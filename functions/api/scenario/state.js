function normPhase(s){
  const v = String(s || "").trim().toUpperCase();
  if(!v) return "PHASE-1";
  // accetta PHASE-1, PHASE-2, PHASE-3... oppure stringhe custom
  return v;
}

export async function onRequestGet({ env }) {
  if(!env.DB){
    return new Response(JSON.stringify({ ok:false, error:"DB binding missing" }), {
      status: 500, headers: { "Content-Type":"application/json" }
    });
  }

  try{
    const row = await env.DB.prepare(
      "SELECT current_phase FROM simulation_state WHERE id=1"
    ).first();

    const current_phase = row?.current_phase || "PHASE-1";

    return new Response(JSON.stringify({ ok:true, current_phase }), {
      headers: { "Content-Type":"application/json" }
    });
  } catch(e){
    return new Response(JSON.stringify({ ok:false, error:String(e) }), {
      status: 500, headers: { "Content-Type":"application/json" }
    });
  }
}

export async function onRequestPost({ request, env }) {
  if(!env.DB){
    return new Response(JSON.stringify({ ok:false, error:"DB binding missing" }), {
      status: 500, headers: { "Content-Type":"application/json" }
    });
  }

  try{
    const body = await request.json().catch(()=>null);
    const next = normPhase(body?.current_phase);

    await env.DB.prepare(
      "UPDATE simulation_state SET current_phase=?1 WHERE id=1"
    ).bind(next).run();

    return new Response(JSON.stringify({ ok:true, current_phase: next }), {
      headers: { "Content-Type":"application/json" }
    });
  } catch(e){
    return new Response(JSON.stringify({ ok:false, error:String(e) }), {
      status: 500, headers: { "Content-Type":"application/json" }
    });
  }
}