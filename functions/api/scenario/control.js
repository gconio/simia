function uuidv4(){ if (crypto && crypto.randomUUID) return crypto.randomUUID(); return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, c => { const r=(Math.random()*16)|0, v=c==="x"?r:(r&0x3)|0x8; return v.toString(16); }); }
function nowIso(){ return new Date().toISOString(); }

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

    const current = await env.DB.prepare(
      "SELECT id,scenario_id,title,phase_code,audience_type,audience_value,release_offset_min,status FROM scenario_injects WHERE id=?1"
    ).bind(inject_id).first();

    if(!current){
      return new Response(JSON.stringify({ ok:false, error:"Inject not found" }), { status:404, headers:{ "Content-Type":"application/json" }});
    }

    const ts = nowIso();

    if(action === "release_now"){
      await env.DB.prepare(
        "UPDATE scenario_injects SET status='released', released_at=?1 WHERE id=?2"
      ).bind(ts, inject_id).run();

      await env.DB.prepare(
        "INSERT INTO scenario_actions (id,scenario_id,inject_id,action_type,actor,notes,ts) VALUES (?1,?2,?3,'release',?4,?5,?6)"
      ).bind(uuidv4(), current.scenario_id, inject_id, actor, `Activation "${current.title}" released immediately`, ts).run();

      return new Response(JSON.stringify({ ok:true, inject_id, action, released_at: ts }), { headers:{ "Content-Type":"application/json" }});
    }

    if(action === "delay"){
      const delay_min = Number(body.delay_min || 0);
      await env.DB.prepare(
        "UPDATE scenario_injects SET release_offset_min=COALESCE(release_offset_min,0)+?1, status=CASE WHEN status='released' THEN status ELSE 'scheduled' END WHERE id=?2"
      ).bind(delay_min, inject_id).run();

      await env.DB.prepare(
        "INSERT INTO scenario_actions (id,scenario_id,inject_id,action_type,actor,notes,ts) VALUES (?1,?2,?3,'postpone',?4,?5,?6)"
      ).bind(uuidv4(), current.scenario_id, inject_id, actor, `Activation "${current.title}" delayed by +${delay_min} min`, ts).run();

      return new Response(JSON.stringify({ ok:true, inject_id, action, delay_min }), { headers:{ "Content-Type":"application/json" }});
    }

    if(action === "cancel"){
      await env.DB.prepare(
        "UPDATE scenario_injects SET status='cancelled' WHERE id=?1"
      ).bind(inject_id).run();

      await env.DB.prepare(
        "INSERT INTO scenario_actions (id,scenario_id,inject_id,action_type,actor,notes,ts) VALUES (?1,?2,?3,'cancel',?4,?5,?6)"
      ).bind(uuidv4(), current.scenario_id, inject_id, actor, `Activation "${current.title}" cancelled`, ts).run();

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

      await env.DB.prepare(
        "INSERT INTO scenario_actions (id,scenario_id,inject_id,action_type,actor,notes,ts) VALUES (?1,?2,?3,'retarget',?4,?5,?6)"
      ).bind(uuidv4(), current.scenario_id, inject_id, actor, `Activation "${current.title}" retargeted to ${audience_type}:${audience_value}`, ts).run();

      return new Response(JSON.stringify({ ok:true, inject_id, action, audience_type, audience_value }), { headers:{ "Content-Type":"application/json" }});
    }

    return new Response(JSON.stringify({ ok:false, error:"Unsupported action" }), { status:400, headers:{ "Content-Type":"application/json" }});
  }catch(e){
    return new Response(JSON.stringify({ ok:false, error:String(e) }), { status:500, headers:{ "Content-Type":"application/json" }});
  }
}
