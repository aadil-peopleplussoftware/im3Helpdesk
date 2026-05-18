using iM3Helpdesk.Domain.Entities;
using iM3Helpdesk.Domain.Enums;
using iM3Helpdesk.Infrastructure.Persistence;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;

namespace iM3Helpdesk.API.Controllers;

[ApiController]
[Route("api/[controller]")]
public class WhatsAppController : ControllerBase
{
  private readonly ApplicationDbContext _context;

  public WhatsAppController(ApplicationDbContext context)
  {
    _context = context;
  }

  [HttpPost("webhook")]
  public IActionResult Webhook([FromForm] WhatsAppWebhookDto dto)
  {
    if (string.IsNullOrEmpty(dto.Body) || string.IsNullOrEmpty(dto.From))
      return BadRequest();

    return Ok(new { message = "Received" });
  }

  // Send WhatsApp reply
  [HttpPost("send")]
  public IActionResult SendMessage([FromBody] SendWhatsAppDto dto)
  {   
    return Ok(new
    {
      message = "WhatsApp configured (Twilio credentials needed)"
    });
  }
}

public class WhatsAppWebhookDto
{
  public string? From { get; set; }
  public string? To { get; set; }
  public string? Body { get; set; }
  public string? ProfileName { get; set; }
  public string? MediaUrl0 { get; set; }
}

public class SendWhatsAppDto
{
  public string To { get; set; } = string.Empty;
  public string Message { get; set; } = string.Empty;
}
