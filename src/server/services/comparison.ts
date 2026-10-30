import { prisma } from "../db";
import { conflict, notFound } from "../errors";
import { PdfWriter } from "../pdf";
import { diffInspections, CInspection } from "../../lib/compare";
import { fmtDate, label, PhotoNumbers, refs, writeSignatures } from "./report";
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
  const { lease, moveIn, moveOut, rooms, summary, repairs } = await compareLease(ownerId, leaseId);
  const title = "Move-In / Move-Out Comparison";
  const w = await PdfWriter.create({ title, right: [lease.property.name, lease.property.address].filter(Boolean).join(" · ") });
  w.title(title, `Prepared ${fmtDate(new Date())}`);
  w.facts([
    ["Property", lease.property.name],
    ["Address", lease.property.address],
    ["Tenant", lease.renterName],
    ["Lease term", `${fmtDate(lease.startDate)} to ${fmtDate(lease.endDate)}`],
    ["Move-in inspection", fmtDate(moveIn.createdAt)],
    ["Move-out inspection", fmtDate(moveOut.createdAt)],
  ]);
  w.stats([
    [summary.roomsFlagged, "rooms with changes"],
    [summary.itemsWorse, "items worse"],
    [summary.workingOrderChanges, "working-order changes"],
    [summary.newBlemishes, "new blemishes"],
    [summary.repairedBlemishes, "repaired"],
  ]);

  const byName = new Map(moveOut.rooms.map((r) => [r.name, r]));
  const cond = (c: string | null | undefined, wo: string | null | undefined, eq: boolean) =>
    [label(c) || "-", eq ? `working: ${label(wo) || "-"}` : ""].filter(Boolean).join("\n");
  for (const [ri, room] of rooms.entries()) {
    const num = String(ri + 1);
    const photos = new PhotoNumbers(num);
    w.sectionBar(
      `${num}. ${room.name}${room.flagged ? "  - CHANGES" : ""}`,
      `Move-in: ${label(room.before) || "-"}   Move-out: ${label(room.after) || "-"}`,
    );
    const changed = room.items.filter((i) => i.flagged);
    if (changed.length) {
      w.table(
        [
          { title: "Item", width: 0.24 },
          { title: "Move-in", width: 0.18 },
          { title: "Move-out", width: 0.18 },
          { title: "Change / notes", width: 0.4 },
        ],
        changed.map((it) => [
          it.name,
          cond(it.before?.condition, it.before?.workingOrder, it.isEquipment),
          { text: cond(it.after.condition, it.after.workingOrder, it.isEquipment), bold: it.trend === "WORSE" || it.workingOrderChanged },
          [it.trend === "WORSE" ? "Worse" : it.trend === "BETTER" ? "Better" : "", it.changeStatus && it.changeStatus !== "UNCHANGED" ? label(it.changeStatus) : "", it.after.notes]
            .filter(Boolean)
            .join(" · "),
        ]),
        { continued: `${num}. ${room.name}` },
      );
    } else {
      w.noteBox("No item changes recorded.", { muted: true });
    }
    const src = byName.get(room.name)!;
    for (const b of room.newBlemishes) {
      const full = src.blemishes.find((x) => x.id === b.id);
      w.callout("New damage", b.description, refs(full ? photos.add(full.photos, `${room.name} new damage`) : []));
    }
    for (const b of room.repairedBlemishes) w.callout("Repaired", b.description);
    if (room.existingBlemishes.length) {
      w.gap(5);
      w.text(`Existing at move-in, unchanged: ${room.existingBlemishes.map((b) => b.description).join("; ")}`, { size: 8, muted: true });
    }
    if (photos.grid.length) await w.photoGrid(await photos.load());
  }

  w.sectionBar("Repair log", `${repairs.length} repair${repairs.length === 1 ? "" : "s"}`);
  const repairPhotos = new PhotoNumbers("R");
  if (!repairs.length) w.noteBox("No repairs logged.", { muted: true });
  else
    w.table(
      [
        { title: "Date", width: 0.13 },
        { title: "Repair", width: 0.37 },
        { title: "Vendor", width: 0.17 },
        { title: "Cost", width: 0.11 },
        { title: "Responsibility", width: 0.22 },
      ],
      repairs.map((r) => [
        fmtDate(r.date),
        [r.description, r.blemish ? `Fixes: ${r.blemish.description}` : r.item ? `Item: ${r.item.name}` : "", refs(repairPhotos.add(r.photos, r.description))]
          .filter(Boolean)
          .join("\n"),
        r.vendor,
        `$${(r.costCents / 100).toFixed(2)}`,
        label(r.responsibility),
      ]),
      { continued: "Repair log" },
    );
  if (repairPhotos.grid.length) await w.photoGrid(await repairPhotos.load());

  w.newPage();
  await writeSignatures(w, moveOut);
  return w.save();
}
