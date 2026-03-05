export async function onRequest({ env }) {
  try {
    const dbBound = !!env.DB;
    let dbOk = false;
    if (dbBound) {
      await env.DB.prepare("SELECT 1").run();
      dbOk = true;
    }
    return new Response(JSON.stringify({ ok:true, dbBound, dbOk }), {
      headers: { "Content-Type":"application/json" }
    });
  } catch (e) {
    return new Response(JSON.stringify({ ok:false, error:String(e) }), {
      status: 500,
      headers: { "Content-Type":"application/json" }
    });
  }
}
