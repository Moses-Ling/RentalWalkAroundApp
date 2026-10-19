import { describe, it, expect, beforeEach } from "vitest";
import { resetDb, makeOwner, PNG_1PX } from "../helpers";
import { seedMoveIn } from "../phase2/fixtures";
import * as I from "@/server/services/inspection";
import * as S from "@/server/services/signoff";
import { buildInspectionPdf } from "@/server/services/report";
import { sanitize } from "@/server/pdf";
import { prisma } from "@/server/db";

const sig = `data:image/png;base64,${PNG_1PX.toString("base64")}`;
beforeEach(resetDb);

describe("comments", () => {
  it("lets renter and landlord comment on rooms, items and blemishes", async () => {
    const { owner, insp } = await seedMoveIn();
    const room = insp.rooms[0];
    const b = await I.addBlemish(owner.id, room.id, { description: "Chip" });
    await S.addComment(owner.id, { roomId: room.id }, "RENTER", "Room was dirtier than noted");
    await S.addComment(owner.id, { itemId: room.items[0].id }, "RENTER", "ok");
    await S.addComment(owner.id, { blemishId: b.id }, "LANDLORD", "Photographed");
    const got = await I.getInspection(owner.id, insp.id);
    expect(got.rooms[0].comments[0]).toMatchObject({ author: "RENTER", text: "Room was dirtier than noted" });
    expect(got.rooms[0].blemishes[0].comments).toHaveLength(1);
  });

  it("validates input", async () => {
    const { owner, insp } = await seedMoveIn();
    await expect(S.addComment(owner.id, { roomId: insp.rooms[0].id }, "RENTER", "  ")).rejects.toThrow(/required/);
    await expect(S.addComment(owner.id, {}, "RENTER", "x")).rejects.toThrow(/exactly one/);
    await expect(S.addComment(owner.id, { roomId: insp.rooms[0].id }, "BOB" as never, "x")).rejects.toThrow(/author/);
  });
});

describe("signing", () => {
  it("stays editable until both parties have signed, then locks", async () => {
    const { owner, insp } = await seedMoveIn();
    await S.signInspection(owner.id, insp.id, "LANDLORD", "Lee Landlord", sig);
    expect((await I.getInspection(owner.id, insp.id)).status).toBe("DRAFT");
    await S.signInspection(owner.id, insp.id, "RENTER", "Sam Renter", sig);
    const got = await I.getInspection(owner.id, insp.id);
    expect(got.status).toBe("SIGNED");
    expect(got.signedAt).not.toBeNull();
    await expect(I.updateRoom(owner.id, got.rooms[0].id, { notes: "tamper" })).rejects.toThrow(/locked/);
    await expect(S.signInspection(owner.id, insp.id, "RENTER", "Sam", sig)).rejects.toThrow(/already signed/);
    await expect(S.addComment(owner.id, { roomId: got.rooms[0].id }, "RENTER", "late")).rejects.toThrow(/locked/);
  });

  it("discards a lone signature when content is edited afterwards", async () => {
    const { owner, insp } = await seedMoveIn();
    await S.signInspection(owner.id, insp.id, "LANDLORD", "Lee", sig);
    await I.updateRoom(owner.id, insp.rooms[0].id, { notes: "changed" });
    expect(await prisma.signature.count()).toBe(0);
  });

  it("does not discard signatures when only a comment is added", async () => {
    const { owner, insp } = await seedMoveIn();
    await S.signInspection(owner.id, insp.id, "LANDLORD", "Lee", sig);
    await S.addComment(owner.id, { roomId: insp.rooms[0].id }, "RENTER", "I disagree");
    expect(await prisma.signature.count()).toBe(1);
  });

  it("validates name, role and image; is owner-scoped", async () => {
    const { owner, insp } = await seedMoveIn();
    await expect(S.signInspection(owner.id, insp.id, "RENTER", " ", sig)).rejects.toThrow(/name/);
    await expect(S.signInspection(owner.id, insp.id, "BOB" as never, "x", sig)).rejects.toThrow(/role/);
    await expect(S.signInspection(owner.id, insp.id, "RENTER", "x", "data:text/plain;base64,AAAA")).rejects.toThrow(/image/i);
    const other = await makeOwner("x@test.dev");
    await expect(S.signInspection(other.id, insp.id, "RENTER", "x", sig)).rejects.toThrow(/not found/i);
  });

  it("re-signing by the same party replaces the signature", async () => {
    const { owner, insp } = await seedMoveIn();
    await S.signInspection(owner.id, insp.id, "RENTER", "First", sig);
    await S.signInspection(owner.id, insp.id, "RENTER", "Second", sig);
    const sigs = await prisma.signature.findMany();
    expect(sigs).toHaveLength(1);
    expect(sigs[0].name).toBe("Second");
  });
});

describe("PDF report", () => {
  it("produces a valid PDF with photos, blemishes and signatures", async () => {
    const { owner, insp } = await seedMoveIn();
    const room = insp.rooms[0];
    await I.updateRoom(owner.id, room.id, { condition: "GOOD", notes: "Clean – “smart quotes” ✓" });
    await I.addBlemish(owner.id, room.id, { description: "Scratch", itemId: room.items[0].id });
    await I.addPhoto(owner.id, { roomId: room.id }, PNG_1PX, "overview");
    await S.addComment(owner.id, { roomId: room.id }, "RENTER", "Agreed");
    await S.signInspection(owner.id, insp.id, "LANDLORD", "Lee", sig);
    await S.signInspection(owner.id, insp.id, "RENTER", "Sam", sig);
    const pdf = await buildInspectionPdf(owner.id, insp.id);
    expect(pdf.subarray(0, 5).toString()).toBe("%PDF-");
    expect(pdf.length).toBeGreaterThan(2000);
    expect(pdf.subarray(-6).toString()).toContain("%%EOF");
  });

  it("is owner-scoped", async () => {
    const { insp } = await seedMoveIn();
    const other = await makeOwner("x@test.dev");
    await expect(buildInspectionPdf(other.id, insp.id)).rejects.toThrow();
  });

  it("sanitizes characters Helvetica cannot encode", () => {
    expect(sanitize("ok ✓ 日本")).toBe("ok ? ??");
    expect(sanitize("café")).toBe("café");
  });
});
