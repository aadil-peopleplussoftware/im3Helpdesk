using iM3Helpdesk.API.Services;
using iM3Helpdesk.Domain.Enums;
using iM3Helpdesk.Infrastructure.Persistence;
using iM3Helpdesk.Infrastructure.Services;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using iM3Helpdesk.Application.Contracts.Services;
using ClosedXML.Excel;
using System.Text;
using System.Net.Mail;
using System.Security.Claims;

namespace iM3Helpdesk.API.Controllers;

[ApiController]
[Route("api/[controller]")]
[Authorize]
public class AgentsController : ControllerBase
{
  private readonly ApplicationDbContext _context;
  private readonly ICurrentTenantService _tenantService;
  private readonly IEmailService _emailService;

  public AgentsController(
      ApplicationDbContext context,
      ICurrentTenantService tenantService,
      IEmailService emailService)
  {
    _context = context;
    _tenantService = tenantService;
    _emailService = emailService;
  }

  [HttpGet]
  public async Task<IActionResult> GetAll()
  {
    var orgId = await ResolveOrganizationIdFromContextAsync();
    var isSuperAdmin = _tenantService.IsSuperAdmin ||
      User.IsInRole(nameof(UserRole.SuperAdmin));

    var query = _context.Users
        .IgnoreQueryFilters()
        .Where(u =>
            u.Role == UserRole.Agent ||
            u.Role == UserRole.CompanyAdmin ||
            u.Role == UserRole.Customer);

    if (orgId.HasValue)
      query = query.Where(u => u.OrganizationId == orgId.Value);
    else if (!isSuperAdmin)
      query = query.Where(_ => false);

    var agents = await query
        .Select(u => new
        {
          u.Id,
          u.FullName,
          u.Email,
          u.PhoneNumber,
          Role = u.Role.ToString(),
          u.IsEmailVerified,
          u.CreatedAt,
          u.LastLoginAt,
          // ✅ IsActive: LockedUntil nahi hai ya past mein hai to active
          IsActive = !u.LockedUntil.HasValue ||
              u.LockedUntil < DateTime.UtcNow
        })
        .ToListAsync();

    return Ok(agents);
  }

  [HttpGet("{id}")]
  public async Task<IActionResult> GetById(Guid id)
  {
    var orgId = await ResolveOrganizationIdFromContextAsync();
    var isSuperAdmin = _tenantService.IsSuperAdmin ||
      User.IsInRole(nameof(UserRole.SuperAdmin));

    var agent = await _context.Users
        .IgnoreQueryFilters()
        .FirstOrDefaultAsync(u =>
            u.Id == id &&
            (isSuperAdmin ||
             (orgId.HasValue && u.OrganizationId == orgId.Value)));

    if (agent == null) return NotFound();

    return Ok(new
    {
      agent.Id,
      agent.FullName,
      agent.Email,
      agent.PhoneNumber,
      Role = agent.Role.ToString(),
      agent.Signature,
      agent.PhotoUrl,
      agent.IsEmailVerified,
      agent.LastLoginAt,
      agent.CreatedAt
    });
  }

  private async Task<Guid?> ResolveOrganizationIdFromContextAsync()
  {
    if (_tenantService.OrganizationId.HasValue)
      return _tenantService.OrganizationId;

    var claimValue =
      User.FindFirstValue("organizationId") ??
      User.FindFirstValue("OrganizationId") ??
      User.FindFirstValue("orgId") ??
      User.FindFirstValue("organizationid");

    if (Guid.TryParse(claimValue, out var claimOrgId))
      return claimOrgId;

    var userIdClaim =
      User.FindFirstValue(ClaimTypes.NameIdentifier) ??
      User.FindFirstValue(ClaimTypes.Sid) ??
      User.FindFirstValue("sub") ??
      User.FindFirstValue("nameid");

    if (Guid.TryParse(userIdClaim, out var userId))
    {
      var userOrgId = await _context.Users
        .IgnoreQueryFilters()
        .Where(u => u.Id == userId)
        .Select(u => u.OrganizationId)
        .FirstOrDefaultAsync();

      if (userOrgId.HasValue)
        return userOrgId.Value;
    }

    return null;
  }

