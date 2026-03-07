function uuidv4(){ if (crypto && crypto.randomUUID) return crypto.randomUUID(); return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, c => { const r=(Math.random()*16)|0, v=c==="x"?r:(r&0x3)|0x8; return v.toString(16); }); }
function nowIso(){ return new Date().toISOString(); }

async function getInject(env, inject_id){
  return await env.DB.prepare(
    "SELECT id,scenario_id,title,phase_code,body,kind,source_type,severity,audience_type,audience_value,release_offset_min,status,author FROM scenario_injects WHERE id=?1"
  ).bind(inject_id).first();
}

async function getPhases(env, scenario_id){
  const rows = await env.DB.prepare(
    "SELECT id,phase_code,title,sort_order,duration_min,status FROM scenario_phases WHERE scenario_id=?1 ORDER BY sort_order ASC, created_at ASC"
  ).bind(scenario_id).all();
  return rows.results || [];
}

function buildPhaseWindows(phases){
  let cursor = 0;
  const map = {};
  for(const p of phases){
    const duration = Number(p.duration_min || 0);
    const start = cursor;
    const end = duration > 0 ? cursor + duration : Number.POSITIVE_INFINITY;
    map[String(p.phase_code || "")] = {
      phase_code: String(p.phase_code || ""),
      title: String(p.title || ""),
      start_offset: start,
      end_offset: end,
      duration_min: duration
    };
    if(Number.isFinite(end)) cursor = end;
  }
  return map;
}

function audienceToFeedValue(audience_type, audience_value){
  const t = String(audience_type || "ALL").trim().toUpperCase();
  const v = String(audience_value || "ALL").trim().toUpperCase();
  if(t === "ALL") return "ALL";
  if(t === "TEAM") return "TEAM:" + (v || "ALL");
  if(t === "ROLE") return "ROLE:" + (v || "PLAYER");
  if(t === "USER") return "USER:" + v;
  return "ALL";
}

async function publishInjectAsEvent(env, injectRow){
  const event_id = uuidv4();
  const ts = nowIso();
  const audience = audienceToFeedValue(injectRow.audience_type, injectRow.audience_value);

  await env.DB.prepare(
    `INSERT INTO events
     (id, ts, kind, phase, audience, title, body, severity, author, is_published)
     VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, 1)`
  ).bind(
    event_id,
    ts,
    String(injectRow.kind || "INJECT").toUpperCase(),
    injectRow.phase_code || null,
    audience,
    injectRow.title || "",
    injectRow.body || "",
    String(injectRow.severity || "INFO").toUpperCase(),
    injectRow.author || "white-cell",
    1
  ).run();

  return { event_id, ts, audience };
}

async function findClampOffset(env, scenario_id, inject_id, phase_code, phaseWindow){
  if(!phaseWindow || !Number.isFinite(phaseWindow.end_offset)) return null;
  const others = await env.DB.prepare(
    "SELECT id, release_offset_min FROM scenario_injects WHERE scenario_id=?1 AND phase_code=?2 AND id<>?3 ORDER BY release_offset_min DESC"
  ).bind(scenario_id, phase_code, inject_id).all();
  const valid = (others.results || [])
    .map(r => Number(r.release_offset_min || 0))
    .filter(v => v >= phaseWindow.start_offset && v < phaseWindow.end_offset);
  if(valid.length) return Math.max(...valid);
  return Math.max(phaseWindow.start_offset, phaseWindow.end_offset - 1);
}

async function clampOffsetIfNeeded(env, injectRow, proposedOffset){
  const phases = await getPhases(env, injectRow.scenario_id);
  const windows = buildPhaseWindows(phases);
  const w = windows[String(injectRow.phase_code || "")];
  const n = Number(proposedOffset || 0);
  if(!w || !Number.isFinite(w.end_offset)) return { finalOffset:n, clamped:false, note:"" };
  if(n >= w.start_offset && n < w.end_offset) return { finalOffset:n, clamped:false, note:"" };
  const clampOffset = await findClampOffset(env, injectRow.scenario_id, injectRow.id, injectRow.phase_code, w);
  return {
    finalOffset: clampOffset,
    clamped: true,
    note: `Activation "${injectRow.title}" clamped to T+${clampOffset} to remain within ${injectRow.phase_code}`
  };
}

async function writeAction(env, scenario_id, inject_id, action_type, actor, notes){
  await env.DB.prepare(
    "INSERT INTO scenario_actions (id,scenario_id,inject_id,action_type,actor,notes,ts) VALUES (?1,?2,?3,?4,?5,?6,?7)"
  ).bind(uuidv4(), scenario_id, inject_id, action_type, actor, notes, nowIso()).run();
}

