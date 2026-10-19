import { describe, it, expect, beforeEach } from "vitest";
import { resetDb, makeOwner, PNG_1PX } from "../helpers";
import { seedLease } from "../phase2/fixtures";
import * as I from "@/server/services/inspection";
import * as S from "@/server/services/signoff";
import * as R from "@/server/services/repair";
import { compareLease, buildComparisonPdf } from "@/server/services/comparison";
import { prisma } from "@/server/db";

const sig = `data:image/png;base64,${PNG_1PX.toString("base64")}`;
beforeEach(resetDb);

async function signedMoveIn() {
  const s = await seedLease();
  const insp = await I.startInspection(s.owner.id, s.lease.id, "MOVE_IN");
  const kitchen = insp.rooms[0];
  const wall = kitchen.items.find((i) => i.name === "Walls")!;
  const fridge = kitchen.items.find((i) => i.name === "Refrigerator")!;
  for (const it of kitchen.items) await I.updateItem(s.owner.id, it.id, { condition: "GOOD", workingOrder: it.isEquipment ? "WORKING" : null });
  await I.updateRoom(s.owner.id, kitchen.id, { condition: "GOOD" });
  const scratch = await I.addBlemish(s.owner.id, kitchen.id, { description: "Scratch on wall", itemId: wall.id });
  await I.addPhoto(s.owner.id, { blemishId: scratch.id }, PNG_1PX);
  await S.signInspection(s.owner.id, insp.id, "LANDLORD", "Lee", sig);
  await S.signInspection(s.owner.id, insp.id, "RENTER", "Sam", sig);
  return { ...s, insp, kitchen, wall, fridge, scratch };
}

describe("repair log", () => {
  it("logs a repair, links a blemish and marks it repaired even though move-in is locked", async () => {
    const s = await signedMoveIn();
    const r = await R.createRepair(s.owner.id, s.lease.id, {
      date: "2027-03-01", description: "Patched and painted wall", vendor: "Pat Painter",
      costCents: 12050, responsibility: "LANDLORD_MAINTENANCE", blemishId: s.scratch.id,
    });
    await R.addRepairPhoto(s.owner.id, r.id, PNG_1PX, "before");
    await R.addRepairPhoto(s.owner.id, r.id, PNG_1PX, "receipt");
    const [row] = await R.listRepairs(s.owner.id, s.lease.id);
    expect(row.costCents).toBe(12050);
    expect(row.photos.map((p) => p.caption).sort()).toEqual(["before", "receipt"]);
    expect((await prisma.blemish.findUnique({ where: { id: s.scratch.id } }))!.status).toBe("REPAIRED");
    // the signed content itself is still locked
    await expect(I.updateBlemish(s.owner.id, s.scratch.id, { description: "x" })).rejects.toThrow(/locked/);
  });

  it("validates input and ownership", async () => {
    const s = await signedMoveIn();
    const base = { date: "2027-03-01", description: "Fix" };
    await expect(R.createRepair(s.owner.id, s.lease.id, { ...base, description: " " })).rejects.toThrow(/required/);
    await expect(R.createRepair(s.owner.id, s.lease.id, { ...base, date: "nope" })).rejects.toThrow(/date/i);
    await expect(R.createRepair(s.owner.id, s.lease.id, { ...base, costCents: -5 })).rejects.toThrow(/Cost/);
    await expect(R.createRepair(s.owner.id, s.lease.id, { ...base, costCents: 1.5 })).rejects.toThrow(/Cost/);
    await expect(R.createRepair(s.owner.id, s.lease.id, { ...base, responsibility: "NOBODY" as never })).rejects.toThrow(/responsibility/);
    await expect(R.createRepair(s.owner.id, s.lease.id, { ...base, blemishId: "bogus" })).rejects.toThrow(/Blemish/);
    const other = await makeOwner("x@test.dev");
    await expect(R.createRepair(other.id, s.lease.id, base)).rejects.toThrow(/not found/i);
    await expect(R.addRepairPhoto(s.owner.id, (await R.createRepair(s.owner.id, s.lease.id, base)).id, Buffer.from("x"))).rejects.toThrow(/PNG/);
  });

  it("rejects linking a blemish from another lease", async () => {
    const a = await signedMoveIn();
    const b = await seedLease("other@test.dev");
    await expect(
      R.createRepair(b.owner.id, b.lease.id, { date: "2027-01-01", description: "x", blemishId: a.scratch.id }),
    ).rejects.toThrow(/Blemish/);
  });

  it("deletes a repair with its photos", async () => {
    const s = await signedMoveIn();
    const r = await R.createRepair(s.owner.id, s.lease.id, { date: "2027-01-01", description: "x" });
    await R.addRepairPhoto(s.owner.id, r.id, PNG_1PX, "after");
    await R.deleteRepair(s.owner.id, r.id);
    expect(await prisma.repair.count()).toBe(0);
    expect(await prisma.photo.count({ where: { repairId: r.id } })).toBe(0);
  });
});

