# iM3HelpDesk JWT Flow and API Protection Matrix

## Why manual Authorization headers were removed

The old frontend pattern added Authorization: Bearer <token> in many services using local token helpers. That caused drift and login/API instability because:

- Different services handled tokens differently.
- Some requests were sent without auth headers.
- Duplicate HttpClient provider/interceptor wiring could bypass auth logic.
- Browser storage token handling increases XSS exposure risk.

The new pattern is centralized:

- Backend issues JWT and refresh token in HttpOnly cookies.
- Frontend sends requests with credentials enabled.
- Backend reads JWT from cookie (and SignalR query token when needed).
- Tenant and role context are derived from authenticated claims.

Result: one transport path, fewer edge cases, stronger security posture.

## Current auth architecture

### 1. Login and token issue

- Client calls POST /api/Auth/login.
- Backend validates user and role/tenant rules.
- Backend issues:
  - Access token cookie: im3_access
  - Refresh token cookie: im3_refresh
- Cookies are set as HttpOnly with cross-site settings for local FE/BE split.

Implemented in:
- backend/iM3Helpdesk.API/Controllers/AuthController.cs

### 2. Frontend request behavior

- Frontend no longer manually adds Bearer tokens in each service.
- A single interceptor sets withCredentials for API calls.
- Browser automatically attaches HttpOnly cookies for allowed origins.

Implemented in:
- frontend/src/app/core/interceptors/auth.interceptor.ts
- frontend/src/app/app.config.ts

### 3. Backend JWT extraction and validation

JWT bearer handler resolves token in this order:

1. SignalR access_token query string for hub connections.
2. Authorization header Bearer token (default JWT bearer behavior).
3. HttpOnly cookie fallback: im3_access.

Implemented in:
- backend/iM3Helpdesk.API/Program.cs

### 4. Tenant context population

Tenant middleware now reads organizationId and role from authenticated claims first.
This is required for cookie-auth requests where controllers depend on tenant scope.

Implemented in:
- backend/iM3Helpdesk.API/Middleware/TenantMiddleware.cs

### 5. Refresh token behavior

- Client calls POST /api/Auth/refresh.
- Backend accepts refresh token from request body or im3_refresh cookie fallback.
- New access and refresh cookies are issued.

Implemented in:
- backend/iM3Helpdesk.API/Controllers/AuthController.cs

## JWT payload/claims used in this project

Generated JWT includes these key claims:

- sub: user id
- email: user email
- role: user role (also standard role claim)
- organizationId: tenant identifier
- fullName: display name

These claims drive:

- authorization checks ([Authorize], role checks)
- tenant scoping in middleware/services
- API behavior by user role

## API protection matrix

## A. JWT protected by default (controller-level Authorize)

These controllers are class-level protected with [Authorize] (or stricter role policy):

- AgentGroupsController
- AgentsController
- AIFeaturesController
- AttachmentsController
- AuditController
- CalendarEventsController
- CallLogController
- ChatController
- ContactsController
- CustomerController
- CustomFieldsController
- DashboardController
- EmailNotificationSettingsController
- KnowledgeBaseController
- NotificationsController
- OrganizationsController
- ProfileController
- ReportsController
- SearchController
- TicketsController
- TicketTemplatesController
- TodoController
- SuperAdminController (role restricted: SuperAdmin)

SignalR:
- ChatHub is protected with [Authorize].

## B. Not class-level JWT protected (intentional/public or alternate security)

1. AuthController
- No class-level [Authorize].
- Expected: authentication lifecycle endpoints are public or pre-auth by design.
- Endpoints include login, verify-otp, resend-otp, register, register-customer, refresh, verify-email, forgot-password, reset-password.

2. InboundEmailController
- No JWT attributes.
- Protected by webhook HMAC signature check and rate limiting.

3. WhatsAppController
- No JWT attributes.
- Protected by webhook HMAC signature check and rate limiting.

4. SlackController
- Mixed protection:
  - POST /api/Slack/webhook -> no JWT (HMAC + rate limiting)
  - POST /api/Slack/notify -> [Authorize]
  - POST /api/Slack/teams/notify -> [Authorize]

## Final answer to "is every API JWT protected?"

No. Most business APIs are JWT protected, but webhook/integration endpoints intentionally use HMAC signature validation instead of JWT, and AuthController endpoints are public by design for login and recovery flows.

## Quick verification checklist

1. Login and confirm Set-Cookie for im3_access and im3_refresh in response.
2. Call protected endpoint (example: GET /api/Todo) without manual Authorization header.
3. Confirm request still authenticates via cookie and returns 200.
4. Confirm webhook endpoints reject invalid signatures with 401.
5. Confirm SignalR hub connection succeeds with authorized token flow.

## Related files

- docs/api-auth-matrix.md
- backend/iM3Helpdesk.API/Program.cs
- backend/iM3Helpdesk.API/Controllers/AuthController.cs
- backend/iM3Helpdesk.API/Middleware/TenantMiddleware.cs
- backend/iM3Helpdesk.API/Hubs/ChatHub.cs
- backend/iM3Helpdesk.API/Controllers/SlackController.cs
- backend/iM3Helpdesk.API/Controllers/InboundEmailController.cs
- backend/iM3Helpdesk.API/Controllers/WhatsAppController.cs
- frontend/src/app/core/interceptors/auth.interceptor.ts
- frontend/src/app/app.config.ts
