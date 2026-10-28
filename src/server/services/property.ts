import { prisma } from "../db";
import { badRequest, notFound } from "../errors";
import { getTemplate } from "../templates";
import { DEFAULT_LAYOUT } from "../defaultLayout";
import { getStorage } from "../storage";

export async function createProperty(ownerId: string, data: { name: string; address?: string }) {
  if (!data.name?.trim()) throw badRequest("Property name is required");
  return prisma.property.create({ data: { ownerId, name: data.name.trim(), address: data.address?.trim() ?? "" } });
}

/**
 * Gives a newly created property its starting rooms: the property marked as default if there is
 * one, otherwise the built-in DEFAULT_LAYOUT.
 */
export async function applyStartingLayout(ownerId: string, propertyId: string) {
  const base = await prisma.property.findFirst({ where: { ownerId, isDefaultLayout: true, id: { not: propertyId } } });
  if (base) return cloneLayout(ownerId, base.id, propertyId);
  await getProperty(ownerId, propertyId);
  for (const [i, r] of DEFAULT_LAYOUT.entries()) {
    await prisma.room.create({
      data: {
        propertyId,
        name: r.name,
        sortOrder: i,
        items: { create: r.items.map((it, j) => ({ name: it.name, isEquipment: it.isEquipment, sortOrder: j })) },
      },
    });
  }
}

/** Marks one property's rooms and items as the starting layout for every new property. */
/** Gives an existing property with no rooms the starting layout. */
export async function fillEmptyProperty(ownerId: string, propertyId: string) {
  const p = await getProperty(ownerId, propertyId);
  if (p.rooms.length > 0) throw badRequest("This property already has rooms");
  await applyStartingLayout(ownerId, propertyId);
}

export async function setDefaultLayout(ownerId: string, id: string) {
  await getProperty(ownerId, id);
  await prisma.$transaction([
    prisma.property.updateMany({ where: { ownerId }, data: { isDefaultLayout: false } }),
    prisma.property.update({ where: { id }, data: { isDefaultLayout: true } }),
  ]);
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

/** Deletes a property with its leases, inspections, repairs and their photo files. */
export async function deleteProperty(ownerId: string, id: string) {
  await getProperty(ownerId, id);
  const lease = { lease: { propertyId: id } };
  const photos = await prisma.photo.findMany({
    where: {
      OR: [
        { repair: lease },
        { room: { inspection: lease } },
        { item: { room: { inspection: lease } } },
        { blemish: { room: { inspection: lease } } },
      ],
    },
  });
  const storage = getStorage();
  for (const p of photos) await storage.delete(p.storageKey);
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

export async function renameItem(ownerId: string, itemId: string, name: string) {
  const it = await prisma.item.findFirst({ where: { id: itemId, room: { property: { ownerId } } } });
  if (!it) throw notFound("Item not found");
  if (!name?.trim()) throw badRequest("Item name is required");
  return prisma.item.update({ where: { id: itemId }, data: { name: name.trim() } });
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
