function norm(s){ return String(s || "").trim().toUpperCase(); }

export async function onRequest({ request, env }) {
  if(!env.DB){
    return new Response(JSON.stringify({ ok:false, error:"DB binding missing" }), {
      status:500, headers:{ "Content-Type":"application/json" }
    });
  }
  const url = new URL(request.url);
  const method = request.method.toUpperCase();
  try{
    if(method === "GET"){
      const code = norm(url.searchParams.get("code") || "");
      if(code){
        const role = await env.DB.prepare(
          "SELECT code,name,description,destination_page,can_have_team,is_system,is_active FROM roles WHERE code=?1"
        ).bind(code).first();
        return new Response(JSON.stringify({ ok:true, role: role || null }), {
          headers:{ "Content-Type":"application/json" }
        });
      }
      const { results } = await env.DB.prepare(
        "SELECT code,name,description,destination_page,can_have_team,is_system,is_active FROM roles ORDER BY is_system DESC, code ASC"
      ).all();
      return new Response(JSON.stringify({ ok:true, roles: results || [] }), {
        headers:{ "Content-Type":"application/json" }
      });
    }
    if(method === "POST"){
      const body = await request.json().catch(()=>({}));
      const code = norm(body.code || "");
      const name = String(body.name || "").trim();
      const description = String(body.description || "").trim();
      const destination_page = String(body.destination_page || "").trim() || "/player.html";
      const can_have_team = (body.can_have_team === 1 || body.can_have_team === "1" || body.can_have_team === true) ? 1 : 0;
      const is_system = (body.is_system === 1 || body.is_system === "1" || body.is_system === true) ? 1 : 0;
      const is_active = (body.is_active === 0 || body.is_active === "0" || body.is_active === false) ? 0 : 1;
      if(!code || !name){
        return new Response(JSON.stringify({ ok:false, error:"code and name are required" }), {
          status:400, headers:{ "Content-Type":"application/json" }
        });
      }
      await env.DB.prepare(
        `INSERT INTO roles (code,name,description,destination_page,can_have_team,is_system,is_active)
         VALUES (?1,?2,?3,?4,?5,?6,?7)
         ON CONFLICT(code) DO UPDATE SET
           name=excluded.name,
           description=excluded.description,
           destination_page=excluded.destination_page,
           can_have_team=excluded.can_have_team,
           is_system=CASE WHEN roles.is_system=1 THEN roles.is_system ELSE excluded.is_system END,
           is_active=excluded.is_active`
      ).bind(code,name,description,destination_page,can_have_team,is_system,is_active).run();
      return new Response(JSON.stringify({ ok:true, code }), {
        headers:{ "Content-Type":"application/json" }
      });
    }
    if(method === "DELETE"){
      const code = norm(url.searchParams.get("code") || "");
      if(!code){
        return new Response(JSON.stringify({ ok:false, error:"Missing code" }), {
          status:400, headers:{ "Content-Type":"application/json" }
        });
      }
      const row = await env.DB.prepare("SELECT is_system FROM roles WHERE code=?1").bind(code).first();
      if(row && Number(row.is_system) === 1){
        return new Response(JSON.stringify({ ok:false, error:"System roles cannot be deleted" }), {
          status:403, headers:{ "Content-Type":"application/json" }
        });
      }
      await env.DB.prepare("DELETE FROM roles WHERE code=?1").bind(code).run();
      return new Response(JSON.stringify({ ok:true, code }), {
        headers:{ "Content-Type":"application/json" }
      });
    }
    return new Response(JSON.stringify({ ok:false, error:"Method not allowed" }), {
      status:405, headers:{ "Content-Type":"application/json" }
    });
  }catch(e){
    return new Response(JSON.stringify({ ok:false, error:String(e) }), {
      status:500, headers:{ "Content-Type":"application/json" }
    });
  }
}
