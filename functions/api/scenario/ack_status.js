function norm(s){ return String(s || "").trim().toUpperCase(); }

function audienceFilter(audience){
  const a = norm(audience);
  if(a === "ALL" || a === "TEAM:ALL") return { type:"ALL" };
  if(a.startsWith("TEAM:")) return { type:"TEAM", team: a.split(":")[1] || "ALL" };
  if(a.startsWith("ROLE:")) return { type:"ROLE", role: a.split(":")[1] || "PLAYER" };
  return { type:"ALL" };
}

async function expectedParticipants(db, audience){
  // Consideriamo "leggibili" i partecipanti non admin/instructor
  const af = audienceFilter(audience);

  if(af.type === "TEAM"){
    const team = norm(af.team || "ALL");
    const q = await db.prepare(
      `SELECT id, name, role, team_id
       FROM participants
       WHERE UPPER(team_id)=?1
         AND UPPER(role) NOT IN ('ADMIN','INSTRUCTOR')`
    ).bind(team).all();
    return q.results || [];
  }

  if(af.type === "ROLE"){
    const role = norm(af.role || "PLAYER");
    const q = await db.prepare(
      `SELECT id, name, role, team_id
       FROM participants
       WHERE UPPER(role)=?1`
    ).bind(role).all();
    return q.results || [];
  }

  // ALL
  const q = await db.prepare(
    `SELECT id, name, role, team_id
     FROM participants
     WHERE UPPER(role) NOT IN ('ADMIN','INSTRUCTOR')`
  ).all();
  return q.results || [];
}

export async function onRequest({ request, env }) {
  if(!env.DB){
    return new Response(JSON.stringify({ ok:false, error:"DB binding missing" }), {
      status: 500, headers: { "Content-Type":"application/json" }
    });
  }

  const url = new URL(request.url);
  const limit = Math.min(parseInt(url.searchParams.get("limit") || "30", 10) || 30, 100);

  try{
    // prendiamo gli ultimi eventi (default 30)
    const evQ = await env.DB.prepare(
      `SELECT id, ts, kind, phase, audience, title, severity
       FROM events
       WHERE is_published=1
       ORDER BY ts DESC
       LIMIT ?1`
    ).bind(limit).all();

    const events = evQ.results || [];
    const out = [];

    for(const ev of events){
      const expected = await expectedParticipants(env.DB, ev.audience);
      const expectedIds = new Set(expected.map(p => String(p.id)));

      // ack per evento
      const ackQ = await env.DB.prepare(
        `SELECT participant_id, team, role, ack_ts
         FROM event_ack
         WHERE event_id=?1`
      ).bind(ev.id).all();

      const ackRows = ackQ.results || [];
      const ackedUnique = new Set();
      const ackByTeam = {};

      for(const a of ackRows){
        const pid = String(a.participant_id || "");
        if(!pid) continue;

        // conta solo se il pid è atteso (evita ack “sporchi”)
        if(expectedIds.size && !expectedIds.has(pid)) continue;

        if(ackedUnique.has(pid)) continue;
        ackedUnique.add(pid);

        const t = norm(a.team || "ALL");
        ackByTeam[t] = (ackByTeam[t] || 0) + 1;
      }

      // expected breakdown per team (utile quando audience=ALL)
      const expectedByTeam = {};
      for(const p of expected){
        const t = norm(p.team_id || "ALL");
        expectedByTeam[t] = (expectedByTeam[t] || 0) + 1;
      }

      const expectedCount = expected.length;
      const ackedCount = ackedUnique.size;
      const pct = expectedCount ? Math.round((ackedCount / expectedCount) * 100) : 0;

      out.push({
        event: ev,
        expectedCount,
        ackedCount,
        pct,
        expectedByTeam,
        ackByTeam
      });
    }

    return new Response(JSON.stringify({ ok:true, items: out }), {
      headers: { "Content-Type":"application/json" }
    });

  }catch(e){
    return new Response(JSON.stringify({ ok:false, error:String(e) }), {
      status: 500, headers: { "Content-Type":"application/json" }
    });
  }
}