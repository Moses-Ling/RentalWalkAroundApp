"use client";
import { useCallback, useEffect, useState } from "react";
import { fitWithin } from "./annotate";

export async function api<T = any>(method: string, path: string, body?: unknown): Promise<T> {
  const init: RequestInit = { method };
  if (body instanceof FormData) init.body = body;
  else if (body !== undefined) {
    init.body = JSON.stringify(body);
    init.headers = { "content-type": "application/json" };
  }
  const res = await fetch(`/api/${path}`, init);
  if (res.status === 401 && !location.pathname.startsWith("/login")) {
    location.href = "/login";
    throw new Error("Unauthorized");
  }
  const data = res.headers.get("content-type")?.includes("json") ? await res.json() : null;
  if (!res.ok) throw new Error(data?.error ?? `Request failed (${res.status})`);
  return data as T;
}

export function useApi<T>(path: string) {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState("");
  const reload = useCallback(async () => {
    try {
      setData(await api<T>("GET", path));
      setError("");
    } catch (e) {
      setError((e as Error).message);
    }
  }, [path]);
  useEffect(() => { reload(); }, [reload]);
  return { data, error, reload };
}

/** Downscale a camera photo before upload (max 2000px, JPEG 0.82). */
export async function downscale(file: File, max = 2000): Promise<Blob> {
  const bmp = await createImageBitmap(file);
  const { width, height } = fitWithin(bmp.width, bmp.height, max);
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  canvas.getContext("2d")!.drawImage(bmp, 0, 0, width, height);
  return new Promise((res, rej) => canvas.toBlob((b) => (b ? res(b) : rej(new Error("Could not process image"))), "image/jpeg", 0.82));
}

export async function uploadPhoto(path: string, file: File, fields: Record<string, string>) {
  const blob = await downscale(file).catch(() => file);
  const form = new FormData();
  form.set("file", blob, "photo.jpg");
  for (const [k, v] of Object.entries(fields)) form.set(k, v);
  return api("POST", path, form);
}

export const enumLabel = (v: string | null | undefined) => (v ? v.replace(/_/g, " ").toLowerCase() : "—");
