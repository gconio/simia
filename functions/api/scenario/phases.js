function uuidv4(){ if (crypto && crypto.randomUUID) return crypto.randomUUID(); return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, c => { const r=(Math.random()*16)|0, v=c==="x"?r:(r&0x3)|0x8; return v.toString(16); }); }
function nowIso(){ return new Date().toISOString(); }
async function currentScenarioId(env){ const row = await env.DB.prepare("SELECT value FROM app_config WHERE key='currentScenarioId'").first(); return String(row?.value || "").trim(); }

export async function onRequest({ request, env }) {
  if(!env.DB) return new Response(JSON.stringify({ ok:false, error:"DB binding missing" }), { status:500, headers:{ "Content-Type":"application/json" }});
  const url = new URL(request.url);
  const method = request.method.toUpperCase();

  try{
    const scenario_id = String(url.searchParams.get("scenario_id") || await currentScenarioId(env) || "").trim();

    if(method === "GET"){
      if(!scenario_id) return new Response(JSON.stringify({ ok:true, phases:[] }), { headers:{ "Content-Type":"application/json" }});
      const rows = await env.DB.prepare("SELECT id,scenario_id,phase_code,title,description,sort_order,duration_min,status,created_at FROM scenario_phases WHERE scenario_id=?1 ORDER BY sort_order ASC, created_at ASC").bind(scenario_id).all();
      return new Response(JSON.stringify({ ok:true, scenario_id, phases: rows.results || [] }), { headers:{ "Content-Type":"application/json" }});
    }

    if(method === "POST"){
      const body = await request.json().catch(()=>({}));
      const sid = String(body.scenario_id || scenario_id || "").trim();
      if(!sid) return new Response(JSON.stringify({ ok:false, error:"scenario_id is required" }), { status:400, headers:{ "Content-Type":"application/json" }});
      const id = String(body.id || uuidv4()).trim();
      const phase_code = String(body.phase_code || "").trim().toUpperCase();
      const title = String(body.title || "").trim();
      const description = String(body.description || "").trim();
      const sort_order = Number(body.sort_order || 0);
      const duration_min = body.duration_min === "" || body.duration_min === undefined ? null : Number(body.duration_min);
      const status = String(body.status || "pending").trim();
      if(!phase_code || !title) return new Response(JSON.stringify({ ok:false, error:"phase_code and title are required" }), { status:400, headers:{ "Content-Type":"application/json" }});

      await env.DB.prepare(
        "INSERT INTO scenario_phases (id,scenario_id,phase_code,title,description,sort_order,duration_min,status,created_at) VALUES (?1,?2,?3,?4,?5,?6,?7,?8,?9) " +
        "ON CONFLICT(id) DO UPDATE SET phase_code=excluded.phase_code, title=excluded.title, description=excluded.description, sort_order=excluded.sort_order, duration_min=excluded.duration_min, status=excluded.status"
      ).bind(id,sid,phase_code,title,description,sort_order,duration_min,status,nowIso()).run();

      if(status === "active"){
        await env.DB.prepare("UPDATE scenario_phases SET status='pending' WHERE scenario_id=?1 AND id<>?2 AND status='active'").bind(sid, id).run();
        await env.DB.prepare("UPDATE scenarios SET current_phase=?1, updated_at=?2 WHERE id=?3").bind(phase_code, nowIso(), sid).run();
      }

      return new Response(JSON.stringify({ ok:true, id, scenario_id:sid }), { headers:{ "Content-Type":"application/json" }});
    }

    if(method === "DELETE"){
      const id = String(url.searchParams.get("id") || "").trim();
      if(!id) return new Response(JSON.stringify({ ok:false, error:"Missing id" }), { status:400, headers:{ "Content-Type":"application/json" }});
      await env.DB.prepare("DELETE FROM scenario_phases WHERE id=?1").bind(id).run();
      return new Response(JSON.stringify({ ok:true, id }), { headers:{ "Content-Type":"application/json" }});
    }

    return new Response(JSON.stringify({ ok:false, error:"Method not allowed" }), { status:405, headers:{ "Content-Type":"application/json" }});
  }catch(e){
    return new Response(JSON.stringify({ ok:false, error:String(e) }), { status:500, headers:{ "Content-Type":"application/json" }});
  }
}
