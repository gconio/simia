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

function nowIso(){ return new Date().toISOString(); }

async function getCurrentScenario(env){
  const cfg = await env.DB.prepare("SELECT value FROM app_config WHERE key='currentScenarioId'").first();
  if(!cfg || !cfg.value) return null;
  return await env.DB.prepare("SELECT id,status FROM scenarios WHERE id=?1").bind(cfg.value).first();
}

export async function onRequestPost({ request, env }){
  if(!env.DB){
    return new Response(JSON.stringify({ ok:false, error:"DB binding missing" }), { status:500, headers:{ "Content-Type":"application/json" }});
  }
  try{
    await ensureSimulationStateSchema(env);
    const body = await request.json().catch(()=>({}));
    const status = String(body.status || "").trim().toLowerCase();
    if(!["running","paused","stopped"].includes(status)){
      return new Response(JSON.stringify({ ok:false, error:"invalid status" }), { status:400, headers:{ "Content-Type":"application/json" }});
    }
    await env.DB.prepare("UPDATE simulation_state SET status=?1 WHERE id=1").bind(status).run();

    const scenario = await getCurrentScenario(env);
    if(scenario){
      if(status === "stopped"){
        await env.DB.prepare("UPDATE scenarios SET status='completed', updated_at=?1 WHERE id=?2").bind(nowIso(), scenario.id).run();
      }
    }

    return new Response(JSON.stringify({ ok:true, status }), { headers:{ "Content-Type":"application/json" }});
  }catch(e){
    return new Response(JSON.stringify({ ok:false, error:String(e) }), { status:500, headers:{ "Content-Type":"application/json" }});
  }
}

export async function onRequestGet({ env }){
  if(!env.DB){
    return new Response(JSON.stringify({ ok:false, error:"DB binding missing" }), { status:500, headers:{ "Content-Type":"application/json" }});
  }
  try{
    const row = await ensureSimulationStateSchema(env);
    return new Response(JSON.stringify({ ok:true, status: row.status || "running", current_phase: row.current_phase || "PHASE-1" }), { headers:{ "Content-Type":"application/json" }});
  }catch(e){
    return new Response(JSON.stringify({ ok:false, error:String(e) }), { status:500, headers:{ "Content-Type":"application/json" }});
  }
}
