# Execution Plan

Each phase ends with passing automated tests (`npm test`) and an acceptance check.

| Phase | Scope | Tests |
|-------|-------|-------|
| 0 Foundation | Next.js + TS, Prisma schema, Docker Compose Postgres, auth, storage layer, test harness | Unit: auth, storage, validation. Integration: DB connectivity, auth API |
| 1 Property setup | Properties, rooms, items, templates, leases | API tests: CRUD, template seeding, cascade, ownership scoping |
| 2 Move-in inspection | Snapshot layout, condition/working order/notes, blemishes, photo upload, annotation, locking | API tests: snapshot copy, photo validation, blemish CRUD, lock on sign. Unit: annotation helpers |
| 3 Sign-off and reports | Comments, signatures, PDF generation | API tests: sign locks edits, comments, PDF output is valid PDF |
| 4 Repairs and move-out | Repair log, link to blemish, move-out prefilled, comparison and PDF | API tests: repair marks blemish repaired, move-out prefill, diff logic |
| 5 Cloud (future) | S3 storage, tokenized renter links, hosting | — |
| 6 SaaS (future) | Deposit accounting, multi-tenant accounts, billing | — |

Phases 0–4 are built now. End-to-end flow test covers the full lifecycle in Phase 4.
