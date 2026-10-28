import { describe, it, expect, beforeEach } from "vitest";
import { resetDb, makeOwner, PNG_1PX } from "../helpers";
import { seedLease, seedMoveIn } from "./fixtures";
import * as P from "@/server/services/property";
import * as I from "@/server/services/inspection";
import * as S from "@/server/services/signoff";
import { SIGNING_ENABLED } from "@/lib/config";
import * as L from "@/server/services/lease";
import { DEFAULT_LAYOUT } from "@/server/defaultLayout";
import { prisma } from "@/server/db";

beforeEach(resetDb);

describe("starting a move-in inspection", () => {
  it("snapshots the property layout", async () => {
    const { owner, lease, prop } = await seedLease();
    const insp = await I.startInspection(owner.id, lease.id, "MOVE_IN");
    expect(insp.status).toBe("DRAFT");
    expect(insp.rooms.map((r) => r.name)).toEqual(["Kitchen", "Bedroom"]);
    expect(insp.rooms[0].items.some((i) => i.name === "Refrigerator" && i.isEquipment)).toBe(true);

    // later layout edits must not alter the snapshot
    const full = await P.getProperty(owner.id, prop.id);
    await P.deleteRoom(owner.id, full.rooms[0].id);
    const again = await I.getInspection(owner.id, insp.id);
    expect(again.rooms).toHaveLength(2);
  });

  it("allows only one move-in per lease and is owner-scoped", async () => {
    const { owner, lease } = await seedLease();
    await I.startInspection(owner.id, lease.id, "MOVE_IN");
    await expect(I.startInspection(owner.id, lease.id, "MOVE_IN")).rejects.toThrow(/already exists/);
    const other = await makeOwner("x@test.dev");
    await expect(I.startInspection(other.id, lease.id, "MOVE_OUT")).rejects.toThrow(/not found/i);
  });

  it("refuses move-out before a signed move-in", async () => {
    const { owner, lease } = await seedLease();
    await expect(I.startInspection(owner.id, lease.id, "MOVE_OUT")).rejects.toThrow(/Move-in/);
    await I.startInspection(owner.id, lease.id, "MOVE_IN");
    if (SIGNING_ENABLED) await expect(I.startInspection(owner.id, lease.id, "MOVE_OUT")).rejects.toThrow(/signed/);
  });
});

describe("recording condition", () => {
  it("updates room and item condition, working order and notes", async () => {
    const { owner, insp } = await seedMoveIn();
    const room = insp.rooms[0];
    const fridge = room.items.find((i) => i.name === "Refrigerator")!;
    await I.updateRoom(owner.id, room.id, { condition: "GOOD", notes: "Clean" });
    await I.updateItem(owner.id, fridge.id, { condition: "FAIR", workingOrder: "PARTIAL", notes: "Freezer ices up" });
    const got = await I.getInspection(owner.id, insp.id);
    expect(got.rooms[0].condition).toBe("GOOD");
    const f = got.rooms[0].items.find((i) => i.id === fridge.id)!;
    expect([f.condition, f.workingOrder, f.notes]).toEqual(["FAIR", "PARTIAL", "Freezer ices up"]);
  });

  it("rejects invalid enum values", async () => {
    const { owner, insp } = await seedMoveIn();
    await expect(I.updateRoom(owner.id, insp.rooms[0].id, { condition: "AWESOME" as never })).rejects.toThrow(/condition/);
    await expect(
      I.updateItem(owner.id, insp.rooms[0].items[0].id, { workingOrder: "BROKEN" as never }),
    ).rejects.toThrow(/working order/);
  });

  it("blocks other owners", async () => {
    const { insp } = await seedMoveIn();
    const other = await makeOwner("x@test.dev");
    await expect(I.updateRoom(other.id, insp.rooms[0].id, { notes: "hax" })).rejects.toThrow();
  });
});

