function norm(s){ return String(s || "").trim().toUpperCase(); }

function normalizePhase(input){
  const p = String(input || "").trim().toUpperCase();
  if(!p) return null;
  const m = p.match(/(\d+)/);
  if(!m) return null;
  return `PHASE-${parseInt(m[1], 10)}`;
}

export async function onRequestGet({ env }) {
  if(!env.DB){
    return new Response(JSON.stringify({ ok:false, error:"DB binding missing" }), {
      status:500, headers:{ "Content-Type":"application/json" }
    });
  }

  try{
    const { results } = await env.DB.prepare(
      `SELECT id, created_ts, planned_phase, seq_no, kind, audience, title, body, severity, author,
              is_released, released_event_id, released_ts
       FROM scheduled_events
       ORDER BY is_released ASC, planned_phase ASC, seq_no ASC, created_ts ASC`
    ).all();

    return new Response(JSON.stringify({ ok:true, items: results || [] }), {
      headers:{ "Content-Type":"application/json" }
    });
  }catch(e){
    return new Response(JSON.stringify({ ok:false, error:String(e) }), {
      status:500, headers:{ "Content-Type":"application/json" }
    });
  }
}

export async function onRequestPost({ request, env }) {
  if(!env.DB){
    return new Response(JSON.stringify({ ok:false, error:"DB binding missing" }), {
      status:500, headers:{ "Content-Type":"application/json" }
    });
  }

  try{
    const body = await request.json().catch(()=>({}));

    const id = crypto.randomUUID();
    const created_ts = new Date().toISOString();

    const planned_phase = normalizePhase(body.planned_phase || body.phase);
    const seq_no = parseInt(body.seq_no || body.seq || "0", 10) || 0;
    const kind = norm(body.kind || "INJECT");
    const audience = norm(body.audience || "ALL");
    const title = String(body.title || "").trim();
    const text = String(body.body || "").toString();
    const severity = norm(body.severity || "INFO");
    const author = String(body.author || "admin").trim() || "admin";

    if(!text.trim()){
      return new Response(JSON.stringify({ ok:false, error:"body is required" }), {
        status:400, headers:{ "Content-Type":"application/json" }
      });
    }

    await env.DB.prepare(
      `INSERT INTO scheduled_events
       (id, created_ts, planned_phase, seq_no, kind, audience, title, body, severity, author)
       VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10)`
    ).bind(id, created_ts, planned_phase, seq_no, kind, audience, title, text, severity, author).run();

    return new Response(JSON.stringify({ ok:true, id }), {
      headers:{ "Content-Type":"application/json" }
    });
  }catch(e){
    return new Response(JSON.stringify({ ok:false, error:String(e) }), {
      status:500, headers:{ "Content-Type":"application/json" }
    });
  }
}

export async function onRequestDelete({ request, env }) {
  if(!env.DB){
    return new Response(JSON.stringify({ ok:false, error:"DB binding missing" }), {
      status:500, headers:{ "Content-Type":"application/json" }
    });
  }

  try{
    const url = new URL(request.url);
    const id = String(url.searchParams.get("id") || "").trim();
    if(!id){
      return new Response(JSON.stringify({ ok:false, error:"Missing id" }), {
        status:400, headers:{ "Content-Type":"application/json" }
      });
    }

    await env.DB.prepare("DELETE FROM scheduled_events WHERE id=?1").bind(id).run();

    return new Response(JSON.stringify({ ok:true, id }), {
      headers:{ "Content-Type":"application/json" }
    });
  }catch(e){
    return new Response(JSON.stringify({ ok:false, error:String(e) }), {
      status:500, headers:{ "Content-Type":"application/json" }
    });
  }
}
