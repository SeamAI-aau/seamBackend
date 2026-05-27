# Backend Testing Report

## Scope

This report covers backend tests implemented and validated for the `@org/api` project in the Nx workspace, plus essential additional scenarios extracted from current backend modules and endpoints.

## Features to Be Tested

- Security and auth token extraction logic (`auth`).
- Auth session lifecycle (`register`, `login`, `refresh`, `logout`).
- Encryption/decryption utility correctness and safety (`common/utils`).
- Project assignment authorization rules (`project`).
- Project management flows (`create`, `update`, member invitation lifecycle).
- Health API availability and response contract (`health`).
- Application bootstrap and docs endpoint availability (`api-e2e` existing).
- Realtime socket authentication behavior (`api-e2e` existing).

## Pass/Fail Criteria

- **Pass (overall)**:
  - All selected test commands complete with exit code `0`.
  - No failing test suites and no failing test cases in the executed scope.
  - No runtime crashes during test bootstrap/setup/teardown.
  - No new lint/type issues introduced by test code.
- **Fail (overall)**:
  - Any test command exits non-zero.
  - Any assertion fails, or expected exceptions are not raised with the correct error contract.
  - Any integration/e2e dependency prevents execution (for example API not reachable, DB/Redis unavailable, invalid env configuration).
  - Test process hangs/timeouts beyond configured thresholds.

### Detailed Criteria by Test Type

- **Unit Tests**
  - **Pass**: deterministic function-level behavior is validated for both happy and negative paths; mocks are called with expected inputs; expected errors are thrown where applicable.
  - **Fail**: incorrect return values, missing/incorrect thrown errors, broken branch logic, or mock contract mismatches.
- **Integration Tests**
  - **Pass**: module boots successfully in test runtime; endpoint/service contract returns expected status and payload schema; date/time/id fields are parseable/valid.
  - **Fail**: module cannot initialize, route contract mismatch (status/body), serialization errors, or unhandled exceptions.
- **E2E Tests**
  - **Pass**: running backend is reachable; user-visible flows succeed end-to-end (HTTP/socket/auth behavior) in an environment close to production wiring.
  - **Fail**: server not reachable, auth handshake failures outside expected negative tests, cross-service dependency failures, or broken end-to-end flow assertions.

### Severity and Release Decision Mapping

- **Critical Fail**: auth/security regression, data integrity issue, or complete endpoint outage -> release should be blocked.
- **Major Fail**: key business flow broken (project/task/meeting core paths) -> release should normally be blocked until fixed.
- **Minor Fail**: non-critical edge case or flaky/non-deterministic test with low user impact -> may proceed only with explicit risk acceptance and follow-up ticket.

### Execution Readiness Gates (Preconditions)

- Required environment variables are present and valid for the scope under test.
- Required infrastructure dependencies (database, redis, third-party stubs/mocks) are available.
- API process is healthy on expected host/port before e2e begins.
- Test data/setup scripts complete successfully before assertions run.

## Approach and Strategy

- Follow the test pyramid:
  - **Unit tests** for isolated utility/business-rule functions with mocks/stubs.
  - **Integration tests** for module-level HTTP behavior using an in-memory Nest app instance.
  - **E2E/smoke tests** for externally visible app behavior (existing suite in `api-e2e`).
- Keep tests deterministic and fast for CI.
- Validate both happy paths and failure paths (especially access control and crypto misuse).

## Types of Testing Included

- Unit Testing
- Integration Testing
- API Smoke Testing
- Realtime Auth E2E (existing tests)
- Basic Contract Validation (status codes and response fields)

## Tools and Environments

- **Framework**: Jest (Nx test target)
- **Backend stack**: NestJS
- **Task runner**: Nx (`npx nx test api`)
- **Runtime**: Node.js (Linux)
- **Lint validation**: Cursor lint diagnostics (`ReadLints`)

## Execution Summary

- Command run: `npx nx test api`
- Result: **PASS**
- Suites: **6 passed / 6 total**
- Tests: **20 passed / 20 total**
- Duration: ~2.8s

## E2E Execution Summary

- Command run: `npx nx e2e @org/api-e2e`
- Result: **FAIL**
- Failure point: `api-e2e` global setup could not connect to `localhost:3000` (`ECONNREFUSED`).
- Root cause observed during dependency startup: `@org/api:serve:development` did not keep the API process running (server process exited before e2e setup check).
- Additional blocker when starting API manually without project env values: strict config validation requires `DATABASE_URL`, Cloudinary keys, and `TOKEN_ENCRYPTION_SECRET`.
- Impact: existing e2e tests (`api.spec.ts`, `realtime.spec.ts`) could not be fully executed in this environment.

## Implemented Test Artifacts

- `api/src/common/utils/encryption.util.spec.ts` (unit)
- `api/src/auth/jwt.cookie-extractor.spec.ts` (unit)
- `api/src/auth/auth.controller.spec.ts` (unit/controller)
- `api/src/project/project-membership.util.spec.ts` (unit)
- `api/src/project/project.controller.spec.ts` (unit/controller)
- `api/src/health/health.integration.spec.ts` (integration)

## Extracted Backend Test Cases

