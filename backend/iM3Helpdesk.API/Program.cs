using iM3Helpdesk.API.Hubs;
using iM3Helpdesk.API.Services;
using iM3Helpdesk.Infrastructure.Persistence;
using iM3Helpdesk.Infrastructure.Services;
using Microsoft.AspNetCore.Authentication.JwtBearer;
using Microsoft.AspNetCore.Http.Features;
using Microsoft.AspNetCore.RateLimiting;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Diagnostics;
using Microsoft.Extensions.Options;
using Microsoft.IdentityModel.Tokens;
using System.Text;
using System.Threading.RateLimiting;
using iM3Helpdesk.Application.Contracts.Services;

var builder = WebApplication.CreateBuilder(args);

builder.Services.AddRateLimiter(options =>
{
  options.AddFixedWindowLimiter("login", opt =>
  {
    opt.PermitLimit = 5;
    opt.Window = TimeSpan.FromMinutes(1);
    opt.QueueProcessingOrder = QueueProcessingOrder.OldestFirst;
    opt.QueueLimit = 0;
  });
});

builder.Services.AddCors(options =>
{
  options.AddPolicy("AllowAngular", policy =>
  {
    policy
        .SetIsOriginAllowed(origin =>
            new Uri(origin).Host == "localhost")
        .AllowAnyHeader()
        .AllowAnyMethod()
        .AllowCredentials();
  });
});

builder.Services.Configure<FormOptions>(x => {
  x.MultipartBodyLengthLimit = 104857600; // 100MB
});
builder.WebHost.ConfigureKestrel(o => {
  o.Limits.MaxRequestBodySize = 104857600;
});


builder.Services.AddScoped<ICurrentTenantService, CurrentTenantService>();
builder.Services.AddScoped<ISlaService, SlaService>();
builder.Services.AddScoped<iM3Helpdesk.API.Services.ISubscriptionService, iM3Helpdesk.API.Services.SubscriptionService>();
builder.Services.AddScoped<iM3Helpdesk.API.Services.IPermissionService, iM3Helpdesk.API.Services.PermissionService>();
builder.Services.AddSingleton<IEmailQueueService, EmailQueueService>();
builder.Services.AddSingleton<IEscalationService, EscalationService>();
builder.Services.AddHostedService<EmailWorker>();
builder.Services.AddHostedService<EscalationWorker>();
builder.Services.AddHostedService<EmailPollingService>();
builder.Services.AddHostedService<RecycleBinPurgeWorker>();
builder.Services.Configure<BirthdayPostOptions>(
  builder.Configuration.GetSection("BirthdayPosts"));
builder.Services.AddHostedService<BirthdayPostWorker>();
builder.Services.Configure<HolidayPostOptions>(
  builder.Configuration.GetSection("HolidayPosts"));
builder.Services.AddHostedService<HolidayPostWorker>();
builder.Services.AddHttpClient();

builder.Services.AddDbContext<ApplicationDbContext>(options =>
  options
    .ConfigureWarnings(w =>
      w.Ignore(CoreEventId.PossibleIncorrectRequiredNavigationWithQueryFilterInteractionWarning))
    .UseSqlServer(
      builder.Configuration.GetConnectionString("DefaultConnection"),
      b => b.MigrationsAssembly("iM3Helpdesk.Infrastructure")));

var jwtSettings = builder.Configuration.GetSection("JwtSettings");
var secretKey = jwtSettings["SecretKey"]!;

builder.Services.AddAuthentication(options =>
{
  options.DefaultAuthenticateScheme = JwtBearerDefaults.AuthenticationScheme;
  options.DefaultChallengeScheme = JwtBearerDefaults.AuthenticationScheme;
})
.AddJwtBearer(options =>
{
  options.TokenValidationParameters = new TokenValidationParameters
  {
    ValidateIssuer = true,
    ValidateAudience = true,
    ValidateLifetime = true,
    ValidateIssuerSigningKey = true,
    ValidIssuer = jwtSettings["Issuer"],
    ValidAudience = jwtSettings["Audience"],
    IssuerSigningKey = new SymmetricSecurityKey(
          Encoding.UTF8.GetBytes(secretKey))
  };
  // ✅ Required for SignalR: read token from query string
  options.Events = new JwtBearerEvents
  {
    OnMessageReceived = context =>
    {
      var accessToken = context.Request.Query["access_token"];
      var path = context.HttpContext.Request.Path;
      if (!string.IsNullOrEmpty(accessToken) &&
          path.StartsWithSegments("/hubs"))
      {
        context.Token = accessToken;
      }

      // Cookie-first auth path for SPA requests using HttpOnly cookies.
      if (string.IsNullOrEmpty(context.Token) &&
          context.Request.Cookies.TryGetValue("im3_access", out var cookieToken))
      {
        context.Token = cookieToken;
      }
      return Task.CompletedTask;
    }
  };
});

