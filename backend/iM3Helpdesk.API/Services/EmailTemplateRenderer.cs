using System.Collections.Concurrent;
using System.Text;
using iM3Helpdesk.Application.Contracts.Services;

namespace iM3Helpdesk.Infrastructure.Services;

public class EmailTemplateRenderer : IEmailTemplateRenderer
{
    private readonly string _baseDir;
    private readonly ConcurrentDictionary<string, string> _cache = new();

    public EmailTemplateRenderer()
    {
        _baseDir = Path.Combine(
            AppContext.BaseDirectory,
            "templates",
            "emails");
    }

    public string Render(
        string templateName,
        IReadOnlyDictionary<string, string?>? tokens = null)
    {
        var template = _cache.GetOrAdd(templateName, name =>
        {
            var path = Path.Combine(_baseDir, name + ".html");
            return File.ReadAllText(path);
        });

        if (tokens == null || tokens.Count == 0)
            return template;

        var sb = new StringBuilder(template);
        foreach (var kv in tokens)
            sb.Replace("{{" + kv.Key + "}}", kv.Value ?? string.Empty);

        return sb.ToString();
    }
}
