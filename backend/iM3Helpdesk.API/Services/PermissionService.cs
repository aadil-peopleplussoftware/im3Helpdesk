using iM3Helpdesk.Domain.Entities;
using iM3Helpdesk.Domain.Enums;
using iM3Helpdesk.Infrastructure.Persistence;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Caching.Memory;

namespace iM3Helpdesk.API.Services;

public enum PermissionAction { View, Add, Edit, Delete, Export }

public interface IPermissionService
{
    /// <summary>
    /// Resolves whether <paramref name="role"/> in organization <paramref name="orgId"/>
    /// is allowed to perform <paramref name="action"/> on <paramref name="module"/>.
    /// Merges org-level overrides on top of system defaults. SuperAdmin bypasses.
    /// </summary>
    Task<bool> CanAsync(Guid? orgId, UserRole role, string module, PermissionAction action);

    /// <summary>Invalidate the cache for an org (call after RoleRights save/reset).</summary>
    void InvalidateOrg(Guid orgId);
}

public class PermissionService : IPermissionService
{
    private readonly ApplicationDbContext _db;
    private readonly IMemoryCache _cache;
    private static readonly TimeSpan CacheTtl = TimeSpan.FromMinutes(5);

    public PermissionService(ApplicationDbContext db, IMemoryCache cache)
    {
        _db = db;
        _cache = cache;
    }

    public async Task<bool> CanAsync(Guid? orgId, UserRole role, string module, PermissionAction action)
    {
        if (string.IsNullOrWhiteSpace(module)) return false;
        if (role == UserRole.SuperAdmin) return true;

        var key = (module ?? string.Empty).Trim().ToLowerInvariant();

        // Load matrix for (org, role) — cached.
        var row = await GetEffectiveRowAsync(orgId, role, key);
        return action switch
        {
            PermissionAction.View => row.CanView,
            PermissionAction.Add => row.CanAdd,
            PermissionAction.Edit => row.CanEdit,
            PermissionAction.Delete => row.CanDelete,
            PermissionAction.Export => row.CanExport,
            _ => false
        };
    }

    public void InvalidateOrg(Guid orgId)
    {
        foreach (UserRole r in Enum.GetValues(typeof(UserRole)))
            _cache.Remove(CacheKey(orgId, r));
    }

    // ───────── internals ─────────

    private record Row(bool CanView, bool CanAdd, bool CanEdit, bool CanDelete, bool CanExport);

    private async Task<Row> GetEffectiveRowAsync(Guid? orgId, UserRole role, string moduleKey)
    {
        var map = await GetRoleMapAsync(orgId, role);
        return map.TryGetValue(moduleKey, out var r) ? r : DefaultFor(role, moduleKey);
    }

    private async Task<IReadOnlyDictionary<string, Row>> GetRoleMapAsync(Guid? orgId, UserRole role)
    {
        var ck = CacheKey(orgId ?? Guid.Empty, role);
        if (_cache.TryGetValue<IReadOnlyDictionary<string, Row>>(ck, out var cached) && cached != null)
            return cached;

        List<RolePermission> overrides = new();
        if (orgId.HasValue)
        {
            overrides = await _db.RolePermissions
                .AsNoTracking()
                .Where(rp => rp.OrganizationId == orgId.Value && rp.Role == role)
                .ToListAsync();
        }

        var dict = new Dictionary<string, Row>(StringComparer.OrdinalIgnoreCase);
        foreach (var m in Modules)
        {
            var o = overrides.FirstOrDefault(x => x.Module == m);
            dict[m] = o == null
                ? DefaultFor(role, m)
                : new Row(o.CanView, o.CanAdd, o.CanEdit, o.CanDelete, o.CanExport);
        }

        _cache.Set(ck, (IReadOnlyDictionary<string, Row>)dict, CacheTtl);
        return dict;
    }

    private static string CacheKey(Guid orgId, UserRole role) => $"perm:{orgId}:{role}";

    // ───────── module catalog & defaults (mirrors RoleRightsController) ─────────

    public static readonly IReadOnlyList<string> Modules = new[]
    {
        // Operations
        "dashboard","tickets","contacts","knowledge-base","chat",
        "calendar","notifications","todo","call-logs",
        // Insights
        "reports","analytics-heatmap","ai-insights","audit-log",
        // People
        "agents","agent-groups","customers","leads",
        // Configuration
        "ticket-templates","custom-fields","ticket-masters","settings",
        "organization-profile","holiday-setup","recycle-bin","role-rights",
        // Integrations
        "integrations-email","integrations-slack","integrations-whatsapp",
    };

    private static Row DefaultFor(UserRole role, string module)
    {
        if (role == UserRole.SuperAdmin)
            return new Row(true, true, true, true, true);

        if (role == UserRole.CompanyAdmin)
            return new Row(true, true, true, true, true);

        if (role == UserRole.Customer)
        {
            var customerVisible = module is "tickets" or "knowledge-base" or "notifications";
            var add = module == "tickets";
            return new Row(customerVisible, add, false, false, false);
        }

        // Agent
        bool adminOnly = module is "organization-profile" or "holiday-setup"
            or "recycle-bin" or "role-rights" or "agents" or "agent-groups"
            or "audit-log" or "leads" or "integrations-email"
            or "integrations-slack" or "integrations-whatsapp" or "ticket-masters"
            or "custom-fields" or "ticket-templates" or "settings";

        if (adminOnly)
            return new Row(false, false, false, false, false);

        var canEdit = module is not ("dashboard" or "reports" or "analytics-heatmap" or "ai-insights" or "audit-log");
        var canAdd = canEdit;
        var canDelete = module is "tickets" or "contacts" or "todo" or "calendar" or "knowledge-base";
        var canExport = module is "tickets" or "reports" or "contacts" or "analytics-heatmap";
        return new Row(true, canAdd, canEdit, canDelete, canExport);
    }
}
