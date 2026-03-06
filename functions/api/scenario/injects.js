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
      if(!scenario_id) return new Response(JSON.stringify({ ok:true, injects:[] }), { headers:{ "Content-Type":"application/json" }});
      const rows = await env.DB.prepare(
        "SELECT id,scenario_id,phase_code,title,body,kind,source_type,severity,audience_type,audience_value,scheduled_at,status,author,created_at,released_at FROM scenario_injects WHERE scenario_id=?1 ORDER BY created_at DESC"
      ).bind(scenario_id).all();
      return new Response(JSON.stringify({ ok:true, scenario_id, injects: rows.results || [] }), { headers:{ "Content-Type":"application/json" }});
    }

    if(method === "POST"){
      const body = await request.json().catch(()=>({}));
      const sid = String(body.scenario_id || scenario_id || "").trim();
      if(!sid) return new Response(JSON.stringify({ ok:false, error:"scenario_id is required" }), { status:400, headers:{ "Content-Type":"application/json" }});
      const id = String(body.id || uuidv4()).trim();
      const phase_code = String(body.phase_code || "").trim().toUpperCase();
      const title = String(body.title || "").trim();
      const bodyText = String(body.body || "").trim();
      const kind = String(body.kind || "INJECT").trim().toUpperCase();
      const source_type = String(body.source_type || "OSINT").trim().toUpperCase();
      const severity = String(body.severity || "INFO").trim().toUpperCase();
      const audience_type = String(body.audience_type || "ALL").trim().toUpperCase();
      const audience_value = String(body.audience_value || "ALL").trim();
      const scheduled_at = String(body.scheduled_at || "").trim();
      const status = String(body.status || "draft").trim().toLowerCase();
      const author = String(body.author || "admin").trim();

      if(!title || !bodyText) return new Response(JSON.stringify({ ok:false, error:"title and body are required" }), { status:400, headers:{ "Content-Type":"application/json" }});

      await env.DB.prepare(
        "INSERT INTO scenario_injects (id,scenario_id,phase_code,title,body,kind,source_type,severity,audience_type,audience_value,scheduled_at,status,author,created_at,released_at) VALUES (?1,?2,?3,?4,?5,?6,?7,?8,?9,?10,?11,?12,?13,?14,NULL) " +
        "ON CONFLICT(id) DO UPDATE SET phase_code=excluded.phase_code, title=excluded.title, body=excluded.body, kind=excluded.kind, source_type=excluded.source_type, severity=excluded.severity, audience_type=excluded.audience_type, audience_value=excluded.audience_value, scheduled_at=excluded.scheduled_at, status=excluded.status, author=excluded.author"
      ).bind(id,sid,phase_code,title,bodyText,kind,source_type,severity,audience_type,audience_value,scheduled_at,status,author,nowIso()).run();

      await env.DB.prepare("INSERT INTO scenario_actions (id,scenario_id,inject_id,action_type,actor,notes,ts) VALUES (?1,?2,?3,?4,?5,?6,?7)")
        .bind(uuidv4(), sid, id, "inject_save", author, `Inject ${title}`, nowIso()).run();

      return new Response(JSON.stringify({ ok:true, id, scenario_id:sid }), { headers:{ "Content-Type":"application/json" }});
    }

    if(method === "DELETE"){
      const id = String(url.searchParams.get("id") || "").trim();
      if(!id) return new Response(JSON.stringify({ ok:false, error:"Missing id" }), { status:400, headers:{ "Content-Type":"application/json" }});
      await env.DB.prepare("DELETE FROM scenario_injects WHERE id=?1").bind(id).run();
      return new Response(JSON.stringify({ ok:true, id }), { headers:{ "Content-Type":"application/json" }});
    }

    return new Response(JSON.stringify({ ok:false, error:"Method not allowed" }), { status:405, headers:{ "Content-Type":"application/json" }});
  }catch(e){
    return new Response(JSON.stringify({ ok:false, error:String(e) }), { status:500, headers:{ "Content-Type":"application/json" }});
  }
}
