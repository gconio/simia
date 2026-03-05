export async function onRequest({ request, env }) {
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
        "SELECT id, label, icon, updated_at FROM teams ORDER BY id ASC"
      ).all();
      return new Response(JSON.stringify({ ok: true, teams: rows.results || [] }), {
        headers: { "Content-Type": "application/json" },
      });
    }

    if (method === "POST") {
      const body = await request.json().catch(() => null);
      if (!body || !Array.isArray(body.teams)) {
        return new Response(JSON.stringify({ ok: false, error: "Body must be {teams:[...]}" }), {
          status: 400,
          headers: { "Content-Type": "application/json" },
        });
      }

      const now = new Date().toISOString();
      const stmts = [env.DB.prepare("DELETE FROM teams")];

      for (const t of body.teams) {
        const id = String(t.id || "").trim().toUpperCase();
        if (!id) continue;
        const label = String(t.label || id).trim() || id;
        const icon = String(t.icon || "").trim();

        stmts.push(
          env.DB.prepare("INSERT INTO teams (id,label,icon,updated_at) VALUES (?1,?2,?3,?4)")
            .bind(id, label, icon, now)
        );
      }

      await env.DB.batch(stmts);
      return new Response(JSON.stringify({ ok: true, updated: body.teams.length }), {
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