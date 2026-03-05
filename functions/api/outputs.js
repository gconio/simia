function norm(s){ return String(s || "").trim().toUpperCase(); }

function normalizePhase(input){
  const p = String(input || "").trim().toUpperCase();
  if(!p) return null;
  const m = p.match(/(\d+)/);
  if(!m) return null;
  return `PHASE-${parseInt(m[1], 10)}`;
}

export async function onRequestGet({ request, env }) {
  if(!env.DB){
    return new Response(JSON.stringify({ ok:false, error:"DB binding missing" }), {
      status: 500, headers: { "Content-Type":"application/json" }
    });
  }

  const url = new URL(request.url);
  const team = norm(url.searchParams.get("team") || "ALL");
  const phase = normalizePhase(url.searchParams.get("phase")) || null;
  const type = norm(url.searchParams.get("type") || "");
  const limit = Math.min(parseInt(url.searchParams.get("limit") || "50", 10) || 50, 200);

  // filtri dinamici
  let sql = `SELECT id, ts, session, phase, team, role, participant_id, output_type, title, content
             FROM analysis_outputs WHERE 1=1`;
  const args = [];

  if(team){
    sql += ` AND UPPER(team)=?${args.length+1}`;
    args.push(team);
  }
  if(phase){
    sql += ` AND phase=?${args.length+1}`;
    args.push(phase);
  }
  if(type){
    sql += ` AND UPPER(output_type)=?${args.length+1}`;
    args.push(type);
  }

  sql += ` ORDER BY ts DESC LIMIT ${limit}`;

  try{
    const stmt = env.DB.prepare(sql);
    const res = args.length ? await stmt.bind(...args).all() : await stmt.all();
    return new Response(JSON.stringify({ ok:true, items: res.results || [] }), {
      headers: { "Content-Type":"application/json" }
    });
  }catch(e){
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
    const body = await request.json().catch(() => ({}));

    const id = crypto.randomUUID();
    const ts = new Date().toISOString();

    const session = String(body.session || "").trim() || null;
    const phase = normalizePhase(body.phase) || null;

    const team = norm(body.team || "ALL");
    const role = norm(body.role || "PLAYER");
    const participant_id = String(body.participant_id || "").trim() || null;

    const output_type = norm(body.output_type || "NOTE");
    const title = String(body.title || "").trim() || "";
    const content = String(body.content || "").toString();

    if(!team || !output_type || !content.trim()){
      return new Response(JSON.stringify({ ok:false, error:"team, output_type, content are required" }), {
        status: 400, headers: { "Content-Type":"application/json" }
      });
    }

    await env.DB.prepare(
      `INSERT INTO analysis_outputs
       (id, ts, session, phase, team, role, participant_id, output_type, title, content)
       VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10)`
    ).bind(id, ts, session, phase, team, role, participant_id, output_type, title, content).run();

    return new Response(JSON.stringify({ ok:true, id, ts }), {
      headers: { "Content-Type":"application/json" }
    });
  }catch(e){
    return new Response(JSON.stringify({ ok:false, error:String(e) }), {
      status: 500, headers: { "Content-Type":"application/json" }
    });
  }
}