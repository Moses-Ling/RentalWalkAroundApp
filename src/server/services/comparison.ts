import { prisma } from "../db";
import { conflict, notFound } from "../errors";
import { PdfWriter } from "../pdf";
import { diffInspections, CInspection } from "../../lib/compare";
import { fmtDate, label, writePhotos, writeSignatures } from "./report";
import { getInspection } from "./inspection";

async function load(ownerId: string, leaseId: string) {
  const lease = await prisma.lease.findFirst({
    where: { id: leaseId, property: { ownerId } },
    include: { property: true, repairs: { orderBy: { date: "asc" }, include: { photos: true, blemish: true, item: true } }, inspections: true },
  });
  if (!lease) throw notFound("Lease not found");
  const inId = lease.inspections.find((i) => i.type === "MOVE_IN")?.id;
  const outId = lease.inspections.find((i) => i.type === "MOVE_OUT")?.id;
  if (!inId || !outId) throw conflict("Both move-in and move-out inspections are required");
  const [moveIn, moveOut] = await Promise.all([getInspection(ownerId, inId), getInspection(ownerId, outId)]);
  return { lease, moveIn, moveOut };
}

export async function compareLease(ownerId: string, leaseId: string) {
  const { lease, moveIn, moveOut } = await load(ownerId, leaseId);
  const diff = diffInspections(moveIn as CInspection, moveOut as CInspection);
  return { lease, moveIn, moveOut, repairs: lease.repairs, ...diff };
}

export async function buildComparisonPdf(ownerId: string, leaseId: string): Promise<Buffer> {
  const { lease, moveOut, rooms, summary, repairs } = await compareLease(ownerId, leaseId);
  const w = await PdfWriter.create();
  w.text("MOVE-IN / MOVE-OUT COMPARISON", { size: 18, bold: true });
  w.text(`${lease.property.name} - ${lease.property.address}`, { size: 11 });
  w.text(`Renter: ${lease.renterName}   Lease: ${fmtDate(lease.startDate)} to ${fmtDate(lease.endDate)}`);
  w.heading("Summary", 12);
  w.text(
    `Rooms with changes: ${summary.roomsFlagged}   Items in worse condition: ${summary.itemsWorse}   ` +
      `Working-order changes: ${summary.workingOrderChanges}   New blemishes: ${summary.newBlemishes}   Repaired: ${summary.repairedBlemishes}`,
  );

  const byName = new Map(moveOut.rooms.map((r) => [r.name, r]));
  for (const room of rooms) {
    w.heading(`${room.name}: ${label(room.before)} -> ${label(room.after)}${room.flagged ? "  [CHANGES]" : ""}`);
    for (const it of room.items.filter((i) => i.flagged)) {
      w.text(
        `${it.name}: ${label(it.before?.condition)} -> ${label(it.after.condition)}` +
          (it.isEquipment ? `; working: ${label(it.before?.workingOrder)} -> ${label(it.after.workingOrder)}` : "") +
          (it.changeStatus && it.changeStatus !== "UNCHANGED" ? `  [${label(it.changeStatus)}]` : ""),
        { bold: true, indent: 8, size: 9 },
      );
      if (it.after.notes) w.text(it.after.notes, { indent: 16, size: 9 });
    }
    const src = byName.get(room.name)!;
    for (const b of room.newBlemishes) {
      w.text(`NEW: ${b.description}`, { indent: 8, size: 9, color: [0.7, 0.1, 0.1] });
      const full = src.blemishes.find((x) => x.id === b.id);
      if (full) await writePhotos(w, full.photos, 16);
    }
    for (const b of room.repairedBlemishes) w.text(`REPAIRED: ${b.description}`, { indent: 8, size: 9, color: [0.1, 0.5, 0.2] });
    for (const b of room.existingBlemishes) w.text(`Existing (unchanged): ${b.description}`, { indent: 8, size: 9, color: [0.4, 0.4, 0.4] });
  }

  w.heading("Repair log");
  if (!repairs.length) w.text("No repairs logged.", { size: 9 });
  for (const r of repairs) {
    w.text(
      `${fmtDate(r.date)} - ${r.description}${r.vendor ? ` (${r.vendor})` : ""} - $${(r.costCents / 100).toFixed(2)} - ${label(r.responsibility)}` +
        (r.blemish ? ` - fixes: ${r.blemish.description}` : "") + (r.item ? ` - item: ${r.item.name}` : ""),
      { size: 9, indent: 8 },
    );
    await writePhotos(w, r.photos, 16);
  }
  await writeSignatures(w, moveOut);
  return w.save();
}
