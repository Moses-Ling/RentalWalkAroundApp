import { describe, it, expect, beforeEach } from "vitest";
import { resetDb, makeOwner } from "../helpers";
import * as P from "@/server/services/property";
import * as L from "@/server/services/lease";
import { ROOM_TEMPLATES } from "@/server/templates";
import { prisma } from "@/server/db";

let owner: { id: string };
let other: { id: string };

beforeEach(async () => {
  await resetDb();
  owner = await makeOwner("a@test.dev");
  other = await makeOwner("b@test.dev");
});

describe("properties", () => {
  it("creates, lists, updates and deletes", async () => {
    const p = await P.createProperty(owner.id, { name: " Unit 4 ", address: "1 Main St" });
    expect(p.name).toBe("Unit 4");
    expect(await P.listProperties(owner.id)).toHaveLength(1);
    await P.updateProperty(owner.id, p.id, { name: "Unit 4B" });
    expect((await P.getProperty(owner.id, p.id)).name).toBe("Unit 4B");
    await P.deleteProperty(owner.id, p.id);
    expect(await P.listProperties(owner.id)).toHaveLength(0);
  });

  it("requires a name", async () => {
    await expect(P.createProperty(owner.id, { name: "  " })).rejects.toThrow(/required/);
  });

  it("scopes everything to the owner", async () => {
    const p = await P.createProperty(owner.id, { name: "Mine" });
    await expect(P.getProperty(other.id, p.id)).rejects.toThrow(/not found/i);
    await expect(P.deleteProperty(other.id, p.id)).rejects.toThrow();
    await expect(P.addRoom(other.id, p.id, { name: "x" })).rejects.toThrow();
    expect(await P.listProperties(other.id)).toHaveLength(0);
  });
});

describe("rooms and items", () => {
  it("seeds a room from a template with its items", async () => {
    const p = await P.createProperty(owner.id, { name: "U" });
    const room = await P.addRoom(owner.id, p.id, { templateKey: "kitchen" });
    const tpl = ROOM_TEMPLATES.find((t) => t.key === "kitchen")!;
    expect(room.name).toBe("Kitchen");
    expect(room.items).toHaveLength(tpl.items.length);
    expect(room.items.some((i) => i.name === "Refrigerator" && i.isEquipment)).toBe(true);
  });

  it("supports custom rooms, renaming, adding and deleting items", async () => {
    const p = await P.createProperty(owner.id, { name: "U" });
    const room = await P.addRoom(owner.id, p.id, { name: "Den" });
    await P.renameRoom(owner.id, room.id, "Study");
    const it = await P.addItem(owner.id, room.id, { name: "Heater", isEquipment: true });
    expect(it.isEquipment).toBe(true);
    await P.deleteItem(owner.id, it.id);
    const full = await P.getProperty(owner.id, p.id);
    expect(full.rooms[0].name).toBe("Study");
    expect(full.rooms[0].items).toHaveLength(0);
  });

  it("rejects unknown templates and other owners' rooms", async () => {
    const p = await P.createProperty(owner.id, { name: "U" });
    await expect(P.addRoom(owner.id, p.id, { templateKey: "nope" })).rejects.toThrow(/template/i);
    const room = await P.addRoom(owner.id, p.id, { name: "Den" });
    await expect(P.addItem(other.id, room.id, { name: "x" })).rejects.toThrow();
  });

  it("cascades deletes", async () => {
    const p = await P.createProperty(owner.id, { name: "U" });
    await P.addRoom(owner.id, p.id, { templateKey: "bathroom" });
    await P.deleteProperty(owner.id, p.id);
    expect(await prisma.room.count()).toBe(0);
    expect(await prisma.item.count()).toBe(0);
  });

  it("clones a layout between properties", async () => {
    const a = await P.createProperty(owner.id, { name: "A" });
    const b = await P.createProperty(owner.id, { name: "B" });
    await P.addRoom(owner.id, a.id, { templateKey: "bedroom" });
    await P.cloneLayout(owner.id, a.id, b.id);
    const full = await P.getProperty(owner.id, b.id);
    expect(full.rooms).toHaveLength(1);
    expect(full.rooms[0].items.length).toBeGreaterThan(0);
  });
});

describe("leases", () => {
  it("creates a lease and validates dates and renter", async () => {
    const p = await P.createProperty(owner.id, { name: "U" });
    const l = await L.createLease(owner.id, p.id, {
      renterName: "Sam Renter", startDate: "2026-11-01", endDate: "2027-10-31",
    });
    expect(l.status).toBe("DRAFT");
    await expect(
      L.createLease(owner.id, p.id, { renterName: "X", startDate: "2027-01-01", endDate: "2026-01-01" }),
    ).rejects.toThrow(/after/);
    await expect(
      L.createLease(owner.id, p.id, { renterName: "", startDate: "2026-01-01", endDate: "2027-01-01" }),
    ).rejects.toThrow(/required/);
    await expect(
      L.createLease(owner.id, p.id, { renterName: "X", startDate: "bad", endDate: "2027-01-01" }),
    ).rejects.toThrow(/dates/i);
  });

  it("is scoped to the owner", async () => {
    const p = await P.createProperty(owner.id, { name: "U" });
    await expect(
      L.createLease(other.id, p.id, { renterName: "X", startDate: "2026-01-01", endDate: "2027-01-01" }),
    ).rejects.toThrow();
    const l = await L.createLease(owner.id, p.id, { renterName: "X", startDate: "2026-01-01", endDate: "2027-01-01" });
    await expect(L.getLease(other.id, l.id)).rejects.toThrow();
  });
});
