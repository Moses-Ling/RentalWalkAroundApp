import { SIGNING_ENABLED } from "../../lib/config";
import { prisma } from "../db";
import { getStorage } from "../storage";
import { PdfWriter } from "../pdf";
import { dataUrlToBuffer } from "../images";
import { getInspection, FullInspection } from "./inspection";
import { MOVE_IN_ACKNOWLEDGMENT } from "../../lib/acknowledgment";

type PhotoRow = { id: string; storageKey: string; mimeType: string; kind: string; originalId: string | null; caption: string };

export const fmtDate = (d: Date | null | undefined) => (d ? d.toISOString().slice(0, 10) : "-");
export const label = (v: string | null | undefined) => (v ? v.replace(/_/g, " ").toLowerCase() : "not recorded");

/** Shows the annotated version when one exists, otherwise the original. */
export function displayPhotos<T extends PhotoRow>(photos: T[]): T[] {
  const annotatedFor = new Map(photos.filter((p) => p.kind === "ANNOTATED").map((p) => [p.originalId, p]));
  return photos.filter((p) => p.kind === "ANNOTATED" || !annotatedFor.has(p.id));
}

export async function writePhotos(w: PdfWriter, photos: PhotoRow[], indent: number) {
  const storage = getStorage();
  for (const p of displayPhotos(photos)) {
    try {
      await w.image(await storage.get(p.storageKey), p.mimeType, {
        indent,
        maxW: 180,
        maxH: 135,
        label: p.caption || (p.kind === "ANNOTATED" ? "annotated" : undefined),
      });
    } catch {
      w.text("[photo file missing]", { size: 8, indent });
    }
  }
}

export async function writeSignatures(w: PdfWriter, insp: FullInspection) {
  w.heading("Signatures", 12);
  if (!SIGNING_ENABLED) {
    for (const role of ["LANDLORD", "RENTER"] as const) {
      w.text(`${label(role)} signature: ______________________________   Date: ______________`, { size: 10 });
      w.text(" ", { size: 10 });
    }
    return;
  }
  for (const role of ["LANDLORD", "RENTER"] as const) {
    const sig = insp.signatures.find((s) => s.role === role);
    if (!sig) {
      w.text(`${label(role)}: not signed`, { size: 9 });
      continue;
    }
    await w.image(dataUrlToBuffer(sig.imageDataUrl), "image/png", { maxW: 160, maxH: 60 });
    w.text(`${label(role)}: ${sig.name} - ${sig.signedAt.toISOString()}`, { size: 9 });
  }
}

export async function buildInspectionPdf(ownerId: string, inspectionId: string): Promise<Buffer> {
  const insp = await getInspection(ownerId, inspectionId);
  const w = await PdfWriter.create();
  w.text(`${label(insp.type)} inspection report`.toUpperCase(), { size: 18, bold: true });
  w.text(`${insp.lease.property.name} - ${insp.lease.property.address}`, { size: 11 });
  w.text(`Renter: ${insp.lease.renterName}   Lease: ${fmtDate(insp.lease.startDate)} to ${fmtDate(insp.lease.endDate)}`);
  if (SIGNING_ENABLED) w.text(`Status: ${insp.status}${insp.signedAt ? ` (signed ${fmtDate(insp.signedAt)})` : " (not yet signed)"}`);

  for (const room of insp.rooms) {
    w.heading(`${room.name} - ${label(room.condition)}`);
    if (room.notes) w.text(room.notes, { indent: 8 });
    await writePhotos(w, room.photos, 8);
    for (const c of room.comments) w.text(`${label(c.author)} comment: ${c.text}`, { indent: 8, size: 9 });
    for (const it of room.items) {
      w.text(
        `${it.name}: ${label(it.condition)}${it.isEquipment ? `, working order: ${label(it.workingOrder)}` : ""}`,
        { bold: true, indent: 8 },
      );
      if (it.notes) w.text(it.notes, { indent: 16, size: 9 });
      for (const b of it.blemishes) w.text(`Blemish: ${b.description}`, { indent: 16, size: 9, color: [0.7, 0.1, 0.1] });
      await writePhotos(w, it.photos, 16);
      for (const c of it.comments) w.text(`${label(c.author)} comment: ${c.text}`, { indent: 16, size: 9 });
    }
    const roomLevel = room.blemishes.filter((b) => !b.itemId);
    if (roomLevel.length) w.text("Room blemishes", { bold: true, indent: 8 });
    for (const b of roomLevel) {
      w.text(`- ${b.description}${b.status === "REPAIRED" ? " (repaired)" : ""}`, { indent: 16, size: 9, color: [0.7, 0.1, 0.1] });
      await writePhotos(w, b.photos, 24);
      for (const c of b.comments) w.text(`${label(c.author)} comment: ${c.text}`, { indent: 24, size: 9 });
    }
  }
  if (insp.type === "MOVE_IN") {
    w.heading(MOVE_IN_ACKNOWLEDGMENT.title, 12);
    for (const p of MOVE_IN_ACKNOWLEDGMENT.paragraphs) {
      w.text(p, { size: 9 });
      w.gap(4);
    }
  }
  await writeSignatures(w, insp);
  return w.save();
}

export async function inspectionCount() {
  return prisma.inspection.count();
}
