function uuidv4() {
  if (crypto && crypto.randomUUID) return crypto.randomUUID();
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, c => {
    const r = (Math.random()*16)|0, v = c === "x" ? r : (r&0x3)|0x8;
    return v.toString(16);
  });
}
function norm(s){ return String(s || "").trim().toUpperCase(); }
function genCode(){ return String(Math.floor(100000 + Math.random()*900000)); }

export async function onRequest({ request, env }) {
  const url = new URL(request.url);
  const method = request.method.toUpperCase();
  if (!env.DB) {
    return new Response(JSON.stringify({ ok:false, error:"DB binding missing" }), {
      status: 500, headers: { "Content-Type":"application/json" }
    });
  }
  try {
    if (method === "GET") {
      const id = String(url.searchParams.get("id") || "").trim();
      if (id) {
        const row = await env.DB.prepare(
          "SELECT id, name, email, role, team_id, created_at, access_code, is_active FROM participants WHERE id=?1"
        ).bind(id).first();
        return new Response(JSON.stringify({ ok:true, participant: row || null }), {
          headers: { "Content-Type":"application/json" }
        });
      }
      const rows = await env.DB.prepare(
        "SELECT id, name, email, role, team_id, created_at, access_code, is_active FROM participants ORDER BY created_at DESC"
      ).all();
      return new Response(JSON.stringify({ ok:true, participants: rows.results || [] }), {
        headers: { "Content-Type":"application/json" }
      });
    }
    if (method === "POST") {
      const body = await request.json().catch(()=>null);
      if(!body || typeof body !== "object"){
        return new Response(JSON.stringify({ ok:false, error:"Invalid JSON body" }), {
          status: 400, headers: { "Content-Type":"application/json" }
        });
      }
      const id = String(body.id || uuidv4()).trim();
      const name = String(body.name || "").trim();
      const email = String(body.email || "").trim();
      const role = norm(body.role || "PLAYER");
      let team_id = norm(body.team_id || "ALL");
      const created_at = new Date().toISOString();
      const access_code = String(body.access_code || genCode()).trim();
      const is_active = (body.is_active === 0 || body.is_active === "0" || body.is_active === false) ? 0 : 1;
      if(!name){
        return new Response(JSON.stringify({ ok:false, error:"name is required" }), {
          status: 400, headers: { "Content-Type":"application/json" }
        });
      }

      let roleRow = null;
      try{
        roleRow = await env.DB.prepare("SELECT code, can_have_team, is_active FROM roles WHERE code=?1").bind(role).first();
      }catch(e){}
      const fallbackRoles = ["ADMIN","INSTRUCTOR","PLAYER","OBSERVER"];
      if(roleRow){
        if(Number(roleRow.is_active) !== 1){
          return new Response(JSON.stringify({ ok:false, error:"Role is disabled" }), {
            status:400, headers:{ "Content-Type":"application/json" }
          });
        }
        if(Number(roleRow.can_have_team) !== 1) team_id = "ALL";
      }else if(!fallbackRoles.includes(role)){
        return new Response(JSON.stringify({ ok:false, error:"Invalid role" }), {
          status: 400, headers: { "Content-Type":"application/json" }
        });
      }else{
        if(role !== "PLAYER") team_id = "ALL";
      }

      await env.DB.prepare(
        "INSERT INTO participants (id,name,email,role,team_id,created_at,access_code,is_active) VALUES (?1,?2,?3,?4,?5,?6,?7,?8)\n" +
        "ON CONFLICT(id) DO UPDATE SET name=excluded.name, email=excluded.email, role=excluded.role, team_id=excluded.team_id, access_code=excluded.access_code, is_active=excluded.is_active"
      ).bind(id, name, email, role, team_id, created_at, access_code, is_active).run();
      return new Response(JSON.stringify({ ok:true, id, role, team_id, access_code, is_active }), {
        headers: { "Content-Type":"application/json" }
      });
    }
    if (method === "DELETE") {
      const id = String(url.searchParams.get("id") || "").trim();
      if(!id){
        return new Response(JSON.stringify({ ok:false, error:"Missing id" }), {
          status: 400, headers: { "Content-Type":"application/json" }
        });
      }
      await env.DB.prepare("DELETE FROM participants WHERE id=?1").bind(id).run();
      return new Response(JSON.stringify({ ok:true, id }), {
        headers: { "Content-Type":"application/json" }
      });
    }
    return new Response(JSON.stringify({ ok:false, error:"Method not allowed" }), {
      status: 405, headers: { "Content-Type":"application/json" }
    });
  } catch(e){
    return new Response(JSON.stringify({ ok:false, error:String(e) }), {
      status: 500, headers: { "Content-Type":"application/json" }
    });
  }
}
