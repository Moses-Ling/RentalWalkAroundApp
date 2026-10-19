import { makeOwner } from "../helpers";
import * as P from "@/server/services/property";
import * as L from "@/server/services/lease";
import * as I from "@/server/services/inspection";

export async function seedLease(ownerEmail = "o@test.dev") {
  const owner = await makeOwner(ownerEmail);
  const prop = await P.createProperty(owner.id, { name: "Unit 1", address: "1 Main" });
  await P.addRoom(owner.id, prop.id, { templateKey: "kitchen" });
  await P.addRoom(owner.id, prop.id, { templateKey: "bedroom" });
  const lease = await L.createLease(owner.id, prop.id, {
    renterName: "Sam Renter", startDate: "2026-11-01", endDate: "2027-10-31",
  });
  return { owner, prop, lease };
}

export async function seedMoveIn() {
  const s = await seedLease();
  const insp = await I.startInspection(s.owner.id, s.lease.id, "MOVE_IN");
  return { ...s, insp };
}
