# Invoice Send Contract V2

Last updated: 2026-09-22

PRD 2 accepted September 22 with physical-device testing deferred by the user.
Not released. Acceptance does not authorize production deployment.

`services/invoiceSending.ts` owns an AsyncStorage request ID per Clerk account
and visit. Persist before networking, join concurrent taps, reuse after lost
responses/restarts, and clear on complete success, definite failure or Office
review closure. Partial, pending and uncertain outcomes retain their ID.
Do not add email sends to PowerSync or clear these keys during updates.

POST `/api/send-invoice` includes `contractVersion: 2` and `requestId` alongside
the visit. GET with the same ID checks without sending. Partial outcomes can be
HTTP 207 and pending 202; inspect JSON recipient outcomes. Older contracts get
426 / `UPDATE_REQUIRED`; job/report/photo and other PowerSync work remains available.
The backend owns staff/assignment checks, accounting recipients and invoice links.

Job Detail checks stored requests on opening and exposes partial/uncertain results.
Explicit retry retains an unresolved/partial ID; after a definite failure it
creates a new ID. The phone cannot narrow the server-owned accounting recipients,
so a partial send must not create a fresh request to all of them. Office may
recover evidence, close a review, or
approve another send; the original request follows replacement results.

Verified: nine focused Jest tests; TypeScript and ESLint pass. Physical-device
restart/reconnect, account/visit switching, update-required and unaffected offline
sync checks remain deferred, not passed. No actual message was sent during
implementation or acceptance documentation. Next: coordinate PRD 3 planning with
the backend; payment-reminder UI consolidation is deferred to PRD 3A.

Coordinate deployment with projectvhd's PRD 2 preparation and rollout checklist:
`docs/plans/astra-prd-2-unified-outbound.md` and `astra-production-rollout.md`.
