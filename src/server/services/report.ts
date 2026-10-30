import { SIGNING_ENABLED } from "../../lib/config";
import { prisma } from "../db";
import { getStorage } from "../storage";
import { GridPhoto, PdfWriter } from "../pdf";
import { dataUrlToBuffer } from "../images";
import { getInspection, FullInspection } from "./inspection";
import { MOVE_IN_ACKNOWLEDGMENT } from "../../lib/acknowledgment";

type PhotoRow = { id: string; storageKey: string; mimeType: string; kind: string; originalId: string | null; caption: string };

export const fmtDate = (d: Date | null | undefined) => (d ? d.toISOString().slice(0, 10) : "-");
/** "NOT_WORKING" -> "Not working"; empty stays empty so the printed cell can be filled by hand. */
export const label = (v: string | null | undefined) => (v ? v.charAt(0) + v.slice(1).replace(/_/g, " ").toLowerCase() : "");

/** Shows the annotated version when one exists, otherwise the original. */
export function displayPhotos<T extends PhotoRow>(photos: T[]): T[] {
  const annotatedFor = new Map(photos.filter((p) => p.kind === "ANNOTATED").map((p) => [p.originalId, p]));
  return photos.filter((p) => p.kind === "ANNOTATED" || !annotatedFor.has(p.id));
}

/** Numbers photos ("3.1", "3.2"...) within a section and loads them for the grid. */
export class PhotoNumbers {
  private n = 0;
  readonly grid: (PhotoRow & { caption: string; label: string })[] = [];
  constructor(private prefix: string) {}

  add(photos: PhotoRow[], context: string): string[] {
    return displayPhotos(photos).map((p) => {
      const label = `${this.prefix}.${++this.n}`;
      const extra = [p.caption, p.kind === "ANNOTATED" ? "marked" : ""].filter(Boolean).join(", ");
      this.grid.push({ ...p, label, caption: `${label}  ${context}${extra ? ` (${extra})` : ""}` });
      return label;
    });
  }

  async load(): Promise<GridPhoto[]> {
    const storage = getStorage();
    return Promise.all(
      this.grid.map(async (p) => ({
        data: await storage.get(p.storageKey).catch(() => Buffer.alloc(0)),
        mime: p.mimeType,
        caption: p.caption,
      })),
    );
  }
}

export const refs = (labels: string[]) => (labels.length ? `Photo${labels.length > 1 ? "s" : ""} ${labels.join(", ")}` : "");
const join = (...parts: (string | false | null | undefined)[]) => parts.filter(Boolean).join(" · ");
const comments = (list: { author: string; text: string }[]) => list.map((c) => `${label(c.author)}: "${c.text}"`).join(" · ");

/** Comments box plus landlord and tenant signature lines, kept together on one page. */
export async function writeSignatures(w: PdfWriter, insp: FullInspection) {
  w.writeBox("Tenant comments / corrections", 110);
  w.gap(6);
  for (const role of ["LANDLORD", "RENTER"] as const) {
    const sig = SIGNING_ENABLED ? insp.signatures.find((s) => s.role === role) : undefined;
    await w.signatureLine(
      role === "LANDLORD" ? "Landlord" : "Tenant",
      sig && { image: dataUrlToBuffer(sig.imageDataUrl), name: sig.name, date: fmtDate(sig.signedAt) },
    );
  }
}

export async function buildInspectionPdf(ownerId: string, inspectionId: string): Promise<Buffer> {
  const insp = await getInspection(ownerId, inspectionId);
  const { property } = insp.lease;
  const moveIn = insp.type === "MOVE_IN";
  const title = moveIn ? "Move-In Condition Report" : "Move-Out Condition Report";
  const w = await PdfWriter.create({ title, right: join(property.name, property.address) });

  const allPhotos = insp.rooms.flatMap((r) => [...r.photos, ...r.items.flatMap((i) => i.photos), ...r.blemishes.flatMap((b) => b.photos)]);
  w.title(title, moveIn ? `Addendum to the lease · prepared ${fmtDate(new Date())}` : `Prepared ${fmtDate(new Date())}`);
  w.facts([
    ["Property", property.name],
    ["Address", property.address],
    ["Tenant", insp.lease.renterName],
    ["Lease term", `${fmtDate(insp.lease.startDate)} to ${fmtDate(insp.lease.endDate)}`],
    ["Inspection started", fmtDate(insp.createdAt)],
    ["Report ID", insp.id.slice(0, 10)],
  ]);
  w.stats([
    [insp.rooms.length, "rooms"],
    [insp.rooms.reduce((n, r) => n + r.items.length, 0), "items"],
    [insp.rooms.reduce((n, r) => n + r.blemishes.length, 0), "blemishes"],
    [displayPhotos(allPhotos).length, "photos"],
  ]);
  w.text(
    "Condition: Excellent · Good · Fair · Poor · Damaged    Working: Working · Partial · Not working · NA    " +
      "Blank cells were not recorded and may be completed by hand. Shaded cells do not apply.",
    { size: 8, muted: true },
  );

  for (const [ri, room] of insp.rooms.entries()) {
    const num = String(ri + 1);
    const photos = new PhotoNumbers(num);
    const blemishNo = new Map(room.blemishes.map((b, j) => [b.id, `${num}.B${j + 1}`]));

    w.sectionBar(`${num}. ${room.name}`, `Overall: ${label(room.condition) || "__________"}`);
    const roomRefs = photos.add(room.photos, room.name);
    const roomNote = join(room.notes, refs(roomRefs), comments(room.comments));
    if (roomNote) w.noteBox(roomNote);

    w.table(
      [
        { title: "Item", width: 0.27 },
        { title: "Condition", width: 0.14 },
        { title: "Working", width: 0.14 },
        { title: "Notes", width: 0.45 },
      ],
      room.items.map((it) => {
        const itemBlemishes = room.blemishes.filter((b) => b.itemId === it.id).map((b) => blemishNo.get(b.id)!);
        const notes = join(
          it.notes,
          moveIn ? "" : it.changeStatus && it.changeStatus !== "UNCHANGED" && label(it.changeStatus),
          refs(photos.add(it.photos, it.name)),
          itemBlemishes.length > 0 && `See ${itemBlemishes.join(", ")}`,
          comments(it.comments),
        );
        return [it.name, label(it.condition), it.isEquipment ? label(it.workingOrder) : { text: "", shade: true }, notes];
      }),
      { continued: `${num}. ${room.name}` },
    );

    for (const b of room.blemishes) {
      const item = room.items.find((i) => i.id === b.itemId);
      w.callout(
        join(`Blemish ${blemishNo.get(b.id)}`, item?.name, b.status === "REPAIRED" && "repaired", !moveIn && !b.priorBlemishId && "new since move-in"),
        b.description,
        join(refs(photos.add(b.photos, `${item?.name ?? room.name} blemish`)), comments(b.comments)),
      );
    }
    if (photos.grid.length) await w.photoGrid(await photos.load());
  }

  w.newPage();
  if (moveIn) {
    w.text(MOVE_IN_ACKNOWLEDGMENT.title, { size: 14, bold: true });
    w.gap(6);
    for (const p of MOVE_IN_ACKNOWLEDGMENT.paragraphs) {
      w.text(p, { size: 9 });
      w.gap(4);
    }
    w.gap(10);
  }
  await writeSignatures(w, insp);
  return w.save();
}

export async function inspectionCount() {
  return prisma.inspection.count();
}