  [HttpPost("invite")]
  public async Task<IActionResult> InviteAgent(
      [FromBody] InviteAgentDto dto)
  {
    var existingUser = await _context.Users
        .IgnoreQueryFilters()
        .FirstOrDefaultAsync(u => u.Email == dto.Email);

    if (existingUser != null)
      return BadRequest(
          new { message = "Email already registered" });

    var tempPassword = GenerateTempPassword();

    var agent = new iM3Helpdesk.Domain.Entities.User
    {
      FullName = dto.FullName,
      Email = dto.Email,
      PhoneNumber = dto.PhoneNumber ?? "",
      PasswordHash = BCrypt.Net.BCrypt.HashPassword(tempPassword),
      Role = ParseRole(dto.Role),
      OrganizationId = _tenantService.OrganizationId!.Value,
      IsEmailVerified = true,
      Signature = dto.Signature ?? "",
      PhotoUrl = dto.PhotoUrl ?? ""
    };

    _context.Users.Add(agent);

    if (dto.GroupIds?.Any() == true)
    {
      foreach (var groupId in dto.GroupIds)
      {
        _context.AgentGroupMembers.Add(
            new iM3Helpdesk.Domain.Entities.AgentGroupMember
            {
              AgentGroupId = groupId,
              UserId = agent.Id
            });
      }
    }

    await _context.SaveChangesAsync();

    var org = await _context.Organizations
        .FirstOrDefaultAsync(o =>
            o.Id == _tenantService.OrganizationId);

    try
    {
      // ✅ FIX: Use proper invite email with all correct params
      await _emailService.SendAgentInviteAsync(
          agent.Email,
          agent.FullName,
          org?.Name ?? "Your Company",
          tempPassword,org?.Id);
    }
    catch { }

    return Ok(new
    {
      message = "Agent invited successfully",
      tempPassword = tempPassword,
      agentId = agent.Id
    });
  }

  [HttpPut("{id}")]
  public async Task<IActionResult> UpdateAgent(
      Guid id, [FromBody] UpdateAgentDto dto)
  {
    var agent = await _context.Users
        .IgnoreQueryFilters()
        .FirstOrDefaultAsync(u =>
            u.Id == id &&
            u.OrganizationId == _tenantService.OrganizationId);

    if (agent == null)
      return NotFound(new { message = "Agent not found" });

    if (!string.IsNullOrEmpty(dto.FullName))
      agent.FullName = dto.FullName;

    if (!string.IsNullOrEmpty(dto.Role))
      agent.Role = ParseRole(dto.Role);

    if (dto.Signature != null)
      agent.Signature = dto.Signature;

    if (dto.PhotoUrl != null)
      agent.PhotoUrl = dto.PhotoUrl;

    await _context.SaveChangesAsync();
    return Ok(new { message = "Agent updated" });
  }

  [HttpPut("{id}/toggle-active")]
  public async Task<IActionResult> ToggleActive(Guid id)
  {
    var agent = await _context.Users
        .IgnoreQueryFilters()
        .FirstOrDefaultAsync(u => u.Id == id);

    if (agent == null)
      return NotFound(new { message = "Agent not found" });

    if (agent.LockedUntil.HasValue &&
        agent.LockedUntil > DateTime.UtcNow)
    {
      agent.LockedUntil = null;
      agent.FailedLoginAttempts = 0;
    }
    else
    {
      agent.LockedUntil = DateTime.UtcNow.AddYears(100);
    }

    await _context.SaveChangesAsync();

    return Ok(new
    {
      message = "Agent status updated",
      isActive = !agent.LockedUntil.HasValue ||
          agent.LockedUntil < DateTime.UtcNow
    });
  }

  [HttpDelete("{id}")]
  public async Task<IActionResult> Delete(Guid id)
  {
    var agent = await _context.Users
        .IgnoreQueryFilters()
        .FirstOrDefaultAsync(u =>
            u.Id == id &&
            u.Role != UserRole.SuperAdmin);

    if (agent == null)
      return NotFound(new { message = "Agent not found" });

    _context.Users.Remove(agent);
    await _context.SaveChangesAsync();

    return Ok(new { message = "Agent deleted" });
  }

