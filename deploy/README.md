# Running Rental Walk-Around on a laptop at the property

The app and its database run as two Docker containers. The app listens on **every network
interface** of the laptop (port 3000), so you never configure an address: whatever network the
laptop joins, the iPad opens `http://<laptop-address>:3000`.

## A. One-time prep at home (needs internet)

1. Install **Docker Desktop** on the laptop and open it once (sign in if asked).
2. Create a folder, e.g. `~/rental`, and put two files in it:
   - `docker-compose.yml` (copy from this `deploy/` folder)
   - `.env` (copy `.env.example`, then edit: your Docker Hub username in lowercase (e.g. `mosesling`), and your own passwords)
3. The image is in a private Docker Hub repo, so sign in once on the laptop: `docker login -u MosesLing`
   (use your Docker Hub password or an access token).
4. In that folder, download the images **now**, while you have internet:
   ```bash
   cd ~/rental
   docker compose pull
   docker compose up -d
   ```
5. Open `http://localhost:3000` on the laptop, sign in with `APP_PASSWORD`, then stop it if you like
   (`docker compose down` keeps all data).

Do this at home. At the property you may have no internet, and the images are already on the laptop.

## B. At the property

1. Start Docker Desktop on the laptop (the containers restart by themselves; if not, `cd ~/rental && docker compose up -d`).
2. Connect the laptop to the Wi-Fi access point, **or** plug in the Ethernet adapter to the router.
3. Connect the iPad to the **same** network (same Wi-Fi, or the router's Wi-Fi if the laptop is on its Ethernet).
4. Find the laptop's address, then open it on the iPad in Safari:
   - Easiest, works on any network: run `scutil --get LocalHostName`, then browse to
     `http://<that-name>.local:3000`
   - Or use the IP address: `ipconfig getifaddr en0` (Wi-Fi). For the Ethernet adapter, try `en1`, `en2`...
     (list ports with `networksetup -listallhardwareports`), then `http://<ip>:3000`
5. If macOS asks to allow incoming connections for Docker, choose **Allow**.
6. Keep the laptop awake while collecting photos: `caffeinate -dims` in a Terminal window
   (stop it with Ctrl-C), or change Energy settings. A sleeping laptop drops the connection.

**If the iPad cannot connect:** some guest/public Wi-Fi networks block devices from talking to each
other ("client isolation"). Use the router's Ethernet port, a normal (non-guest) network, or a
travel router / phone hotspot that both devices join.

Security: the app is protected by your password, but traffic on the local network is plain HTTP.
Avoid public networks.

## C. Where your data lives, and backups

Everything is stored on the laptop in a `data` folder next to `docker-compose.yml`:
```
~/rental/data/uploads/    all photos
~/rental/data/postgres/   the database files
```
Stopping, removing or updating the containers never touches this folder.
Deleting the folder (or `~/rental`) deletes your data, so do not.

**Safest backup** (consistent database dump plus photos), run from `~/rental`:
```bash
docker compose exec -T db pg_dump -U rental rental > backup-$(date +%F).sql
cp -R data/uploads uploads-backup-$(date +%F)
```
Copy those two items to a USB drive or cloud storage when you are done.
Simply copying `data/postgres` while the app is running can give a corrupt copy;
if you want to copy that folder, run `docker compose down` first.

Restoring on another machine: start the stack, then
`docker compose exec -T db psql -U rental rental < backup-DATE.sql` and copy the photos into `data/uploads/`.

## D. Updating to a new version
```bash
docker compose pull && docker compose up -d
```
The app updates its own database tables on start.
