using iM3Helpdesk.Infrastructure.Services;
using Microsoft.Extensions.Logging;
using Microsoft.IdentityModel.Tokens;
using System.IdentityModel.Tokens.Jwt;

namespace iM3Helpdesk.API.Middleware;

public class TenantMiddleware
{
  private readonly RequestDelegate _next;
  private readonly ILogger<TenantMiddleware> _logger;
  private readonly TokenValidationParameters _tokenValidationParameters;

  public TenantMiddleware(RequestDelegate next, ILogger<TenantMiddleware> logger, TokenValidationParameters tokenValidationParameters)
  {
    _next = next;
    _logger = logger;
    _tokenValidationParameters = tokenValidationParameters;
  }

  public async Task InvokeAsync(HttpContext context,
      ICurrentTenantService tenantService)
  {
    if (context.User?.Identity?.IsAuthenticated == true)
    {
      var orgId = context.User.Claims
          .FirstOrDefault(c => c.Type == "organizationId")?.Value;

      var role = context.User.Claims
          .FirstOrDefault(c => c.Type == "http://schemas.microsoft.com/ws/2008/06/identity/claims/role")?.Value
          ?? context.User.Claims.FirstOrDefault(c => c.Type == "role")?.Value;

      var isSuperAdmin = role == "SuperAdmin";
      ((CurrentTenantService)tenantService).IsSuperAdmin = isSuperAdmin;

      if (!isSuperAdmin && !string.IsNullOrEmpty(orgId)
          && Guid.TryParse(orgId, out var tenantId))
      {
        ((CurrentTenantService)tenantService).OrganizationId = tenantId;
      }
    }
    else
    {
      var token = context.Request.Headers["Authorization"]
          .FirstOrDefault()?.Split(" ").Last();

      if (!string.IsNullOrEmpty(token))
      {
        try
        {
          var handler = new JwtSecurityTokenHandler();
          handler.ValidateToken(token, _tokenValidationParameters, out var validatedToken);

          if (validatedToken is JwtSecurityToken jwt)
          {
            var orgId = jwt.Claims
                .FirstOrDefault(c => c.Type == "organizationId")?.Value;

            var role = jwt.Claims
                .FirstOrDefault(c => c.Type == "http://schemas.microsoft.com/ws/2008/06/identity/claims/role")?.Value
                ?? jwt.Claims.FirstOrDefault(c => c.Type == "role")?.Value;

            var isSuperAdmin = role == "SuperAdmin";
            ((CurrentTenantService)tenantService).IsSuperAdmin = isSuperAdmin;

            if (!isSuperAdmin && !string.IsNullOrEmpty(orgId)
                && Guid.TryParse(orgId, out var tenantId))
            {
              ((CurrentTenantService)tenantService).OrganizationId = tenantId;
            }
          }
        }
        catch (SecurityTokenException ex)
        {
          _logger.LogWarning(ex, "Invalid JWT token.");
        }
        catch (Exception ex)
        {
          _logger.LogError(ex, "An error occurred while processing the JWT token.");
        }
      }
    }

    await _next(context);
  }
}
