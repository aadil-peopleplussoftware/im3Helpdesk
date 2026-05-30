namespace iM3Helpdesk.Application.Contracts.Services;

public interface IEmailTemplateRenderer
{
    string Render(
        string templateName,
        IReadOnlyDictionary<string, string?>? tokens = null);
}
