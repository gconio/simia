function norm(s){ return String(s || "").trim(); }

const DEFAULTS = { defaultTheme: "intel-dark" };

export async function onRequestGet({ env }) {
  if(!env.DB){
    return new Response(JSON.stringify({ ok:false, error:"DB binding missing" }), {
      status: 500, headers: { "Content-Type":"application/json" }
    });
  }
  try{
    const { results } = await env.DB.prepare("SELECT key, value FROM app_config").all();
    const cfg = { ...DEFAULTS };
    for(const r of (results || [])){
      if(!r?.key) continue;
      cfg[String(r.key)] = String(r.value ?? "");
    }
    return new Response(JSON.stringify({ ok:true, config: cfg }), {
      headers: { "Content-Type":"application/json", "Cache-Control":"no-store" }
    });
  }catch(e){
    return new Response(JSON.stringify({ ok:true, config: { ...DEFAULTS }, warning:String(e) }), {
      headers: { "Content-Type":"application/json", "Cache-Control":"no-store" }
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
    const body = await request.json().catch(() => ({}));
    const defaultTheme = norm(body.defaultTheme || body.theme || "");
    if(!defaultTheme){
      return new Response(JSON.stringify({ ok:false, error:"defaultTheme is required" }), {
        status: 400, headers: { "Content-Type":"application/json" }
      });
    }
    await env.DB.prepare(
      "INSERT OR REPLACE INTO app_config (key, value) VALUES (?1, ?2)"
    ).bind("defaultTheme", defaultTheme).run();

    return new Response(JSON.stringify({ ok:true, config: { defaultTheme } }), {
      headers: { "Content-Type":"application/json", "Cache-Control":"no-store" }
    });
  }catch(e){
    return new Response(JSON.stringify({ ok:false, error:String(e) }), {
      status: 500, headers: { "Content-Type":"application/json" }
    });
  }
}