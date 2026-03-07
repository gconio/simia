function uuidv4(){ if (crypto && crypto.randomUUID) return crypto.randomUUID(); return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, c => { const r=(Math.random()*16)|0, v=c==="x"?r:(r&0x3)|0x8; return v.toString(16); }); }
function nowIso(){ return new Date().toISOString(); }

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
    event_id,
    ts,
    String(injectRow.kind || "INJECT").toUpperCase(),
    injectRow.phase_code || null,
    audience,
    injectRow.title || "",
    injectRow.body || "",
    String(injectRow.severity || "INFO").toUpperCase(),
    injectRow.author || "scheduler",
    1
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
  const diff = Date.now() - startMs;
  return Math.floor(diff / 60000);
}

async function getCurrentScenario(env){
  const cfg = await env.DB.prepare("SELECT value FROM app_config WHERE key='currentScenarioId'").first();
  if(!cfg || !cfg.value) return null;
  const sc = await env.DB.prepare(
    "SELECT id,name,status,current_phase,start_at FROM scenarios WHERE id=?1"
  ).bind(cfg.value).first();
  return sc || null;
}

export async function onRequestPost({ env }) {
  if(!env.DB){
    return new Response(JSON.stringify({ ok:false, error:"DB binding missing" }), { status:500, headers:{ "Content-Type":"application/json" }});
  }

  try{
    const scenario = await getCurrentScenario(env);
    if(!scenario){
      return new Response(JSON.stringify({ ok:false, error:"No current scenario configured" }), { status:400, headers:{ "Content-Type":"application/json" }});
    }

    const status = String(scenario.status || "").toLowerCase();
    if(status !== "live"){
      return new Response(JSON.stringify({ ok:false, error:"Current scenario is not live" }), { status:400, headers:{ "Content-Type":"application/json" }});
    }

    const elapsed = elapsedMinutes(scenario.start_at);
    if(elapsed === null){
      return new Response(JSON.stringify({ ok:false, error:"Scenario start_at is missing or invalid" }), { status:400, headers:{ "Content-Type":"application/json" }});
    }

    const rows = await env.DB.prepare(
      `SELECT id,scenario_id,phase_code,title,body,kind,source_type,severity,audience_type,audience_value,
              release_offset_min,status,author
       FROM scenario_injects
       WHERE scenario_id=?1
         AND status IN ('scheduled','queued')
         AND COALESCE(release_offset_min,0) <= ?2
       ORDER BY release_offset_min ASC, created_at ASC`
    ).bind(scenario.id, elapsed).all();

    const due = rows.results || [];
    const released = [];

    for(const inject of due){
      const published = await publishInjectAsEvent(env, inject);

      await env.DB.prepare(
        "UPDATE scenario_injects SET status='released', released_at=?1 WHERE id=?2"
      ).bind(nowIso(), inject.id).run();

      await writeAction(
        env,
        inject.scenario_id,
        inject.id,
        "auto_release",
        "scheduler",
        `Activation "${inject.title}" auto-released at T+${inject.release_offset_min} and published as event ${published.event_id} to ${published.audience}`
      );

      released.push({
        inject_id: inject.id,
        title: inject.title,
        phase_code: inject.phase_code,
        release_offset_min: inject.release_offset_min,
        event_id: published.event_id,
        audience: published.audience
      });
    }

    return new Response(JSON.stringify({
      ok:true,
      scenario_id: scenario.id,
      scenario_status: scenario.status,
      start_at: scenario.start_at,
      elapsed_min: elapsed,
      released_count: released.length,
      released
    }), { headers:{ "Content-Type":"application/json" }});
  }catch(e){
    return new Response(JSON.stringify({ ok:false, error:String(e) }), { status:500, headers:{ "Content-Type":"application/json" }});
  }
}
