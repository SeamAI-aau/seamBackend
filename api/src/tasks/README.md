# Task Module

Manages the task lifecycle for stand-up action items: extraction → assignment → approval/decline → Jira sync.

## Lifecycle

- **EXTRACTED** – From meeting transcription; not yet assigned (or assignee unknown). When the meeting callback saves unassigned tasks, the **project owner** and **Scrum Master** project members receive a **`tasks_pending_assignment`** notification so they can assign developers (`reassignTask` / assign flow).
- **SENT_TO_DEVELOPER** – Assigned to a developer (by NLP / ai-engine with `assigneeId` or by Scrum Master).
- **APPROVED** / **REJECTED** – Developer accepts or declines.
- **SYNCED** – Approved task created in Jira (handled by Jira integration).

Transitions are enforced by `TaskStateMachine` in `task-state-machine.ts`.

## API

| Method | Path                           | Description                                              |
| ------ | ------------------------------ | -------------------------------------------------------- |
| `PATCH` | `/tasks/:id`                  | Assignee: approve / decline / edit draft (`UpdateTaskOutcomeDto`). |
| `PATCH` | `/tasks/:id/assign`           | Scrum Master or assignee: set `assigneeId` (UUID) or `null` to unassign. |
| `POST` | `/tasks`                       | Create task (testing / admin flows).                     |
| `GET`  | `/tasks/grouped`               | Current user’s tasks grouped active vs completed.      |
| `GET`  | `/tasks`                        | List tasks (filters: `projectId`, `meetingId`, `assigneeId`, …). |
| `GET`  | `/tasks/:id`                    | Get one task.                                           |

All routes require JWT. `PATCH .../assign` requires **Scrum Master** or current assignee.

## Structure

- **types/** – `ITaskRepository`, `TaskFilters`, dependency-injection tokens.
- **dto/** – Request DTOs (e.g. `AssignTaskDto`, `TaskFilterQueryDto`).
- **constants/** – Task status / config constants.
- **task-state-machine.ts** – Allowed status transitions.
