"use client";
import { useState } from "react";
import { api } from "../../lib/client";

export default function Login() {
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  return (
    <form
      className="card mt-16 space-y-3"
      onSubmit={async (e) => {
        e.preventDefault();
        try { await api("POST", "login", { password }); location.href = "/"; }
        catch (err) { setError((err as Error).message); }
      }}
    >
      <h1 className="text-xl font-semibold">Rental Walk-Around</h1>
      <input className="input" type="password" placeholder="Password" autoFocus value={password} onChange={(e) => setPassword(e.target.value)} />
      {error && <p className="text-sm text-red-600">{error}</p>}
      <button className="btn w-full">Sign in</button>
    </form>
  );
}
