# Data Safety Draft

This is a draft for Play Console review, not legal advice. Confirm it against your real backend, retention rules, and privacy policy before submitting.

## App Purpose

Cleaner-only mobile app for operational workflows: cleaning events, checklists, shopping items, guides, hours, and payout visibility.

## Data Types Likely Collected

### Personal Info

- Email address
- Name or profile name
- Phone number if entered in profile or operational records

### Photos And User-Generated Content

- Checklist completion photos
- Maintenance photos
- Notes submitted by cleaners
- Shopping list notes or item requests

### App Activity / Operational Data

- Assigned cleaning events
- Checklist submissions
- Logged work hours
- Shopping list submissions
- Maintenance reports
- Notification records

## Draft Console Positioning

- Data is collected because the app cannot function without account identity and job submissions.
- Data is not sold.
- Data is used to operate the service and support the cleaner workflow.

## Draft Security Positioning

- Data is sent over network connections to the production backend.
- The Android manifest currently requests only `INTERNET` as a native permission.

## Points You Must Confirm Manually

- Whether any phone number is mandatory or optional
- Whether any analytics SDK is added later
- Whether photos are retained indefinitely or under a retention policy
- Whether users can request deletion of operational data
- Whether notification tokens or crash data are collected by external services
