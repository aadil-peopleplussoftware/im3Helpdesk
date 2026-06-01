using System.Security.Claims;
using iM3Helpdesk.API.Services;
using iM3Helpdesk.Domain.Enums;
using iM3Helpdesk.Infrastructure.Services;
using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.Mvc.Filters;

namespace iM3Helpdesk.API.Middleware;

/// <summary>
/// Enforces the per-organization Role Rights matrix at the API boundary.
/// Returns 403 if the caller's role lacks the requested action on the
/// module. SuperAdmin bypasses. Compose with [Authorize] (auth) and
/// [RequireFeature] (subscription) — this attribute handles role rights only.
///
///   [RequirePermission("contacts", PermissionAction.Delete)]
/// </summary>
[AttributeUsage(AttributeTargets.Class | AttributeTargets.Method, AllowMultiple = true)]
public sealed class RequirePermissionAttribute : Attribute, IAsyncAuthorizationFilter
{
    private readonly string _module;
    private readonly PermissionAction _action;

    public RequirePermissionAttribute(string module, PermissionAction action)
    {
        _module = (module ?? string.Empty).Trim().ToLowerInvariant();
        _action = action;
    }

    public async Task OnAuthorizationAsync(AuthorizationFilterContext context)
    {
        var user = context.HttpContext.User;
        if (user?.Identity?.IsAuthenticated != true)
        {
            context.Result = new UnauthorizedResult();
            return;
        }

        var roleClaim = user.FindFirst(ClaimTypes.Role)?.Value
                     ?? user.FindFirst("role")?.Value;
        if (!Enum.TryParse<UserRole>(roleClaim, ignoreCase: true, out var role))
        {
            context.Result = Forbid("invalid_role");
            return;
        }

        // SuperAdmin always passes.
        if (role == UserRole.SuperAdmin) return;

        var tenant = context.HttpContext.RequestServices.GetService<ICurrentTenantService>();
        var perms = context.HttpContext.RequestServices.GetService<IPermissionService>();
        if (perms == null) return; // mis-configuration: fail open is safer than 500 storm

        var orgId = tenant?.OrganizationId;
        var allowed = await perms.CanAsync(orgId, role, _module, _action);
        if (!allowed)
        {
            context.Result = Forbid("permission_denied");
        }
    }

    private ObjectResult Forbid(string code) => new(new
    {
        error = code,
        module = _module,
        action = _action.ToString().ToLowerInvariant(),
        message = $"Your role does not have '{_action.ToString().ToLowerInvariant()}' permission on '{_module}'."
    })
    { StatusCode = 403 };
}
