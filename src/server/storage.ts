import fs from "fs/promises";
import path from "path";
import { randomUUID } from "crypto";

export interface StorageProvider {
  put(data: Buffer, ext: string): Promise<string>;
  get(key: string): Promise<Buffer>;
  delete(key: string): Promise<void>;
}

export class LocalStorage implements StorageProvider {
  constructor(private dir: string) {}

  private resolve(key: string) {
    const full = path.resolve(this.dir, key);
    if (!full.startsWith(path.resolve(this.dir) + path.sep)) throw new Error("Invalid storage key");
    return full;
  }

  async put(data: Buffer, ext: string) {
    const key = `${randomUUID()}.${ext.replace(/[^a-z0-9]/gi, "")}`;
    await fs.mkdir(this.dir, { recursive: true });
    await fs.writeFile(this.resolve(key), data);
    return key;
  }

  async get(key: string) {
    return fs.readFile(this.resolve(key));
  }

  async delete(key: string) {
    await fs.rm(this.resolve(key), { force: true });
  }
}

export function getStorage(): StorageProvider {
  return new LocalStorage(process.env.UPLOAD_DIR ?? "./uploads");
}
