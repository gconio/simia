export async function onRequestGet(context) {
  const db = context.env.DB;

  const { results } = await db.prepare(
    "SELECT * FROM events WHERE is_published=1 ORDER BY ts DESC LIMIT 200"
  ).all();

  return new Response(JSON.stringify({
    ok: true,
    events: results
  }), {
    headers: { "content-type": "application/json" }
  });
}

function normalizePhase(input){
  const p = String(input || "").trim().toUpperCase();
  if(!p) return null;
  const m = p.match(/(\d+)/);
  if(!m) return null;
  return `PHASE-${parseInt(m[1], 10)}`;
}

export async function onRequestPost(context) {

  const db = context.env.DB;

  const body = await context.request.json();

  const id = crypto.randomUUID();
  const ts = new Date().toISOString();

  const kind = body.kind || "BROADCAST";
  const phase = normalizePhase(body.phase);
  const audience = body.audience || "ALL";
  const title = body.title || "";
  const text = body.body || "";
  const severity = body.severity || "INFO";
  const author = body.author || "admin";

  await db.prepare(`
    INSERT INTO events
    (id, ts, kind, phase, audience, title, body, severity, author)
    VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9)
  `)
  .bind(id, ts, kind, phase, audience, title, text, severity, author)
  .run();

  return new Response(JSON.stringify({
    ok: true,
    id: id
  }), {
    headers: { "content-type": "application/json" }
  });
}