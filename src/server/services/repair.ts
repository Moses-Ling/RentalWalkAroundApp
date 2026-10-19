import { Responsibility } from "@prisma/client";
import { prisma } from "../db";
import { badRequest, notFound } from "../errors";
import { getStorage } from "../storage";
import { validateImage, ImageError } from "../images";

const RESP = ["TENANT", "NORMAL_WEAR", "LANDLORD_MAINTENANCE"];

export type RepairInput = {
  date: Date | string;
  description: string;
  vendor?: string;
  costCents?: number;
  responsibility?: Responsibility;
  blemishId?: string;
  itemId?: string;
};

async function ownedLease(ownerId: string, leaseId: string) {
  const l = await prisma.lease.findFirst({ where: { id: leaseId, property: { ownerId } } });
  if (!l) throw notFound("Lease not found");
  return l;
}

/**
 * Logs a repair against a lease. A linked blemish/item must come from this lease's move-in
 * inspection. Linking a blemish marks it REPAIRED (a status flag outside the signed content,
 * so it is allowed on a locked report) and propagates to any move-out copy.
 */
export async function createRepair(ownerId: string, leaseId: string, data: RepairInput) {
  await ownedLease(ownerId, leaseId);
  if (!data.description?.trim()) throw badRequest("Description is required");
  const date = new Date(data.date);
  if (isNaN(+date)) throw badRequest("Invalid date");
  const costCents = data.costCents ?? 0;
  if (!Number.isInteger(costCents) || costCents < 0) throw badRequest("Cost must be a non-negative whole number of cents");
  const responsibility = data.responsibility ?? "LANDLORD_MAINTENANCE";
  if (!RESP.includes(responsibility)) throw badRequest("Invalid responsibility");

  if (data.blemishId) {
    const b = await prisma.blemish.findFirst({
      where: { id: data.blemishId, room: { inspection: { leaseId, type: "MOVE_IN" } } },
    });
    if (!b) throw badRequest("Blemish must belong to this lease's move-in inspection");
  }
  if (data.itemId) {
    const it = await prisma.inspectionItem.findFirst({
      where: { id: data.itemId, room: { inspection: { leaseId, type: "MOVE_IN" } } },
    });
    if (!it) throw badRequest("Item must belong to this lease's move-in inspection");
  }

  return prisma.$transaction(async (tx) => {
    const repair = await tx.repair.create({
      data: {
        leaseId,
        date,
        description: data.description.trim(),
        vendor: data.vendor?.trim() ?? "",
        costCents,
        responsibility,
        blemishId: data.blemishId ?? null,
        itemId: data.itemId ?? null,
      },
    });
    if (data.blemishId) {
      await tx.blemish.updateMany({
        where: { OR: [{ id: data.blemishId }, { priorBlemishId: data.blemishId, room: { inspection: { status: "DRAFT" } } }] },
        data: { status: "REPAIRED" },
      });
    }
    return repair;
  });
}

export async function listRepairs(ownerId: string, leaseId: string) {
  await ownedLease(ownerId, leaseId);
  return prisma.repair.findMany({
    where: { leaseId },
    orderBy: { date: "asc" },
    include: { photos: true, blemish: true, item: true },
  });
}

export async function deleteRepair(ownerId: string, repairId: string) {
  const r = await prisma.repair.findFirst({ where: { id: repairId, lease: { property: { ownerId } } }, include: { photos: true } });
  if (!r) throw notFound("Repair not found");
  const storage = getStorage();
  for (const p of r.photos) await storage.delete(p.storageKey);
  await prisma.repair.delete({ where: { id: repairId } });
}

/** caption conventionally "before", "after" or "receipt". */
export async function addRepairPhoto(ownerId: string, repairId: string, data: Buffer, caption = "") {
  const r = await prisma.repair.findFirst({ where: { id: repairId, lease: { property: { ownerId } } } });
  if (!r) throw notFound("Repair not found");
  let meta;
  try {
    meta = validateImage(data);
  } catch (e) {
    if (e instanceof ImageError) throw badRequest(e.message);
    throw e;
  }
  const storageKey = await getStorage().put(data, meta.ext);
  return prisma.photo.create({ data: { storageKey, mimeType: meta.mime, caption, kind: "ORIGINAL", repairId } });
}
