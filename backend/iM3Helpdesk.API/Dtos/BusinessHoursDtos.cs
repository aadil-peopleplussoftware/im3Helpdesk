namespace iM3Helpdesk.API.Dtos;

public class BusinessHoursListItemDto
{
  public Guid Id { get; set; }
  public string Name { get; set; } = "";
  public bool IsDefault { get; set; }
  public string Timezone { get; set; } = "UTC";
  public int GroupsCount { get; set; }
}

public class BusinessHoursDetailDto
{
  public Guid Id { get; set; }
  public string Name { get; set; } = "";
  public string? Description { get; set; }
  public bool IsDefault { get; set; }
  public string Mode { get; set; } = "Custom";
  public string Timezone { get; set; } = "UTC";

  public bool Monday    { get; set; }
  public bool Tuesday   { get; set; }
  public bool Wednesday { get; set; }
  public bool Thursday  { get; set; }
  public bool Friday    { get; set; }
  public bool Saturday  { get; set; }
  public bool Sunday    { get; set; }

  public string StartTime { get; set; } = "09:00";
  public string EndTime   { get; set; } = "18:00";

  public List<BusinessHoursHolidayDto> Holidays { get; set; } = new();
  public List<BusinessHoursGroupDto> Groups { get; set; } = new();
}

public class BusinessHoursHolidayDto
{
  public Guid Id { get; set; }
  public string Name { get; set; } = "";
  /// <summary>"yyyy-MM-dd" — date only.</summary>
  public string Date { get; set; } = "";
  public bool IsRecurring { get; set; } = true;
}

public class BusinessHoursGroupDto
{
  public Guid Id { get; set; }
  public string Name { get; set; } = "";
  public bool Assigned { get; set; }
}

public class BusinessHoursUpsertDto
{
  public string Name { get; set; } = "";
  public string? Description { get; set; }
  public string Mode { get; set; } = "Custom";
  public string Timezone { get; set; } = "UTC";

  public bool Monday    { get; set; } = true;
  public bool Tuesday   { get; set; } = true;
  public bool Wednesday { get; set; } = true;
  public bool Thursday  { get; set; } = true;
  public bool Friday    { get; set; } = true;
  public bool Saturday  { get; set; } = false;
  public bool Sunday    { get; set; } = false;

  public string StartTime { get; set; } = "09:00";
  public string EndTime   { get; set; } = "18:00";
}

public class BusinessHoursHolidayUpsertDto
{
  public string Name { get; set; } = "";
  public string Date { get; set; } = "";
  public bool IsRecurring { get; set; } = true;
}

public class BusinessHoursAssignGroupsDto
{
  public List<Guid> GroupIds { get; set; } = new();
}
