function uuidv4(){ if (crypto && crypto.randomUUID) return crypto.randomUUID(); return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => { const r=(Math.random()*16)|0, v=c==='x'?r:(r&0x3)|0x8; return v.toString(16); }); }
function nowIso(){ return new Date().toISOString(); }
async function getCurrentScenarioId(env){ const row = await env.DB.prepare("SELECT value FROM app_config WHERE key='currentScenarioId'").first(); return String(row?.value || '').trim(); }
async function setCurrentScenarioId(env, id){ await env.DB.prepare("INSERT OR REPLACE INTO app_config (key,value) VALUES ('currentScenarioId', ?1)").bind(String(id || '')).run(); }

export async function onRequest({ request, env }) {
  if(!env.DB) return new Response(JSON.stringify({ ok:false, error:'DB binding missing' }), { status:500, headers:{ 'Content-Type':'application/json' }});
  const url = new URL(request.url);
  const method = request.method.toUpperCase();
  try{
    if(method === 'GET'){
      const id = String(url.searchParams.get('id') || '').trim();
      const currentScenarioId = await getCurrentScenarioId(env);
      const targetId = id || currentScenarioId;
      const list = await env.DB.prepare('SELECT id,name,subtitle,description,status,current_phase,start_at,created_at,updated_at FROM scenarios ORDER BY created_at DESC').all();
      let current = null;
      if(targetId) current = await env.DB.prepare('SELECT id,name,subtitle,description,status,current_phase,start_at,created_at,updated_at FROM scenarios WHERE id=?1').bind(targetId).first();
      return new Response(JSON.stringify({ ok:true, currentScenarioId, current: current || null, scenarios: list.results || [] }), { headers:{ 'Content-Type':'application/json', 'Cache-Control':'no-store' }});
    }
    if(method === 'POST'){
      const body = await request.json().catch(()=>({}));
      const action = String(body.action || 'save').trim();
      const ts = nowIso();
      if(action === 'set_current'){
        const id = String(body.id || '').trim();
        await setCurrentScenarioId(env, id);
        return new Response(JSON.stringify({ ok:true, currentScenarioId:id }), { headers:{ 'Content-Type':'application/json' }});
      }
      if(action === 'start_live_now'){
        const id = String(body.id || await getCurrentScenarioId(env) || '').trim();
        if(!id) return new Response(JSON.stringify({ ok:false, error:'Missing scenario id' }), { status:400, headers:{ 'Content-Type':'application/json' }});
        await env.DB.prepare("UPDATE scenarios SET status='live', start_at=?1, updated_at=?1 WHERE id=?2").bind(ts, id).run();
        await env.DB.prepare("INSERT INTO scenario_actions (id,scenario_id,inject_id,action_type,actor,notes,ts) VALUES (?1,?2,NULL,'scenario_status',?3,?4,?5)").bind(uuidv4(), id, String(body.actor || 'instructor'), 'Scenario start time anchored to now (T+ base)', ts).run();
        return new Response(JSON.stringify({ ok:true, id, start_at: ts, status:'live' }), { headers:{ 'Content-Type':'application/json' }});
      }
      const id = String(body.id || uuidv4()).trim();
      const name = String(body.name || '').trim();
      const subtitle = String(body.subtitle || '').trim();
      const description = String(body.description || '').trim();
      const status = String(body.status || 'draft').trim();
      const current_phase = String(body.current_phase || '').trim();
      const start_at = String(body.start_at || '').trim();
      if(!name) return new Response(JSON.stringify({ ok:false, error:'name is required' }), { status:400, headers:{ 'Content-Type':'application/json' }});
      const existing = await env.DB.prepare('SELECT id FROM scenarios WHERE id=?1').bind(id).first();
      await env.DB.prepare("INSERT INTO scenarios (id,name,subtitle,description,status,current_phase,start_at,created_at,updated_at) VALUES (?1,?2,?3,?4,?5,?6,?7,?8,?8) ON CONFLICT(id) DO UPDATE SET name=excluded.name, subtitle=excluded.subtitle, description=excluded.description, status=excluded.status, current_phase=excluded.current_phase, start_at=excluded.start_at, updated_at=excluded.updated_at").bind(id,name,subtitle,description,status,current_phase,start_at,ts).run();
      if(body.make_current === true || body.make_current === 1 || body.make_current === '1' || !existing) await setCurrentScenarioId(env, id);
      await env.DB.prepare('INSERT INTO scenario_actions (id,scenario_id,inject_id,action_type,actor,notes,ts) VALUES (?1,?2,NULL,?3,?4,?5,?6)').bind(uuidv4(), id, existing ? 'update' : 'create', String(body.actor || 'admin'), `Scenario ${existing ? 'updated' : 'created'}`, ts).run();
      return new Response(JSON.stringify({ ok:true, id }), { headers:{ 'Content-Type':'application/json' }});
    }
    if(method === 'DELETE'){
      const id = String(url.searchParams.get('id') || '').trim();
      if(!id) return new Response(JSON.stringify({ ok:false, error:'Missing id' }), { status:400, headers:{ 'Content-Type':'application/json' }});
      await env.DB.prepare('DELETE FROM scenario_actions WHERE scenario_id=?1').bind(id).run();
      await env.DB.prepare('DELETE FROM scenario_injects WHERE scenario_id=?1').bind(id).run();
      await env.DB.prepare('DELETE FROM scenario_phases WHERE scenario_id=?1').bind(id).run();
      await env.DB.prepare('DELETE FROM scenarios WHERE id=?1').bind(id).run();
      const current = await getCurrentScenarioId(env);
      if(current === id) await setCurrentScenarioId(env, '');
      return new Response(JSON.stringify({ ok:true, id }), { headers:{ 'Content-Type':'application/json' }});
    }
    return new Response(JSON.stringify({ ok:false, error:'Method not allowed' }), { status:405, headers:{ 'Content-Type':'application/json' }});
  }catch(e){
    return new Response(JSON.stringify({ ok:false, error:String(e) }), { status:500, headers:{ 'Content-Type':'application/json' }});
  }
}
