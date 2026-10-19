import { describe, it, expect } from "vitest";
import os from "os";
import path from "path";
import fs from "fs";
import { LocalStorage } from "@/server/storage";
import { validateImage, ImageError, dataUrlToBuffer } from "@/server/images";
import { PNG_1PX } from "../helpers";

describe("LocalStorage", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "st-"));
  const st = new LocalStorage(dir);

  it("stores, reads and deletes", async () => {
    const key = await st.put(Buffer.from("hi"), "png");
    expect((await st.get(key)).toString()).toBe("hi");
    await st.delete(key);
    await expect(st.get(key)).rejects.toThrow();
  });

  it("blocks path traversal", async () => {
    await expect(st.get("../../etc/passwd")).rejects.toThrow("Invalid storage key");
  });
});

describe("image validation", () => {
  it("accepts a real PNG", () => {
    expect(validateImage(PNG_1PX)).toEqual({ mime: "image/png", ext: "png" });
  });
  it("rejects non-images, empty and oversized files", () => {
    expect(() => validateImage(Buffer.from("<script>alert(1)</script>"))).toThrow(ImageError);
    expect(() => validateImage(Buffer.alloc(0))).toThrow(ImageError);
    expect(() => validateImage(Buffer.concat([PNG_1PX, Buffer.alloc(16 * 1024 * 1024)]))).toThrow(/too large/);
  });
  it("parses image data URLs", () => {
    const url = `data:image/png;base64,${PNG_1PX.toString("base64")}`;
    expect(dataUrlToBuffer(url).equals(PNG_1PX)).toBe(true);
    expect(() => dataUrlToBuffer("data:text/html;base64,AAAA")).toThrow(ImageError);
  });
});
