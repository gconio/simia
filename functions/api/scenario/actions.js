async function currentScenarioId(env){ const row = await env.DB.prepare("SELECT value FROM app_config WHERE key='currentScenarioId'").first(); return String(row?.value || "").trim(); }

export async function onRequestGet({ request, env }) {
  if(!env.DB) return new Response(JSON.stringify({ ok:false, error:"DB binding missing" }), { status:500, headers:{ "Content-Type":"application/json" }});
  try{
    const url = new URL(request.url);
    const scenario_id = String(url.searchParams.get("scenario_id") || await currentScenarioId(env) || "").trim();
    const limit = Math.max(1, Math.min(100, Number(url.searchParams.get("limit") || 50)));
    if(!scenario_id) return new Response(JSON.stringify({ ok:true, actions:[] }), { headers:{ "Content-Type":"application/json" }});
    const rows = await env.DB.prepare("SELECT id,scenario_id,inject_id,action_type,actor,notes,ts FROM scenario_actions WHERE scenario_id=?1 ORDER BY ts DESC LIMIT ?2").bind(scenario_id, limit).all();
    return new Response(JSON.stringify({ ok:true, scenario_id, actions: rows.results || [] }), { headers:{ "Content-Type":"application/json" }});
  }catch(e){
    return new Response(JSON.stringify({ ok:false, error:String(e) }), { status:500, headers:{ "Content-Type":"application/json" }});
  }
}
