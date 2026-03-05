export async function onRequest({ env }) {
  try {
    if (!env.DB) {
      return new Response(JSON.stringify({ ok: false, dbBound: false }), {
        status: 500,
        headers: { "Content-Type": "application/json" },
      });
    }

    const r = await env.DB.prepare("SELECT 1 AS one").first();
    return new Response(
      JSON.stringify({ ok: true, dbBound: true, dbOk: true, one: r?.one ?? null }),
      { headers: { "Content-Type": "application/json" } }
    );
  } catch (e) {
    return new Response(JSON.stringify({ ok: false, dbBound: true, dbOk: false, error: String(e) }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }
}