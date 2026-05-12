using iM3Helpdesk.API.Hubs;
using iM3Helpdesk.API.Services;
using iM3Helpdesk.Infrastructure.Persistence;
using iM3Helpdesk.Infrastructure.Services;
using Microsoft.AspNetCore.Authentication.JwtBearer;
using Microsoft.AspNetCore.Http.Features;
using Microsoft.AspNetCore.RateLimiting;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Options;
using Microsoft.IdentityModel.Tokens;
using System.Text;
using System.Threading.RateLimiting;

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
        .AllowCredentials(); // ✅ Required for SignalR
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
builder.Services.AddSingleton<IEmailQueueService, EmailQueueService>();
builder.Services.AddSingleton<IEscalationService, EscalationService>();
builder.Services.AddHostedService<EmailWorker>();
builder.Services.AddHostedService<EscalationWorker>();
builder.Services.AddHostedService<EmailPollingService>();
builder.Services.AddHttpClient();

builder.Services.AddDbContext<ApplicationDbContext>(options =>
    options.UseSqlServer(
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
      return Task.CompletedTask;
    }
  };
});

builder.Services.AddScoped<INotificationService, NotificationService>();
builder.Services.AddAuthorization();
builder.Services.AddControllers()
    .AddJsonOptions(options =>
    {
      options.JsonSerializerOptions.ReferenceHandler =
          System.Text.Json.Serialization.ReferenceHandler.IgnoreCycles;
      options.JsonSerializerOptions.PropertyNamingPolicy =
          System.Text.Json.JsonNamingPolicy.CamelCase;
    });
builder.Services.AddEndpointsApiExplorer();
builder.Services.AddSwaggerGen();
builder.Services.AddMemoryCache();
builder.Services.AddScoped<IOtpService, OtpService>();
builder.Services.AddResponseCaching();
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

app.UseHttpsRedirection();
app.UseCors("AllowAngular"); // ✅ Single CORS policy
app.UseRateLimiter();
app.UseAuthentication();
app.UseAuthorization();
app.UseMiddleware<iM3Helpdesk.API.Middleware.TenantMiddleware>();
app.MapControllers();
app.MapHub<ChatHub>("/hubs/chat");
app.Run();
