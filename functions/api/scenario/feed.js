export async function onRequestGet({ request, env }) {
  if(!env.DB){
    return new Response(JSON.stringify({ ok:false, error:"DB binding missing" }), { status:500, headers:{ "Content-Type":"application/json" }});
  }
  try{
    const url = new URL(request.url);
    const team = String(url.searchParams.get("team") || "ALL").trim().toUpperCase();
    const role = String(url.searchParams.get("role") || "PLAYER").trim().toUpperCase();
    const pid  = String(url.searchParams.get("pid") || "").trim();

    let current_phase = "PHASE-1";
    const sim = await env.DB.prepare("SELECT current_phase FROM simulation_state WHERE id=1").first();
    if(sim && sim.current_phase) current_phase = String(sim.current_phase).trim().toUpperCase();

    const audienceAll = "ALL";
    const audienceTeam = "TEAM:" + team;
    const audienceRole = "ROLE:" + role;
    const audienceUser = pid ? ("USER:" + pid) : "__NO_USER__";

    const rows = await env.DB.prepare(
      `SELECT id, ts, kind, phase, audience, title, body, severity, author
       FROM events
       WHERE is_published=1
         AND (audience=?1 OR audience=?2 OR audience=?3 OR audience=?4)
       ORDER BY ts DESC`
    ).bind(audienceAll, audienceTeam, audienceRole, audienceUser).all();

    const events = (rows.results || []).map(r => ({
      id: r.id,
      ts: r.ts,
      kind: r.kind,
      phase: r.phase,
      audience: r.audience,
      title: r.title,
      body: r.body,
      severity: r.severity,
      author: r.author
    }));

    return new Response(JSON.stringify({
      ok:true,
      current_phase,
      team,
      role,
      pid: pid || null,
      events
    }), { headers:{ "Content-Type":"application/json" }});
  }catch(e){
    return new Response(JSON.stringify({ ok:false, error:String(e) }), { status:500, headers:{ "Content-Type":"application/json" }});
  }
}
