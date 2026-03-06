export async function onRequestPost({ request, env }) {
  if(!env.DB){
    return new Response(JSON.stringify({ ok:false, error:"DB binding missing" }), {
      status:500, headers:{ "Content-Type":"application/json" }
    });
  }

  try{
    const body = await request.json().catch(()=>({}));
    const scheduled_id = String(body.scheduled_id || "").trim();
    if(!scheduled_id){
      return new Response(JSON.stringify({ ok:false, error:"scheduled_id is required" }), {
        status:400, headers:{ "Content-Type":"application/json" }
      });
    }

    const item = await env.DB.prepare(
      `SELECT id, planned_phase, kind, audience, title, body, severity, author, is_released
       FROM scheduled_events WHERE id=?1`
    ).bind(scheduled_id).first();

    if(!item){
      return new Response(JSON.stringify({ ok:false, error:"Scheduled item not found" }), {
        status:404, headers:{ "Content-Type":"application/json" }
      });
    }

    if(Number(item.is_released) === 1){
      return new Response(JSON.stringify({ ok:false, error:"Item already released" }), {
        status:409, headers:{ "Content-Type":"application/json" }
      });
    }

    const event_id = crypto.randomUUID();
    const ts = new Date().toISOString();

    await env.DB.prepare(
      `INSERT INTO events
       (id, ts, kind, phase, audience, title, body, severity, author, is_published)
       VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, 1)`
    ).bind(
      event_id, ts, item.kind, item.planned_phase, item.audience,
      item.title || "", item.body, item.severity, item.author || "admin"
    ).run();

    await env.DB.prepare(
      `UPDATE scheduled_events
       SET is_released=1, released_event_id=?1, released_ts=?2
       WHERE id=?3`
    ).bind(event_id, ts, scheduled_id).run();

    return new Response(JSON.stringify({ ok:true, scheduled_id, event_id, released_ts: ts }), {
      headers:{ "Content-Type":"application/json" }
    });
  }catch(e){
    return new Response(JSON.stringify({ ok:false, error:String(e) }), {
      status:500, headers:{ "Content-Type":"application/json" }
    });
  }
}
