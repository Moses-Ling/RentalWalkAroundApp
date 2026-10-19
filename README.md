# Rental Walk-Around

Phone-friendly web app to record room/equipment condition at move-in, log repairs during a lease, and compare at move-out. See `docs/REQUIREMENTS.md` and `docs/PLAN.md`.

## Run on your laptop
```bash
npm install
cp .env.example .env        # set APP_PASSWORD and SESSION_SECRET (>=32 chars)
npm run db:up               # Postgres in Docker on port 5433
npm run db:push             # create tables
npm run dev                 # http://0.0.0.0:3000
```
On the phone (same Wi-Fi) open `http://<laptop-ip>:3000` (find the IP with `ipconfig getifaddr en0`).
Camera capture uses `<input capture>`, which works over plain HTTP.

## Tests (need the Postgres container running)
```bash
npm test                    # everything
npm run test:phase0 … test:phase4
```
Tests use a separate `rental_test` database in the same container.

## Notes
- Photos are stored in `UPLOAD_DIR` behind a `StorageProvider` interface (swap for S3 later).
- Signed inspections are locked server-side; only the repair log may flag a blemish as repaired.
- Not yet covered: remote renter links, deposit accounting, multi-tenant SaaS (Phases 5-6).
