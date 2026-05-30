namespace iM3Helpdesk.Application.Contracts.Services;

public interface IEscalationService
{
    Task CheckAndEscalateAsync();
}
