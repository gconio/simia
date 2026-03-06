export async function onRequestPost({ request, env }) {
  if (!env.DB) {
    return new Response(JSON.stringify({ ok:false, error:"DB binding missing" }), {
      status:500, headers:{ "Content-Type":"application/json" }
    });
  }
  try{
    const body = await request.json().catch(()=>({}));
    const pid = String(body.pid || "").trim();
    const access_code = String(body.access_code || "").trim();
    if(!pid || !access_code){
      return new Response(JSON.stringify({ ok:false, error:"pid and access_code are required" }), {
        status:400, headers:{ "Content-Type":"application/json" }
      });
    }
    const p = await env.DB.prepare(
      "SELECT id, name, role, team_id, is_active FROM participants WHERE id=?1 AND access_code=?2"
    ).bind(pid, access_code).first();
    if(!p){
      return new Response(JSON.stringify({ ok:false, error:"Invalid credentials" }), {
        status:401, headers:{ "Content-Type":"application/json" }
      });
    }
    if(Number(p.is_active) !== 1){
      return new Response(JSON.stringify({ ok:false, error:"Participant disabled" }), {
        status:403, headers:{ "Content-Type":"application/json" }
      });
    }
    let destination_page = null;
    try{
      const roleRow = await env.DB.prepare("SELECT destination_page FROM roles WHERE code=?1 AND is_active=1").bind(String(p.role || "").toUpperCase()).first();
      destination_page = roleRow?.destination_page || null;
    }catch(e){}
    return new Response(JSON.stringify({ ok:true, participant:p, destination_page }), {
      headers:{ "Content-Type":"application/json" }
    });
  }catch(e){
    return new Response(JSON.stringify({ ok:false, error:String(e) }), {
      status:500, headers:{ "Content-Type":"application/json" }
    });
  }
}
