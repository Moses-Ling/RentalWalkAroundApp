import { Prisma, Condition, WorkingOrder, ChangeStatus, InspectionType } from "@prisma/client";
import { prisma } from "../db";
import { badRequest, conflict, notFound } from "../errors";
import { getStorage } from "../storage";
import { dataUrlToBuffer, validateImage, ImageError } from "../images";

const fullInclude = {
  lease: { include: { property: true } },
  signatures: true,
  rooms: {
    orderBy: { sortOrder: "asc" },
    include: {
      photos: { orderBy: { createdAt: "asc" } },
      comments: true,
      blemishes: { include: { photos: true, comments: true }, orderBy: { createdAt: "asc" } },
      items: {
        orderBy: { sortOrder: "asc" },
        include: { photos: true, comments: true, blemishes: { include: { photos: true } } },
      },
    },
  },
} satisfies Prisma.InspectionInclude;

export type FullInspection = Prisma.InspectionGetPayload<{ include: typeof fullInclude }>;

export async function getInspection(ownerId: string, id: string): Promise<FullInspection> {
  const i = await prisma.inspection.findFirst({
    where: { id, lease: { property: { ownerId } } },
    include: fullInclude,
  });
  if (!i) throw notFound("Inspection not found");
  return i;
}

export async function startInspection(ownerId: string, leaseId: string, type: InspectionType) {
  const lease = await prisma.lease.findFirst({
    where: { id: leaseId, property: { ownerId } },
    include: { property: { include: { rooms: { orderBy: { sortOrder: "asc" }, include: { items: { orderBy: { sortOrder: "asc" } } } } } } },
  });
  if (!lease) throw notFound("Lease not found");
  const existing = await prisma.inspection.findUnique({ where: { leaseId_type: { leaseId, type } } });
  if (existing) throw conflict(`A ${type} inspection already exists for this lease`);

  if (type === "MOVE_IN") {
    const insp = await prisma.inspection.create({
      data: {
        leaseId,
        type,
        rooms: {
          create: lease.property.rooms.map((r, i) => ({
            name: r.name,
            sortOrder: i,
            items: { create: r.items.map((it, j) => ({ name: it.name, isEquipment: it.isEquipment, sortOrder: j })) },
          })),
        },
      },
    });
    return getInspection(ownerId, insp.id);
  }

  const moveIn = await prisma.inspection.findUnique({
    where: { leaseId_type: { leaseId, type: "MOVE_IN" } },
    include: {
      rooms: {
        orderBy: { sortOrder: "asc" },
        include: { items: { orderBy: { sortOrder: "asc" } }, blemishes: true },
      },
    },
  });
  if (!moveIn) throw conflict("Move-in inspection must exist before move-out");
  if (moveIn.status !== "SIGNED") throw conflict("Move-in inspection must be signed before move-out");

  const out = await prisma.$transaction(async (tx) => {
    const insp = await tx.inspection.create({ data: { leaseId, type } });
    for (const r of moveIn.rooms) {
      const room = await tx.inspectionRoom.create({
        data: { inspectionId: insp.id, name: r.name, sortOrder: r.sortOrder, condition: r.condition },
      });
      const idMap = new Map<string, string>();
      for (const it of r.items) {
        const created = await tx.inspectionItem.create({
          data: {
            roomId: room.id,
            name: it.name,
            isEquipment: it.isEquipment,
            sortOrder: it.sortOrder,
            condition: it.condition,
            workingOrder: it.workingOrder,
            changeStatus: "UNCHANGED",
            priorItemId: it.id,
          },
        });
        idMap.set(it.id, created.id);
      }
      for (const b of r.blemishes) {
        await tx.blemish.create({
          data: {
            roomId: room.id,
            itemId: b.itemId ? idMap.get(b.itemId) : null,
            description: b.description,
            status: b.status,
            priorBlemishId: b.id,
          },
        });
      }
    }
    return insp;
  });
  return getInspection(ownerId, out.id);
}

// ---- Ownership/lock resolution -------------------------------------------------

type Target =
  | { kind: "room"; id: string }
  | { kind: "item"; id: string }
  | { kind: "blemish"; id: string }
  | { kind: "photo"; id: string }
  | { kind: "inspection"; id: string };

