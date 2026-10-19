# Rental Walk-Around App — Software Requirements

## 1. Purpose
A phone-optimized web app for documenting the condition of every room and piece of equipment in a rental property at move-in, logging repairs during the lease, and verifying condition at move-out. The signed move-in report is the evidence snapshot; the move-out report is compared against it.

## 2. Scope
**MVP (Phase 1–4):** single landlord, multiple properties, runs on a laptop (Docker + Postgres), phone connects over the same Wi-Fi. Renter reviews and signs in person on the landlord's phone; a PDF copy is generated.
**Later:** remote renter review links on cloud hosting (Phase 5), security deposit accounting and multi-tenant SaaS (Phase 6).

## 3. Users
- **Landlord/Inspector (MVP user):** logs in with a single password, performs inspections.
- **Renter (signs in person):** reviews, comments, signs on the landlord's device. No account.

## 4. User stories
- US-1 Add a property and set up its rooms and items from templates, then customize.
- US-2 Create a lease for a property with renter details and dates.
- US-3 Start a move-in inspection; per room and per item record condition, working order, notes (typed or phone dictation), multiple photos.
- US-4 Draw on a photo (circle/arrow) to highlight a blemish; original is preserved.
- US-5 Record multiple blemishes per room/item, each with notes and photos.
- US-6 Renter reviews the report, adds comments per item, and signs; report is then locked.
- US-7 Export a PDF of the signed report.
- US-8 Log repairs during the lease (date, description, photos, vendor, cost, receipt, responsibility) linked to a blemish or item.
- US-9 Start a move-out inspection pre-filled from move-in; see move-in data beside current state; mark unchanged / new damage / repaired; add new blemishes.
- US-10 Generate a signed move-in vs move-out comparison PDF highlighting changes and repairs.

## 5. Functional requirements
| ID | Requirement |
|----|-------------|
| FR-1 | CRUD for properties, rooms, items. Room/item templates provide starter lists. |
| FR-2 | A property's layout is cloned (snapshot) into each inspection so later layout edits do not alter past reports. |
| FR-3 | Lease: property, renter name/email/phone, start/end dates, status (draft, active, ended). |
| FR-4 | Inspection types: MOVE_IN, MOVE_OUT. One of each per lease. Status: DRAFT → SIGNED (locked). |
| FR-5 | Condition scale: EXCELLENT, GOOD, FAIR, POOR, DAMAGED. Working order: WORKING, PARTIAL, NOT_WORKING, N/A. |
| FR-6 | Photos: multiple per room, item, blemish, repair; server-timestamped; original retained; annotated version stored separately. |
| FR-7 | Annotation: free-hand pen, circle, arrow, color, undo, on a canvas. |
| FR-8 | Notes fields are plain text areas compatible with the OS keyboard dictation. |
| FR-9 | Renter comments per room/item/blemish during review. |
| FR-10 | Signatures: drawn signature image + name + timestamp for landlord and renter. Signing locks the inspection; edits afterward are only possible as addenda. |
| FR-11 | Repair log: date, description, vendor, cost, receipt photo, before/after photos, responsibility (TENANT, NORMAL_WEAR, LANDLORD_MAINTENANCE), linked blemish or item. Linking marks the blemish as REPAIRED. |
| FR-12 | Move-out: pre-filled from move-in snapshot; each item gets a change status (UNCHANGED, NEW_DAMAGE, REPAIRED, WORKING_ORDER_CHANGED). |
| FR-13 | PDF generation for move-in report and comparison report, including photos. |
| FR-14 | Single-user password authentication (session cookie). Data model includes `ownerId` on all top-level entities for future multi-tenancy. |

## 6. Non-functional requirements
- NFR-1 Mobile-first UI: usable one-handed at 360–430 px width; tap targets ≥ 44 px.
- NFR-2 Photos are downscaled client-side (max 2000 px, JPEG ~0.8) before upload.
- NFR-3 Storage behind an interface (`StorageProvider`): local disk now, S3 later.
- NFR-4 Config via environment variables; Docker Compose for Postgres and app; moves to cloud without code change.
- NFR-5 Signed data is immutable at the API level (enforced server-side, not just UI).
- NFR-6 Uploads validated: image MIME types only, 15 MB limit.
- NFR-7 Automated tests per phase (unit, API/integration against real Postgres, e2e for the key flow).

## 7. Data model (Postgres / Prisma)
Owner, Property, RoomTemplate/ItemTemplate (seed), Room, Item (live layout) → Lease → Inspection (type, status) → InspectionRoom / InspectionItem (snapshots with condition, working order, notes, change status) → Blemish, Photo (polymorphic via nullable FKs), Comment, Signature, Repair.

## 8. Out of scope for MVP
Remote renter links, deposit accounting, payments, multi-user roles, mid-lease inspections, native apps, offline sync.

## 9. Risks
- Camera access (`getUserMedia`) needs HTTPS: use `<input capture>` for photos (works over HTTP) and mkcert for HTTPS if needed.
- Large PDFs with many photos: downscaled images and streaming generation.
