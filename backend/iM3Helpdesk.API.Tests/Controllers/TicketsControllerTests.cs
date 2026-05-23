using System.Security.Claims;
using iM3Helpdesk.API.Controllers;
using iM3Helpdesk.API.Services;
using iM3Helpdesk.Domain.Entities;
using iM3Helpdesk.Domain.Enums;
using iM3Helpdesk.Infrastructure.Persistence;
using iM3Helpdesk.Infrastructure.Services;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Logging.Abstractions;
using Moq;
using Xunit;

namespace iM3Helpdesk.API.Tests.Controllers;

public class TicketsControllerTests
{
  [Fact]
  public async Task AddComment_WithScriptPayload_StoresSanitizedComment()
  {
    // Arrange
    var tenantId = Guid.NewGuid();
    var userId = Guid.NewGuid();
    var ticketId = Guid.NewGuid();

    var tenantService = new FakeCurrentTenantService(tenantId, isSuperAdmin: false);

    var options = new DbContextOptionsBuilder<ApplicationDbContext>()
        .UseInMemoryDatabase(Guid.NewGuid().ToString())
        .Options;

    await using var context = new ApplicationDbContext(options, tenantService);

    context.Users.Add(new User
    {
      Id = userId,
      FullName = "Customer A",
      Email = "customer@example.com",
      PasswordHash = "x",
      Role = UserRole.Customer,
      OrganizationId = tenantId
    });

    context.Tickets.Add(new Ticket
    {
      Id = ticketId,
      Title = "XSS test ticket",
      Description = "desc",
      Category = "Security",
      OrganizationId = tenantId,
      CreatedByUserId = userId,
      TicketNumber = 3001
    });

    await context.SaveChangesAsync();

    var notificationMock = new Mock<INotificationService>();
    var emailMock = new Mock<IEmailService>();
    var slaMock = new Mock<ISlaService>();

    var controller = new TicketsController(
        context,
        tenantService,
        notificationMock.Object,
        emailMock.Object,
        slaMock.Object,
        NullLogger<TicketsController>.Instance);

    controller.ControllerContext = new ControllerContext
    {
      HttpContext = new DefaultHttpContext
      {
        User = new ClaimsPrincipal(new ClaimsIdentity(new[]
        {
          new Claim(ClaimTypes.NameIdentifier, userId.ToString()),
          new Claim(ClaimTypes.Role, "Customer")
        }, "TestAuth"))
      }
    };

    var dto = new AddCommentDto
    {
      Comment = "Hello<script>alert(1)</script>",
      IsInternal = true
    };

    // Act
    var result = await controller.AddComment(ticketId, dto);

    // Assert
    Assert.IsType<OkObjectResult>(result);
    var saved = await context.TicketComments
        .AsNoTracking()
        .SingleAsync(c => c.TicketId == ticketId);
    Assert.DoesNotContain("<script>", saved.Comment, StringComparison.OrdinalIgnoreCase);
  }

  [Fact]
  public async Task GetById_NonSuperAdmin_CrossTenantTicket_ReturnsNotFound()
  {
    // Arrange
    var currentTenantId = Guid.NewGuid();
    var otherTenantId = Guid.NewGuid();

    var tenantService = new FakeCurrentTenantService(currentTenantId, isSuperAdmin: false);

    var options = new DbContextOptionsBuilder<ApplicationDbContext>()
        .UseInMemoryDatabase(Guid.NewGuid().ToString())
        .Options;

    var attackerUserId = Guid.NewGuid();
    var victimUserId = Guid.NewGuid();
    var ticketId = Guid.NewGuid();
    await using var context = new ApplicationDbContext(options, tenantService);

    context.Users.AddRange(
        new User
        {
          Id = attackerUserId,
          FullName = "Agent A",
          Email = "agenta@example.com",
          PasswordHash = "x",
          Role = UserRole.Agent,
          OrganizationId = currentTenantId
        },
        new User
        {
          Id = victimUserId,
          FullName = "Agent B",
          Email = "agentb@example.com",
          PasswordHash = "x",
          Role = UserRole.Agent,
          OrganizationId = otherTenantId
        });

    context.Tickets.Add(new Ticket
    {
      Id = ticketId,
      Title = "Cross-tenant ticket",
      Description = "Should not be visible to another tenant",
      Category = "Security",
      OrganizationId = otherTenantId,
      CreatedByUserId = victimUserId,
      TicketNumber = 2001
    });

    await context.SaveChangesAsync();

    var notificationMock = new Mock<INotificationService>();
    var emailMock = new Mock<IEmailService>();
    var slaMock = new Mock<ISlaService>();

    var controller = new TicketsController(
        context,
        tenantService,
        notificationMock.Object,
        emailMock.Object,
        slaMock.Object,
        NullLogger<TicketsController>.Instance);

    var claims = new[]
    {
      new Claim(ClaimTypes.NameIdentifier, Guid.NewGuid().ToString()),
      new Claim(ClaimTypes.Role, "Agent")
    };

    controller.ControllerContext = new ControllerContext
    {
      HttpContext = new DefaultHttpContext
      {
        User = new ClaimsPrincipal(new ClaimsIdentity(claims, "TestAuth"))
      }
    };

    // Act
    var result = await controller.GetById(ticketId);

    // Assert
    Assert.IsType<NotFoundResult>(result);
  }

  private sealed class FakeCurrentTenantService : ICurrentTenantService
  {
    public FakeCurrentTenantService(Guid? organizationId, bool isSuperAdmin)
    {
      OrganizationId = organizationId;
      IsSuperAdmin = isSuperAdmin;
    }

    public Guid? OrganizationId { get; }
    public bool IsSuperAdmin { get; }
  }
}
