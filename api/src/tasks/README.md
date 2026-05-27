# Task Module

Manages the task lifecycle for stand-up action items: extraction → assignment → approval/decline → Jira sync.

## Lifecycle

- **MANUAL** – Created via `POST /tasks` (Scrum Master flow); no meeting/transcript link.
- **MEETING_EXTRACTION** – From meeting transcription (`meetingId` + `transcriptId` set).
- **EXTRACTED** – Not yet assigned (or assignee unknown). When the meeting callback saves unassigned tasks, the **project owner** and **Scrum Master** project members receive a **`tasks_pending_assignment`** notification so they can assign developers (`reassignTask` / assign flow).
- **SENT_TO_DEVELOPER** – Assigned to a developer (by NLP / ai-engine with `assigneeId` or by Scrum Master).
- **APPROVED** / **REJECTED** – Developer accepts or declines.
- **SYNCED** – Approved task synced to Jira: **create** new issue (default) or **transition** existing when the engine set `jiraProposalAction: TRANSITION` + `jiraProposalIssueKey`. If sync fails after approve, **`jiraSyncLastError`** holds the last error (Bull retries transient failures).
- **Jira proposals** – Meeting callback may store `jiraProposalAction`, `jiraProposalIssueKey`, `jiraProposalTargetStatus`, `jiraProposalTransitionId`. Nothing is sent to Jira until the assignee **approves**. Use `GET /tasks/:id/jira/proposed-transitions` before approve; optional `jiraTransitionId` on `PATCH /tasks/:id` when approving.

Transitions are enforced by `TaskStateMachine` in `task-state-machine.ts`.

## API

| Method | Path                           | Description                                              |
| ------ | ------------------------------ | -------------------------------------------------------- |
| `PATCH` | `/tasks/:id`                  | Assignee: approve / decline / edit draft (`UpdateTaskOutcomeDto`). |
| `PATCH` | `/tasks/:id/assign`           | Scrum Master or assignee: set `assigneeId` (UUID) or `null` to unassign. |
| `POST` | `/tasks`                       | Create task manually (`source: MANUAL`, no meeting row). |
| `GET`  | `/tasks/grouped`               | Current user’s tasks grouped active vs completed.      |
| `GET`  | `/tasks`                        | List tasks (filters: `projectId`, `meetingId`, `assigneeId`, …). |
| `GET`  | `/tasks/:id`                    | Get one task.                                           |

All routes require JWT. `PATCH .../assign` requires **Scrum Master** or current assignee.

## Structure

- **types/** – `ITaskRepository`, `TaskFilters`, dependency-injection tokens.
- **dto/** – Request DTOs (e.g. `AssignTaskDto`, `TaskFilterQueryDto`).
- **constants/** – Task status / config constants.
- **task-state-machine.ts** – Allowed status transitions.