  [HttpPost("bulk-import")]
  [Authorize(Roles = nameof(UserRole.CompanyAdmin))]
  public async Task<IActionResult> BulkImport([FromForm] BulkImportUsersDto dto)
  {
    if (dto.File == null || dto.File.Length == 0)
      return BadRequest(new { message = "Please upload an Excel or CSV file." });

    if (!_tenantService.OrganizationId.HasValue)
      return BadRequest(new { message = "Organization context is missing." });

    var ext = Path.GetExtension(dto.File.FileName).ToLowerInvariant();
    if (ext != ".xlsx" && ext != ".csv")
      return BadRequest(new { message = "Only .xlsx and .csv files are supported." });

    List<BulkImportRawRow> rawRows;
    try
    {
      await using var stream = dto.File.OpenReadStream();
      rawRows = ext == ".xlsx"
        ? ReadRowsFromExcel(stream)
        : ReadRowsFromCsv(stream);
    }
    catch
    {
      return BadRequest(new { message = "Unable to parse uploaded file. Please check template format." });
    }

    if (rawRows.Count == 0)
      return BadRequest(new { message = "No data rows found in uploaded file." });

    var normalizedEmails = rawRows
      .Select(r => (r.Email ?? string.Empty).Trim().ToLowerInvariant())
      .Where(e => !string.IsNullOrWhiteSpace(e))
      .Distinct()
      .ToList();

    var existingEmailList = await _context.Users
      .IgnoreQueryFilters()
      .Where(u => normalizedEmails.Contains(u.Email.ToLower()))
      .Select(u => u.Email.ToLower())
      .ToListAsync();
    var existingEmails = new HashSet<string>(existingEmailList);

    var orgId = _tenantService.OrganizationId.Value;
    var org = await _context.Organizations.FirstOrDefaultAsync(o => o.Id == orgId);

    var fileSeenEmails = new HashSet<string>();
    var newUsers = new List<(iM3Helpdesk.Domain.Entities.User user, string tempPassword, int row)>();
    var results = new List<BulkImportRowResult>();

    foreach (var row in rawRows)
    {
      var fullName = (row.FullName ?? string.Empty).Trim();
      var email = (row.Email ?? string.Empty).Trim();
      var roleText = (row.Role ?? string.Empty).Trim();
      var phone = (row.PhoneNumber ?? string.Empty).Trim();
      var emailNorm = email.ToLowerInvariant();

      if (string.IsNullOrWhiteSpace(fullName))
      {
        results.Add(BulkImportRowResult.Fail(row.RowNumber, email, roleText, "FullName is required."));
        continue;
      }

      if (string.IsNullOrWhiteSpace(email))
      {
        results.Add(BulkImportRowResult.Fail(row.RowNumber, email, roleText, "Email is required."));
        continue;
      }

      if (!IsValidEmail(email))
      {
        results.Add(BulkImportRowResult.Fail(row.RowNumber, email, roleText, "Invalid email format."));
        continue;
      }

      if (fileSeenEmails.Contains(emailNorm))
      {
        results.Add(BulkImportRowResult.Fail(row.RowNumber, email, roleText, "Duplicate email in upload file."));
        continue;
      }
      fileSeenEmails.Add(emailNorm);

      if (existingEmails.Contains(emailNorm))
      {
        results.Add(BulkImportRowResult.Fail(row.RowNumber, email, roleText, "Email already exists."));
        continue;
      }

      var parsedRole = ParseBulkRole(roleText);
      if (!parsedRole.HasValue)
      {
        results.Add(BulkImportRowResult.Fail(row.RowNumber, email, roleText, "Role must be Agent, Customer, or Administrator."));
        continue;
      }

      var tempPassword = GenerateTempPassword();
      var user = new iM3Helpdesk.Domain.Entities.User
      {
        FullName = fullName,
        Email = email,
        PhoneNumber = phone,
        PasswordHash = BCrypt.Net.BCrypt.HashPassword(tempPassword),
        Role = parsedRole.Value,
        OrganizationId = orgId,
        IsEmailVerified = true,
        Signature = string.Empty,
        PhotoUrl = string.Empty
      };

      newUsers.Add((user, tempPassword, row.RowNumber));
      _context.Users.Add(user);
      existingEmails.Add(emailNorm);
    }

    if (newUsers.Count > 0)
      await _context.SaveChangesAsync();

    foreach (var created in newUsers)
    {
      var roleLabel = created.user.Role.ToString();
      var emailSent = false;
      if (dto.SendInviteEmail)
      {
        try
        {
          var html = $@"<p>Hello {created.user.FullName},</p>
<p>Your {roleLabel} account has been created for {(org?.Name ?? "DeskMate")}.</p>
<p><strong>Email:</strong> {created.user.Email}<br/>
<strong>Temporary Password:</strong> {created.tempPassword}</p>
<p>Please login and change your password immediately.</p>";

          await _emailService.SendAsync(
            created.user.Email,
            $"Your {roleLabel} account is ready",
            html,
            organizationId: orgId,
            wrapInMasterTemplate: true);
          emailSent = true;
        }
        catch
        {
          emailSent = false;
        }
      }

      results.Add(BulkImportRowResult.Ok(
        created.row,
        created.user.Email,
        roleLabel,
        created.tempPassword,
        emailSent));
    }

    var createdCount = results.Count(x => x.Success);
    var failedCount = results.Count(x => !x.Success);

    return Ok(new BulkImportUsersResponse
    {
      TotalRows = rawRows.Count,
      CreatedCount = createdCount,
      FailedCount = failedCount,
      Results = results.OrderBy(r => r.RowNumber).ToList()
    });
  }

