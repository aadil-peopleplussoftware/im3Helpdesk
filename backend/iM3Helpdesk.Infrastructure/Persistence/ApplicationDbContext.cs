using iM3Helpdesk.Domain.Entities;
using iM3Helpdesk.Domain.Enums;
using iM3Helpdesk.Infrastructure.Services;
using Microsoft.EntityFrameworkCore;

namespace iM3Helpdesk.Infrastructure.Persistence;

public class ApplicationDbContext : DbContext
{
  private readonly Guid? _currentTenantId;
  private readonly bool _isSuperAdmin;

  public ApplicationDbContext(
      DbContextOptions<ApplicationDbContext>
          options,
      ICurrentTenantService tenantService)
          : base(options)
  {
    _currentTenantId =
        tenantService.OrganizationId;
    _isSuperAdmin =
        tenantService.IsSuperAdmin;
  }

  // ════════════════════════════════════
  // DbSets — All Tables
  // ════════════════════════════════════
  public DbSet<Organization> Organizations
      => Set<Organization>();
  public DbSet<User> Users
      => Set<User>();
  public DbSet<Lead> Leads
      => Set<Lead>();
  public DbSet<Ticket> Tickets
      => Set<Ticket>();
  public DbSet<TicketComment> TicketComments
      => Set<TicketComment>();
  public DbSet<Notification> Notifications
      => Set<Notification>();
  public DbSet<ActivityLog> ActivityLogs
      => Set<ActivityLog>();
  public DbSet<KbArticle> KbArticles
      => Set<KbArticle>();
  public DbSet<KbReaction> KbReactions
      => Set<KbReaction>();
  public DbSet<KbComment> KbComments
      => Set<KbComment>();
  public DbSet<TicketTemplate> TicketTemplates
      => Set<TicketTemplate>();
  public DbSet<EmailQueue> EmailQueues
      => Set<EmailQueue>();
  public DbSet<AgentGroup> AgentGroups
      => Set<AgentGroup>();
  public DbSet<AgentGroupMember>
      AgentGroupMembers
      => Set<AgentGroupMember>();
  public DbSet<TicketAttachment>
      TicketAttachments
      => Set<TicketAttachment>();
  public DbSet<CustomField> CustomFields
      => Set<CustomField>();
  public DbSet<TicketFieldMaster> TicketFieldMasters
      => Set<TicketFieldMaster>();
  public DbSet<TicketCustomFieldValue>
      TicketCustomFieldValues
      => Set<TicketCustomFieldValue>();
  public DbSet<TicketViewer> TicketViewers
      => Set<TicketViewer>();
  public DbSet<EmailNotificationSetting>
      EmailNotificationSettings
      => Set<EmailNotificationSetting>();
  public DbSet<Contact> Contacts
      => Set<Contact>();
  public DbSet<TodoItem> TodoItems
      => Set<TodoItem>();
  public DbSet<ChatMessage> ChatMessages
      => Set<ChatMessage>();
  public DbSet<UserOnlineStatus>
      UserOnlineStatuses
      => Set<UserOnlineStatus>();
  public DbSet<ChatGroup> ChatGroups
      => Set<ChatGroup>();
  public DbSet<ChatGroupMember>
      ChatGroupMembers
      => Set<ChatGroupMember>();

  // ✅ NEW — Call Log
  public DbSet<CallLog> CallLogs
      => Set<CallLog>();

  public DbSet<CalendarEvent> CalendarEvents { get; set; }

  // ✅ NEW — Holidays
  public DbSet<Holiday> Holidays => Set<Holiday>();
  public DbSet<HolidayYearSetup> HolidayYearSetups
      => Set<HolidayYearSetup>();

  // ✅ NEW — Role Rights matrix
  public DbSet<RolePermission> RolePermissions => Set<RolePermission>();

