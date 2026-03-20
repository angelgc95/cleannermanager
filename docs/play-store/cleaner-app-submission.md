# Play Console Submission Checklist

## App Identity

- App name: `CleannerManager Cleaner`
- Default language: `English (United States)` recommended
- App or game: `App`
- Free or paid: `Free`
- Package name: `com.cleannermanager.app`
- Version code: `1`
- Version name: `1.0`

## Release Artifact

- Upload this file:
  - `android/app/build/outputs/bundle/release/app-release.aab`

## Android Facts Confirmed From The Repo

- Native permission in manifest:
  - `android.permission.INTERNET`
- Native app label:
  - `CleannerManager Cleaner`
- Native app is cleaner-only:
  - host accounts are blocked in the Android app
  - host signup is not shown in the Android app
- Production web/auth target:
  - `https://www.cleannermanager.com`

## Play Console Steps

1. Create app in Play Console.
2. Use app name `CleannerManager Cleaner`.
3. Keep package name as `com.cleannermanager.app` unless you decide to rename it before the first upload.
4. Create a new release in `Testing -> Internal testing`.
5. Upload `app-release.aab`.
6. Paste the copy from [store-listing-copy.md](./store-listing-copy.md).
7. Upload these assets:
   - feature graphic: [assets/feature-graphic.png](./assets/feature-graphic.png)
   - at least 2 phone screenshots
   - one real screenshot already prepared: [assets/phone-screenshot-signin.png](./assets/phone-screenshot-signin.png)
8. Complete `App content`, `Data safety`, and `App access` using:
   - [data-safety-draft.md](./data-safety-draft.md)
   - [reviewer-access.md](./reviewer-access.md)
9. Publish a privacy policy URL before moving beyond testing:
   - use [privacy-policy-draft.md](./privacy-policy-draft.md) as the base text
10. Start with internal testing before production.

## What Still Needs To Be Supplied Manually

- Support email you want shown publicly in Play Console
- Privacy policy URL
- Cleaner reviewer account email and password
- At least one more real in-app screenshot after cleaner sign-in

## Recommended Additional Screenshots

- Dashboard with one active cleaning event
- Checklist run detail
- Shopping list submission view
- Calendar view

## Suggested Category

- App category: `Business`

## Suggested Tags

- Cleaning
- Property management
- Vacation rental operations
- Checklist
- Housekeeping
