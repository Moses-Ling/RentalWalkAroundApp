import { prisma } from "@/server/db";

export async function resetDb() {
  await prisma.$executeRawUnsafe(
    `TRUNCATE "Owner","Property","Room","Item","Lease","Inspection","InspectionRoom","InspectionItem","Blemish","Photo","Comment","Signature","Repair" RESTART IDENTITY CASCADE`,
  );
}

export async function makeOwner(email = "owner@test.dev") {
  return prisma.owner.create({ data: { email } });
}

// 1x1 transparent PNG
export const PNG_1PX = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==",
  "base64",
);
