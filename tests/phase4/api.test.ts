import { describe, it, expect, beforeEach } from "vitest";
import { resetDb, makeOwner, PNG_1PX } from "../helpers";
import { dispatch, handleLogin } from "@/server/api";
import { verifySessionToken } from "@/server/auth";

beforeEach(resetDb);

async function call(ownerId: string, method: string, path: string, body?: unknown) {
  const init: RequestInit = { method };
  if (body instanceof FormData) init.body = body;
  else if (body !== undefined) {
    init.body = JSON.stringify(body);
    init.headers = { "content-type": "application/json" };
  }
  const res = await dispatch(new Request(`http://x/api/${path}`, init), path.split("/"), ownerId);
  return { res, json: res.headers.get("content-type")?.includes("json") ? await res.json() : null };
}

describe("login", () => {
  it("issues a verifiable token only for the right password", async () => {
    expect((await handleLogin({ password: "nope" })).status).toBe(401);
    expect((await handleLogin({})).status).toBe(401);
    const ok = await handleLogin({ password: "test-password" });
    expect(ok.status).toBe(200);
    if (ok.status === 200) expect(verifySessionToken(ok.token)).toBeTruthy();
  });
});

describe("HTTP API end-to-end", () => {
  it("runs property -> lease -> move-in -> photo -> sign -> pdf over the router", async () => {
    const o = await makeOwner();
    const prop = (await call(o.id, "POST", "properties", { name: "Unit 9", address: "9 Elm" })).json;
    const room = (await call(o.id, "POST", `properties/${prop.id}/rooms`, { templateKey: "bedroom" })).json;
    expect(room.items.length).toBeGreaterThan(0);
    const lease = (await call(o.id, "POST", `properties/${prop.id}/leases`, { renterName: "Sam", startDate: "2026-11-01", endDate: "2027-10-31" })).json;
    const created = await call(o.id, "POST", `leases/${lease.id}/inspections`, { type: "MOVE_IN" });
    expect(created.res.status).toBe(201);
    const insp = created.json;

    const room0 = insp.rooms[0];
    expect((await call(o.id, "PATCH", `inspection-rooms/${room0.id}`, { condition: "GOOD", notes: "ok" })).res.status).toBe(200);
    const bl = (await call(o.id, "POST", `inspection-rooms/${room0.id}/blemishes`, { description: "Dent" })).json;

    const form = new FormData();
    form.set("file", new File([new Uint8Array(PNG_1PX)], "p.png", { type: "image/png" }));
    form.set("blemishId", bl.id);
    const ph = await call(o.id, "POST", "photos", form);
    expect(ph.res.status).toBe(201);
    const served = await call(o.id, "GET", `photos/${ph.json.id}`);
    expect(served.res.headers.get("content-type")).toBe("image/png");

    const badForm = new FormData();
    badForm.set("file", new File(["hello"], "x.txt", { type: "text/plain" }));
    badForm.set("roomId", room0.id);
    expect((await call(o.id, "POST", "photos", badForm)).res.status).toBe(400);

    const sig = `data:image/png;base64,${PNG_1PX.toString("base64")}`;
    await call(o.id, "POST", `inspections/${insp.id}/sign`, { role: "LANDLORD", name: "Lee", imageDataUrl: sig });
    await call(o.id, "POST", `inspections/${insp.id}/sign`, { role: "RENTER", name: "Sam", imageDataUrl: sig });
    expect((await call(o.id, "PATCH", `inspection-rooms/${room0.id}`, { notes: "tamper" })).res.status).toBe(409);

    const report = await call(o.id, "GET", `inspections/${insp.id}/report.pdf`);
    expect(report.res.headers.get("content-type")).toBe("application/pdf");
    expect(Buffer.from(await report.res.arrayBuffer()).subarray(0, 5).toString()).toBe("%PDF-");
  });

  it("returns 404 for unknown routes, 404 for other owners' data and 400 for bad JSON", async () => {
    const a = await makeOwner("a@t.dev");
    const b = await makeOwner("b@t.dev");
    expect((await call(a.id, "GET", "nope")).res.status).toBe(404);
    const prop = (await call(a.id, "POST", "properties", { name: "P" })).json;
    expect((await call(b.id, "GET", `properties/${prop.id}`)).res.status).toBe(404);
    const bad = await dispatch(
      new Request("http://x/api/properties", { method: "POST", body: "{", headers: { "content-type": "application/json" } }),
      ["properties"], a.id,
    );
    expect(bad.status).toBe(400);
  });
});
