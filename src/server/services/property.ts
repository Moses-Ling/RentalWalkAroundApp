import { prisma } from "../db";
import { badRequest, notFound } from "../errors";
import { getTemplate } from "../templates";

export async function createProperty(ownerId: string, data: { name: string; address?: string }) {
  if (!data.name?.trim()) throw badRequest("Property name is required");
  return prisma.property.create({ data: { ownerId, name: data.name.trim(), address: data.address?.trim() ?? "" } });
}

export function listProperties(ownerId: string) {
  return prisma.property.findMany({ where: { ownerId }, orderBy: { createdAt: "desc" } });
}

export async function getProperty(ownerId: string, id: string) {
  const p = await prisma.property.findFirst({
    where: { id, ownerId },
    include: {
      rooms: { orderBy: { sortOrder: "asc" }, include: { items: { orderBy: { sortOrder: "asc" } } } },
      leases: { orderBy: { startDate: "desc" } },
    },
  });
  if (!p) throw notFound("Property not found");
  return p;
}

export async function updateProperty(ownerId: string, id: string, data: { name?: string; address?: string }) {
  await getProperty(ownerId, id);
  return prisma.property.update({ where: { id }, data });
}

export async function deleteProperty(ownerId: string, id: string) {
  await getProperty(ownerId, id);
  await prisma.property.delete({ where: { id } });
}

async function ownedRoom(ownerId: string, roomId: string) {
  const r = await prisma.room.findFirst({ where: { id: roomId, property: { ownerId } } });
  if (!r) throw notFound("Room not found");
  return r;
}

export async function addRoom(ownerId: string, propertyId: string, data: { name?: string; templateKey?: string }) {
  await getProperty(ownerId, propertyId);
  const tpl = data.templateKey ? getTemplate(data.templateKey) : undefined;
  if (data.templateKey && !tpl) throw badRequest("Unknown template");
  const name = (data.name ?? tpl?.name ?? "").trim();
  if (!name) throw badRequest("Room name is required");
  const count = await prisma.room.count({ where: { propertyId } });
  return prisma.room.create({
    data: {
      propertyId,
      name,
      sortOrder: count,
      items: tpl
        ? { create: tpl.items.map((it, i) => ({ name: it.name, isEquipment: it.isEquipment, sortOrder: i })) }
        : undefined,
    },
    include: { items: true },
  });
}

export async function renameRoom(ownerId: string, roomId: string, name: string) {
  await ownedRoom(ownerId, roomId);
  if (!name.trim()) throw badRequest("Room name is required");
  return prisma.room.update({ where: { id: roomId }, data: { name: name.trim() } });
}

export async function deleteRoom(ownerId: string, roomId: string) {
  await ownedRoom(ownerId, roomId);
  await prisma.room.delete({ where: { id: roomId } });
}

export async function addItem(ownerId: string, roomId: string, data: { name: string; isEquipment?: boolean }) {
  await ownedRoom(ownerId, roomId);
  if (!data.name?.trim()) throw badRequest("Item name is required");
  const count = await prisma.item.count({ where: { roomId } });
  return prisma.item.create({
    data: { roomId, name: data.name.trim(), isEquipment: !!data.isEquipment, sortOrder: count },
  });
}

export async function deleteItem(ownerId: string, itemId: string) {
  const it = await prisma.item.findFirst({ where: { id: itemId, room: { property: { ownerId } } } });
  if (!it) throw notFound("Item not found");
  await prisma.item.delete({ where: { id: itemId } });
}

export async function cloneLayout(ownerId: string, fromPropertyId: string, toPropertyId: string) {
  const from = await getProperty(ownerId, fromPropertyId);
  await getProperty(ownerId, toPropertyId);
  const base = await prisma.room.count({ where: { propertyId: toPropertyId } });
  for (const [i, r] of from.rooms.entries()) {
    await prisma.room.create({
      data: {
        propertyId: toPropertyId,
        name: r.name,
        sortOrder: base + i,
        items: { create: r.items.map((it) => ({ name: it.name, isEquipment: it.isEquipment, sortOrder: it.sortOrder })) },
      },
    });
  }
}
