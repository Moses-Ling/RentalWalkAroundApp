"use client";
import Link from "next/link";
import { useState } from "react";
import { api, useApi } from "../lib/client";

type Property = { id: string; name: string; address: string };

export default function Home() {
  const { data, error, reload } = useApi<Property[]>("properties");
  const [name, setName] = useState("");
  const [address, setAddress] = useState("");
  const [err, setErr] = useState("");

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold">Properties</h1>
        <button className="text-sm text-slate-500 underline" onClick={async () => { await api("POST", "logout"); location.href = "/login"; }}>Sign out</button>
      </div>
      {error && <p className="text-red-600">{error}</p>}
      {data?.map((p) => (
        <Link key={p.id} href={`/properties/${p.id}`} className="card block">
          <div className="font-medium">{p.name}</div>
          <div className="text-sm text-slate-500">{p.address || "No address"}</div>
        </Link>
      ))}
      {data?.length === 0 && <p className="text-slate-500">No properties yet. Add your first one below.</p>}
      <form
        className="card space-y-2"
        onSubmit={async (e) => {
          e.preventDefault(); setErr("");
          try { await api("POST", "properties", { name, address }); setName(""); setAddress(""); reload(); }
          catch (e2) { setErr((e2 as Error).message); }
        }}
      >
        <h2 className="font-medium">Add property</h2>
        <input className="input" placeholder="Name (e.g. Unit 4B)" value={name} onChange={(e) => setName(e.target.value)} />
        <input className="input" placeholder="Address" value={address} onChange={(e) => setAddress(e.target.value)} />
        {err && <p className="text-sm text-red-600">{err}</p>}
        <button className="btn w-full">Add</button>
      </form>
    </div>
  );
}
