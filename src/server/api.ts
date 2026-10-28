import { prisma } from "./db";
import { AppError, badRequest } from "./errors";
import { checkPassword, createSessionToken } from "./auth";
import { ROOM_TEMPLATES } from "./templates";
import * as P from "./services/property";
import * as L from "./services/lease";
import * as I from "./services/inspection";
import * as S from "./services/signoff";
import * as R from "./services/repair";
import { buildInspectionPdf } from "./services/report";
import { compareLease, buildComparisonPdf } from "./services/comparison";

type Params = Record<string, string>;
type Ctx = { ownerId: string; params: Params; body: any; req: Request };
type Handler = (c: Ctx) => Promise<Response | unknown>;

export const json = (data: unknown, status = 200) =>
  new Response(JSON.stringify(data), { status, headers: { "content-type": "application/json" } });

const pdf = (buf: Buffer, name: string) =>
  new Response(new Uint8Array(buf), {
    headers: { "content-type": "application/pdf", "content-disposition": `inline; filename="${name}"` },
  });

const routes: { method: string; pattern: string[]; handler: Handler }[] = [];
function on(method: string, path: string, handler: Handler) {
  routes.push({ method, pattern: path.split("/"), handler });
}

function match(pattern: string[], segs: string[]): Params | null {
  if (pattern.length !== segs.length) return null;
  const params: Params = {};
  for (let i = 0; i < pattern.length; i++) {
    if (pattern[i].startsWith(":")) params[pattern[i].slice(1)] = decodeURIComponent(segs[i]);
    else if (pattern[i] !== segs[i]) return null;
  }
  return params;
}

// ---- routes -------------------------------------------------------------------
on("GET", "templates", async () => ROOM_TEMPLATES.map((t) => ({ key: t.key, name: t.name, itemCount: t.items.length })));

on("GET", "properties", (c) => P.listProperties(c.ownerId));
on("POST", "properties", async (c) => {
  const p = await P.createProperty(c.ownerId, c.body);
  await P.applyStartingLayout(c.ownerId, p.id);
  return p;
});
on("GET", "properties/:id", (c) => P.getProperty(c.ownerId, c.params.id));
on("PATCH", "properties/:id", (c) => P.updateProperty(c.ownerId, c.params.id, c.body));
on("DELETE", "properties/:id", async (c) => (await P.deleteProperty(c.ownerId, c.params.id), { ok: true }));
on("POST", "properties/:id/starting-layout", async (c) => (await P.fillEmptyProperty(c.ownerId, c.params.id), { ok: true }));
on("POST", "properties/:id/default-layout", async (c) => (await P.setDefaultLayout(c.ownerId, c.params.id), { ok: true }));
on("POST", "properties/:id/rooms", (c) => P.addRoom(c.ownerId, c.params.id, c.body));
on("POST", "properties/:id/clone-from/:fromId", async (c) => (await P.cloneLayout(c.ownerId, c.params.fromId, c.params.id), { ok: true }));
on("PATCH", "rooms/:id", (c) => P.renameRoom(c.ownerId, c.params.id, c.body.name));
on("DELETE", "rooms/:id", async (c) => (await P.deleteRoom(c.ownerId, c.params.id), { ok: true }));
on("POST", "rooms/:id/items", (c) => P.addItem(c.ownerId, c.params.id, c.body));
on("PATCH", "items/:id", (c) => P.renameItem(c.ownerId, c.params.id, c.body.name));
on("DELETE", "items/:id", async (c) => (await P.deleteItem(c.ownerId, c.params.id), { ok: true }));

on("POST", "properties/:id/leases", (c) => L.createLease(c.ownerId, c.params.id, c.body));
on("GET", "leases/:id", (c) => L.getLease(c.ownerId, c.params.id));
on("DELETE", "leases/:id", async (c) => (await L.deleteLease(c.ownerId, c.params.id), { ok: true }));
on("PATCH", "leases/:id", (c) => L.updateLeaseStatus(c.ownerId, c.params.id, c.body.status));
on("POST", "leases/:id/inspections", (c) => I.startInspection(c.ownerId, c.params.id, c.body.type));
on("GET", "leases/:id/comparison", (c) => compareLease(c.ownerId, c.params.id));
on("GET", "leases/:id/comparison.pdf", async (c) => pdf(await buildComparisonPdf(c.ownerId, c.params.id), "comparison.pdf"));
on("GET", "leases/:id/repairs", (c) => R.listRepairs(c.ownerId, c.params.id));
on("POST", "leases/:id/repairs", (c) => R.createRepair(c.ownerId, c.params.id, c.body));
on("DELETE", "repairs/:id", async (c) => (await R.deleteRepair(c.ownerId, c.params.id), { ok: true }));

