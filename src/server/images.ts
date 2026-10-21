export const MAX_UPLOAD_BYTES = 15 * 1024 * 1024;

const SIGNATURES: { mime: string; ext: string; test: (b: Buffer) => boolean }[] = [
  { mime: "image/png", ext: "png", test: (b) => b.subarray(0, 4).toString("hex") === "89504e47" },
  { mime: "image/jpeg", ext: "jpg", test: (b) => b.subarray(0, 3).toString("hex") === "ffd8ff" },
  {
    mime: "image/webp",
    ext: "webp",
    test: (b) => b.subarray(0, 4).toString() === "RIFF" && b.subarray(8, 12).toString() === "WEBP",
  },
];

export class ImageError extends Error {}

/** Validates by magic bytes (never trusts the client MIME type). */
export function validateImage(data: Buffer): { mime: string; ext: string } {
  if (data.length === 0) throw new ImageError("Empty file");
  if (data.length > MAX_UPLOAD_BYTES) throw new ImageError("File too large (max 15 MB)");
  const found = SIGNATURES.find((s) => s.test(data));
  if (!found) throw new ImageError("Only PNG, JPEG or WebP images are allowed");
  return { mime: found.mime, ext: found.ext };
}

export function dataUrlToBuffer(dataUrl: string): Buffer {
  // No regex over the payload: it overflows the stack on multi-megabyte strings.
  const m = /^data:image\/(png|jpeg|webp);base64,/.exec(dataUrl.slice(0, 40));
  if (!m) throw new ImageError("Invalid image data URL");
  const buf = Buffer.from(dataUrl.slice(m[0].length), "base64");
  if (buf.length === 0) throw new ImageError("Invalid image data URL");
  return buf;
}
