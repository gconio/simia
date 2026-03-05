function norm(s){ return String(s || "").trim().toUpperCase(); }

function phaseNum(phase){
  // PHASE-1 -> 1, PHASE-2 -> 2, null/empty -> 0
  const p = norm(phase);
  const m = /^PHASE-(\d+)$/.exec(p);
  return m ? parseInt(m[1], 10) : 0;
}

export async function onRequest({ request, env }) {
  if(!env.DB){
    return new Response(JSON.stringify({ ok:false, error:"DB binding missing" }), {
      status: 500, headers: { "Content-Type":"application/json" }
    });
  }

  const url = new URL(request.url);
  const team = norm(url.searchParams.get("team") || "ALL");
  const role = norm(url.searchParams.get("role") || "PLAYER");

  const audAll = "ALL";
  const audTeam = `TEAM:${team}`;
  const audRole = `ROLE:${role}`;
  const audTeamAll = "TEAM:ALL";

  try{
    const state = await env.DB.prepare(
      "SELECT current_phase FROM simulation_state WHERE id=1"
    ).first();

    const current_phase = state?.current_phase || "PHASE-1";
    const current_n = phaseNum(current_phase);

    // Prendiamo gli ultimi 400 e filtriamo in JS per phase gating (semplice e robusto)
    const { results } = await env.DB.prepare(
      `SELECT id, ts, kind, phase, audience, title, body, severity, author
       FROM events
       WHERE is_published=1
         AND (audience=?1 OR audience=?2 OR audience=?3 OR audience=?4)
       ORDER BY ts DESC
       LIMIT 400`
    ).bind(audAll, audTeam, audRole, audTeamAll).all();

    const all = results || [];
    const events = all.filter(ev => {
      const pn = phaseNum(ev.phase);
      return pn === 0 || pn <= current_n; // null/invalid -> always; else gate by current phase
    }).slice(0, 200);

    return new Response(JSON.stringify({
      ok:true,
      team,
      role,
      current_phase,
      events
    }), { headers: { "Content-Type":"application/json" }});

  }catch(e){
    return new Response(JSON.stringify({ ok:false, error:String(e) }), {
      status: 500, headers: { "Content-Type":"application/json" }
    });
  }
}