describe("blemishes", () => {
  it("adds, edits and deletes blemishes for a room or an item", async () => {
    const { owner, insp } = await seedMoveIn();
    const room = insp.rooms[0];
    const wall = room.items.find((i) => i.name === "Walls")!;
    const b1 = await I.addBlemish(owner.id, room.id, { description: "Scuff near door" });
    const b2 = await I.addBlemish(owner.id, room.id, { description: "2in scratch", itemId: wall.id });
    await I.updateBlemish(owner.id, b1.id, { description: "Scuff by door frame" });
    let got = await I.getInspection(owner.id, insp.id);
    expect(got.rooms[0].blemishes).toHaveLength(2);
    expect(got.rooms[0].blemishes.find((b) => b.id === b1.id)!.description).toBe("Scuff by door frame");
    expect(got.rooms[0].items.find((i) => i.id === wall.id)!.blemishes[0].id).toBe(b2.id);
    await I.deleteBlemish(owner.id, b1.id);
    got = await I.getInspection(owner.id, insp.id);
    expect(got.rooms[0].blemishes).toHaveLength(1);
  });

  it("validates input and item/room pairing", async () => {
    const { owner, insp } = await seedMoveIn();
    await expect(I.addBlemish(owner.id, insp.rooms[0].id, { description: " " })).rejects.toThrow(/required/);
    await expect(
      I.addBlemish(owner.id, insp.rooms[0].id, { description: "x", itemId: insp.rooms[1].items[0].id }),
    ).rejects.toThrow(/belong/);
  });
});

describe("photos", () => {
  it("attaches multiple photos to rooms, items and blemishes", async () => {
    const { owner, insp } = await seedMoveIn();
    const room = insp.rooms[0];
    const b = await I.addBlemish(owner.id, room.id, { description: "Chip" });
    await I.addPhoto(owner.id, { roomId: room.id }, PNG_1PX);
    await I.addPhoto(owner.id, { roomId: room.id }, PNG_1PX);
    await I.addPhoto(owner.id, { itemId: room.items[0].id }, PNG_1PX, "wall");
    await I.addPhoto(owner.id, { blemishId: b.id }, PNG_1PX);
    const got = await I.getInspection(owner.id, insp.id);
    expect(got.rooms[0].photos).toHaveLength(2);
    expect(got.rooms[0].items[0].photos[0].caption).toBe("wall");
    expect(got.rooms[0].blemishes[0].photos).toHaveLength(1);
    expect(got.rooms[0].photos[0].kind).toBe("ORIGINAL");
  });

  it("rejects non-images and ambiguous targets", async () => {
    const { owner, insp } = await seedMoveIn();
    const room = insp.rooms[0];
    await expect(I.addPhoto(owner.id, { roomId: room.id }, Buffer.from("not an image"))).rejects.toThrow(/PNG/);
    await expect(I.addPhoto(owner.id, {}, PNG_1PX)).rejects.toThrow(/exactly one/);
    await expect(I.addPhoto(owner.id, { roomId: room.id, itemId: room.items[0].id }, PNG_1PX)).rejects.toThrow(/exactly one/);
  });

  it("keeps the original when annotating and replaces older annotation", async () => {
    const { owner, insp } = await seedMoveIn();
    const photo = await I.addPhoto(owner.id, { roomId: insp.rooms[0].id }, PNG_1PX);
    const url = `data:image/png;base64,${PNG_1PX.toString("base64")}`;
    const a1 = await I.saveAnnotatedPhoto(owner.id, photo.id, url);
    const a2 = await I.saveAnnotatedPhoto(owner.id, photo.id, url);
    expect(a1.kind).toBe("ANNOTATED");
    expect(a2.originalId).toBe(photo.id);
    const all = await prisma.photo.findMany({ where: { roomId: insp.rooms[0].id } });
    expect(all.filter((p) => p.kind === "ORIGINAL")).toHaveLength(1);
    expect(all.filter((p) => p.kind === "ANNOTATED")).toHaveLength(1);
    expect((await I.readPhoto(owner.id, photo.id)).data.equals(PNG_1PX)).toBe(true);
  });

  it("deleting an original removes its annotation; other owners can't read photos", async () => {
    const { owner, insp } = await seedMoveIn();
    const photo = await I.addPhoto(owner.id, { roomId: insp.rooms[0].id }, PNG_1PX);
    await I.saveAnnotatedPhoto(owner.id, photo.id, `data:image/png;base64,${PNG_1PX.toString("base64")}`);
    const other = await makeOwner("x@test.dev");
    await expect(I.readPhoto(other.id, photo.id)).rejects.toThrow();
    await I.deletePhoto(owner.id, photo.id);
    expect(await prisma.photo.count()).toBe(0);
  });
});

