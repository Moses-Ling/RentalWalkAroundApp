import { createHmac, timingSafeEqual } from "crypto";

export const SESSION_COOKIE = "rw_session";
const MAX_AGE_MS = 1000 * 60 * 60 * 24 * 30;

function secret() {
  const s = process.env.SESSION_SECRET;
  if (!s || s.length < 32) throw new Error("SESSION_SECRET must be set (>=32 chars)");
  return s;
}

function sign(payload: string) {
  return createHmac("sha256", secret()).update(payload).digest("base64url");
}

function safeEqual(a: string, b: string) {
  const ab = Buffer.from(a);
  const bb = Buffer.from(b);
  return ab.length === bb.length && timingSafeEqual(ab, bb);
}

export function checkPassword(input: string): boolean {
  const expected = process.env.APP_PASSWORD;
  if (!expected) return false;
  return safeEqual(input, expected);
}

export function createSessionToken(ownerId: string, now = Date.now()): string {
  const payload = Buffer.from(JSON.stringify({ o: ownerId, e: now + MAX_AGE_MS })).toString("base64url");
  return `${payload}.${sign(payload)}`;
}

export function verifySessionToken(token: string | undefined | null, now = Date.now()): string | null {
  if (!token) return null;
  const [payload, sig] = token.split(".");
  if (!payload || !sig || !safeEqual(sig, sign(payload))) return null;
  try {
    const { o, e } = JSON.parse(Buffer.from(payload, "base64url").toString());
    if (typeof o !== "string" || typeof e !== "number" || e < now) return null;
    return o;
  } catch {
    return null;
  }
}
