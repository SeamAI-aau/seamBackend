# Task Module

Manages the task lifecycle for stand-up action items: extraction → assignment → approval/decline → Jira sync.

## Lifecycle

- **EXTRACTED** – From meeting transcription; not yet assigned (or assignee unknown).
- **SENT_TO_DEVELOPER** – Assigned to a developer (by NLP worker with `assigneeId` or by Scrum Master).
- **APPROVED** / **REJECTED** – Developer accepts or declines.
- **SYNCED** – Approved task created in Jira (handled by Jira integration).

Transitions are enforced by `TaskStateMachine` in `task-state-machine.ts`.

## API

| Method | Path                           | Description                                              |
| ------ | ------------------------------ | -------------------------------------------------------- |
| POST   | `/tasks/:id/approve`           | Developer approves task (assignee only).                 |
| POST   | `/tasks/:id/decline`           | Developer declines task (assignee only).                 |
| POST   | `/tasks/:id/send-to-developer` | Scrum Master assigns developer (body: `{ assigneeId }`). |
| GET    | `/tasks/by-project/:projectId` | List tasks for project (query: `?status=&assigneeId=`).  |
| GET    | `/tasks/by-meeting/:meetingId` | List tasks for meeting (query: `?status=&assigneeId=`).  |
| GET    | `/tasks/my`                    | List tasks assigned to current user (query: `?status=`). |

All routes require JWT. `send-to-developer` requires `SCRUM_MASTER` role.

## Structure

- **types/** – `ITaskRepository`, `TaskFilters`, dependency-injection tokens.
- **dto/** – Request DTOs (e.g. `AssignTaskDto`, `TaskFilterQueryDto`).
- **constants/** – Task status / config constants.
- **task-state-machine.ts** – Allowed status transitions.