  private string GenerateTempPassword()
  {
    return "Agent@" + Guid.NewGuid().ToString()[..6];
  }

  private static bool IsValidEmail(string email)
  {
    try
    {
      _ = new MailAddress(email);
      return true;
    }
    catch
    {
      return false;
    }
  }

  private static UserRole? ParseBulkRole(string? role)
  {
    var normalized = (role ?? string.Empty).Trim().ToLowerInvariant();
    return normalized switch
    {
      "administrator" => UserRole.CompanyAdmin,
      "companyadmin" => UserRole.CompanyAdmin,
      "company admin" => UserRole.CompanyAdmin,
      "agent" => UserRole.Agent,
      "customer" => UserRole.Customer,
      _ => null
    };
  }

  private static List<BulkImportRawRow> ReadRowsFromExcel(Stream stream)
  {
    using var workbook = new XLWorkbook(stream);
    var sheet = workbook.Worksheets.First();
    var rows = new List<BulkImportRawRow>();

    var header = sheet.Row(1);
    var headers = new Dictionary<string, int>();
    for (var c = 1; c <= header.LastCellUsed()?.Address.ColumnNumber; c++)
    {
      var key = NormalizeHeader(header.Cell(c).GetString());
      if (!string.IsNullOrWhiteSpace(key) && !headers.ContainsKey(key))
        headers[key] = c;
    }

    var lastRow = sheet.LastRowUsed()?.RowNumber() ?? 1;
    for (var r = 2; r <= lastRow; r++)
    {
      var row = sheet.Row(r);
      var fullName = GetCellByHeader(row, headers, "fullname", "name");
      var email = GetCellByHeader(row, headers, "email", "emailaddress");
      var role = GetCellByHeader(row, headers, "role", "usertype");
      var phone = GetCellByHeader(row, headers, "phone", "phonenumber", "mobile");

      if (string.IsNullOrWhiteSpace(fullName) && string.IsNullOrWhiteSpace(email) && string.IsNullOrWhiteSpace(role) && string.IsNullOrWhiteSpace(phone))
        continue;

      rows.Add(new BulkImportRawRow
      {
        RowNumber = r,
        FullName = fullName,
        Email = email,
        Role = role,
        PhoneNumber = phone
      });
    }

    return rows;
  }

  private static List<BulkImportRawRow> ReadRowsFromCsv(Stream stream)
  {
    using var reader = new StreamReader(stream, Encoding.UTF8, true);
    var lines = new List<string>();
    while (!reader.EndOfStream)
      lines.Add(reader.ReadLine() ?? string.Empty);

    if (lines.Count == 0)
      return new List<BulkImportRawRow>();

    var headersRaw = ParseCsvLine(lines[0]);
    var headers = headersRaw
      .Select((h, i) => new { Key = NormalizeHeader(h), Index = i })
      .Where(x => !string.IsNullOrWhiteSpace(x.Key))
      .GroupBy(x => x.Key)
      .ToDictionary(g => g.Key, g => g.First().Index);

    var rows = new List<BulkImportRawRow>();
    for (var i = 1; i < lines.Count; i++)
    {
      var cols = ParseCsvLine(lines[i]);
      var fullName = GetCsvByHeader(cols, headers, "fullname", "name");
      var email = GetCsvByHeader(cols, headers, "email", "emailaddress");
      var role = GetCsvByHeader(cols, headers, "role", "usertype");
      var phone = GetCsvByHeader(cols, headers, "phone", "phonenumber", "mobile");

      if (string.IsNullOrWhiteSpace(fullName) && string.IsNullOrWhiteSpace(email) && string.IsNullOrWhiteSpace(role) && string.IsNullOrWhiteSpace(phone))
        continue;

      rows.Add(new BulkImportRawRow
      {
        RowNumber = i + 1,
        FullName = fullName,
        Email = email,
        Role = role,
        PhoneNumber = phone
      });
    }

    return rows;
  }

