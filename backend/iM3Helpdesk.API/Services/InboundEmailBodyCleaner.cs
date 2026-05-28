using System.Net;
using System.Text.RegularExpressions;

namespace iM3Helpdesk.API.Services;

internal static class InboundEmailBodyCleaner
{
  private static readonly Regex ScriptBlockRegex = new(
      @"<script\b[^<]*(?:(?!</script>)<[^<]*)*</script>",
      RegexOptions.IgnoreCase | RegexOptions.Singleline | RegexOptions.Compiled);

  private static readonly Regex StyleBlockRegex = new(
      @"<style\b[^<]*(?:(?!</style>)<[^<]*)*</style>",
      RegexOptions.IgnoreCase | RegexOptions.Singleline | RegexOptions.Compiled);

  private static readonly Regex HtmlTagRegex = new(
      @"<[^>]+>",
      RegexOptions.Compiled);

  private static readonly Regex OnDateWroteRegex = new(
      @"^\s*On\s.+wrote:\s*$",
      RegexOptions.IgnoreCase | RegexOptions.Compiled);

  private static readonly Regex QuotePrefixRegex = new(
      @"^\s*>+",
      RegexOptions.Compiled);

  private static readonly Regex OriginalMessageRegex = new(
      @"^\s*-{2,}\s*Original Message\s*-{2,}\s*$",
      RegexOptions.IgnoreCase | RegexOptions.Compiled);

  private static readonly string[] CutoffMarkers =
  {
    "Reply to this email to continue the conversation",
    "This email was sent by",
    "Please do not reply directly unless",
    "Powered by DeskMate",
    "New Reply on #TN",
    "From:",
    "Sent:",
    "To:",
    "Subject:"
  };

  public static string ToCleanHtml(string? textBody, string? htmlBody)
  {
    var rawText = !string.IsNullOrWhiteSpace(textBody)
        ? textBody
        : HtmlToText(htmlBody);

    var cleanedText = ExtractNewestText(rawText);
    if (string.IsNullOrWhiteSpace(cleanedText))
      return "<p>(No content)</p>";

    var encoded = WebUtility.HtmlEncode(cleanedText)
        .Replace("\r\n", "\n")
        .Replace("\r", "\n")
        .Replace("\n\n", "</p><p>")
        .Replace("\n", "<br>");

    return $"<p>{encoded}</p>";
  }

  private static string ExtractNewestText(string? rawText)
  {
    if (string.IsNullOrWhiteSpace(rawText))
      return string.Empty;

    var normalized = rawText
        .Replace("\r\n", "\n")
        .Replace("\r", "\n");

    var lines = normalized.Split('\n');
    var keptLines = new List<string>();

    foreach (var line in lines)
    {
      if (IsCutoffLine(line))
        break;

      keptLines.Add(line.TrimEnd());
    }

    while (keptLines.Count > 0 &&
           string.IsNullOrWhiteSpace(keptLines[^1]))
    {
      keptLines.RemoveAt(keptLines.Count - 1);
    }

    return string.Join("\n", keptLines).Trim();
  }

  private static bool IsCutoffLine(string line)
  {
    var trimmed = line.Trim();
    if (string.IsNullOrWhiteSpace(trimmed))
      return false;

    if (OnDateWroteRegex.IsMatch(trimmed) ||
        QuotePrefixRegex.IsMatch(trimmed) ||
        OriginalMessageRegex.IsMatch(trimmed))
    {
      return true;
    }

    return CutoffMarkers.Any(marker =>
        trimmed.Contains(marker, StringComparison.OrdinalIgnoreCase));
  }

  private static string HtmlToText(string? html)
  {
    if (string.IsNullOrWhiteSpace(html))
      return string.Empty;

    var noScripts = ScriptBlockRegex.Replace(html, " ");
    var noStyles = StyleBlockRegex.Replace(noScripts, " ");

    var withLineBreaks = noStyles
        .Replace("<br>", "\n", StringComparison.OrdinalIgnoreCase)
        .Replace("<br/>", "\n", StringComparison.OrdinalIgnoreCase)
        .Replace("<br />", "\n", StringComparison.OrdinalIgnoreCase);

    withLineBreaks = Regex.Replace(
        withLineBreaks,
        @"</(p|div|tr|li|h1|h2|h3|h4|h5|h6)>",
        "\n",
        RegexOptions.IgnoreCase);

    var plain = HtmlTagRegex.Replace(withLineBreaks, " ");
    return WebUtility.HtmlDecode(plain);
  }
}