| ID | Type | Feature/Area | Description | Preconditions | Steps/Action | Expected Result | Status |
|---|---|---|---|---|---|---|---|
| UT-ENC-001 | Unit | Encryption | Encrypt then decrypt a payload with the same secret | Valid text and secret | Call `encrypt`, then `decrypt` with same secret | Decrypted output equals original payload | Passed |
| UT-ENC-002 | Unit | Encryption | Ensure IV randomness produces different ciphertext | Same payload and secret | Encrypt payload twice | Two encrypted values differ; both decrypt successfully | Passed |
| UT-ENC-003 | Unit | Encryption | Reject decrypt using wrong secret | Encrypted text from valid secret | Decrypt with different secret | Decrypt throws an error | Passed |
| UT-AUTH-001 | Unit | Auth Cookies | Extract valid `accessToken` cookie | Request has non-empty string cookie | Call `cookieTokenExtractor(req)` | Returns token string | Passed |
| UT-AUTH-002 | Unit | Auth Cookies | Handle missing cookies safely | Request has no `cookies` | Call extractor | Returns `null` | Passed |
| UT-AUTH-003 | Unit | Auth Cookies | Reject empty/non-string token values | Cookie is empty string or object | Call extractor | Returns `null` | Passed |
| UT-AUTH-004 | Unit/Controller | Auth Register | Register flow sets auth cookies and returns user payload | Valid register DTO and mocked auth service | Call `AuthController.register` | `authService.register` called, cookies set, message+user returned | Passed |
| UT-AUTH-005 | Unit/Controller | Auth Login | Login flow sets auth cookies | Valid login DTO and mocked auth service | Call `AuthController.login` | `authService.login` called, cookies set, success message returned | Passed |
| UT-AUTH-006 | Unit/Controller | Auth Refresh | Refresh uses token from body or cookie | Refresh token in request body or cookie | Call `AuthController.refresh` | Token rotated, cookies set, refresh message returned | Passed |
| UT-AUTH-007 | Unit/Controller | Auth Refresh Validation | Refresh requires token | No token in body and no cookie token | Call `AuthController.refresh` | `BadRequestException` thrown | Passed |
| UT-AUTH-008 | Unit/Controller | Auth Logout | Logout revokes session and clears cookies | Authenticated user context | Call `AuthController.logout` | `authService.logout` called, cookies cleared, success message returned | Passed |
| UT-PROJ-001 | Unit | Project Membership | Allow assignment for valid member | Repository returns `true` for assignment check | Call `assertProjectTaskAssignee` | Resolves with no exception | Passed |
| UT-PROJ-002 | Unit | Project Membership | Block assignment for invalid member | Repository returns `false` | Call `assertProjectTaskAssignee` | Throws `AppException` with `FORBIDDEN` | Passed |
| UT-PROJ-003 | Unit/Controller | Project Create | Create project delegates to service | Authenticated owner context and valid DTO | Call `ProjectController.createProject` | `projectService.createProject` called with user and payload | Passed |
| UT-PROJ-004 | Unit/Controller | Project Update | Update project delegates to service | Authenticated owner context and valid update DTO | Call `ProjectController.updateProject` | `projectService.updateProject` called with `projectId`, `userId`, payload | Passed |
| UT-PROJ-005 | Unit/Controller | Project Invite | Invite member by email delegates correctly | Owner context and invite email | Call `ProjectController.addMemberByEmail` | `projectService.addMemberByEmail` called with project/user/email | Passed |
| UT-PROJ-006 | Unit/Controller | Project Invite Accept | Accept invitation delegates correctly | Authenticated invited user and email payload | Call `ProjectController.acceptInvite` | `projectService.acceptInvite` called with project/user/email | Passed |
| UT-PROJ-007 | Unit/Controller | Project Invite Decline | Decline invitation delegates correctly | Authenticated invited user and email payload | Call `ProjectController.declineInvite` | `projectService.declineInvite` called with project/user/email | Passed |
| IT-HEALTH-001 | Integration | Health Endpoint | Validate `/health` response contract | Nest testing app initialized with `HealthModule` | HTTP GET `/health` | Status `200`, `status: "ok"`, parseable ISO `timestamp` | Passed |
| E2E-APP-001 | E2E (Existing) | App Bootstrap | API docs endpoint availability | Running backend instance | GET `/api-docs` in e2e context | Status `200` | Blocked (API not reachable) |
| E2E-RT-001 | E2E (Existing) | Realtime Auth | Socket connect with valid JWT | `JWT_SECRET` configured and backend running | Connect with signed token | Connection established | Blocked (API not reachable) |
| E2E-RT-002 | E2E (Existing) | Realtime Auth | Socket reject invalid JWT | Backend running | Connect with invalid token | `connect_error` emitted, not connected | Blocked (API not reachable) |

## What Restricts Full System E2E Today

- `api-e2e` setup waits for `localhost:3000`, but the dependent API process is not consistently staying up in this environment (`ECONNREFUSED` seen during global setup).
- API boot has strict required configuration, and startup fails if any required variables are missing (`DATABASE_URL`, `CLOUDINARY_CLOUD_NAME`, `CLOUDINARY_API_KEY`, `CLOUDINARY_API_SECRET`, `TOKEN_ENCRYPTION_SECRET`, plus auth settings).
- Full flow E2E needs infrastructure dependencies reachable and valid (database and redis), not only app code.
- Because of the above environment readiness gaps, current e2e status is **blocked at setup/runtime**, not failing business assertions.

## Recommended Additional Coverage (Next Iteration)

- Auth controller flows: register/login/forgot-password/change-password.
- Task lifecycle transitions and assignment rules in `task.service`.
- Project invitation acceptance/decline and membership transitions.
- Jira/GitHub integration boundary tests with mocked clients/queues.
- Global exception filter contract tests for standardized error payloads.
