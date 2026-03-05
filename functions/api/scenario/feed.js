function norm(s){ return String(s || "").trim().toUpperCase(); }

export async function onRequest({ request, env }) {
  if(!env.DB){
    return new Response(JSON.stringify({ ok:false, error:"DB binding missing" }), {
      status: 500, headers: { "Content-Type":"application/json" }
    });
  }

  const url = new URL(request.url);
  const team = norm(url.searchParams.get("team") || "ALL");
  const role = norm(url.searchParams.get("role") || "PLAYER");

  // Audience matching:
  // - ALL
  // - TEAM:<TEAM>
  // - ROLE:<ROLE>
  // - TEAM:ALL (alias)
  const audAll = "ALL";
  const audTeam = `TEAM:${team}`;
  const audRole = `ROLE:${role}`;
  const audTeamAll = "TEAM:ALL";

  try{
    const { results } = await env.DB.prepare(
      `SELECT id, ts, kind, phase, audience, title, body, severity, author
       FROM events
       WHERE is_published=1
         AND (audience=?1 OR audience=?2 OR audience=?3 OR audience=?4)
       ORDER BY ts DESC
       LIMIT 200`
    ).bind(audAll, audTeam, audRole, audTeamAll).all();

    return new Response(JSON.stringify({
      ok:true,
      team,
      role,
      events: results || []
    }), { headers: { "Content-Type":"application/json" }});
  }catch(e){
    return new Response(JSON.stringify({ ok:false, error:String(e) }), {
      status: 500, headers: { "Content-Type":"application/json" }
    });
  }
}