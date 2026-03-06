# UI Map v1

Version: `v1`

## Web Ops Console

| Module | Screen | Primary actions | Roles | Scope behavior |
|---|---|---|---|---|
| Overview | Dashboard | View KPIs, open issues, today pipeline | Owner, Org Admin, Manager, QA | Aggregates by allowed `ORG`/`UNIT` scope; cleaner not primary persona. |
| Planning | Calendar | View events, inspect status, open event detail | Owner, Org Admin, Manager, QA, Cleaner | Host roles see org/unit slices; cleaner sees assigned listings/events only. |
| Operations | Tasks / Events list | Filter backlog, open event, triage status | Owner, Org Admin, Manager, QA, Cleaner | Same as calendar; list data is tenant-scoped then role-scoped. |
| Operations | Event Detail | Assign cleaner, change status, cancel, reset/reopen, launch checklist | Owner, Org Admin, Manager, QA, Cleaner (limited) | Event-scoped actions resolve host from event scope (`event.host_user_id`). |
| Execution | Checklist Run | Complete checklist, upload photos, submit notes, finish run | Cleaner, Manager, QA | No org picker; scope always derived from event. |
| Supplies | Shopping | Submit/resolve missing items, add product entries | Owner, Org Admin, Manager, QA, Cleaner | Manual cleaner submit requires org context when multi-org; host roles scoped to org/unit filters. |
| Maintenance | Maintenance tickets | Create ticket, upload evidence, update status | Owner, Org Admin, Manager, QA, Cleaner | Manual cleaner submit requires org context when multi-org. |
| Labor | Hours | Log/update hours, approve/review | Owner, Org Admin, Manager, QA, Cleaner | Event-linked entries use event scope; manual entries require org context for multi-org cleaners. |
| Finance | Expenses | Create/edit expenses, review totals | Owner, Org Admin, Manager, QA, Cleaner | Manual entries require explicit org context outside event flow. |
| Finance | Payouts | Generate/review payout batches, mark settled | Owner, Org Admin, Manager | Org/unit bounded financial visibility. |
| Admin | Settings & Access | User/role management, org config | Owner, Org Admin | Org-level administrative scope only. |

## Mobile Field App

| Tab | Screen | Primary actions | Roles | Scope behavior |
|---|---|---|---|---|
| Today | Assigned Events | View today queue, open event | Cleaner, Manager, QA | Assigned listing/event scope only for cleaners. |
| Checklist | Run Checklist | Start/continue/finish run, photos, comments | Cleaner, Manager, QA | Event-derived scope only; no manual org selector. |
| Shopping | Manual Shopping Submit | Add missing products outside checklist | Cleaner | If cleaner has multi-org assignments, org selection is required before submit. |
| Maintenance | Manual Maintenance Ticket | Report issue, attach photos | Cleaner | If multi-org cleaner and outside event, org selection is required. |
| Hours | Manual Hours | Log additional hours outside event | Cleaner | Requires org context for multi-org cleaners; auto for single-org. |
| Expenses | Manual Expense | Log expense outside event | Cleaner | Requires org context for multi-org cleaners; auto for single-org. |
| Profile | Account / Context | View assignment context, switch org (if allowed) | Cleaner | Context switch persists for manual forms only; checklist ignores it. |
