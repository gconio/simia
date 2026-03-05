function uuidv4() {
  if (crypto?.randomUUID) return crypto.randomUUID();
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === "x" ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

export async function onRequest({ request, env }) {
  const url = new URL(request.url);
  const method = request.method.toUpperCase();

  if (!env.DB) {
    return new Response(JSON.stringify({ ok: false, error: "DB binding missing" }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }

  try {
    if (method === "GET") {
      const rows = await env.DB.prepare(
        "SELECT id, name, email, role, team_id, created_at FROM participants ORDER BY created_at DESC"
      ).all();
      return new Response(JSON.stringify({ ok: true, participants: rows.results || [] }), {
        headers: { "Content-Type": "application/json" },
      });
    }

    if (method === "POST") {
      const body = await request.json().catch(() => null);
      if (!body || typeof body !== "object") {
        return new Response(JSON.stringify({ ok: false, error: "Invalid JSON body" }), {
          status: 400,
          headers: { "Content-Type": "application/json" },
        });
      }

      const id = String(body.id || uuidv4());
      const name = String(body.name || "").trim();
      const email = String(body.email || "").trim();
      const role = String(body.role || "PLAYER").trim().toUpperCase();
      const team_id = String(body.team_id || "ALL").trim().toUpperCase();
      const now = new Date().toISOString();

      if (!name) {
        return new Response(JSON.stringify({ ok: false, error: "name is required" }), {
          status: 400,
          headers: { "Content-Type": "application/json" },
        });
      }

      await env.DB.prepare(
        "INSERT INTO participants (id,name,email,role,team_id,created_at) VALUES (?1,?2,?3,?4,?5,?6)\n" +
        "ON CONFLICT(id) DO UPDATE SET name=excluded.name, email=excluded.email, role=excluded.role, team_id=excluded.team_id"
      ).bind(id, name, email, role, team_id, now).run();

      return new Response(JSON.stringify({ ok: true, id }), {
        headers: { "Content-Type": "application/json" },
      });
    }

    if (method === "DELETE") {
      const id = url.searchParams.get("id");
      if (!id) {
        return new Response(JSON.stringify({ ok: false, error: "Missing id" }), {
          status: 400,
          headers: { "Content-Type": "application/json" },
        });
      }
      await env.DB.prepare("DELETE FROM participants WHERE id=?1").bind(String(id)).run();
      return new Response(JSON.stringify({ ok: true }), {
        headers: { "Content-Type": "application/json" },
      });
    }

    return new Response(JSON.stringify({ ok: false, error: "Method not allowed" }), {
      status: 405,
      headers: { "Content-Type": "application/json" },
    });
  } catch (e) {
    return new Response(JSON.stringify({ ok: false, error: String(e) }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }
}