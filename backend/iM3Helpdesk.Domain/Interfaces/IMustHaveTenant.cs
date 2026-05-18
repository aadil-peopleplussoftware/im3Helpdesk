
namespace iM3Helpdesk.Domain.Interfaces;

public interface IMustHaveTenant
{
    Guid OrganizationId { get; set; }
}
