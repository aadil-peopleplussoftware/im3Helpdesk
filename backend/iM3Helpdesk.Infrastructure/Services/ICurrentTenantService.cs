namespace iM3Helpdesk.Infrastructure.Services;

public interface ICurrentTenantService
{
    Guid? OrganizationId { get; }
    bool IsSuperAdmin { get; }
}