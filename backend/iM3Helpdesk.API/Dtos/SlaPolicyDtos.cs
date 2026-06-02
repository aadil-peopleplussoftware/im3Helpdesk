using iM3Helpdesk.Domain.Enums;

namespace iM3Helpdesk.API.Dtos;

// ─────────────────────────────────────────────
// Read DTOs (GET responses)
// ─────────────────────────────────────────────

public class SlaPolicyListItemDto
{
  public Guid Id { get; set; }
  public string Name { get; set; } = "";
  public string? Description { get; set; }
  public bool IsDefault { get; set; }
  public bool IsActive { get; set; }
  public int Order { get; set; }
}

public class SlaPolicyDetailDto
{
  public Guid Id { get; set; }
  public string Name { get; set; } = "";
  public string? Description { get; set; }
  public bool IsDefault { get; set; }
  public bool IsActive { get; set; }
  public int Order { get; set; }
  public List<SlaTargetDto> Targets { get; set; } = new();
  public List<SlaReminderDto> Reminders { get; set; } = new();
  public List<SlaEscalationDto> Escalations { get; set; } = new();
}

public class SlaTargetDto
{
  public Guid Id { get; set; }
  public TicketPriority Priority { get; set; }
  public int FirstResponseMinutes { get; set; }
  public int ResolutionMinutes { get; set; }
  public string OperationalHours { get; set; } = "BusinessHours";
  public bool EscalationEnabled { get; set; } = true;
}

public class SlaReminderDto
{
  public Guid Id { get; set; }
  public string TargetType { get; set; } = "FirstResponse";
  public int ApproachInMinutes { get; set; } = 30;
  public string Recipients { get; set; } = "AssignedAgent";
}

public class SlaEscalationDto
{
  public Guid Id { get; set; }
  public string TargetType { get; set; } = "FirstResponse";
  public int EscalateAfterMinutes { get; set; }
  public string Recipients { get; set; } = "AssignedAgent";
}

public class BusinessHoursDto
{
  public bool Monday    { get; set; } = true;
  public bool Tuesday   { get; set; } = true;
  public bool Wednesday { get; set; } = true;
  public bool Thursday  { get; set; } = true;
  public bool Friday    { get; set; } = true;
  public bool Saturday  { get; set; }
  public bool Sunday    { get; set; }
  public string StartTime { get; set; } = "09:00";
  public string EndTime   { get; set; } = "18:00";
  public string Timezone  { get; set; } = "UTC";
}

// ─────────────────────────────────────────────
// Write DTOs (POST / PUT bodies)
// ─────────────────────────────────────────────

public class SlaPolicyUpsertDto
{
  public string Name { get; set; } = "";
  public string? Description { get; set; }
  public bool IsActive { get; set; } = true;
  public List<SlaTargetDto> Targets { get; set; } = new();
  public List<SlaReminderDto> Reminders { get; set; } = new();
  public List<SlaEscalationDto> Escalations { get; set; } = new();
}
