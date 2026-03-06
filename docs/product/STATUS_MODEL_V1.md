# Status Model v1

Version: `v1`

## Enumerations

### Event Status (`event.status`)

| Value | Meaning | Notes |
|---|---|---|
| `TODO` | Event created, not started. | Default creation state. |
| `ASSIGNED` | Cleaner assigned, not started. | Optional explicit state; can be represented by `TODO` + assigned cleaner in legacy flows. |
| `IN_PROGRESS` | Work has started. | Usually when checklist run starts. |
| `COMPLETED` | Operationally finished. | Legacy `DONE` should normalize to `COMPLETED`. |
| `CANCELLED` | Event cancelled. | Terminal unless reopened by Manager+. |

### Checklist / Run Status (`checklist_run.status` effective)

| Value | Meaning | Derived from |
|---|---|---|
| `NOT_STARTED` | No run exists for event. | No `checklist_run` rows. |
| `IN_PROGRESS` | Active run exists. | `started_at` set and `finished_at` null. |
| `COMPLETED` | Run finished successfully. | `finished_at` set and gates passed. |
| `RESET` | Previous run was intentionally removed. | Manager+ reset/reopen operation. |

### QA Review Status (`qa_review.status`, if enabled)

| Value | Meaning |
|---|---|
| `NOT_REQUIRED` | No QA intervention needed. |
| `PENDING` | Waiting for QA review. |
| `PASSED` | QA approved closure. |
| `FAILED` | QA rejected; corrective action required. |
| `WAIVED` | Manager+ override with reason. |

## Source-of-Truth Rules

- UI display status must use **effective status**, not raw stored event status alone.
- Effective status is derived by precedence:

| Priority | Rule | Effective status |
|---|---|---|
| 1 | If `event.status == CANCELLED` | `CANCELLED` |
| 2 | Else if latest run has `finished_at` | `COMPLETED` |
| 3 | Else if latest run exists and not finished | `IN_PROGRESS` |
| 4 | Else if stored status is `IN_PROGRESS` | `IN_PROGRESS` |
| 5 | Else | `TODO` |

- Event-scoped writes must keep host scope from `event.host_user_id`.

## Transition Rules

### Event transitions

| From | To | Trigger | Allowed roles |
|---|---|---|---|
| — | `TODO` | Booking ingest / manual creation | System, Owner, Org Admin, Manager |
| `TODO` | `ASSIGNED` | Assign cleaner | Owner, Org Admin, Manager |
| `TODO`/`ASSIGNED` | `IN_PROGRESS` | Checklist run started | Cleaner, Manager, Org Admin, Owner |
| `IN_PROGRESS` | `COMPLETED` | Checklist finish gates pass | Cleaner (self-run), Manager+ override |
| `TODO`/`ASSIGNED`/`IN_PROGRESS` | `CANCELLED` | Cancel action | Owner, Org Admin, Manager |
| `COMPLETED`/`CANCELLED` | `ASSIGNED` or `TODO` | Reopen/reset | Owner, Org Admin, Manager |

### Checklist/run transitions

| From | To | Trigger | Allowed roles |
|---|---|---|---|
| `NOT_STARTED` | `IN_PROGRESS` | Start checklist run | Cleaner, Manager+ |
| `IN_PROGRESS` | `COMPLETED` | All completion gates pass | Cleaner, Manager+ |
| `IN_PROGRESS`/`COMPLETED` | `RESET` | Reset/reopen action (destructive) | Owner, Org Admin, Manager |
| `RESET` | `IN_PROGRESS` | New run started after reset | Cleaner, Manager+ |

### QA transitions (if enabled)

| From | To | Trigger | Allowed roles |
|---|---|---|---|
| `NOT_REQUIRED` | `PENDING` | Threshold breach / failed critical item | System, Manager+ |
| `PENDING` | `PASSED` | QA approval | QA, Manager+ |
| `PENDING` | `FAILED` | QA rejection | QA, Manager+ |
| `FAILED` | `PENDING` | Corrective resubmission | Cleaner, Manager+ |
| `PENDING`/`FAILED` | `WAIVED` | Exception override with reason | Owner, Org Admin, Manager |
