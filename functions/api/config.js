const DEFAULTS = {
  brandName: "SimIA",
  exerciseSubtitle: "Scenario / Exercise",
  defaultTheme: "intel-dark",
  logoMode: "url",
  logoUrl: "",
  logoData: ""
};

export async function onRequestGet({ env }) {
  if(!env.DB){
    return new Response(JSON.stringify({ ok:false, error:"DB binding missing" }), {
      status:500, headers:{ "Content-Type":"application/json" }
    });
  }
  try{
    const { results } = await env.DB.prepare("SELECT key, value FROM app_config").all();
    const config = { ...DEFAULTS };
    for(const row of (results || [])){
      if(!row?.key) continue;
      config[String(row.key)] = String(row.value ?? "");
    }
    return new Response(JSON.stringify({ ok:true, config }), {
      headers:{ "Content-Type":"application/json", "Cache-Control":"no-store" }
    });
  }catch(e){
    return new Response(JSON.stringify({ ok:true, config:{...DEFAULTS}, warning:String(e) }), {
      headers:{ "Content-Type":"application/json", "Cache-Control":"no-store" }
    });
  }
}

export async function onRequestPost({ request, env }) {
  if(!env.DB){
    return new Response(JSON.stringify({ ok:false, error:"DB binding missing" }), {
      status:500, headers:{ "Content-Type":"application/json" }
    });
  }
  try{
    const body = await request.json().catch(()=>({}));
    const allowed = new Set(["brandName","exerciseSubtitle","defaultTheme","logoMode","logoUrl","logoData"]);
    const updates = Object.entries(body).filter(([k,v]) => allowed.has(k) && v !== undefined);
    if(!updates.length){
      return new Response(JSON.stringify({ ok:false, error:"No valid config keys supplied" }), {
        status:400, headers:{ "Content-Type":"application/json" }
      });
    }
    const stmts = updates.map(([k,v]) =>
      env.DB.prepare("INSERT OR REPLACE INTO app_config (key,value) VALUES (?1,?2)").bind(String(k), String(v ?? ""))
    );
    await env.DB.batch(stmts);
    return new Response(JSON.stringify({ ok:true, saved:Object.fromEntries(updates) }), {
      headers:{ "Content-Type":"application/json", "Cache-Control":"no-store" }
    });
  }catch(e){
    return new Response(JSON.stringify({ ok:false, error:String(e) }), {
      status:500, headers:{ "Content-Type":"application/json" }
    });
  }
}
