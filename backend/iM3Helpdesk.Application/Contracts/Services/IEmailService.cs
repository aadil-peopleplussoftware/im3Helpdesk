namespace iM3Helpdesk.Application.Contracts.Services;

public interface IEmailService
{
    // Core send
    Task SendAsync(
        string to,
        string subject,
        string htmlBody,
        string? replyTo = null,
        Guid? organizationId = null,
        bool wrapInMasterTemplate = true,
        string? ticketNumberTag = null);

    // Agent reply to customer (extended)
    Task<string?> SendReplyAsync(
        string to,
        string subject,
        string htmlBody,
        string ticketNumber,
        string agentName,
        string agentSignature,
        Guid? organizationId = null,
        IEnumerable<string>? cc = null,
        IEnumerable<string>? bcc = null,
        string? inReplyTo = null,
        IEnumerable<string>? references = null);

    // Forward (with optional cc/bcc + threading)
    Task<string?> SendForwardAsync(
        string to,
        string subject,
        string htmlBody,
        Guid? organizationId = null,
        IEnumerable<string>? cc = null,
        IEnumerable<string>? bcc = null,
        string? inReplyTo = null,
        IEnumerable<string>? references = null,
        string? fromDisplayName = null);

    // Ticket lifecycle emails
    Task SendTicketCreatedAsync(
        string to,
        string customerName,
        string ticketTitle,
        string ticketNumber,
        string category,
        string priority,
        string orgName,
        Guid? organizationId = null);

    Task SendTicketStatusChangedAsync(
        string to,
        string customerName,
        string ticketTitle,
        string ticketNumber,
        string oldStatus,
        string newStatus,
        string orgName,
        Guid? organizationId = null);

    Task SendTicketAssignedAsync(
        string agentEmail,
        string agentName,
        string ticketTitle,
        string ticketNumber,
        string customerName,
        string priority,
        string orgName,
        Guid? organizationId = null);

    Task SendTicketMergedAsync(
        string to,
        string customerName,
        string mergedTicketNumber,
        string originalTicketNumber,
        string originalTicketTitle,
        string orgName,
        Guid? organizationId = null);

    // Auth emails
    Task SendEmailVerificationAsync(
        string to,
        string fullName,
        string verificationToken,
        string orgName = "DeskMate",
        Guid? organizationId = null);

    Task SendWelcomeEmailAsync(
        string to,
        string fullName,
        string companyName,
        Guid? organizationId = null);

    Task SendForgotPasswordAsync(
        string to,
        string fullName,
        string resetToken,
        string orgName = "DeskMate",
        Guid? organizationId = null);

    Task SendAgentInviteAsync(
        string to,
        string agentName,
        string orgName,
        string tempPassword,
        Guid? organizationId = null);

    // OTP Login
    Task SendOtpEmailAsync(
        string to,
        string fullName,
        string otp,
        Guid? organizationId = null);

    // Calendar emails
    Task SendCalendarReminderAsync(
        string to,
        string attendeeName,
        string eventTitle,
        string eventType,
        string eventDescription,
        DateTime startDate,
        int minutesBefore,
        string? ticketNumber,
        string orgName,
        Guid? organizationId = null);

    Task SendCalendarInviteAsync(
        string to,
        string attendeeName,
        string eventTitle,
        string eventType,
        string eventDescription,
        DateTime startDate,
        DateTime? endDate,
        string organizerName,
        string orgName,
        Guid? organizationId = null);

    Task SendCalendarEventUpdatedAsync(
        string to,
        string attendeeName,
        string eventTitle,
        DateTime startDate,
        string changeType,  // "updated" | "cancelled"
        string orgName,
        Guid? organizationId = null);
}
