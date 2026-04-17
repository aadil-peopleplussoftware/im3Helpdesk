using iM3Helpdesk.API.Services;
using iM3Helpdesk.Infrastructure.Persistence;
using iM3Helpdesk.Infrastructure.Services;
using Microsoft.AspNetCore.Authentication.JwtBearer;
using Microsoft.EntityFrameworkCore;
using Microsoft.IdentityModel.Tokens;
using System.Text;
using Microsoft.AspNetCore.RateLimiting;
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
  options.AddPolicy("AllowAllLocal", policy =>
  {
    policy.SetIsOriginAllowed(origin => new Uri(origin).Host == "localhost")
          .AllowAnyHeader()
          .AllowAnyMethod()
          .AllowCredentials();
  });
});

builder.Services.AddScoped<ICurrentTenantService, CurrentTenantService>();
builder.Services.AddScoped<ISlaService, SlaService>();
builder.Services.AddSingleton<IEmailQueueService, EmailQueueService>();
builder.Services.AddSingleton<IEscalationService, EscalationService>();
builder.Services.AddHostedService<EmailWorker>();
builder.Services.AddHostedService<EscalationWorker>();
builder.Services.AddHostedService<EmailPollingService>();
builder.Services.AddSignalR();
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
});

builder.Services.AddScoped<iM3Helpdesk.API.Services.IEmailService, iM3Helpdesk.API.Services.EmailService>();
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


var app = builder.Build();

if (app.Environment.IsDevelopment())
{
  app.UseSwagger();
  app.UseSwaggerUI();
}
app.UseStaticFiles();
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
app.UseCors("AllowAllLocal");
app.UseRateLimiter();
app.UseMiddleware<iM3Helpdesk.API.Middleware.TenantMiddleware>();
app.UseAuthentication();
app.UseAuthorization();
app.MapControllers();
app.MapHub<iM3Helpdesk.API.Hubs.ChatHub>("/hubs/chat");
app.Run();
