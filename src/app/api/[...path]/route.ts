import { cookies } from "next/headers";
import { dispatch, handleLogin, json } from "../../../server/api";
import { SESSION_COOKIE, verifySessionToken } from "../../../server/auth";

export const dynamic = "force-dynamic";

async function handle(req: Request, ctx: { params: Promise<{ path: string[] }> }) {
  const { path } = await ctx.params;
  const jar = await cookies();

  if (req.method === "POST" && path.join("/") === "login") {
    const r = await handleLogin(await req.json().catch(() => ({})));
    if (r.status !== 200) return json({ error: "Wrong password" }, 401);
    jar.set(SESSION_COOKIE, r.token, { httpOnly: true, sameSite: "lax", path: "/", maxAge: 60 * 60 * 24 * 30 });
    return json({ ok: true });
  }
  if (req.method === "POST" && path.join("/") === "logout") {
    jar.delete(SESSION_COOKIE);
    return json({ ok: true });
  }

  const ownerId = verifySessionToken(jar.get(SESSION_COOKIE)?.value);
  if (!ownerId) return json({ error: "Unauthorized" }, 401);
  return dispatch(req, path, ownerId);
}

export { handle as GET, handle as POST, handle as PATCH, handle as DELETE };