on("GET", "inspections/:id", (c) => I.getInspection(c.ownerId, c.params.id));
on("DELETE", "inspections/:id", async (c) => (await I.deleteInspection(c.ownerId, c.params.id), { ok: true }));
on("GET", "inspections/:id/report.pdf", async (c) => pdf(await buildInspectionPdf(c.ownerId, c.params.id), "report.pdf"));
on("POST", "inspections/:id/sign", (c) => S.signInspection(c.ownerId, c.params.id, c.body.role, c.body.name, c.body.imageDataUrl));
on("POST", "inspections/:id/load-layout", (c) => I.loadPropertyLayout(c.ownerId, c.params.id));
on("POST", "inspections/:id/rooms", (c) => I.addInspectionRoom(c.ownerId, c.params.id, c.body.name));
on("DELETE", "inspection-rooms/:id", async (c) => (await I.deleteInspectionRoom(c.ownerId, c.params.id), { ok: true }));
on("POST", "inspection-rooms/:id/items", (c) => I.addInspectionItem(c.ownerId, c.params.id, c.body));
on("DELETE", "inspection-items/:id", async (c) => (await I.deleteInspectionItem(c.ownerId, c.params.id), { ok: true }));
on("PATCH", "inspection-rooms/:id", (c) => I.updateRoom(c.ownerId, c.params.id, c.body));
on("PATCH", "inspection-items/:id", (c) => I.updateItem(c.ownerId, c.params.id, c.body));
on("POST", "inspection-rooms/:id/blemishes", (c) => I.addBlemish(c.ownerId, c.params.id, c.body));
on("PATCH", "blemishes/:id", (c) => I.updateBlemish(c.ownerId, c.params.id, c.body));
on("DELETE", "blemishes/:id", async (c) => (await I.deleteBlemish(c.ownerId, c.params.id), { ok: true }));
on("POST", "comments", (c) => {
  const { roomId, itemId, blemishId, author, text } = c.body;
  return S.addComment(c.ownerId, { roomId, itemId, blemishId }, author, text);
});

async function upload(c: Ctx, attach: (data: Buffer, form: FormData) => Promise<unknown>) {
  const form = await c.req.formData();
  const file = form.get("file");
  if (!(file instanceof File)) throw badRequest("file is required");
  return attach(Buffer.from(await file.arrayBuffer()), form);
}
const str = (f: FormData, k: string) => (typeof f.get(k) === "string" && f.get(k) ? (f.get(k) as string) : undefined);

on("POST", "photos", (c) =>
  upload(c, (data, f) =>
    I.addPhoto(c.ownerId, { roomId: str(f, "roomId"), itemId: str(f, "itemId"), blemishId: str(f, "blemishId") }, data, str(f, "caption") ?? ""),
  ),
);
on("POST", "repairs/:id/photos", (c) => upload(c, (data, f) => R.addRepairPhoto(c.ownerId, c.params.id, data, str(f, "caption") ?? "")));
on("GET", "photos/:id", async (c) => {
  const { data, mimeType } = await I.readPhoto(c.ownerId, c.params.id);
  return new Response(new Uint8Array(data), { headers: { "content-type": mimeType, "cache-control": "private, max-age=3600" } });
});
on("DELETE", "photos/:id", async (c) => (await I.deletePhoto(c.ownerId, c.params.id), { ok: true }));
on("POST", "photos/:id/annotate", (c) => I.saveAnnotatedPhoto(c.ownerId, c.params.id, c.body.dataUrl));

// ---- dispatcher ---------------------------------------------------------------

export async function handleLogin(body: { password?: string }) {
  if (!body?.password || !checkPassword(body.password)) return { status: 401 as const };
  const owner = await prisma.owner.upsert({
    where: { email: process.env.OWNER_EMAIL ?? "owner@local" },
    create: { email: process.env.OWNER_EMAIL ?? "owner@local" },
    update: {},
  });
  return { status: 200 as const, token: createSessionToken(owner.id) };
}

export async function dispatch(req: Request, segments: string[], ownerId: string): Promise<Response> {
  try {
    for (const r of routes) {
      if (r.method !== req.method) continue;
      const params = match(r.pattern, segments);
      if (!params) continue;
      let body: any = {};
      if (["POST", "PATCH", "PUT"].includes(req.method) && req.headers.get("content-type")?.includes("application/json")) {
        try {
          body = await req.json();
        } catch {
          throw badRequest("Invalid JSON");
        }
      }
      const out = await r.handler({ ownerId, params, body, req });
      return out instanceof Response ? out : json(out, req.method === "POST" ? 201 : 200);
    }
    return json({ error: "Not found" }, 404);
  } catch (e) {
    if (e instanceof AppError) return json({ error: e.message }, e.status);
    console.error(e);
    return json({ error: "Internal error" }, 500);
  }
}