  // ════════════════════════════════════
  // OnModelCreating
  // ════════════════════════════════════
  protected override void OnModelCreating(
      ModelBuilder modelBuilder)
  {
    base.OnModelCreating(modelBuilder);

    // ── Organization ──────────────
    modelBuilder.Entity<Organization>(e =>
    {
      e.HasKey(x => x.Id);
      e.HasIndex(x => x.Slug)
          .IsUnique();
      e.Property(x => x.Name)
          .HasMaxLength(200)
          .IsRequired();
      e.Property(x => x.Slug)
          .HasMaxLength(100)
          .IsRequired();
      e.Property(x => x.SupportEmail)
          .HasMaxLength(256);
      e.Property(x => x.SmtpHost)
          .HasMaxLength(200);
      e.Property(x => x.SmtpFromEmail)
          .HasMaxLength(256);
      e.Property(x => x.SmtpFromName)
          .HasMaxLength(200);
      e.Property(x => x.SmtpUsername)
          .HasMaxLength(256);
      e.Property(x => x.SmtpPassword)
          .HasMaxLength(500);
      e.Property(x => x.ImapHost)
          .HasMaxLength(200);
    });

    // ── User ──────────────────────
    modelBuilder.Entity<User>(e =>
    {
      e.HasKey(x => x.Id);
      e.HasIndex(x => x.Email)
          .IsUnique();
      e.Property(x => x.Email)
          .HasMaxLength(256)
          .IsRequired();
      e.Property(x => x.FullName)
          .HasMaxLength(200)
          .IsRequired();
      e.Property(x => x.Department)
          .HasMaxLength(120);
      e.Property(x => x.Location)
          .HasMaxLength(120);
      e.Property(x => x.Designation)
          .HasMaxLength(120);
      e.Property(x => x.Gender)
          .HasMaxLength(30);
      e.HasQueryFilter(u =>
          _isSuperAdmin ||
          u.OrganizationId ==
              _currentTenantId);
      e.HasOne(u => u.Organization)
          .WithMany(o => o.Users)
          .HasForeignKey(u =>
              u.OrganizationId);
    });

    // ── Lead ──────────────────────
    modelBuilder.Entity<Lead>(e =>
    {
      e.HasKey(x => x.Id);
      e.Property(x => x.OrganizationName)
          .HasMaxLength(200)
          .IsRequired();
      e.Property(x => x.OwnerName)
          .HasMaxLength(200)
          .IsRequired();
      e.Property(x => x.WorkEmail)
          .HasMaxLength(256)
          .IsRequired();
      e.Property(x => x.Phone)
          .HasMaxLength(30);
      e.Property(x => x.Notes)
          .HasColumnType("nvarchar(max)");
      e.Property(x => x.RejectionReason)
          .HasMaxLength(500);
      e.Property(x => x.Status)
          .HasConversion<int>();
      e.HasIndex(x => x.WorkEmail);
      e.HasIndex(x => x.Status);
      e.HasIndex(x => x.CreatedAt);
      e.HasIndex(x => x.RegistrationToken)
          .IsUnique()
          .HasFilter("[RegistrationToken] IS NOT NULL");
    });

    // ── Ticket ────────────────────
    modelBuilder.Entity<Ticket>(e =>
    {
      e.HasKey(x => x.Id);
      e.Property(x => x.Title)
          .HasMaxLength(500)
          .IsRequired();
      e.Property(x => x.Category)
          .HasMaxLength(100);

      // ✅ CRITICAL: No IDENTITY
      // ValueGeneratedNever = no IDENTITY
      e.Property(x => x.TicketNumber)
          .ValueGeneratedNever()
          .HasDefaultValue(0);

      e.Property(x => x.Description)
          .HasColumnType("nvarchar(max)");
      e.Property(x => x.Tags)
          .HasColumnType("nvarchar(max)");

      // Tenant isolation + recycle-bin filter: hide soft-deleted tickets
      // from every regular query. The RecycleBinController calls
      // IgnoreQueryFilters() to surface deleted rows.
      e.HasQueryFilter(t =>
          (_isSuperAdmin ||
           t.OrganizationId ==
              _currentTenantId)
          && !t.IsDeleted);

      e.HasIndex(t => t.IsDeleted);

      e.HasOne(t => t.CreatedBy)
          .WithMany()
          .HasForeignKey(t =>
              t.CreatedByUserId)
          .OnDelete(
              DeleteBehavior.Restrict);
      e.HasOne(t => t.AssignedTo)
          .WithMany()
          .HasForeignKey(t =>
              t.AssignedToUserId)
          .OnDelete(
              DeleteBehavior.Restrict);
      e.HasOne(t => t.Organization)
          .WithMany()
          .HasForeignKey(t =>
              t.OrganizationId)
          .OnDelete(
              DeleteBehavior.Restrict);

      e.HasIndex(t => t.OrganizationId);
      e.HasIndex(t => t.CreatedAt);
      e.HasIndex(t => t.Status);
      e.HasIndex(t => new
      {
        t.OrganizationId,
        t.Status
      });
    });

    // ── TicketComment ─────────────
    modelBuilder.Entity<TicketComment>(e =>
    {
      e.HasKey(x => x.Id);
      e.Property(x => x.Comment)
          .HasColumnType("nvarchar(max)")
          .IsRequired();
      e.Property(x => x.IsInternal)
          .HasDefaultValue(false);
      e.HasQueryFilter(c =>
          _isSuperAdmin ||
          c.OrganizationId ==
              _currentTenantId);
      e.HasOne(c => c.User)
          .WithMany()
          .HasForeignKey(c => c.UserId)
          .IsRequired(false)
          .OnDelete(
              DeleteBehavior.Restrict);
      e.HasIndex(c => c.EmailMessageId);
    });

    // ── Notification ──────────────
    modelBuilder.Entity<Notification>(e =>
    {
      e.HasKey(x => x.Id);
      e.Property(x => x.Title)
          .HasMaxLength(200)
          .IsRequired();
      e.Property(x => x.Message)
          .HasMaxLength(500)
          .IsRequired();
      e.HasQueryFilter(n =>
          _isSuperAdmin ||
          n.OrganizationId ==
              _currentTenantId);
      e.HasOne(n => n.User)
          .WithMany()
          .HasForeignKey(n => n.UserId)
          .OnDelete(
              DeleteBehavior.Restrict);
      e.HasOne(n => n.Ticket)
          .WithMany()
          .HasForeignKey(n => n.TicketId)
          .OnDelete(
              DeleteBehavior.SetNull);
      e.HasIndex(n => new
      {
        n.UserId,
        n.IsRead
      });
    });

    // ── ActivityLog ───────────────
    modelBuilder.Entity<ActivityLog>(e =>
    {
      e.HasKey(x => x.Id);
      e.Property(x => x.Action)
          .HasMaxLength(100)
          .IsRequired();
      e.Property(x => x.Description)
          .HasColumnType("nvarchar(max)");
      e.HasQueryFilter(a =>
          _isSuperAdmin ||
          a.OrganizationId ==
              _currentTenantId);
      e.HasOne(a => a.User)
          .WithMany()
          .HasForeignKey(a => a.UserId)
          .OnDelete(
              DeleteBehavior.Restrict);
      e.HasIndex(a =>
          a.OrganizationId);
    });

    // ── KbArticle ─────────────────
    modelBuilder.Entity<KbArticle>(e =>
    {
      e.HasKey(x => x.Id);
      e.Property(x => x.Title)
          .HasMaxLength(300)
          .IsRequired();
      e.Property(x => x.Content)
          .IsRequired();
      e.Property(x => x.Category)
          .HasMaxLength(100);
      e.HasQueryFilter(a =>
          _isSuperAdmin ||
          a.OrganizationId ==
              _currentTenantId);
      e.Property(x => x.MediaUrl)
          .HasMaxLength(500)
          .HasDefaultValue("");
      e.Property(x => x.MediaType)
          .HasMaxLength(20)
          .HasDefaultValue("none");
      e.HasOne(a => a.CreatedBy)
          .WithMany()
          .HasForeignKey(a =>
              a.CreatedByUserId)
          .OnDelete(
              DeleteBehavior.Restrict);
    });

    // ── KbReaction ────────────────
    modelBuilder.Entity<KbReaction>(e =>
    {
      e.HasKey(x => x.Id);
      e.HasIndex(x => new { x.ArticleId, x.UserId })
          .IsUnique();
      e.Property(x => x.ReactionType)
          .HasMaxLength(20)
          .HasDefaultValue("like");
      e.HasQueryFilter(r =>
          _isSuperAdmin ||
          r.OrganizationId == _currentTenantId);
      e.HasOne(r => r.Article)
          .WithMany(a => a.Reactions)
          .HasForeignKey(r => r.ArticleId)
          .OnDelete(DeleteBehavior.Cascade);
      e.HasOne(r => r.User)
          .WithMany()
          .HasForeignKey(r => r.UserId)
          .OnDelete(DeleteBehavior.Restrict);
    });

    // ── KbComment ─────────────────
    modelBuilder.Entity<KbComment>(e =>
    {
      e.HasKey(x => x.Id);
      e.Property(x => x.Text)
          .HasColumnType("nvarchar(max)")
          .IsRequired();
      e.HasQueryFilter(c =>
          _isSuperAdmin ||
          c.OrganizationId == _currentTenantId);
      e.HasOne(c => c.Article)
          .WithMany(a => a.Comments)
          .HasForeignKey(c => c.ArticleId)
          .OnDelete(DeleteBehavior.Cascade);
      e.HasOne(c => c.User)
          .WithMany()
          .HasForeignKey(c => c.UserId)
          .OnDelete(DeleteBehavior.Restrict);
    });

    // ── TicketTemplate ────────────
    modelBuilder.Entity<TicketTemplate>(e =>
    {
      e.HasKey(x => x.Id);
      e.Property(x => x.Name)
          .HasMaxLength(100)
          .IsRequired();
      e.HasQueryFilter(t =>
          _isSuperAdmin ||
          t.OrganizationId ==
              _currentTenantId);
    });

    // ── EmailQueue ────────────────
    modelBuilder.Entity<EmailQueue>(e =>
    {
      e.HasKey(x => x.Id);
      e.Property(x => x.ToEmail)
          .HasMaxLength(256)
          .IsRequired();
      e.Property(x => x.Subject)
          .HasMaxLength(500)
          .IsRequired();
    });

    // ── AgentGroup ────────────────
    modelBuilder.Entity<AgentGroup>(e =>
    {
      e.HasKey(x => x.Id);
      e.Property(x => x.Name)
          .HasMaxLength(100)
          .IsRequired();
      e.HasQueryFilter(g =>
          _isSuperAdmin ||
          g.OrganizationId ==
              _currentTenantId);
    });

    // ── AgentGroupMember ──────────
    modelBuilder.Entity<AgentGroupMember>(
        e =>
        {
          e.HasKey(x => x.Id);
          e.HasOne(m => m.Group)
                  .WithMany(g => g.Members)
                  .HasForeignKey(m =>
                      m.AgentGroupId)
                  .OnDelete(
                      DeleteBehavior.Cascade)
                  .IsRequired(false);
          e.HasOne(m => m.User)
                  .WithMany()
                  .HasForeignKey(m => m.UserId)
                  .OnDelete(
                      DeleteBehavior.Restrict);
          // ✅ NEW — tenant filter via Group
          e.HasQueryFilter(m =>
                  _isSuperAdmin ||
                  (m.Group != null &&
                   m.Group.OrganizationId ==
                      _currentTenantId));
        });

    // ── TicketAttachment ──────────
    modelBuilder.Entity<TicketAttachment>(
        e =>
        {
          e.HasKey(x => x.Id);
          e.Property(x => x.FileName)
                  .HasMaxLength(300)
                  .IsRequired();
          e.HasQueryFilter(a =>
                  _isSuperAdmin ||
                  a.OrganizationId ==
                      _currentTenantId);
          e.HasOne(a => a.Ticket)
                  .WithMany()
                  .HasForeignKey(a => a.TicketId)
                  .OnDelete(
                      DeleteBehavior.Cascade);
          e.HasOne(a => a.UploadedBy)
                  .WithMany()
                  .HasForeignKey(a =>
                      a.UploadedByUserId)
                  .OnDelete(
                      DeleteBehavior.Restrict);
        });

    // ── CustomField ───────────────
    modelBuilder.Entity<CustomField>(e =>
    {
      e.HasKey(x => x.Id);
      e.Property(x => x.Label)
          .HasMaxLength(200)
          .IsRequired();
      e.Property(x => x.FieldType)
          .HasMaxLength(50);
      e.HasQueryFilter(f =>
          _isSuperAdmin ||
          f.OrganizationId ==
              _currentTenantId);
    });

        // ── TicketFieldMaster ────────
        modelBuilder.Entity<TicketFieldMaster>(e =>
        {
            e.HasKey(x => x.Id);
            e.Property(x => x.Field)
                    .HasMaxLength(30)
                    .IsRequired();
            e.Property(x => x.Value)
                    .HasMaxLength(120)
                    .IsRequired();
            e.Property(x => x.Label)
                    .HasMaxLength(120)
                    .IsRequired();
            e.HasIndex(x => new
            {
                x.OrganizationId,
                x.Field,
                x.Value
            }).IsUnique();
            e.HasIndex(x => new
            {
                x.OrganizationId,
                x.Field,
                x.IsActive,
                x.SortOrder
            });
            e.HasQueryFilter(m =>
                    _isSuperAdmin ||
                    m.OrganizationId ==
                            _currentTenantId);
        });

    // ── TicketCustomFieldValue ────
    modelBuilder.Entity<
        TicketCustomFieldValue>(e =>
        {
          e.HasKey(x => x.Id);
          e.HasOne(v => v.Ticket)
                  .WithMany()
                  .HasForeignKey(v => v.TicketId)
                  .OnDelete(
                      DeleteBehavior.Cascade);
          e.HasOne(v => v.CustomField)
                  .WithMany()
                  .HasForeignKey(v =>
                      v.CustomFieldId)
                  .OnDelete(
                      DeleteBehavior.Cascade);
          e.HasQueryFilter(v =>
                  _isSuperAdmin ||
                  v.OrganizationId ==
                      _currentTenantId);
        });

    // ── TicketViewer ──────────────
    modelBuilder.Entity<TicketViewer>(e =>
    {
      e.HasKey(x => x.Id);
      e.HasIndex(x => new
      {
        x.TicketId,
        x.UserId
      });
    });

    // ── EmailNotificationSetting ──
    modelBuilder.Entity<
        EmailNotificationSetting>(e =>
        {
          e.HasKey(x => x.Id);
          e.HasIndex(x => new
          {
            x.OrganizationId,
            x.NotifKey
          });
          e.HasQueryFilter(s =>
                  _isSuperAdmin ||
                  s.OrganizationId ==
                      _currentTenantId);
        });

    // ── Contact ───────────────────
    modelBuilder.Entity<Contact>(e =>
    {
      e.HasKey(x => x.Id);
      e.HasIndex(x => new
      {
        x.OrganizationId,
        x.Email
      }).IsUnique();
      e.Property(x => x.FullName)
          .HasMaxLength(200)
          .IsRequired();
      e.Property(x => x.Email)
          .HasMaxLength(200)
          .IsRequired();
      e.HasQueryFilter(c =>
          _isSuperAdmin ||
          c.OrganizationId ==
              _currentTenantId);
    });

    // ── TodoItem ──────────────────
    // ✅ FIX WARNING: IsRequired(false)
    // fixes "User required end" warning
    modelBuilder.Entity<TodoItem>(e =>
    {
      e.HasKey(x => x.Id);
      e.Property(x => x.Title)
          .HasMaxLength(500)
          .IsRequired();
      e.HasOne<User>()
          .WithMany()
          .HasForeignKey(
              (TodoItem x) => x.UserId)
          .OnDelete(
              DeleteBehavior.Restrict)
          .IsRequired(false);
    });

    // ════════════════════════════════
    // CHAT
    // ════════════════════════════════

    // ── ChatMessage ───────────────
    modelBuilder.Entity<ChatMessage>(e =>
    {
      e.HasKey(x => x.Id);
      e.Property(x => x.Content)
          .HasColumnType("nvarchar(max)")
          .IsRequired();
      e.Property(x => x.MessageType)
          .HasMaxLength(50)
          .HasDefaultValue("text");
      e.HasOne(x => x.Sender)
          .WithMany()
          .HasForeignKey(x => x.SenderId)
          .OnDelete(
              DeleteBehavior.Restrict)
          .IsRequired(false);
      e.HasOne(x => x.Receiver)
          .WithMany()
          .HasForeignKey(x =>
              x.ReceiverId)
          .OnDelete(
              DeleteBehavior.Restrict)
          .IsRequired(false);
      e.HasOne(x => x.Group)
          .WithMany()
          .HasForeignKey(x => x.GroupId)
          .OnDelete(
              DeleteBehavior.Cascade)
          .IsRequired(false);
      e.HasIndex(x =>
          x.ConversationId);
      e.HasIndex(x => new
      {
        x.SenderId,
        x.ReceiverId
      });
      e.HasIndex(x => x.CreatedAt);
    });

    // ── UserOnlineStatus ──────────
    // ✅ IsRequired(false) fixes warning
    modelBuilder.Entity<
        UserOnlineStatus>(e =>
        {
          e.HasKey(x => x.Id);
          e.HasIndex(x => x.UserId)
                  .IsUnique();
          e.HasOne(x => x.User)
                  .WithMany()
                  .HasForeignKey(x => x.UserId)
                  .OnDelete(
                      DeleteBehavior.Cascade)
                  .IsRequired(false);
        });

    // ── ChatGroup ─────────────────
    modelBuilder.Entity<ChatGroup>(e =>
    {
      e.HasKey(x => x.Id);
      e.Property(x => x.Name)
          .HasMaxLength(200)
          .IsRequired();
      e.HasQueryFilter(g =>
          _isSuperAdmin ||
          g.OrganizationId ==
              _currentTenantId);
      e.HasOne(x => x.CreatedBy)
          .WithMany()
          .HasForeignKey(x =>
              x.CreatedByUserId)
          .OnDelete(
              DeleteBehavior.Restrict);
    });

    // ── CalendarEvent ─────────────
    modelBuilder.Entity<CalendarEvent>(e =>
    {
      e.HasKey(x => x.Id);
      e.Property(x => x.Title)
          .HasMaxLength(500)
          .IsRequired();
      e.Property(x => x.Type)
          .HasMaxLength(50)
          .HasDefaultValue("event");
      e.Property(x => x.Priority)
          .HasMaxLength(20)
          .HasDefaultValue("medium");
      e.Property(x => x.Color)
          .HasMaxLength(20);
      e.HasQueryFilter(c =>
          _isSuperAdmin ||
          c.OrganizationId == _currentTenantId);
      e.HasIndex(x => new
      {
        x.OrganizationId,
        x.CreatedByUserId,
        x.StartDate
      });
    });

    // ── Holiday ───────────────────
    modelBuilder.Entity<Holiday>(e =>
    {
      e.HasKey(x => x.Id);
      e.Property(x => x.Occasion)
          .HasMaxLength(300)
          .IsRequired();
      e.Property(x => x.Day)
          .HasMaxLength(60);
      e.HasIndex(x => new
      {
        x.OrganizationId,
        x.Year,
        x.Date
      });
      e.HasQueryFilter(h =>
          _isSuperAdmin ||
          h.OrganizationId == _currentTenantId);
    });

    // ── HolidayYearSetup ──────────
    modelBuilder.Entity<HolidayYearSetup>(e =>
    {
      e.HasKey(x => x.Id);
      e.Property(x => x.PdfFileUrl).HasMaxLength(500);
      e.Property(x => x.PdfFileName).HasMaxLength(300);
      e.Property(x => x.PolicyText)
          .HasColumnType("nvarchar(max)");
      e.HasIndex(x => new
      {
        x.OrganizationId,
        x.Year
      }).IsUnique();
      e.HasQueryFilter(h =>
          _isSuperAdmin ||
          h.OrganizationId == _currentTenantId);
    });

    // ── RolePermission ────────────
    modelBuilder.Entity<RolePermission>(e =>
    {
      e.HasKey(x => x.Id);
      e.Property(x => x.Module).HasMaxLength(80).IsRequired();
      e.HasIndex(x => new { x.OrganizationId, x.Role, x.Module }).IsUnique();
      e.HasQueryFilter(rp =>
          _isSuperAdmin ||
          rp.OrganizationId == _currentTenantId);
    });

    // ── ChatGroupMember ───────────
    // ✅ FIX WARNING: IsRequired(false)SS
    // on Group fixes "ChatGroup required
    // end" warning
    modelBuilder.Entity<
        ChatGroupMember>(e =>
        {
          e.HasKey(x => x.Id);
          e.HasIndex(x => new
          {
            x.GroupId,
            x.UserId
          }).IsUnique();
          e.HasOne(x => x.Group)
                  .WithMany(g => g.Members)
                  .HasForeignKey(x => x.GroupId)
                  .OnDelete(
                      DeleteBehavior.Cascade)
                  .IsRequired(false); // ✅ KEY FIX
          e.HasOne(x => x.User)
                  .WithMany()
                  .HasForeignKey(x => x.UserId)
                  .OnDelete(
                      DeleteBehavior.Restrict);
        });

    // ✅ NEW — CallLog ─────────────
    modelBuilder.Entity<CallLog>(e =>
    {
      e.HasKey(x => x.Id);
      e.Property(x => x.CallType)
          .HasMaxLength(10)
          .HasDefaultValue("audio");
      e.Property(x => x.Status)
          .HasMaxLength(20)
          .HasDefaultValue("missed");
      // ✅ IsRead — for missed call badge tracking
      e.Property(x => x.IsRead)
          .HasDefaultValue(false);
      // Caller FK
      e.HasOne(x => x.Caller)
          .WithMany()
          .HasForeignKey(x => x.CallerId)
          .OnDelete(
              DeleteBehavior.Restrict);
      // Receiver FK
      e.HasOne(x => x.Receiver)
          .WithMany()
          .HasForeignKey(x => x.ReceiverId)
          .OnDelete(
              DeleteBehavior.Restrict);
      // Indexes for fast history queries
      e.HasIndex(x => x.CallerId);
      e.HasIndex(x => x.ReceiverId);
      e.HasIndex(x => x.StartedAt);
      e.HasIndex(x => new
      {
        x.ReceiverId,
        x.Status
      });
    });
  }
}
