using iM3Helpdesk.API.Controllers;
using iM3Helpdesk.API.DTOs.Auth;
using iM3Helpdesk.API.Services;
using iM3Helpdesk.Domain.Entities;
using iM3Helpdesk.Domain.Enums;
using iM3Helpdesk.Infrastructure.Persistence;
using iM3Helpdesk.Infrastructure.Services;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Configuration;
using Moq;
using Xunit;

namespace iM3Helpdesk.API.Tests.Controllers;

public class AuthControllerTests
{
  [Fact]
  public async Task Login_ValidCredentials_SetsHttpOnlyAuthCookies()
  {
    // Arrange
    var options = new DbContextOptionsBuilder<ApplicationDbContext>()
        .UseInMemoryDatabase(Guid.NewGuid().ToString())
        .Options;

    var tenantService = new FakeCurrentTenantService();
    await using var context = new ApplicationDbContext(options, tenantService);

    var user = new User
    {
      Id = Guid.NewGuid(),
      FullName = "Test User",
      Email = "test@example.com",
      PasswordHash = BCrypt.Net.BCrypt.HashPassword("Pass@123"),
      Role = UserRole.Agent,
      IsEmailVerified = true,
      OrganizationId = null
    };

    context.Users.Add(user);
    await context.SaveChangesAsync();

    var config = new ConfigurationBuilder()
        .AddInMemoryCollection(new Dictionary<string, string?>
        {
          ["JwtSettings:SecretKey"] = "01234567890123456789012345678901",
          ["JwtSettings:Issuer"] = "iM3Helpdesk",
          ["JwtSettings:Audience"] = "iM3Helpdesk"
        })
        .Build();

    var emailMock = new Mock<IEmailService>();
    var otpMock = new Mock<IOtpService>();

    var controller = new AuthController(
        context,
        config,
        emailMock.Object,
        otpMock.Object)
    {
      ControllerContext = new ControllerContext
      {
        HttpContext = new DefaultHttpContext()
      }
    };

    var dto = new LoginDto
    {
      Email = user.Email,
      Password = "Pass@123",
      LoginWithOtp = false
    };

    // Act
    var result = await controller.Login(dto);

    // Assert
    Assert.IsType<OkObjectResult>(result);
    var setCookieValues = controller.Response.Headers["Set-Cookie"].ToString();
    Assert.False(string.IsNullOrWhiteSpace(setCookieValues));
    Assert.Contains("HttpOnly", setCookieValues, StringComparison.OrdinalIgnoreCase);
  }

  private sealed class FakeCurrentTenantService : ICurrentTenantService
  {
    public Guid? OrganizationId => null;
    public bool IsSuperAdmin => true;
  }
}
