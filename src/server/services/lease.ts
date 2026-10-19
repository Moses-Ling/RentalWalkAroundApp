import { prisma } from "../db";
import { badRequest, notFound } from "../errors";
import { getProperty } from "./property";

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