  private static string NormalizeHeader(string raw)
  {
    return (raw ?? string.Empty)
      .Trim()
      .ToLowerInvariant()
      .Replace(" ", string.Empty)
      .Replace("_", string.Empty)
      .Replace("-", string.Empty);
  }

  private static string GetCellByHeader(IXLRow row, Dictionary<string, int> headers, params string[] names)
  {
    foreach (var name in names)
    {
      if (headers.TryGetValue(name, out var col))
        return row.Cell(col).GetString().Trim();
    }
    return string.Empty;
  }

  private static string GetCsvByHeader(List<string> cols, Dictionary<string, int> headers, params string[] names)
  {
    foreach (var name in names)
    {
      if (headers.TryGetValue(name, out var index) && index < cols.Count)
        return (cols[index] ?? string.Empty).Trim();
    }
    return string.Empty;
  }

  private static List<string> ParseCsvLine(string line)
  {
    var result = new List<string>();
    if (line == null)
    {
      result.Add(string.Empty);
      return result;
    }

    var sb = new StringBuilder();
    var inQuotes = false;
    for (var i = 0; i < line.Length; i++)
    {
      var ch = line[i];
      if (ch == '"')
      {
        if (inQuotes && i + 1 < line.Length && line[i + 1] == '"')
        {
          sb.Append('"');
          i++;
        }
        else
        {
          inQuotes = !inQuotes;
        }
      }
      else if (ch == ',' && !inQuotes)
      {
        result.Add(sb.ToString());
        sb.Clear();
      }
      else
      {
        sb.Append(ch);
      }
    }

    result.Add(sb.ToString());
    return result;
  }

  private static UserRole ParseRole(string? role)
  {
    return role switch
    {
      "Administrator" => UserRole.CompanyAdmin,
      "Agent" => UserRole.Agent,
      _ => UserRole.Agent
    };
  }
}

public class InviteAgentDto
{
  public string FullName { get; set; } = string.Empty;
  public string Email { get; set; } = string.Empty;
  public string? PhoneNumber { get; set; }
  public string Role { get; set; } = "Agent";
  public string? Signature { get; set; }
  public string? PhotoUrl { get; set; }
  public List<Guid>? GroupIds { get; set; }
}

public class UpdateAgentDto
{
  public string? FullName { get; set; }
  public string? Role { get; set; }
  public string? Signature { get; set; }
  public string? PhotoUrl { get; set; }
}

public class BulkImportUsersDto
{
  public IFormFile? File { get; set; }
  public bool SendInviteEmail { get; set; } = true;
}

public class BulkImportUsersResponse
{
  public int TotalRows { get; set; }
  public int CreatedCount { get; set; }
  public int FailedCount { get; set; }
  public List<BulkImportRowResult> Results { get; set; } = new();
}

public class BulkImportRawRow
{
  public int RowNumber { get; set; }
  public string FullName { get; set; } = string.Empty;
  public string Email { get; set; } = string.Empty;
  public string Role { get; set; } = string.Empty;
  public string PhoneNumber { get; set; } = string.Empty;
}

public class BulkImportRowResult
{
  public int RowNumber { get; set; }
  public string Email { get; set; } = string.Empty;
  public string Role { get; set; } = string.Empty;
  public bool Success { get; set; }
  public string Message { get; set; } = string.Empty;
  public string? TempPassword { get; set; }
  public bool? InviteEmailSent { get; set; }

  public static BulkImportRowResult Fail(int rowNumber, string email, string role, string message)
  {
    return new BulkImportRowResult
    {
      RowNumber = rowNumber,
      Email = email,
      Role = role,
      Success = false,
      Message = message
    };
  }

  public static BulkImportRowResult Ok(int rowNumber, string email, string role, string tempPassword, bool emailSent)
  {
    return new BulkImportRowResult
    {
      RowNumber = rowNumber,
      Email = email,
      Role = role,
      Success = true,
      Message = "Created",
      TempPassword = tempPassword,
      InviteEmailSent = emailSent
    };
  }
}
