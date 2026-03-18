# Cleanner Manager Local Setup

This clone can run independently from Lovable using the local Supabase project in [`supabase/`](/Users/angel/Documents/Playground/cleannermanager/supabase). The frontend uses `.env.local`, so it can point at the local backend even if the checked-in `.env` still contains old hosted values.

## Stack

- Vite
- React
- TypeScript
- Tailwind CSS
- Supabase local stack

## Requirements

- Node.js 20+
- npm
- Supabase CLI
- A Docker runtime

If you use Colima on macOS, create or start it with `sshfs` mounts. Supabase local logging sidecars are excluded in the local scripts because they are not needed for app development and can fail under Colima socket mounting.

## First-time local bootstrap

```sh
npm install
npm run local:backend
npm run dev
```

What `npm run local:backend` does:

- starts Docker if Colima is installed and Docker is not already running
- starts the local Supabase stack from this repo
- skips `vector` and `logflare` sidecars
- writes `.env.local` with the local Supabase URL and publishable key

The app will then be available at [http://127.0.0.1:8080](http://127.0.0.1:8080).

## Daily local workflow

```sh
npm run local:backend
npm run dev
```

To stop the backend:

```sh
npm run local:stop
```

## Local endpoints

- App: [http://127.0.0.1:8080](http://127.0.0.1:8080)
- Supabase API: [http://127.0.0.1:54321](http://127.0.0.1:54321)
- Supabase Studio: [http://127.0.0.1:54323](http://127.0.0.1:54323)
- Mailpit: [http://127.0.0.1:54324](http://127.0.0.1:54324)

## Local data notes

- Database schema and edge functions come from the files in [`supabase/`](/Users/angel/Documents/Playground/cleannermanager/supabase).
- A fresh local database starts empty, which is expected.
- Create your first account through the app locally, then complete onboarding there.
- Optional features still need their own local secrets if you want them:
  - `TICKETMASTER_API_KEY` for event fetching
  - `LOVABLE_API_KEY` for checklist suggestions