describe("locking", () => {
  it("rejects every edit once the inspection is signed", async () => {
    const { owner, insp } = await seedMoveIn();
    const room = insp.rooms[0];
    const b = await I.addBlemish(owner.id, room.id, { description: "x" });
    const photo = await I.addPhoto(owner.id, { roomId: room.id }, PNG_1PX);
    await prisma.inspection.update({ where: { id: insp.id }, data: { status: "SIGNED", signedAt: new Date() } });
    const locked = /locked/;
    await expect(I.updateRoom(owner.id, room.id, { notes: "n" })).rejects.toThrow(locked);
    await expect(I.updateItem(owner.id, room.items[0].id, { notes: "n" })).rejects.toThrow(locked);
    await expect(I.addBlemish(owner.id, room.id, { description: "y" })).rejects.toThrow(locked);
    await expect(I.updateBlemish(owner.id, b.id, { description: "z" })).rejects.toThrow(locked);
    await expect(I.deleteBlemish(owner.id, b.id)).rejects.toThrow(locked);
    await expect(I.addPhoto(owner.id, { roomId: room.id }, PNG_1PX)).rejects.toThrow(locked);
    await expect(I.deletePhoto(owner.id, photo.id)).rejects.toThrow(locked);
    await expect(
      I.saveAnnotatedPhoto(owner.id, photo.id, `data:image/png;base64,${PNG_1PX.toString("base64")}`),
    ).rejects.toThrow(locked);
  });
});

describe("editing the layout inside a move-in", () => {
  it("renames, adds and removes rooms and items without touching the property", async () => {
    const { owner, lease, prop } = await seedLease();
    const insp = await I.startInspection(owner.id, lease.id, "MOVE_IN");
    await I.updateRoom(owner.id, insp.rooms[1].id, { name: "Master bedroom" });
    await I.addInspectionItem(owner.id, insp.rooms[0].id, { name: "Wine fridge", isEquipment: true });
    await I.deleteInspectionItem(owner.id, insp.rooms[0].items[0].id);
    const room = await I.addInspectionRoom(owner.id, insp.id, "Garage");
    await I.deleteInspectionRoom(owner.id, room.id);
    const after = await I.getInspection(owner.id, insp.id);
    expect(after.rooms.map((r) => r.name)).toEqual(["Kitchen", "Master bedroom"]);
    expect(after.rooms[0].items.some((i) => i.name === "Wine fridge")).toBe(true);
    const full = await P.getProperty(owner.id, prop.id);
    expect(full.rooms.map((r) => r.name)).toEqual(["Kitchen", "Bedroom"]);
  });

  it("refuses structure edits once signed", async () => {
    const { owner, insp } = await seedMoveIn();
    const sig = `data:image/png;base64,${PNG_1PX.toString("base64")}`;
    await S.signInspection(owner.id, insp.id, "LANDLORD", "Lee", sig);
    await S.signInspection(owner.id, insp.id, "RENTER", "Sam", sig);
    await expect(I.addInspectionRoom(owner.id, insp.id, "Garage")).rejects.toThrow(/locked/);
  });
});

describe("properties with no rooms", () => {
  it("refuses to start a move-in, and an empty move-in can load the layout", async () => {
    const owner = await makeOwner();
    const prop = await P.createProperty(owner.id, { name: "Empty" });
    const lease = await L.createLease(owner.id, prop.id, { renterName: "R", startDate: "2026-11-01", endDate: "2027-10-31" });
    await expect(I.startInspection(owner.id, lease.id, "MOVE_IN")).rejects.toThrow(/no rooms/);

    // an inspection created before that check existed
    const empty = await prisma.inspection.create({ data: { leaseId: lease.id, type: "MOVE_IN" } });
    const filled = await I.loadPropertyLayout(owner.id, empty.id);
    expect(filled.rooms.map((r) => r.name)).toEqual(DEFAULT_LAYOUT.map((r) => r.name));
    expect((await P.getProperty(owner.id, prop.id)).rooms).toHaveLength(DEFAULT_LAYOUT.length);
    await expect(I.loadPropertyLayout(owner.id, empty.id)).rejects.toThrow(/already has rooms/);
  });
});