builder.Services.AddScoped<INotificationService, NotificationService>();

// Register TokenValidationParameters
builder.Services.AddSingleton(new TokenValidationParameters
{
  ValidateIssuer = true,
  ValidateAudience = true,
  ValidateLifetime = true,
  ValidateIssuerSigningKey = true,
  ValidIssuer = jwtSettings["Issuer"],
  ValidAudience = jwtSettings["Audience"],
  IssuerSigningKey = new SymmetricSecurityKey(Encoding.UTF8.GetBytes(secretKey))
});
builder.Services.AddAuthorization();
builder.Services.AddControllers()
    .AddJsonOptions(options =>
    {
      options.JsonSerializerOptions.ReferenceHandler =
          System.Text.Json.Serialization.ReferenceHandler.IgnoreCycles;
      options.JsonSerializerOptions.PropertyNamingPolicy =
          System.Text.Json.JsonNamingPolicy.CamelCase;
      // Always serialize DateTime as ISO-8601 UTC with a Z suffix so
      // browsers convert correctly to the user's configured timezone.
      // Without this, EF Core's DateTimeKind.Unspecified values would be
      // written without a zone and treated as local time by JavaScript.
      options.JsonSerializerOptions.Converters.Add(
          new iM3Helpdesk.API.Json.UtcDateTimeConverter());
      options.JsonSerializerOptions.Converters.Add(
          new iM3Helpdesk.API.Json.NullableUtcDateTimeConverter());
      // Serialize/deserialize enums as their string names (e.g. "Monthly"
      // instead of 0). Frontend submits and consumes string enum values.
      options.JsonSerializerOptions.Converters.Add(
          new System.Text.Json.Serialization.JsonStringEnumConverter());
    });
builder.Services.AddEndpointsApiExplorer();
builder.Services.AddSwaggerGen();
builder.Services.AddMemoryCache();
builder.Services.AddScoped<IOtpService, OtpService>();
builder.Services.AddResponseCaching();
builder.Services.AddSingleton<IEmailTemplateRenderer, EmailTemplateRenderer>();
builder.Services.AddScoped<IEmailService, EmailService>();
builder.Services.AddSignalR();
var app = builder.Build();

if (app.Environment.IsDevelopment())
{
  app.UseSwagger();
  app.UseSwaggerUI();
}
app.UseStaticFiles();
app.UseStaticFiles(new StaticFileOptions
{
  FileProvider = new Microsoft.Extensions
        .FileProviders.PhysicalFileProvider(
        Path.Combine(
            builder.Environment.ContentRootPath,
            "wwwroot")),
  RequestPath = ""
});
var uploadsPath = Path.Combine(
    Directory.GetCurrentDirectory(),
    "wwwroot", "uploads");
Directory.CreateDirectory(uploadsPath);

app.UseStaticFiles(new StaticFileOptions
{
  FileProvider = new Microsoft.Extensions
        .FileProviders.PhysicalFileProvider(
            uploadsPath),
  RequestPath = "/uploads",
  OnPrepareResponse = ctx =>
  {
    ctx.Context.Response.Headers
        .Append("Access-Control-Allow-Origin", "*");
  }
});
app.UseStaticFiles(new StaticFileOptions
{
  OnPrepareResponse = ctx =>
  {
    ctx.Context.Response.Headers
        .Append("Access-Control-Allow-Origin", "*");
    ctx.Context.Response.Headers
        .Append("Cache-Control",
            "public,max-age=3600");
  }
});

app.UseCors("AllowAngular");
app.UseRateLimiter();
app.UseAuthentication();
app.UseAuthorization();
app.UseMiddleware<iM3Helpdesk.API.Middleware.TenantMiddleware>();
app.MapControllers();
app.MapHub<ChatHub>("/hubs/chat");

// ── Seed subscription plans + trial subscriptions for existing orgs ──
using (var scope = app.Services.CreateScope())
{
    var db = scope.ServiceProvider.GetRequiredService<iM3Helpdesk.Infrastructure.Persistence.ApplicationDbContext>();
    try { await iM3Helpdesk.API.Services.SubscriptionSeeder.SeedAsync(db); }
    catch (Exception ex)
    {
        var logger = scope.ServiceProvider.GetRequiredService<ILogger<Program>>();
        logger.LogWarning(ex, "Subscription seeding failed (likely pending migration). Run 'dotnet ef database update'.");
    }
}

app.Run();
