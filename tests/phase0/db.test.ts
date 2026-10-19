import { describe, it, expect, beforeEach } from "vitest";
import { prisma } from "@/server/db";
import { resetDb, makeOwner } from "../helpers";

describe("database", () => {
  beforeEach(resetDb);
  it("connects and persists", async () => {
    const o = await makeOwner();
    expect(await prisma.owner.count()).toBe(1);
    expect(o.email).toBe("owner@test.dev");
  });
});
