using System.Text.RegularExpressions;
using Ganss.Xss;
using MimeKit;

namespace iM3Helpdesk.API.Services;

/// <summary>
/// Converts an inbound MIME message body into a safe-yet-rich HTML string
/// suitable for storing on a ticket / comment and rendering back to the user
/// with original formatting (colors, highlights, fonts, strikethrough,
/// inline images, …) preserved as closely as possible.
///
/// Two pieces of work:
///   1. Inline (cid:) images embedded in the HTML are extracted to disk,
///      stored as <see cref="Domain.Entities.TicketAttachment"/> rows and
///      the &lt;img src="cid:…"&gt; references are rewritten to a static
///      `/uploads/&lt;guid&gt;.&lt;ext&gt;` URL so the browser can resolve them.
///   2. The resulting HTML is run through <see cref="HtmlSanitizer"/> with
///      a permissive allow-list (style attributes ARE preserved) so the
///      front-end can drop it directly into the DOM via
///      <c>DomSanitizer.bypassSecurityTrustHtml()</c> without losing the
///      rich-text formatting that Angular's default sanitiser strips.
/// </summary>
internal sealed class EmailHtmlProcessor
{
  private static readonly Regex CidImgRegex = new(
      @"src\s*=\s*(['""])cid:(?<cid>[^'""]+)\1",
      RegexOptions.IgnoreCase | RegexOptions.Compiled);

  private static readonly HtmlSanitizer Sanitizer = BuildSanitizer();

  /// <summary>
  /// Build a permissive sanitiser that keeps the styling that mail clients
  /// rely on (background-color highlights, colored text, font sizes,
  /// text-decoration, alignment, …) while still removing the dangerous
  /// surface (scripts, event handlers, javascript: URLs, &lt;iframe&gt;, …).
  /// </summary>
  private static HtmlSanitizer BuildSanitizer()
  {
    var s = new HtmlSanitizer();

    // Keep almost every visible tag. Defaults already cover most, but
    // we explicitly add the ones email clients love to emit.
    foreach (var tag in new[]
    {
      "span", "font", "u", "s", "strike", "del", "ins", "mark",
      "sup", "sub", "small", "big", "kbd", "samp", "var", "code", "pre",
      "blockquote", "figure", "figcaption", "details", "summary",
      "table", "thead", "tbody", "tfoot", "tr", "td", "th", "caption", "col", "colgroup"
    })
    {
      s.AllowedTags.Add(tag);
    }

    // Attributes that carry formatting.
    foreach (var attr in new[]
    {
      "style", "class", "id", "title", "lang", "dir", "align",
      "color", "face", "size",                 // <font>
      "border", "cellspacing", "cellpadding",  // tables
      "colspan", "rowspan", "valign", "bgcolor",
      "width", "height"
    })
    {
      s.AllowedAttributes.Add(attr);
    }

    // CSS properties that carry visible style. Defaults cover most;
    // a few specific ones (background, text-decoration variants,
    // line-height, letter-spacing, white-space, …) are explicit so
    // future library upgrades don't silently drop them.
    foreach (var prop in new[]
    {
      "color", "background", "background-color",
      "font", "font-family", "font-size", "font-style", "font-weight", "font-variant",
      "text-align", "text-decoration", "text-decoration-line",
      "text-decoration-color", "text-decoration-style", "text-indent",
      "letter-spacing", "line-height", "white-space",
      "border", "border-color", "border-style", "border-width",
      "border-top", "border-right", "border-bottom", "border-left",
      "border-radius",
      "margin", "margin-top", "margin-right", "margin-bottom", "margin-left",
      "padding", "padding-top", "padding-right", "padding-bottom", "padding-left",
      "width", "height", "max-width", "max-height", "min-width", "min-height",
      "display", "vertical-align"
    })
    {
      s.AllowedCssProperties.Add(prop);
    }

    // Allow data:image/* for emoji / signature graphics embedded inline.
    s.AllowedSchemes.Add("data");
    s.AllowedSchemes.Add("cid"); // remaining unresolved cids stay clickable, not executed

    return s;
  }

  /// <summary>
  /// Build the description HTML for an inbound mail. Inline cid: images are
  /// uploaded to <paramref name="uploadDirectory"/> and recorded for the
  /// caller (so they can be persisted as <c>TicketAttachment</c> rows that
  /// stay linked to the ticket / comment).
  /// </summary>
  public ProcessedHtmlResult Build(
      MimeMessage message,
      string uploadDirectory)
  {
    var result = new ProcessedHtmlResult();

    string raw;
    if (!string.IsNullOrEmpty(message.HtmlBody))
    {
      raw = RewriteInlineCids(message, uploadDirectory, result);
    }
    else if (!string.IsNullOrEmpty(message.TextBody))
    {
      var encoded = System.Net.WebUtility.HtmlEncode(message.TextBody)
          .Replace("\r\n\r\n", "</p><p>")
          .Replace("\n\n", "</p><p>")
          .Replace("\r\n", "<br>")
          .Replace("\n", "<br>");
      raw = $"<p>{encoded}</p>";
    }
    else
    {
      result.Html = "<p>(No content)</p>";
      return result;
    }

    // Strip quoted-reply blocks before sanitising so we don't waste cycles
    // sanitising content that will be removed anyway.
    raw = QuoteStripper.Strip(raw);
    result.Html = Sanitizer.Sanitize(raw);
    return result;
  }

