export async function onRequest() {
  return new Response(JSON.stringify({ ok: true, service: "SimIA", ts: new Date().toISOString() }), {
    headers: { "Content-Type": "application/json" },
  });
}