async function resolveInspection(ownerId: string, t: Target) {
  const scope = { lease: { property: { ownerId } } };
  let insp;
  switch (t.kind) {
    case "inspection":
      insp = await prisma.inspection.findFirst({ where: { id: t.id, ...scope } });
      break;
    case "room":
      insp = await prisma.inspection.findFirst({ where: { ...scope, rooms: { some: { id: t.id } } } });
      break;
    case "item":
      insp = await prisma.inspection.findFirst({ where: { ...scope, rooms: { some: { items: { some: { id: t.id } } } } } });
      break;
    case "blemish":
      insp = await prisma.inspection.findFirst({ where: { ...scope, rooms: { some: { blemishes: { some: { id: t.id } } } } } });
      break;
    case "photo":
      insp = await prisma.inspection.findFirst({
        where: {
          ...scope,
          OR: [
            { rooms: { some: { photos: { some: { id: t.id } } } } },
            { rooms: { some: { items: { some: { photos: { some: { id: t.id } } } } } } },
            { rooms: { some: { blemishes: { some: { photos: { some: { id: t.id } } } } } } },
          ],
        },
      });
      break;
  }
  if (!insp) throw notFound();
  return insp;
}

/**
 * Resolves the owning inspection of a record and ensures it can still be changed.
 * A content edit invalidates any partial (single-party) signature, because a signature
 * must attest to exactly the content the signer saw.
 */
export async function resolveEditable(ownerId: string, t: Target, opts: { keepSignatures?: boolean } = {}) {
  const insp = await resolveInspection(ownerId, t);
  if (insp.status === "SIGNED") throw conflict("Inspection is signed and locked");
  if (!opts.keepSignatures) await prisma.signature.deleteMany({ where: { inspectionId: insp.id } });
  return insp;
}

// ---- Edits --------------------------------------------------------------------

const CONDITIONS = ["EXCELLENT", "GOOD", "FAIR", "POOR", "DAMAGED"];
const WORKING = ["WORKING", "PARTIAL", "NOT_WORKING", "NA"];
const CHANGES = ["UNCHANGED", "NEW_DAMAGE", "REPAIRED", "WORKING_ORDER_CHANGED"];

function oneOf<T extends string>(v: unknown, allowed: string[], label: string): T | null | undefined {
  if (v === undefined) return undefined;
  if (v === null) return null;
  if (typeof v !== "string" || !allowed.includes(v)) throw badRequest(`Invalid ${label}`);
  return v as T;
}

export async function updateRoom(ownerId: string, roomId: string, data: { condition?: Condition | null; notes?: string }) {
  await resolveEditable(ownerId, { kind: "room", id: roomId });
  return prisma.inspectionRoom.update({
    where: { id: roomId },
    data: { condition: oneOf<Condition>(data.condition, CONDITIONS, "condition"), notes: data.notes },
  });
}

export async function updateItem(
  ownerId: string,
  itemId: string,
  data: { condition?: Condition | null; workingOrder?: WorkingOrder | null; notes?: string; changeStatus?: ChangeStatus | null },
) {
  await resolveEditable(ownerId, { kind: "item", id: itemId });
  return prisma.inspectionItem.update({
    where: { id: itemId },
    data: {
      condition: oneOf<Condition>(data.condition, CONDITIONS, "condition"),
      workingOrder: oneOf<WorkingOrder>(data.workingOrder, WORKING, "working order"),
      changeStatus: oneOf<ChangeStatus>(data.changeStatus, CHANGES, "change status"),
      notes: data.notes,
    },
  });
}

export async function addBlemish(ownerId: string, roomId: string, data: { description: string; itemId?: string }) {
  await resolveEditable(ownerId, { kind: "room", id: roomId });
  if (!data.description?.trim()) throw badRequest("Description is required");
  if (data.itemId) {
    const it = await prisma.inspectionItem.findFirst({ where: { id: data.itemId, roomId } });
    if (!it) throw badRequest("Item does not belong to this room");
  }
  return prisma.blemish.create({
    data: { roomId, itemId: data.itemId ?? null, description: data.description.trim() },
  });
}

