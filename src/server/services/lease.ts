import { prisma } from "../db";
import { badRequest, conflict, notFound } from "../errors";
import { getProperty } from "./property";
import { getStorage } from "../storage";

export async function createLease(
  ownerId: string,
  propertyId: string,
  data: { renterName: string; renterEmail?: string; renterPhone?: string; startDate: Date | string; endDate: Date | string },
) {
  await getProperty(ownerId, propertyId);
  if (!data.renterName?.trim()) throw badRequest("Renter name is required");
  const startDate = new Date(data.startDate);
  const endDate = new Date(data.endDate);
  if (isNaN(+startDate) || isNaN(+endDate)) throw badRequest("Invalid dates");
  if (endDate <= startDate) throw badRequest("End date must be after start date");
  return prisma.lease.create({
    data: {
      propertyId,
      renterName: data.renterName.trim(),
      renterEmail: data.renterEmail?.trim() ?? "",
      renterPhone: data.renterPhone?.trim() ?? "",
      startDate,
      endDate,
    },
  });
}

export async function getLease(ownerId: string, id: string) {
  const l = await prisma.lease.findFirst({
    where: { id, property: { ownerId } },
    include: { property: true, inspections: true, repairs: { orderBy: { date: "desc" } } },
  });
  if (!l) throw notFound("Lease not found");
  return l;
}

export async function updateLeaseStatus(ownerId: string, id: string, status: "DRAFT" | "ACTIVE" | "ENDED") {
  await getLease(ownerId, id);
  return prisma.lease.update({ where: { id }, data: { status } });
}

/** Deletes a lease with its inspections, repairs and photos. Refused once any inspection is signed. */
export async function deleteLease(ownerId: string, id: string) {
  const l = await getLease(ownerId, id);
  if (l.inspections.some((i) => i.status === "SIGNED")) throw conflict("A lease with a signed inspection cannot be deleted");
  const storage = getStorage();
  const photos = await prisma.photo.findMany({
    where: {
      OR: [
        { repair: { leaseId: id } },
        { room: { inspection: { leaseId: id } } },
        { item: { room: { inspection: { leaseId: id } } } },
        { blemish: { room: { inspection: { leaseId: id } } } },
      ],
    },
  });
  for (const p of photos) await storage.delete(p.storageKey);
  await prisma.lease.delete({ where: { id } });
}
