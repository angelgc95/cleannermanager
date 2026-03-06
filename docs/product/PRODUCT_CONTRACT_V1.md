# Product Contract v1

Version: `v1`
Applies to: Web Ops Console + Mobile Field App

## Core Concepts

| Concept | Definition | Notes |
|---|---|---|
| Organization (tenant) | Top-level customer boundary for data, users, and policy. | All authorization is tenant-scoped first. |
| Unit (`ORG_ROOT` hierarchy optional) | Optional grouping layer inside an Organization (region, brand, team, portfolio). | Can be skipped for flat orgs. |
| Listing | Atomic rental unit where cleanings occur. | Lowest operational scope for events/checklists. |

## Scope Model

| Scope | What it covers | Typical use |
|---|---|---|
| `ORG` | Entire tenant across all units/listings. | Ownership, policy, org-wide reporting/admin. |
| `UNIT` | Subset of listings under a unit node. | Regional/portfolio management. |
| `LISTING` | Single listing and its events/runs/manual logs. | Field operations and assignment execution. |

## Roles

| Role | Purpose | Default scope |
|---|---|---|
| Owner | Commercial + governance owner of tenant. | `ORG` |
| Org Admin | Day-to-day tenant administration. | `ORG` |
| Manager | Operational control (events, assignments, resets). | `UNIT` or `ORG` |
| QA | Quality review and sign-off workflows. | `UNIT`/`LISTING` |
| Cleaner | Executes assigned work in field. | Assigned `LISTING`(s) |

## General Org Permission Rules

- Access is always constrained by tenant boundary first.
- User actions must resolve to exactly one effective scope (`ORG`/`UNIT`/`LISTING`) before write.
- Event-scoped writes must use `event.host_user_id` as host/tenant source of truth.
- Manual writes (outside event flow) must include explicit host/organization scope.
- Role checks and scope checks both apply; passing one does not bypass the other.
- Manager+ (`Owner`, `Org Admin`, `Manager`) can perform destructive operational overrides.

## Event Lifecycle

| Stage | Trigger | Result |
|---|---|---|
| Created from booking | iCal/booking ingestion | Event created in tenant/listing scope. |
| Assigned | Manager+ sets cleaner assignment | Cleaner responsibility established. |
| In progress | Checklist run starts | Event considered active execution. |
| Completed | Checklist run finishes and gates pass | Event closes successfully. |
| Cancelled | Manager+ cancel action | Event closed as cancelled. |

## Checklist Rules

- Checklist is mandatory for every cleaning event.
- Event completion is blocked until checklist completion gates pass.

| Completion gate | Rule |
|---|---|
| Required items | All `required` items must be satisfied. |
| `photo_required` items | Required photos must exist before finish. |
| Fail comments | If an item is failed, comment is required. |
| QA thresholds | If configured threshold/failed-critical rule is hit, mark `QA_REVIEW` and require QA workflow before final closure. |

## Reset / Reopen Rules

- Allowed roles: `Owner`, `Org Admin`, `Manager` only.
- Reset/reopen is destructive in v1: no historical preservation.
- Reset deletes run and run-linked rows (responses, photos, run-linked shopping/log rows), then reopens event for a new run.
- Audit metadata (actor/time/reason) should be captured even when operational history is dropped.

## Multi-Host Cleaner Rule

- Organization context is required only for manual submissions (outside event/checklist flow).
- Event/checklist flow never prompts for org selection; org scope is derived from `event.host_user_id`.
