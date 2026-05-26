# Soteria Forge Template

Reusable, multi-tenant LMS template for industrial, construction, field-service, and austere-environment training.

Soteria Forge is designed around:

- Vue 3 learner/admin LMS app with Ionic Vue, PWA, and Capacitor mobile support.
- Separate Vue superadmin/course-creator console.
- Express/Node API with MongoDB/Mongoose.
- Tenant resolution by subdomain or `x-soteria-tenant` header.
- First-party auth with learner, manager, admin, and superadmin roles.
- Offline learner queue using IndexedDB and idempotent sync.
- Internal xAPI/LRS-lite storage.
- SCORM runtime scaffolding for SCORM 1.2 and SCORM 2004.
- Vimeo-backed video streaming without storing video in MongoDB.

## Project Layout

- `apps/lms/` - Tenant-facing learner, manager, and client admin app.
- `apps/console/` - Superadmin and course-creator control plane.
- `apps/api/` - Express API for auth, tenancy, courses, attempts, completions, sync, xAPI, SCORM, admin, and superadmin routes.
- `packages/shared/` - Shared TypeScript contracts and learning-standard helpers.
- `docs/` - Product, deployment, and implementation notes.

## Local Setup

1. Install dependencies:

   ```bash
   npm install
   ```

2. Create the API environment file:

   ```bash
   cp apps/api/.env.example apps/api/.env
   ```

3. Set up the local database, or set `MONGODB_URI` in `apps/api/.env` to your Atlas connection string.

4. Run all apps:

   ```bash
   npm run dev
   ```

Local URLs:

- LMS: `http://localhost:5180`
- Superadmin console: `http://localhost:5181`
- API: `http://localhost:4000`

Demo credentials seeded when MongoDB is connected:

- Learner: `learner@soteriaforge.local`
- Admin: `admin@soteriaforge.local`
- Superadmin: `superadmin@soteriaforge.local`
- Password for all demo accounts: `SoteriaForgeDemo!2026`

## Local MongoDB

This template can run a self-contained MongoDB under `.mongodb/` so nothing is installed system-wide.

Download MongoDB once for your platform, then manage it with:

```bash
npm run db:start
npm run db:status
npm run db:stop
npm run db:restart
```

The default local database is `soteria_forge_template`.

## Deployment Shape

Recommended Vercel projects:

- `soteria-forge-lms` rooted at `apps/lms`
- `soteria-forge-console` rooted at `apps/console`
- `soteria-forge-api` rooted at `apps/api`

Production services:

- MongoDB Atlas for application records.
- Vimeo for video streaming.
- S3-compatible object storage or Vercel Blob for SCORM packages, documents, thumbnails, and offline bundles.
- Wildcard DNS for client subdomains, routed to the LMS app.

## Verification

```bash
npm run typecheck
npm run build
```

The Phaser game is lazy-loaded, but it remains the largest chunk. Keep game and simulation content code-split as the template grows.
