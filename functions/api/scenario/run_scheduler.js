function uuidv4(){ if (crypto && crypto.randomUUID) return crypto.randomUUID(); return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, c => { const r=(Math.random()*16)|0, v=c==="x"?r:(r&0x3)|0x8; return v.toString(16); }); }
function nowIso(){ return new Date().toISOString(); }

async function ensureSimulationStateSchema(env){
  const info = await env.DB.prepare("PRAGMA table_info(simulation_state)").all();
  const cols = (info.results || []).map(r => String(r.name || "").toLowerCase());
  if(!cols.includes("status")){
    await env.DB.prepare("ALTER TABLE simulation_state ADD COLUMN status TEXT DEFAULT 'running'").run();
  }
  const row = await env.DB.prepare("SELECT id,current_phase,status FROM simulation_state WHERE id=1").first();
  if(!row){
    await env.DB.prepare("INSERT INTO simulation_state (id,current_phase,status) VALUES (1,?1,'running')").bind("PHASE-1").run();
    return { id:1, current_phase:"PHASE-1", status:"running" };
  }
  if(!row.status){
    await env.DB.prepare("UPDATE simulation_state SET status='running' WHERE id=1").run();
    return { ...row, status:"running" };
  }
  return row;
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
     VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10)`
  ).bind(
    event_id, ts, String(injectRow.kind || "INJECT").toUpperCase(), injectRow.phase_code || null,
    audience, injectRow.title || "", injectRow.body || "", String(injectRow.severity || "INFO").toUpperCase(),
    injectRow.author || "scheduler", 1
  ).run();

  return { event_id, ts, audience };
}

async function writeAction(env, scenario_id, inject_id, action_type, actor, notes){
  await env.DB.prepare(
    "INSERT INTO scenario_actions (id,scenario_id,inject_id,action_type,actor,notes,ts) VALUES (?1,?2,?3,?4,?5,?6,?7)"
  ).bind(uuidv4(), scenario_id, inject_id, action_type, actor, notes, nowIso()).run();
}

function elapsedMinutes(startAt){
  const startMs = Date.parse(startAt || "");
  if(!Number.isFinite(startMs)) return null;
  return Math.floor((Date.now() - startMs) / 60000);
}

async function getCurrentScenario(env){
  const cfg = await env.DB.prepare("SELECT value FROM app_config WHERE key='currentScenarioId'").first();
  if(!cfg || !cfg.value) return null;
  return await env.DB.prepare("SELECT id,name,status,current_phase,start_at FROM scenarios WHERE id=?1").bind(cfg.value).first();
}

async function getPhaseWindows(env, scenario_id){
  const res = await env.DB.prepare("SELECT id,phase_code,title,sort_order,duration_min,status FROM scenario_phases WHERE scenario_id=?1 ORDER BY sort_order ASC, created_at ASC").bind(scenario_id).all();
  const phases = res.results || [];
  let cursor = 0;
  return phases.map(p => {
    const dur = Number(p.duration_min || 0);
    const start = cursor;
    const end = dur > 0 ? cursor + dur : Number.POSITIVE_INFINITY;
    if (Number.isFinite(end)) cursor = end;
    return { id:p.id, phase_code:p.phase_code, title:p.title, sort_order:p.sort_order, duration_min:p.duration_min, status:p.status, start_offset:start, end_offset:end };
  });
}

async function updatePhaseProgression(env, scenario, elapsed){
  const windows = await getPhaseWindows(env, scenario.id);
  if(!windows.length) return { current_phase: scenario.current_phase || null, updated: 0 };
  let active = null;
  for(const w of windows){ if(elapsed >= w.start_offset && elapsed < w.end_offset){ active = w.phase_code; break; } }
  if(!active) active = windows[windows.length - 1].phase_code;

  let updated = 0;
  for(const w of windows){
    let nextStatus = "pending";
    if(elapsed >= w.end_offset) nextStatus = "closed";
    else if(elapsed >= w.start_offset && elapsed < w.end_offset) nextStatus = "active";
    if(String(w.status || "") !== nextStatus){
      await env.DB.prepare("UPDATE scenario_phases SET status=?1 WHERE id=?2").bind(nextStatus, w.id).run();
      updated += 1;
    }
  }
  if(String(scenario.current_phase || "") !== String(active || "")){
    await env.DB.prepare("UPDATE scenarios SET current_phase=?1, updated_at=?2 WHERE id=?3").bind(active, nowIso(), scenario.id).run();
    updated += 1;
  }
  await env.DB.prepare("UPDATE simulation_state SET current_phase=?1 WHERE id=1").bind(active).run();
  updated += 1;
  return { current_phase: active, updated };
}

export async function onRequestPost({ env }) {
  if(!env.DB){
    return new Response(JSON.stringify({ ok:false, error:"DB binding missing" }), { status:500, headers:{ "Content-Type":"application/json" }});
  }
  try{
    const simState = await ensureSimulationStateSchema(env);
    const simStatus = String(simState.status || "running").toLowerCase();
    if(simStatus !== "running"){
      return new Response(JSON.stringify({ ok:true, message:"scheduler paused", simulation_status:simStatus, released_count:0 }), { headers:{ "Content-Type":"application/json" }});
    }

    const scenario = await getCurrentScenario(env);
    if(!scenario) return new Response(JSON.stringify({ ok:false, error:"No current scenario configured" }), { status:400, headers:{ "Content-Type":"application/json" }});
    if(String(scenario.status || "").toLowerCase() !== "live") return new Response(JSON.stringify({ ok:false, error:"Current scenario is not live" }), { status:400, headers:{ "Content-Type":"application/json" }});

    const elapsed = elapsedMinutes(scenario.start_at);
    if(elapsed === null) return new Response(JSON.stringify({ ok:false, error:"Scenario start_at is missing or invalid" }), { status:400, headers:{ "Content-Type":"application/json" }});

    const phaseUpdate = await updatePhaseProgression(env, scenario, elapsed);

    const rows = await env.DB.prepare(
      `SELECT id,scenario_id,phase_code,title,body,kind,source_type,severity,audience_type,audience_value,release_offset_min,status,author
       FROM scenario_injects WHERE scenario_id=?1 AND status IN ('scheduled','queued') AND COALESCE(release_offset_min,0) <= ?2
       ORDER BY release_offset_min ASC, created_at ASC`
    ).bind(scenario.id, elapsed).all();

    const due = rows.results || [];
    const released = [];
    for(const inject of due){
      const published = await publishInjectAsEvent(env, inject);
      await env.DB.prepare("UPDATE scenario_injects SET status='released', released_at=?1 WHERE id=?2").bind(nowIso(), inject.id).run();
      await writeAction(env, inject.scenario_id, inject.id, "auto_release", "scheduler", `Activation "${inject.title}" auto-released at T+${inject.release_offset_min} and published as event ${published.event_id} to ${published.audience}`);
      released.push({ inject_id: inject.id, title: inject.title, phase_code: inject.phase_code, release_offset_min: inject.release_offset_min, event_id: published.event_id, audience: published.audience });
    }

    return new Response(JSON.stringify({ ok:true, scenario_id: scenario.id, simulation_status:"running", start_at: scenario.start_at, elapsed_min: elapsed, current_phase: phaseUpdate.current_phase, phase_updates: phaseUpdate.updated, released_count: released.length, released }), { headers:{ "Content-Type":"application/json" }});
  }catch(e){
    return new Response(JSON.stringify({ ok:false, error:String(e) }), { status:500, headers:{ "Content-Type":"application/json" }});
  }
}
