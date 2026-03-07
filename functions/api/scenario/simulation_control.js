export async function onRequestPost(context) {

  const { request, env } = context;
  const body = await request.json();

  const status = body.status;

  if (!["running","paused","stopped"].includes(status)) {
    return Response.json({error:"invalid status"}, {status:400});
  }

  await env.DB.prepare(`
    UPDATE simulation_state
    SET status = ?
    WHERE id = 1
  `).bind(status).run();

  return Response.json({
    ok:true,
    status
  });
}