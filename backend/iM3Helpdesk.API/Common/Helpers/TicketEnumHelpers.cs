using System.Text;
using iM3Helpdesk.Domain.Entities;
using iM3Helpdesk.Domain.Enums;

namespace iM3Helpdesk.API.Common.Helpers;

public static class TicketEnumHelpers
{
    public const string TicketTypeField = "TicketType";
    public const string TicketStatusField = "TicketStatus";
    public const string TicketPriorityField = "TicketPriority";

    public static string? GetTicketRecipientEmail(Ticket ticket)
    {
        if (!string.IsNullOrWhiteSpace(ticket.FromEmail))
            return ticket.FromEmail.Trim();

        return ticket.CreatedBy?.Email;
    }

    public static string FormatSize(long bytes)
    {
        if (bytes < 1024) return $"{bytes} B";
        if (bytes < 1048576)
            return $"{bytes / 1024} KB";
        return $"{bytes / 1048576} MB";
    }

    public static bool TryParseTicketStatus(string? input, out TicketStatus status)
    {
        status = default;
        if (string.IsNullOrWhiteSpace(input))
            return false;

        var value = input.Trim();

        if (Enum.TryParse<TicketStatus>(value, true, out var parsed) &&
            Enum.IsDefined(parsed))
        {
            status = parsed;
            return true;
        }

        var compact = CompactEnumToken(value);
        if (compact == "close")
        {
            status = TicketStatus.Closed;
            return true;
        }

        foreach (var name in Enum.GetNames<TicketStatus>())
        {
            if (CompactEnumToken(name) == compact)
            {
                status = Enum.Parse<TicketStatus>(name, true);
                return true;
            }
        }

        return false;
    }

    public static bool TryParseTicketPriority(string? input, out TicketPriority priority)
    {
        priority = default;
        if (string.IsNullOrWhiteSpace(input))
            return false;

        var value = input.Trim();

        if (Enum.TryParse<TicketPriority>(value, true, out var parsed) &&
            Enum.IsDefined(parsed))
        {
            priority = parsed;
            return true;
        }

        var compact = CompactEnumToken(value);
        if (compact == "urgent")
        {
            priority = TicketPriority.Critical;
            return true;
        }

        foreach (var name in Enum.GetNames<TicketPriority>())
        {
            if (CompactEnumToken(name) == compact)
            {
                priority = Enum.Parse<TicketPriority>(name, true);
                return true;
            }
        }

        return false;
    }

    public static string CompactEnumToken(string value)
    {
        var sb = new StringBuilder(value.Length);
        foreach (var ch in value)
        {
            if (char.IsLetterOrDigit(ch))
                sb.Append(char.ToLowerInvariant(ch));
        }

        return sb.ToString();
    }
}
