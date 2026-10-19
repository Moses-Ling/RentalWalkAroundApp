import { SignerRole } from "@prisma/client";
import { prisma } from "../db";
import { badRequest, conflict, notFound } from "../errors";
import { dataUrlToBuffer, validateImage, ImageError } from "../images";
import { resolveEditable } from "./inspection";

type CommentTarget = { roomId?: string; itemId?: string; blemishId?: string };

export async function addComment(ownerId: string, target: CommentTarget, author: SignerRole, text: string) {
  const keys = [target.roomId, target.itemId, target.blemishId].filter(Boolean);
  if (keys.length !== 1) throw badRequest("Specify exactly one of roomId, itemId, blemishId");
  if (!text?.trim()) throw badRequest("Comment text is required");
  if (!["LANDLORD", "RENTER"].includes(author)) throw badRequest("Invalid author");
  // comments are part of the record: only allowed while the inspection is open
  const t = target.roomId
    ? ({ kind: "room", id: target.roomId } as const)
    : target.itemId
      ? ({ kind: "item", id: target.itemId } as const)
      : ({ kind: "blemish", id: target.blemishId! } as const);
  await resolveEditable(ownerId, t, { keepSignatures: true });
  return prisma.comment.create({ data: { author, text: text.trim(), ...target } });
}

/**
 * Records a signature. Once both landlord and renter have signed the inspection is
 * locked (status SIGNED). Editing a draft after one party signed discards signatures
 * (see resolveEditable), so a signature always attests to the content it saw.
 */
export async function signInspection(
  ownerId: string,
  inspectionId: string,
  role: SignerRole,
  name: string,
  imageDataUrl: string,
) {
  const insp = await prisma.inspection.findFirst({
    where: { id: inspectionId, lease: { property: { ownerId } } },
  });
  if (!insp) throw notFound("Inspection not found");
  if (insp.status === "SIGNED") throw conflict("Inspection is already signed and locked");
  if (!["LANDLORD", "RENTER"].includes(role)) throw badRequest("Invalid role");
  if (!name?.trim()) throw badRequest("Signer name is required");
  try {
    validateImage(dataUrlToBuffer(imageDataUrl));
  } catch (e) {
    if (e instanceof ImageError) throw badRequest(e.message);
    throw e;
  }

  return prisma.$transaction(async (tx) => {
    await tx.signature.upsert({
      where: { inspectionId_role: { inspectionId, role } },
      create: { inspectionId, role, name: name.trim(), imageDataUrl },
      update: { name: name.trim(), imageDataUrl, signedAt: new Date() },
    });
    const count = await tx.signature.count({ where: { inspectionId } });
    if (count >= 2) {
      return tx.inspection.update({ where: { id: inspectionId }, data: { status: "SIGNED", signedAt: new Date() } });
    }
    return insp;
  });
}
