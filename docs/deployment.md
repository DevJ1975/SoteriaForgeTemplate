# Soteria Forge Deployment Notes

## Vercel Projects

Create three projects from the same GitHub repository:

- `soteria-forge-lms`
  - Root directory: `apps/lms`
  - Build command: `npm run build --workspace @soteria-forge/lms`
  - Output directory: `apps/lms/dist`

- `soteria-forge-console`
  - Root directory: `apps/console`
  - Build command: `npm run build --workspace @soteria-forge/console`
  - Output directory: `apps/console/dist`

- `soteria-forge-api`
  - Root directory: `apps/api`
  - Runtime: Vercel Node functions
  - Entry: `api/index.ts`

## Required Environment Variables

API:

- `MONGODB_URI`
- `JWT_SECRET`
- `SESSION_COOKIE_NAME`
- `CLIENT_ORIGIN`
- `ROOT_DOMAIN`
- `OBJECT_STORAGE_BASE_URL`
- `VIMEO_ALLOWED_DOMAINS`

LMS and console:

- `VITE_API_BASE_URL`

## Tenant Routing

The API resolves tenants in this order:

1. `x-soteria-tenant` request header.
2. Subdomain from the request host.
3. `demo` for localhost.

Production should use wildcard DNS such as `*.soteriaforge.com` for client LMS subdomains.

## Storage Policy

Do not store videos in MongoDB. Store only Vimeo IDs/URLs, transcripts, captions, summaries, and learning events.

Use object storage for:

- SCORM packages.
- Documents and job aids.
- Thumbnails.
- Offline bundles.
- Evidence uploads.

## Standards Roadmap

The template includes internal xAPI storage and SCORM runtime scaffolding. Formal SCORM conformance testing and external LRS forwarding should be handled as a dedicated hardening milestone before regulated production use.
