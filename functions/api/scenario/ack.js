function norm(s){ return String(s || "").trim().toUpperCase(); }

export async function onRequestPost({ request, env }) {
  if(!env.DB){
    return new Response(JSON.stringify({ ok:false, error:"DB binding missing" }), {
      status: 500, headers: { "Content-Type":"application/json" }
    });
  }

  try{
    const body = await request.json().catch(() => ({}));

    const event_id = String(body.event_id || "").trim();
    const participant_id = String(body.participant_id || "").trim();
    const team = norm(body.team || "ALL");
    const role = norm(body.role || "PLAYER");
    const ack_ts = new Date().toISOString();

    if(!event_id || !participant_id){
      return new Response(JSON.stringify({ ok:false, error:"event_id and participant_id are required" }), {
        status: 400, headers: { "Content-Type":"application/json" }
      });
    }

    await env.DB.prepare(
      "INSERT OR REPLACE INTO event_ack (event_id, participant_id, team, role, ack_ts) VALUES (?1, ?2, ?3, ?4, ?5)"
    ).bind(event_id, participant_id, team, role, ack_ts).run();

    return new Response(JSON.stringify({ ok:true, event_id, participant_id, ack_ts }), {
      headers: { "Content-Type":"application/json" }
    });
  }catch(e){
    return new Response(JSON.stringify({ ok:false, error:String(e) }), {
      status: 500, headers: { "Content-Type":"application/json" }
    });
  }
}