export async function onRequestPost({ request, env }) {
  if(!env.DB){
    return new Response(JSON.stringify({ ok:false, error:"DB binding missing" }), { status:500, headers:{ "Content-Type":"application/json" }});
  }

  try{
    const body = await request.json().catch(()=>({}));
    const action = String(body.action || "").trim().toLowerCase();
    const inject_id = String(body.inject_id || "").trim();
    const actor = String(body.actor || "white-cell").trim();

    if(!action || !inject_id){
      return new Response(JSON.stringify({ ok:false, error:"action and inject_id are required" }), { status:400, headers:{ "Content-Type":"application/json" }});
    }

    const current = await getInject(env, inject_id);
    if(!current){
      return new Response(JSON.stringify({ ok:false, error:"Inject not found" }), { status:404, headers:{ "Content-Type":"application/json" }});
    }

    const ts = nowIso();

    if(action === "release_now"){
      const published = await publishInjectAsEvent(env, current);

      await env.DB.prepare(
        "UPDATE scenario_injects SET status='released', released_at=?1 WHERE id=?2"
      ).bind(ts, inject_id).run();

      await writeAction(
        env,
        current.scenario_id,
        inject_id,
        "release",
        actor,
        `Activation "${current.title}" released immediately and published as event ${published.event_id} to ${published.audience}`
      );

      return new Response(JSON.stringify({
        ok:true,
        inject_id,
        action,
        released_at: ts,
        event_id: published.event_id,
        audience: published.audience
      }), { headers:{ "Content-Type":"application/json" }});
    }

    if(action === "delay"){
      const delay_min = Number(body.delay_min || 0);
      const result = await clampOffsetIfNeeded(env, current, Number(current.release_offset_min || 0) + delay_min);

      await env.DB.prepare(
        "UPDATE scenario_injects SET release_offset_min=?1, status=CASE WHEN status='released' THEN status ELSE 'scheduled' END WHERE id=?2"
      ).bind(result.finalOffset, inject_id).run();

      await writeAction(
        env,
        current.scenario_id,
        inject_id,
        result.clamped ? "phase_clamp" : "postpone",
        actor,
        result.clamped ? result.note : `Activation "${current.title}" delayed by +${delay_min} min`
      );

      return new Response(JSON.stringify({
        ok:true,
        inject_id,
        action,
        delay_min,
        final_offset: result.finalOffset,
        clamped: result.clamped
      }), { headers:{ "Content-Type":"application/json" }});
    }

    if(action === "shift_subsequent"){
      const delay_min = Number(body.delay_min || 0);
      const rows = await env.DB.prepare(
        "SELECT id,scenario_id,title,phase_code,release_offset_min,status FROM scenario_injects WHERE scenario_id=?1 AND COALESCE(release_offset_min,0) >= ?2 ORDER BY release_offset_min ASC"
      ).bind(current.scenario_id, Number(current.release_offset_min || 0)).all();

      const affected = (rows.results || []).filter(r => !["released","cancelled"].includes(String(r.status || "").toLowerCase()));
      let shifted = 0;
      let clamped = 0;

      for(const row of affected){
        const result = await clampOffsetIfNeeded(env, row, Number(row.release_offset_min || 0) + delay_min);
        await env.DB.prepare(
          "UPDATE scenario_injects SET release_offset_min=?1, status=CASE WHEN status='released' THEN status ELSE 'scheduled' END WHERE id=?2"
        ).bind(result.finalOffset, row.id).run();
        shifted += 1;
        if(result.clamped){
          clamped += 1;
          await writeAction(env, row.scenario_id, row.id, "phase_clamp", actor, result.note);
        }
      }

      await writeAction(
        env,
        current.scenario_id,
        inject_id,
        "timeline_shift",
        actor,
        `Timeline shifted from "${current.title}" by +${delay_min} min. Affected: ${shifted}. Clamped: ${clamped}.`
      );

      return new Response(JSON.stringify({
        ok:true,
        inject_id,
        action,
        delay_min,
        shifted,
        clamped
      }), { headers:{ "Content-Type":"application/json" }});
    }

    if(action === "cancel"){
      await env.DB.prepare(
        "UPDATE scenario_injects SET status='cancelled' WHERE id=?1"
      ).bind(inject_id).run();

      await writeAction(env, current.scenario_id, inject_id, "cancel", actor, `Activation "${current.title}" cancelled`);
      return new Response(JSON.stringify({ ok:true, inject_id, action }), { headers:{ "Content-Type":"application/json" }});
    }

    if(action === "retarget"){
      const audience_type = String(body.audience_type || "").trim().toUpperCase();
      const audience_value = String(body.audience_value || "").trim();
      if(!audience_type || !audience_value){
        return new Response(JSON.stringify({ ok:false, error:"audience_type and audience_value are required for retarget" }), { status:400, headers:{ "Content-Type":"application/json" }});
      }

      await env.DB.prepare(
        "UPDATE scenario_injects SET audience_type=?1, audience_value=?2 WHERE id=?3"
      ).bind(audience_type, audience_value, inject_id).run();

      await writeAction(
        env,
        current.scenario_id,
        inject_id,
        "retarget",
        actor,
        `Activation "${current.title}" retargeted to ${audience_type}:${audience_value}`
      );

      return new Response(JSON.stringify({ ok:true, inject_id, action, audience_type, audience_value }), { headers:{ "Content-Type":"application/json" }});
    }

    return new Response(JSON.stringify({ ok:false, error:"Unsupported action" }), { status:400, headers:{ "Content-Type":"application/json" }});
  }catch(e){
    return new Response(JSON.stringify({ ok:false, error:String(e) }), { status:500, headers:{ "Content-Type":"application/json" }});
  }
}
