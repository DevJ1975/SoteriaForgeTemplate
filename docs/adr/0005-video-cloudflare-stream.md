# ADR-0005: Cloudflare Stream for video; DynamoDB stores metadata only

- **Status:** Accepted
- **Date:** 2026-07-01
- **Deciders:** Platform / mobile
- **Related:** [ADR-0002](./0002-offline-event-sourcing.md), [ADR-0003](./0003-single-pool-multitenancy.md)

## Context

Lessons are video-first. The rebuild moves compute, identity, and data to AWS
([ADR-0001](./0001-backend-amplify-gen2.md), [ADR-0003](./0003-single-pool-multitenancy.md)),
which raises the obvious question: should video move to AWS too (S3 + MediaConvert
+ CloudFront), or stay on the existing Cloudflare Stream setup?

Two requirements constrain the answer:

1. **Offline playback.** Field/austere learners ([ADR-0002](./0002-offline-event-sourcing.md))
   must download a lesson video and watch it with no connectivity. That needs a
   plain, cacheable **MP4 download**, not only adaptive HLS/DASH streaming.
2. **DynamoDB must never hold video bytes.** The single table is for records and
   metadata. Storing media blobs in DynamoDB is an anti-pattern (item-size limits,
   cost, hot partitions) and the old template already enforced "no video in the
   database."

The rebuild deliberately runs a **split cloud**: AWS for auth/data/compute,
Cloudflare for video. That split is a decision to keep, not an accident to
unwind.

## Decision

**We keep video on Cloudflare Stream. The AWS/Cloudflare split is deliberate.**

- **Cloudflare Stream** ingests, transcodes, and delivers lesson video
  (adaptive streaming for online playback; signed URLs / tokens for access
  control). AWS is not in the video path.
- **The MP4 download endpoint enables offline.** Stream's downloadable MP4
  rendition is what the mobile app fetches to cache a lesson locally for offline
  viewing (paired with the offline layer in
  [ADR-0002](./0002-offline-event-sourcing.md)). Streaming-only delivery would not
  satisfy the offline requirement.
- **DynamoDB stores metadata only.** The `VideoAsset` model
  (`SK = VIDEO#<videoId>`, PK = `TENANT#<tenantId>`) holds only **metadata** —
  the Cloudflare video id, duration, thumbnail, caption/transcript references,
  ready state, and the like. **Never video bytes.** The `VIDEO#` row points at
  Cloudflare; it does not contain the media.
- `VideoAsset` is tenant-partitioned like everything else, so video metadata is
  covered by the same tenant-match invariant ([ADR-0003](./0003-single-pool-multitenancy.md)).

## Alternatives considered

- **Migrate video to AWS (S3 + MediaConvert + CloudFront) — rejected.** It would
  put everything under one cloud, but it means rebuilding a working transcode +
  delivery pipeline, and re-solving signed delivery and the downloadable-MP4-for-
  offline path that Cloudflare Stream already provides. No benefit that justifies
  the migration; Cloudflare Stream stays.
- **HLS/DASH streaming only, no MP4 download — rejected.** Adaptive streaming is
  fine online but does not give a self-contained file to cache for offline
  playback, which is a core requirement for this learner base.
- **Store video (or offline bundles of it) in DynamoDB — rejected outright.**
  Violates the "metadata only" rule; DynamoDB item-size limits and cost make it a
  non-starter. Video lives in Cloudflare; the device caches the downloaded MP4 in
  local storage, not in the table.

## Consequences

**Easier**

- Cloudflare Stream continues to own transcode, adaptive delivery, and the
  downloadable MP4, so we don't build or run a video pipeline on AWS.
- Offline lesson playback has a clean primitive: fetch the MP4 rendition, cache
  it on device, play it back with no network.
- The data layer stays lean — `VideoAsset` rows are small metadata pointers, so
  DynamoDB keeps its record-store role and avoids media-blob pathologies.

**Harder / ongoing cost**

- **Two clouds to operate.** AWS (auth/data) and Cloudflare (video) each have
  their own credentials, config, and failure modes; the split must be documented
  so operators know video incidents are a Cloudflare concern, not AWS.
- Access control spans the boundary: AWS-authenticated users must be granted
  time-bounded access to Cloudflare-hosted video (signed URLs/tokens), so the
  backend has to bridge the two systems for playback and for issuing the MP4
  download link.
- The `VideoAsset` metadata can drift from Cloudflare's actual state (e.g.
  ready/processing, deletions); the source of truth for the bytes is Cloudflare,
  and the `VIDEO#` row must be reconciled against it rather than assumed
  authoritative.
- Offline-cached MP4s live in device storage outside AWS; their lifecycle
  (eviction, re-download on staleness) is the mobile app's responsibility.
