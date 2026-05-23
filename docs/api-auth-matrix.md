# API Auth Matrix (Endpoint-Level)

Generated from controller route attributes and verified authorization configuration.

## Legend

- JWT: requires authenticated JWT (cookie-based flow in current architecture)
- JWT (SuperAdmin role): requires JWT and SuperAdmin role
- HMAC + RateLimit: integration endpoint secured by signature validation and rate limiting
- Public (Auth flow): public auth lifecycle endpoint

## Endpoints

| Controller | Action | Method | Route | Security | Source |
|---|---|---|---|---|---|
| AgentGroups | GetAll | GET | /api/AgentGroups | JWT | AgentGroupsController.cs |
| AgentGroups | Create | POST | /api/AgentGroups | JWT | AgentGroupsController.cs |
| AgentGroups | Delete | DELETE | /api/AgentGroups/{id} | JWT | AgentGroupsController.cs |
| AgentGroups | Update | PUT | /api/AgentGroups/{id} | JWT | AgentGroupsController.cs |
| AgentGroups | RemoveMember | DELETE | /api/AgentGroups/{id}/members/{userId} | JWT | AgentGroupsController.cs |
| AgentGroups | AddMember | POST | /api/AgentGroups/{id}/members/{userId} | JWT | AgentGroupsController.cs |
| Agents | GetAll | GET | /api/Agents | JWT | AgentsController.cs |
| Agents | Delete | DELETE | /api/Agents/{id} | JWT | AgentsController.cs |
| Agents | GetById | GET | /api/Agents/{id} | JWT | AgentsController.cs |
| Agents | UpdateAgent | PUT | /api/Agents/{id} | JWT | AgentsController.cs |
| Agents | ToggleActive | PUT | /api/Agents/{id}/toggle-active | JWT | AgentsController.cs |
| Agents | InviteAgent | POST | /api/Agents/invite | JWT | AgentsController.cs |
| Attachments | Delete | DELETE | /api/Attachments/{id} | JWT | AttachmentsController.cs |
| Attachments | GetByTicket | GET | /api/Attachments/ticket/{ticketId} | JWT | AttachmentsController.cs |
| Audit | GetAll | GET | /api/Audit | JWT | AuditController.cs |
| Auth | ForgotPassword | POST | /api/Auth/forgot-password | Public (Auth flow) | AuthController.cs |
| Auth | Login | POST | /api/Auth/login | Public (Auth flow) | AuthController.cs |
| Auth | Refresh | POST | /api/Auth/refresh | Public (Auth flow) | AuthController.cs |
| Auth | Register | POST | /api/Auth/register | Public (Auth flow) | AuthController.cs |
| Auth | RegisterCustomer | POST | /api/Auth/register-customer | Public (Auth flow) | AuthController.cs |
| Auth | ResendOtp | POST | /api/Auth/resend-otp | Public (Auth flow) | AuthController.cs |
| Auth | ResetPassword | POST | /api/Auth/reset-password | Public (Auth flow) | AuthController.cs |
| Auth | VerifyEmail | GET | /api/Auth/verify-email | Public (Auth flow) | AuthController.cs |
| Auth | VerifyOtp | POST | /api/Auth/verify-otp | Public (Auth flow) | AuthController.cs |
| CalendarEvents | GetAll | GET | /api/CalendarEvents | JWT | CalendarEventsController.cs |
| CalendarEvents | Create | POST | /api/CalendarEvents | JWT | CalendarEventsController.cs |
| CalendarEvents | Delete | DELETE | /api/CalendarEvents/{id} | JWT | CalendarEventsController.cs |
| CalendarEvents | GetById | GET | /api/CalendarEvents/{id} | JWT | CalendarEventsController.cs |
| CalendarEvents | Update | PUT | /api/CalendarEvents/{id} | JWT | CalendarEventsController.cs |
| CalendarEvents | SendReminderNow | POST | /api/CalendarEvents/{id}/send-reminder | JWT | CalendarEventsController.cs |
| CalendarEvents | GetUpcomingReminders | GET | /api/CalendarEvents/upcoming-reminders | JWT | CalendarEventsController.cs |
| CallLog | GetCallLogs | GET | /api/CallLog | JWT | CallLogController.cs |
| CallLog | MarkOneRead | POST | /api/CallLog/{id}/read | JWT | CallLogController.cs |
| CallLog | MarkAllRead | POST | /api/CallLog/mark-read | JWT | CallLogController.cs |
| CallLog | GetUnreadMissed | GET | /api/CallLog/unread-missed | JWT | CallLogController.cs |
| Chat | CreateGroup | POST | /api/Chat/groups | JWT | ChatController.cs |
| Chat | AddGroupMembers | POST | /api/Chat/groups/{groupId}/members | JWT | ChatController.cs |
| Chat | Send | POST | /api/Chat/send | JWT | ChatController.cs |
| Contacts | GetAll | GET | /api/Contacts | JWT | ContactsController.cs |
| Contacts | Create | POST | /api/Contacts | JWT | ContactsController.cs |
| Contacts | Delete | DELETE | /api/Contacts/{id} | JWT | ContactsController.cs |
| Contacts | GetById | GET | /api/Contacts/{id} | JWT | ContactsController.cs |
| Contacts | Update | PUT | /api/Contacts/{id} | JWT | ContactsController.cs |
| Customer | GetMyTickets | GET | /api/Customer/my-tickets | JWT | CustomerController.cs |
| Customer | GetMyTicket | GET | /api/Customer/my-tickets/{id} | JWT | CustomerController.cs |
| Customer | AddReply | POST | /api/Customer/my-tickets/{id}/reply | JWT | CustomerController.cs |
| Customer | SubmitTicket | POST | /api/Customer/submit-ticket | JWT | CustomerController.cs |
| CustomFields | GetAll | GET | /api/CustomFields | JWT | CustomFieldsController.cs |
| CustomFields | Create | POST | /api/CustomFields | JWT | CustomFieldsController.cs |
| CustomFields | Delete | DELETE | /api/CustomFields/{id} | JWT | CustomFieldsController.cs |
| CustomFields | Update | PUT | /api/CustomFields/{id} | JWT | CustomFieldsController.cs |
| CustomFields | GetValues | GET | /api/CustomFields/ticket/{ticketId}/values | JWT | CustomFieldsController.cs |
| CustomFields | SaveValues | POST | /api/CustomFields/ticket/{ticketId}/values | JWT | CustomFieldsController.cs |
| Dashboard | GetStats | GET | /api/Dashboard/stats | JWT | DashboardController.cs |
| Dashboard | GetWidgets | GET | /api/Dashboard/widgets | JWT | DashboardController.cs |
| EmailNotificationSettings | GetAll | GET | /api/EmailNotificationSettings | JWT | EmailNotificationSettingsController.cs |
| EmailNotificationSettings | SaveAll | POST | /api/EmailNotificationSettings | JWT | EmailNotificationSettingsController.cs |
| InboundEmail | ReceiveEmail | POST | /api/InboundEmail | HMAC + RateLimit | InboundEmailController.cs |
| InboundEmail | ReceiveEmailJson | POST | /api/InboundEmail/json | HMAC + RateLimit | InboundEmailController.cs |
| InboundEmail | SimulateEmail | POST | /api/InboundEmail/simulate | HMAC + RateLimit | InboundEmailController.cs |
| KnowledgeBase | GetAll | GET | /api/KnowledgeBase | JWT | KnowledgeBaseController.cs |
| KnowledgeBase | Create | POST | /api/KnowledgeBase | JWT | KnowledgeBaseController.cs |
| KnowledgeBase | Delete | DELETE | /api/KnowledgeBase/{id} | JWT | KnowledgeBaseController.cs |
| KnowledgeBase | GetById | GET | /api/KnowledgeBase/{id} | JWT | KnowledgeBaseController.cs |
| KnowledgeBase | Update | PUT | /api/KnowledgeBase/{id} | JWT | KnowledgeBaseController.cs |
| KnowledgeBase | GetComments | GET | /api/KnowledgeBase/{id}/comments | JWT | KnowledgeBaseController.cs |
| KnowledgeBase | AddComment | POST | /api/KnowledgeBase/{id}/comments | JWT | KnowledgeBaseController.cs |
| KnowledgeBase | React | POST | /api/KnowledgeBase/{id}/react | JWT | KnowledgeBaseController.cs |
| KnowledgeBase | RecordView | POST | /api/KnowledgeBase/{id}/view | JWT | KnowledgeBaseController.cs |
| KnowledgeBase | GetViewers | GET | /api/KnowledgeBase/{id}/viewers | JWT | KnowledgeBaseController.cs |
| KnowledgeBase | GetByUser | GET | /api/KnowledgeBase/by-user/{userId} | JWT | KnowledgeBaseController.cs |
| KnowledgeBase | GetCategories | GET | /api/KnowledgeBase/categories | JWT | KnowledgeBaseController.cs |
| KnowledgeBase | DeleteComment | DELETE | /api/KnowledgeBase/comments/{commentId} | JWT | KnowledgeBaseController.cs |
| KnowledgeBase | UpdateComment | PUT | /api/KnowledgeBase/comments/{commentId} | JWT | KnowledgeBaseController.cs |
| KnowledgeBase | GetMyPosts | GET | /api/KnowledgeBase/my-posts | JWT | KnowledgeBaseController.cs |
| KnowledgeBase | GetUnreadCount | GET | /api/KnowledgeBase/unread-count | JWT | KnowledgeBaseController.cs |
| KnowledgeBase | GetUsersWithPosts | GET | /api/KnowledgeBase/users-with-posts | JWT | KnowledgeBaseController.cs |
| Notifications | GetAll | GET | /api/Notifications | JWT | NotificationsController.cs |
| Notifications | Delete | DELETE | /api/Notifications/{id} | JWT | NotificationsController.cs |
| Notifications | MarkRead | PUT | /api/Notifications/{id}/read | JWT | NotificationsController.cs |
| Notifications | GetActivity | GET | /api/Notifications/activity | JWT | NotificationsController.cs |
| Notifications | MarkAllRead | PUT | /api/Notifications/mark-all-read | JWT | NotificationsController.cs |
| Notifications | GetUnreadCount | GET | /api/Notifications/unread-count | JWT | NotificationsController.cs |
| Organizations | GetCurrent | GET | /api/Organizations/current | JWT | OrganizationsController.cs |
| Organizations | UpdateCurrent | PUT | /api/Organizations/current | JWT | OrganizationsController.cs |
| Organizations | UploadLogo | POST | /api/Organizations/upload-logo | JWT | OrganizationsController.cs |
| Profile | GetProfile | GET | /api/Profile | JWT | ProfileController.cs |
| Profile | UpdateProfile | PUT | /api/Profile | JWT | ProfileController.cs |
| Profile | ChangePassword | PUT | /api/Profile/change-password | JWT | ProfileController.cs |
| Profile | UpdateOrganization | PUT | /api/Profile/organization | JWT | ProfileController.cs |
| Profile | UploadPhoto | POST | /api/Profile/upload-photo | JWT | ProfileController.cs |
| Reports | ExportCsv | GET | /api/Reports/export-csv | JWT | ReportsController.cs |
| Reports | GetSummary | GET | /api/Reports/summary | JWT | ReportsController.cs |
| Search | GlobalSearch | GET | /api/Search | JWT | SearchController.cs |
| Slack | SendNotification | POST | /api/Slack/notify | JWT | SlackController.cs |
| Slack | SendTeamsNotification | POST | /api/Slack/teams/notify | JWT | SlackController.cs |
| Slack | Webhook | POST | /api/Slack/webhook | HMAC + RateLimit | SlackController.cs |
| SuperAdmin | GetOrganizations | GET | /api/SuperAdmin/organizations | JWT (SuperAdmin role) | SuperAdminController.cs |
| SuperAdmin | ToggleOrganization | PUT | /api/SuperAdmin/organizations/{id}/toggle | JWT (SuperAdmin role) | SuperAdminController.cs |
| SuperAdmin | GetStats | GET | /api/SuperAdmin/stats | JWT (SuperAdmin role) | SuperAdminController.cs |
| SuperAdmin | GetAllUsers | GET | /api/SuperAdmin/users | JWT (SuperAdmin role) | SuperAdminController.cs |
| Tickets | GetAll | GET | /api/Tickets | JWT | TicketsController.cs |
| Tickets | Create | POST | /api/Tickets | JWT | TicketsController.cs |
| Tickets | Delete | DELETE | /api/Tickets/{id} | JWT | TicketsController.cs |
| Tickets | GetById | GET | /api/Tickets/{id} | JWT | TicketsController.cs |
| Tickets | Update | PUT | /api/Tickets/{id} | JWT | TicketsController.cs |
| Tickets | AssignTicket | PUT | /api/Tickets/{id}/assign | JWT | TicketsController.cs |
| Tickets | AddComment | POST | /api/Tickets/{id}/comments | JWT | TicketsController.cs |
| Tickets | ForwardTicket | POST | /api/Tickets/{id}/forward | JWT | TicketsController.cs |
| Tickets | UpdateGroup | PUT | /api/Tickets/{id}/group | JWT | TicketsController.cs |
| Tickets | LogTime | PUT | /api/Tickets/{id}/log-time | JWT | TicketsController.cs |
| Tickets | Merge | POST | /api/Tickets/{id}/merge | JWT | TicketsController.cs |
| Tickets | UpdatePriority | PUT | /api/Tickets/{id}/priority | JWT | TicketsController.cs |
| Tickets | UpdateStatus | PUT | /api/Tickets/{id}/status | JWT | TicketsController.cs |
| Tickets | UpdateTags | PUT | /api/Tickets/{id}/tags | JWT | TicketsController.cs |
| Tickets | GetTimeline | GET | /api/Tickets/{id}/timeline | JWT | TicketsController.cs |
| Tickets | UpdateType | PUT | /api/Tickets/{id}/type | JWT | TicketsController.cs |
| Tickets | RecordView | POST | /api/Tickets/{id}/view | JWT | TicketsController.cs |
| Tickets | GetViewers | GET | /api/Tickets/{id}/viewers | JWT | TicketsController.cs |
| Tickets | BulkUpdate | POST | /api/Tickets/bulk-update | JWT | TicketsController.cs |
| Tickets | GetByTag | GET | /api/Tickets/by-tag/{tag} | JWT | TicketsController.cs |
| Tickets | Export | GET | /api/Tickets/export | JWT | TicketsController.cs |
| Tickets | Search | GET | /api/Tickets/search | JWT | TicketsController.cs |
| TicketTemplates | GetAll | GET | /api/TicketTemplates | JWT | TicketTemplatesController.cs |
| TicketTemplates | Create | POST | /api/TicketTemplates | JWT | TicketTemplatesController.cs |
| TicketTemplates | Delete | DELETE | /api/TicketTemplates/{id} | JWT | TicketTemplatesController.cs |
| Todo | GetAll | GET | /api/Todo | JWT | TodoController.cs |
| Todo | Create | POST | /api/Todo | JWT | TodoController.cs |
| Todo | Delete | DELETE | /api/Todo/{id} | JWT | TodoController.cs |
| Todo | Toggle | PUT | /api/Todo/{id}/toggle | JWT | TodoController.cs |
| WhatsApp | SendMessage | POST | /api/WhatsApp/send | HMAC + RateLimit | WhatsAppController.cs |
| WhatsApp | Webhook | POST | /api/WhatsApp/webhook | HMAC + RateLimit | WhatsAppController.cs |

## Notes

- Most business APIs are JWT-protected via class-level [Authorize].
- AuthController endpoints are intentionally public for login/recovery/token workflows.
- Webhook controllers use HMAC signature checks instead of JWT on ingest endpoints.
- ChatHub is JWT-protected with [Authorize] (SignalR token extraction supports query token and cookie fallback).