export async function updateBlemish(ownerId: string, id: string, data: { description?: string }) {
  await resolveEditable(ownerId, { kind: "blemish", id });
  if (data.description !== undefined && !data.description.trim()) throw badRequest("Description is required");
  return prisma.blemish.update({ where: { id }, data: { description: data.description?.trim() } });
}

export async function deleteBlemish(ownerId: string, id: string) {
  await resolveEditable(ownerId, { kind: "blemish", id });
  await prisma.blemish.delete({ where: { id } });
}

// ---- Photos -------------------------------------------------------------------

export type PhotoTarget = { roomId?: string; itemId?: string; blemishId?: string };

export async function addPhoto(ownerId: string, target: PhotoTarget, data: Buffer, caption = "") {
  const keys = [target.roomId, target.itemId, target.blemishId].filter(Boolean);
  if (keys.length !== 1) throw badRequest("Specify exactly one of roomId, itemId, blemishId");
  if (target.roomId) await resolveEditable(ownerId, { kind: "room", id: target.roomId });
  if (target.itemId) await resolveEditable(ownerId, { kind: "item", id: target.itemId });
  if (target.blemishId) await resolveEditable(ownerId, { kind: "blemish", id: target.blemishId });

  let meta;
  try {
    meta = validateImage(data);
  } catch (e) {
    if (e instanceof ImageError) throw badRequest(e.message);
    throw e;
  }
  const storageKey = await getStorage().put(data, meta.ext);
  return prisma.photo.create({
    data: { storageKey, mimeType: meta.mime, caption, kind: "ORIGINAL", ...target },
  });
}

/** Stores a drawn-on copy next to the untouched original. Re-annotating replaces the previous annotation. */
export async function saveAnnotatedPhoto(ownerId: string, originalId: string, dataUrl: string) {
  await resolveEditable(ownerId, { kind: "photo", id: originalId });
  const original = await prisma.photo.findUnique({ where: { id: originalId } });
  if (!original || original.kind !== "ORIGINAL") throw badRequest("Can only annotate an original photo");
  let buf: Buffer;
  let meta;
  try {
    buf = dataUrlToBuffer(dataUrl);
    meta = validateImage(buf);
  } catch (e) {
    if (e instanceof ImageError) throw badRequest(e.message);
    throw e;
  }
  const storage = getStorage();
  const prev = await prisma.photo.findFirst({ where: { originalId, kind: "ANNOTATED" } });
  if (prev) {
    await storage.delete(prev.storageKey);
    await prisma.photo.delete({ where: { id: prev.id } });
  }
  const storageKey = await storage.put(buf, meta.ext);
  return prisma.photo.create({
    data: {
      storageKey,
      mimeType: meta.mime,
      kind: "ANNOTATED",
      originalId,
      roomId: original.roomId,
      itemId: original.itemId,
      blemishId: original.blemishId,
    },
  });
}

export async function deletePhoto(ownerId: string, photoId: string) {
  await resolveEditable(ownerId, { kind: "photo", id: photoId });
  const photo = await prisma.photo.findUnique({ where: { id: photoId } });
  if (!photo) throw notFound();
  const storage = getStorage();
  const children = await prisma.photo.findMany({ where: { originalId: photoId } });
  for (const p of [photo, ...children]) await storage.delete(p.storageKey);
  await prisma.photo.deleteMany({ where: { OR: [{ id: photoId }, { originalId: photoId }] } });
}

/** Reads a photo for serving; checks the photo belongs to one of the owner's inspections or repairs. */
export async function readPhoto(ownerId: string, photoId: string) {
  const photo = await prisma.photo.findFirst({
    where: {
      id: photoId,
      OR: [
        { room: { inspection: { lease: { property: { ownerId } } } } },
        { item: { room: { inspection: { lease: { property: { ownerId } } } } } },
        { blemish: { room: { inspection: { lease: { property: { ownerId } } } } } },
        { repair: { lease: { property: { ownerId } } } },
      ],
    },
  });
  if (!photo) throw notFound();
  return { data: await getStorage().get(photo.storageKey), mimeType: photo.mimeType };
}
