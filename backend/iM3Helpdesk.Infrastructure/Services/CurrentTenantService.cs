namespace iM3Helpdesk.Infrastructure.Services;

public class CurrentTenantService : ICurrentTenantService
{
    public Guid? OrganizationId { get; set; }
    public bool IsSuperAdmin { get; set; }
}