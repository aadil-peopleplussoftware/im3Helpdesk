using iM3Helpdesk.Infrastructure.Services;
using System.IdentityModel.Tokens.Jwt;

namespace iM3Helpdesk.API.Middleware;

public class TenantMiddleware
{
  private readonly RequestDelegate _next;

  public TenantMiddleware(RequestDelegate next)
  {
    _next = next;
  }

  public async Task InvokeAsync(HttpContext context,
      ICurrentTenantService tenantService)
  {
    var token = context.Request.Headers["Authorization"]
        .FirstOrDefault()?.Split(" ").Last();

    if (token != null)
    {
      try
      {
        var handler = new JwtSecurityTokenHandler();
        var jwt = handler.ReadJwtToken(token);

        var orgId = jwt.Claims
            .FirstOrDefault(c => c.Type == "organizationId")?.Value;

        var role = jwt.Claims
            .FirstOrDefault(c => c.Type ==
                "http://schemas.microsoft.com/ws/2008/06/identity/claims/role"
            )?.Value
            ?? jwt.Claims
                .FirstOrDefault(c => c.Type == "role")?.Value;

        var isSuperAdmin = role == "SuperAdmin";
        ((CurrentTenantService)tenantService).IsSuperAdmin = isSuperAdmin;

        if (!isSuperAdmin && !string.IsNullOrEmpty(orgId)
            && Guid.TryParse(orgId, out var tenantId))
        {
          ((CurrentTenantService)tenantService).OrganizationId = tenantId;
        }
      }
      catch { }
    }

    await _next(context);
  }
}
