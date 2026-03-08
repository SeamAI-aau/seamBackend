# Notification Module

Handles in-app notifications (browser & VS Code dashboards) and email delivery.

## Email Configuration

Set in `.env`:

```
SMTP_HOST=smtp.example.com
SMTP_PORT=587
SMTP_SECURE=false
SMTP_USER=user
SMTP_PASS=secret
MAIL_FROM=noreply@example.com
APP_NAME=Seam
```

If SMTP is not configured, emails are logged only and the app runs normally.

## API (JWT required)

| Method | Path | Description |
|--------|------|-------------|
| GET | `/notifications` | List my notifications (query: `unreadOnly`, `type`, `fromDate`, `toDate`, `page`, `limit`) |
| GET | `/notifications/unread-count` | Unread count |
| PATCH | `/notifications/:id/read` | Mark one as read |
| PATCH | `/notifications/read-all` | Mark all as read |

## Notification Types

- `invitation_sent` – Email only (invitee not yet a user)
- `invitation_accepted` – In-app + optional email
- `task_assigned` – In-app + email
- `task_approved` – In-app (to SM)
- `task_declined` – In-app (to SM)
- `blocker_detected` – In-app + email (wire as needed)

## Usage (from services)

```ts
// In-app + email (when type is in EMAIL_ENABLED_TYPES)
await this.notification.notify({
  userId,
  type: 'task_assigned',
  title: 'New task',
  body: 'You have been assigned a task.',
  metadata: { taskId, projectId },
});

// Email only (e.g. invitee without account)
await this.notification.notifyEmailOnly({
  to: 'invitee@example.com',
  type: 'invitation_sent',
  title: "You're invited",
  body: 'Join the project...',
});
```

## Dashboards

Browser and VS Code dashboards consume the same REST API. Poll `GET /notifications?unreadOnly=true` or `GET /notifications/unread-count` for updates.
