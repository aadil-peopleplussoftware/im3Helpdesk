using System;
using System.Globalization;
using System.Text.Json;
using System.Text.Json.Serialization;

namespace iM3Helpdesk.API.Json;

/// <summary>
/// Serializes all <see cref="DateTime"/> values as ISO 8601 UTC strings
/// with a trailing "Z" suffix.
/// <para>
/// Background: EF Core reads <c>datetime2</c> columns into a
/// <see cref="DateTime"/> whose <see cref="DateTime.Kind"/> is
/// <see cref="DateTimeKind.Unspecified"/>. The default System.Text.Json
/// behaviour then writes the value WITHOUT a timezone designator, e.g.
/// <c>"2026-05-27T11:23:00"</c>. Browsers parse such strings as
/// <em>local</em> time, which silently breaks any client-side timezone
/// conversion (a UTC moment ends up displayed as if it were IST/Qatar
/// local already).
/// </para>
/// <para>
/// This converter assumes that any persisted timestamp is conceptually
/// UTC (which matches our convention of always writing
/// <c>DateTime.UtcNow</c>), tags it with <see cref="DateTimeKind.Utc"/>
/// when needed, and serializes it as
/// <c>"2026-05-27T11:23:00.000Z"</c> so browsers convert correctly.
/// </para>
/// </summary>
public sealed class UtcDateTimeConverter : JsonConverter<DateTime>
{
  public override DateTime Read(
      ref Utf8JsonReader reader,
      Type typeToConvert,
      JsonSerializerOptions options)
  {
    var raw = reader.GetDateTime();
    return raw.Kind == DateTimeKind.Unspecified
        ? DateTime.SpecifyKind(raw, DateTimeKind.Utc)
        : raw.ToUniversalTime();
  }

  public override void Write(
      Utf8JsonWriter writer,
      DateTime value,
      JsonSerializerOptions options)
  {
    var utc = value.Kind switch
    {
      DateTimeKind.Utc => value,
      DateTimeKind.Local => value.ToUniversalTime(),
      _ => DateTime.SpecifyKind(value, DateTimeKind.Utc)
    };
    // Use the round-trip "O" format with InvariantCulture so the ':'
    // time separator is preserved verbatim (some server cultures rewrite
    // ':' to '.' which produces strings JS cannot parse).
    writer.WriteStringValue(
        utc.ToString("yyyy-MM-ddTHH:mm:ss.fffZ", CultureInfo.InvariantCulture));
  }
}

/// <summary>
/// Same behaviour as <see cref="UtcDateTimeConverter"/> but for nullable
/// <c>DateTime?</c> properties.
/// </summary>
public sealed class NullableUtcDateTimeConverter : JsonConverter<DateTime?>
{
  public override DateTime? Read(
      ref Utf8JsonReader reader,
      Type typeToConvert,
      JsonSerializerOptions options)
  {
    if (reader.TokenType == JsonTokenType.Null) return null;
    var raw = reader.GetDateTime();
    return raw.Kind == DateTimeKind.Unspecified
        ? DateTime.SpecifyKind(raw, DateTimeKind.Utc)
        : raw.ToUniversalTime();
  }

  public override void Write(
      Utf8JsonWriter writer,
      DateTime? value,
      JsonSerializerOptions options)
  {
    if (value is null)
    {
      writer.WriteNullValue();
      return;
    }
    var v = value.Value;
    var utc = v.Kind switch
    {
      DateTimeKind.Utc => v,
      DateTimeKind.Local => v.ToUniversalTime(),
      _ => DateTime.SpecifyKind(v, DateTimeKind.Utc)
    };
    writer.WriteStringValue(
        utc.ToString("yyyy-MM-ddTHH:mm:ss.fffZ", CultureInfo.InvariantCulture));
  }
}
