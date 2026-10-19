import { describe, it, expect } from "vitest";
import { checkPassword, createSessionToken, verifySessionToken } from "@/server/auth";

describe("auth", () => {
  it("accepts the configured password only", () => {
    expect(checkPassword("test-password")).toBe(true);
    expect(checkPassword("wrong")).toBe(false);
    expect(checkPassword("")).toBe(false);
  });

  it("round-trips a session token", () => {
    expect(verifySessionToken(createSessionToken("owner1"))).toBe("owner1");
  });

  it("rejects tampered, expired and missing tokens", () => {
    const t = createSessionToken("owner1");
    const [payload, sig] = t.split(".");
    const forged = Buffer.from(JSON.stringify({ o: "owner2", e: Date.now() + 99999 })).toString("base64url");
    expect(verifySessionToken(`${forged}.${sig}`)).toBeNull();
    expect(verifySessionToken(`${payload}.bad`)).toBeNull();
    expect(verifySessionToken(null)).toBeNull();
    expect(verifySessionToken("garbage")).toBeNull();
    expect(verifySessionToken(t, Date.now() + 1000 * 60 * 60 * 24 * 31)).toBeNull();
  });
});