describe("move-out", () => {
  it("is pre-filled from the signed move-in with prior links", async () => {
    const s = await signedMoveIn();
    const out = await I.startInspection(s.owner.id, s.lease.id, "MOVE_OUT");
    const k = out.rooms.find((r) => r.name === "Kitchen")!;
    expect(k.condition).toBe("GOOD");
    expect(k.items).toHaveLength(s.kitchen.items.length);
    const fr = k.items.find((i) => i.name === "Refrigerator")!;
    expect(fr).toMatchObject({ priorItemId: s.fridge.id, workingOrder: "WORKING", changeStatus: "UNCHANGED" });
    expect(k.blemishes[0]).toMatchObject({ description: "Scratch on wall", priorBlemishId: s.scratch.id, status: "OPEN" });
    expect(k.blemishes[0].itemId).toBe(k.items.find((i) => i.name === "Walls")!.id);
    expect(k.photos).toHaveLength(0);
  });

  it("carries repaired status and picks up repairs logged after move-out starts", async () => {
    const s = await signedMoveIn();
    const out = await I.startInspection(s.owner.id, s.lease.id, "MOVE_OUT");
    await R.createRepair(s.owner.id, s.lease.id, { date: "2027-05-01", description: "fixed", blemishId: s.scratch.id });
    const got = await I.getInspection(s.owner.id, out.id);
    expect(got.rooms.find((r) => r.name === "Kitchen")!.blemishes[0].status).toBe("REPAIRED");
  });
});

describe("full lifecycle", () => {
  it("move-in -> repair -> move-out -> comparison -> PDF", async () => {
    const s = await signedMoveIn();
    await R.createRepair(s.owner.id, s.lease.id, {
      date: "2027-02-10", description: "Repainted wall", costCents: 8000, blemishId: s.scratch.id,
    });

    const out = await I.startInspection(s.owner.id, s.lease.id, "MOVE_OUT");
    const k = out.rooms.find((r) => r.name === "Kitchen")!;
    const fridge = k.items.find((i) => i.name === "Refrigerator")!;
    const floor = k.items.find((i) => i.name === "Floor")!;
    await I.updateItem(s.owner.id, fridge.id, { workingOrder: "NOT_WORKING", changeStatus: "WORKING_ORDER_CHANGED", notes: "Does not cool" });
    await I.updateItem(s.owner.id, floor.id, { condition: "POOR", changeStatus: "NEW_DAMAGE" });
    const burn = await I.addBlemish(s.owner.id, k.id, { description: "Burn mark on floor", itemId: floor.id });
    await I.addPhoto(s.owner.id, { blemishId: burn.id }, PNG_1PX, "burn");
    await I.updateRoom(s.owner.id, k.id, { condition: "FAIR" });
    await S.signInspection(s.owner.id, out.id, "LANDLORD", "Lee", sig);
    await S.signInspection(s.owner.id, out.id, "RENTER", "Sam", sig);

    const cmp = await compareLease(s.owner.id, s.lease.id);
    const kd = cmp.rooms.find((r) => r.name === "Kitchen")!;
    expect(cmp.summary).toMatchObject({ itemsWorse: 1, workingOrderChanges: 1, newBlemishes: 1, repairedBlemishes: 1 });
    expect(kd.newBlemishes[0].description).toBe("Burn mark on floor");
    expect(kd.repairedBlemishes[0].description).toBe("Scratch on wall");
    expect(cmp.repairs).toHaveLength(1);
    expect(cmp.rooms.find((r) => r.name === "Bedroom")!.flagged).toBe(false);

    const pdf = await buildComparisonPdf(s.owner.id, s.lease.id);
    expect(pdf.subarray(0, 5).toString()).toBe("%PDF-");
    expect(pdf.length).toBeGreaterThan(3000);
  });

  it("comparison requires both inspections and is owner-scoped", async () => {
    const s = await signedMoveIn();
    await expect(compareLease(s.owner.id, s.lease.id)).rejects.toThrow(/Both/);
    await I.startInspection(s.owner.id, s.lease.id, "MOVE_OUT");
    const other = await makeOwner("x@test.dev");
    await expect(compareLease(other.id, s.lease.id)).rejects.toThrow(/not found/i);
  });
});