  /// <summary>
  /// Walk every MIME part on the message and, for each one whose Content-Id
  /// is referenced via <c>src="cid:…"</c> in the HTML body, write the part
  /// out to disk and substitute the cid for the resulting public URL.
  /// </summary>
  private static string RewriteInlineCids(
      MimeMessage message,
      string uploadDirectory,
      ProcessedHtmlResult result)
  {
    var html = message.HtmlBody ?? string.Empty;
    var cidMap = new Dictionary<string, string>(StringComparer.OrdinalIgnoreCase);

    foreach (var part in message.BodyParts.OfType<MimePart>())
    {
      if (string.IsNullOrWhiteSpace(part.ContentId))
        continue;
      if (part.Content == null)
        continue;

      // Only rewrite cids that actually appear in the body (no orphan saves).
      var cid = part.ContentId.Trim().Trim('<', '>');
      if (!html.Contains(cid, StringComparison.OrdinalIgnoreCase))
        continue;

      var fileName = part.FileName ?? $"inline-{Guid.NewGuid():N}";
      var ext = Path.GetExtension(fileName);
      if (string.IsNullOrWhiteSpace(ext))
      {
        ext = part.ContentType.MediaSubtype switch
        {
          "jpeg" => ".jpg",
          var s when !string.IsNullOrWhiteSpace(s) => "." + s.ToLowerInvariant(),
          _ => ".bin"
        };
        fileName += ext;
      }

      var safeName = $"{Guid.NewGuid()}{ext}";
      var filePath = Path.Combine(uploadDirectory, safeName);

      try
      {
        Directory.CreateDirectory(uploadDirectory);
        using var stream = File.Create(filePath);
        part.Content.DecodeTo(stream);
      }
      catch
      {
        // Fall through — leaving the cid in place is harmless; the body
        // will just render with a broken image, which mirrors what most
        // mail clients do when a cid fails to resolve.
        continue;
      }

      var publicUrl = $"/uploads/{safeName}";
      cidMap[cid] = publicUrl;

      result.InlineAttachments.Add(new InlineAttachmentInfo
      {
        FileName = fileName,
        FileUrl = publicUrl,
        ContentType = part.ContentType.MimeType,
        FileSize = new FileInfo(filePath).Length,
        ContentId = cid
      });
    }

    if (cidMap.Count == 0)
      return html;

    return CidImgRegex.Replace(html, m =>
    {
      var cid = m.Groups["cid"].Value.Trim();
      return cidMap.TryGetValue(cid, out var url)
          ? $"src=\"{url}\""
          : m.Value;
    });
  }
}

/// <summary>Output of <see cref="EmailHtmlProcessor.Build"/>.</summary>
internal sealed class ProcessedHtmlResult
{
  public string Html { get; set; } = string.Empty;
  public List<InlineAttachmentInfo> InlineAttachments { get; } = new();
}

internal sealed class InlineAttachmentInfo
{
  public string FileName { get; set; } = string.Empty;
  public string FileUrl { get; set; } = string.Empty;
  public string ContentType { get; set; } = string.Empty;
  public long FileSize { get; set; }
  public string ContentId { get; set; } = string.Empty;
}

/// <summary>
/// Standalone quoted-reply stripper used by the new processor. Mirrors the
/// regex set already used inline in <see cref="EmailPollingService"/>.
/// </summary>
internal static class QuoteStripper
{
  private static readonly Regex GmailQuoteRegex = new(
      @"<blockquote[^>]*class=[""']gmail_quote[^>]*>[\s\S]*",
      RegexOptions.IgnoreCase | RegexOptions.Compiled);
  private static readonly Regex GmailExtraRegex = new(
      @"<div[^>]*class=[""']gmail_quote[^>]*>[\s\S]*",
      RegexOptions.IgnoreCase | RegexOptions.Compiled);
  private static readonly Regex OutlookAppendRegex = new(
      @"<div[^>]*id=[""']appendonsend[^>]*>[\s\S]*",
      RegexOptions.IgnoreCase | RegexOptions.Compiled);
  private static readonly Regex OutlookDividerRegex = new(
      @"<div[^>]*id=[""']divRplyFwdMsg[^>]*>[\s\S]*",
      RegexOptions.IgnoreCase | RegexOptions.Compiled);
  private static readonly Regex OnWroteRegex = new(
      @"(<(?:div|p|blockquote)[^>]*>\s*)?On\s+(Mon|Tue|Wed|Thu|Fri|Sat|Sun|\d{1,2})[\s\S]{0,500}?wrote:\s*<?[\s\S]*",
      RegexOptions.IgnoreCase | RegexOptions.Compiled);
  private static readonly Regex TrailingEmptyRegex = new(
      @"(?:<br\s*/?>|\s|&nbsp;|<p>\s*</p>|<div>\s*</div>)+$",
      RegexOptions.IgnoreCase | RegexOptions.Compiled);

  public static string Strip(string html)
  {
    if (string.IsNullOrWhiteSpace(html)) return html;
    html = GmailQuoteRegex.Replace(html, string.Empty);
    html = GmailExtraRegex.Replace(html, string.Empty);
    html = OutlookAppendRegex.Replace(html, string.Empty);
    html = OutlookDividerRegex.Replace(html, string.Empty);
    html = OnWroteRegex.Replace(html, string.Empty);
    // NOTE: do NOT strip generic <blockquote> tags here — Gmail uses
    // blockquotes for indented / nested content in the ORIGINAL body
    // too. Stripping them silently truncated long emails (everything
    // after the first indented section disappeared). The targeted
    // gmail_quote / Outlook / "On … wrote:" regexes above are enough
    // to remove genuine quoted-reply trails.
    html = TrailingEmptyRegex.Replace(html, string.Empty);
    return html.Trim();
  }
}
