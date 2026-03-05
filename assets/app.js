async function jget(url){
  const r = await fetch(url, { headers: { "Accept": "application/json" } });
  const t = await r.text();
  let j;
  try{ j = JSON.parse(t); } catch { j = { raw: t }; }
  if(!r.ok) throw new Error(j?.error || `HTTP ${r.status}`);
  return j;
}

async function jpost(url, body){
  const r = await fetch(url, {
    method: "POST",
    headers: { "Content-Type":"application/json", "Accept":"application/json" },
    body: JSON.stringify(body)
  });
  const t = await r.text();
  let j;
  try{ j = JSON.parse(t); } catch { j = { raw: t }; }
  if(!r.ok) throw new Error(j?.error || `HTTP ${r.status}`);
  return j;
}

async function jdel(url){
  const r = await fetch(url, { method:"DELETE" });
  const t = await r.text();
  let j;
  try{ j = JSON.parse(t); } catch { j = { raw: t }; }
  if(!r.ok) throw new Error(j?.error || `HTTP ${r.status}`);
  return j;
}

function esc(s){
  return String(s||"").replaceAll("&","&amp;").replaceAll("<","&lt;").replaceAll(">","&gt;")
    .replaceAll('"',"&quot;").replaceAll("'","&#39;");
}

function downloadText(text, filename, mime){
  const blob = new Blob([text], { type: mime || "text/plain" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = filename || "download.txt";
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(()=>URL.revokeObjectURL(a.href), 500);
}

function setActiveTab(tab){
  document.querySelectorAll(".tab").forEach(a=>{
    const on = a.getAttribute("data-tab") === tab;
    a.classList.toggle("active", on);
  });

  document.querySelectorAll(".panel").forEach(p=>{
    p.style.display = (p.getAttribute("data-panel") === tab) ? "" : "none";
  });

  try{ localStorage.setItem("simia.admin.tab", tab); }catch(e){}
}

function entryLink(p){
  const u = new URL("/index.html", location.origin);
  u.searchParams.set("role", String(p.role||"PLAYER").toUpperCase());
  u.searchParams.set("team", String(p.team_id||"ALL").toUpperCase());
  u.searchParams.set("pid", String(p.id||""));
  return u.toString();
}

let TEAMS = []; // cached
let PARTICIPANTS = [];

async function loadTeams(){
  const j = await jget("/api/teams");
  TEAMS = Array.isArray(j.teams) ? j.teams : [];
  if(!TEAMS.find(t=>String(t.id).toUpperCase()==="ALL")){
    TEAMS.unshift({ id:"ALL", label:"All Teams", icon:"" });
  }
  renderTeams();
  fillTeamSelect();
}

function renderTeams(){
  const box = document.getElementById("teamsList");
  if(!box) return;
  if(!TEAMS.length){
    box.innerHTML = `<div class="item"><div class="h">Nessun team</div><div class="small">Aggiungi un team e salva.</div></div>`;
    return;
  }
  box.innerHTML = "";
  TEAMS.forEach((t, idx)=>{
    const div = document.createElement("div");
    div.className = "item";
    div.innerHTML = `
      <div class="row" style="justify-content:space-between;align-items:flex-start;gap:10px;flex-wrap:wrap">
        <div style="flex:1">
          <div class="h">${esc(t.label || t.id)} <span class="small mono">(${esc(t.id)})</span></div>
          <div class="small" style="margin-top:6px">Icona: <span class="mono">${esc(t.icon||"—")}</span></div>
        </div>
        <button class="btn danger" data-del="${idx}">Rimuovi</button>
      </div>
    `;
    div.querySelector("[data-del]")?.addEventListener("click", ()=>{
      TEAMS.splice(idx,1);
      renderTeams();
      fillTeamSelect();
    });
    box.appendChild(div);
  });
}

function fillTeamSelect(){
  const sel = document.getElementById("pTeam");
  if(!sel) return;
  sel.innerHTML = "";
  TEAMS.forEach(t=>{
    const opt = document.createElement("option");
    opt.value = String(t.id||"ALL").toUpperCase();
    opt.textContent = (t.icon ? `${t.icon} ` : "") + (t.label || t.id);
    sel.appendChild(opt);
  });
  sel.value = "ALL";
}

async function saveTeams(){
  // normalize payload
  const payload = TEAMS
    .filter(t=>String(t.id||"").trim() !== "")
    .map(t=>({
      id: String(t.id||"").trim().toUpperCase(),
      label: String(t.label||"").trim() || String(t.id||"").trim().toUpperCase(),
      icon: String(t.icon||"").trim()
    }));
  await jpost("/api/teams", { teams: payload });
}

async function loadParticipants(){
  const j = await jget("/api/participants");
  PARTICIPANTS = Array.isArray(j.participants) ? j.participants : [];
  renderParticipants();
}

function renderParticipants(){
  const box = document.getElementById("pList");
  if(!box) return;
  if(!PARTICIPANTS.length){
    box.innerHTML = `<div class="item"><div class="h">Nessun partecipante</div><div class="small">Aggiungi un partecipante sopra.</div></div>`;
    return;
  }
  box.innerHTML = "";
  PARTICIPANTS.forEach(p=>{
    const div = document.createElement("div");
    div.className = "item";

    const role = String(p.role||"PLAYER").toUpperCase();
    const team = String(p.team_id||"ALL").toUpperCase();

    div.innerHTML = `
      <div class="row" style="justify-content:space-between;align-items:flex-start;gap:12px;flex-wrap:wrap">
        <div style="flex:1;min-width:260px">
          <div class="h">${esc(p.name||"")}</div>
          <div class="small" style="margin-top:6px">
            ${p.email ? `<span class="pill mono">${esc(p.email)}</span>` : ``}
            <span class="pill mono">ID: ${esc(p.id||"")}</span>
          </div>

          <div class="row" style="margin-top:10px;align-items:flex-end;flex-wrap:wrap">
            <div style="min-width:160px">
              <label class="lbl">Ruolo</label>
              <select class="input" data-role>
                <option>PLAYER</option><option>OBSERVER</option><option>INSTRUCTOR</option><option>ADMIN</option>
              </select>
            </div>
            <div style="min-width:180px">
              <label class="lbl">Team</label>
              <select class="input" data-team></select>
            </div>
            <button class="btn" data-save>Salva</button>
          </div>
        </div>

        <div class="row" style="justify-content:flex-end;flex-wrap:wrap">
          <button class="btn" data-link>Copia link</button>
          <button class="btn" data-email>Copia email</button>
          <button class="btn danger" data-del>Elimina</button>
        </div>
      </div>
    `;

    const roleSel = div.querySelector("[data-role]");
    roleSel.value = role;

    const teamSel = div.querySelector("[data-team]");
    teamSel.innerHTML = "";
    TEAMS.forEach(t=>{
      const opt = document.createElement("option");
      opt.value = String(t.id||"ALL").toUpperCase();
      opt.textContent = (t.icon ? `${t.icon} ` : "") + (t.label || t.id);
      teamSel.appendChild(opt);
    });
    teamSel.value = team;

    div.querySelector("[data-save]")?.addEventListener("click", async ()=>{
      await jpost("/api/participants", {
        id: p.id,
        name: p.name,
        email: p.email || "",
        role: roleSel.value,
        team_id: teamSel.value
      });
      await loadParticipants();
      alert("Aggiornato.");
    });

    div.querySelector("[data-del]")?.addEventListener("click", async ()=>{
      if(!confirm("Eliminare il partecipante?")) return;
      await jdel(`/api/participants?id=${encodeURIComponent(p.id)}`);
      await loadParticipants();
    });

    div.querySelector("[data-link]")?.addEventListener("click", async ()=>{
      const link = entryLink(p);
      try{ await navigator.clipboard.writeText(link); alert("Link copiato."); }
      catch{ alert(link); }
    });

    div.querySelector("[data-email]")?.addEventListener("click", async ()=>{
      const subj = (document.getElementById("invSubject")?.value || "SimIA — Accesso alla simulazione").trim();
      const tpl = (document.getElementById("invTpl")?.value || "").toString();
      const link = entryLink(p);
      const body = tpl
        .replaceAll("{NAME}", p.name||"")
        .replaceAll("{ROLE}", String(p.role||"PLAYER").toUpperCase())
        .replaceAll("{TEAM}", String(p.team_id||"ALL").toUpperCase())
        .replaceAll("{LINK}", link);

      const msg = `Subject: ${subj}\n\n${body}`;
      try{ await navigator.clipboard.writeText(msg); alert("Email copiata."); }
      catch{ alert(msg); }
    });

    box.appendChild(div);
  });
}

async function exportCsv(){
  const rows = [["name","email","role","team_id","entryLink"]];
  PARTICIPANTS.forEach(p=>{
    rows.push([
      p.name||"",
      p.email||"",
      String(p.role||"PLAYER").toUpperCase(),
      String(p.team_id||"ALL").toUpperCase(),
      entryLink(p)
    ]);
  });
  const csv = rows.map(r=>r.map(x=>`"${String(x).replaceAll('"','""')}"`).join(",")).join("\n");
  downloadText(csv, "simia_invites.csv", "text/csv");
}

async function exportJson(){
  downloadText(JSON.stringify({ exportedAt: new Date().toISOString(), participants: PARTICIPANTS }, null, 2),
    "simia_invites.json", "application/json");
}

async function loadSystem(){
  const badge = document.getElementById("sysBadge");
  const h = document.getElementById("sysHealth");
  const d = document.getElementById("sysDbcheck");
  try{
    const j1 = await jget("/api/health");
    h.textContent = JSON.stringify(j1, null, 2);
    const j2 = await jget("/api/dbcheck");
    d.textContent = JSON.stringify(j2, null, 2);
    badge.textContent = (j2.dbBound && j2.dbOk) ? "DB OK" : "DB ERR";
  }catch(e){
    if(badge) badge.textContent = "ERR";
    if(h) h.textContent = String(e);
    if(d) d.textContent = String(e);
  }
}

function bindTabs(){
  const tabsBar = document.querySelector(".tabs");
  if(!tabsBar){
    console.error("SimIA: .tabs non trovato (admin.html non aggiornato?)");
    return;
  }

  // Event delegation: funziona sempre, anche se i tab vengono ricreati
  tabsBar.addEventListener("click", (ev) => {
    const a = ev.target.closest("[data-tab]");
    if(!a) return;
    ev.preventDefault();
    const tab = a.getAttribute("data-tab");
    console.log("SimIA: click tab =", tab);
    setActiveTab(tab);
  });

  let saved = "setup";
  try{ saved = localStorage.getItem("simia.admin.tab") || "setup"; }catch(e){}
  setActiveTab(saved);
}

function bindSetup(){
  document.getElementById("addTeamBtn")?.addEventListener("click", ()=>{
    const id = (document.getElementById("teamId")?.value || "").trim().toUpperCase();
    const label = (document.getElementById("teamLabel")?.value || "").trim();
    const icon = (document.getElementById("teamIcon")?.value || "").trim();
    if(!id){ alert("Inserisci ID team."); return; }
    if(TEAMS.find(t=>String(t.id).toUpperCase()===id)){ alert("ID già presente."); return; }
    TEAMS.push({ id, label: label || id, icon });
    document.getElementById("teamId").value="";
    document.getElementById("teamLabel").value="";
    document.getElementById("teamIcon").value="";
    renderTeams();
    fillTeamSelect();
  });

  document.getElementById("reloadTeamsBtn")?.addEventListener("click", loadTeams);

  document.getElementById("saveTeamsBtn")?.addEventListener("click", async ()=>{
    await saveTeams();
    await loadTeams();
    alert("Teams salvati su DB.");
  });
}

function bindParticipants(){
  document.getElementById("pAddBtn")?.addEventListener("click", async ()=>{
    const name = (document.getElementById("pName")?.value || "").trim();
    const email = (document.getElementById("pEmail")?.value || "").trim();
    const role = (document.getElementById("pRole")?.value || "PLAYER").trim().toUpperCase();
    const team_id = (document.getElementById("pTeam")?.value || "ALL").trim().toUpperCase();
    if(!name){ alert("Inserisci un nome."); return; }
    await jpost("/api/participants", { name, email, role, team_id });
    document.getElementById("pName").value="";
    document.getElementById("pEmail").value="";
    await loadParticipants();
  });

  document.getElementById("pReloadBtn")?.addEventListener("click", loadParticipants);
}
function bindScenario(){
  const send = document.getElementById("scSendBtn");
  const reload = document.getElementById("scReloadBtn");
  if(reload) reload.addEventListener("click", loadScenarioLog);

  if(send) send.addEventListener("click", async ()=>{
    const kind = (document.getElementById("scKind")?.value || "BROADCAST").toUpperCase();
    const severity = (document.getElementById("scSeverity")?.value || "INFO").toUpperCase();
    const audience = (document.getElementById("scAudience")?.value || "ALL").trim() || "ALL";
    const phase = (document.getElementById("scPhase")?.value || "").trim() || null;
    const title = (document.getElementById("scTitle")?.value || "").trim();
    const body = (document.getElementById("scBody")?.value || "").toString();

    if(!body.trim()){
      alert("Inserisci Body.");
      return;
    }

    await jpost("/api/scenario/events", { kind, severity, audience, phase, title, body });
    document.getElementById("scTitle").value = "";
    document.getElementById("scBody").value = "";
    await loadScenarioLog();
    alert("Evento inviato.");
  });
}
function bindInvites(){
  document.getElementById("exportCsvBtn")?.addEventListener("click", exportCsv);
  document.getElementById("exportJsonBtn")?.addEventListener("click", exportJson);
}
async function loadScenarioLog(){
  const box = document.getElementById("scLog");
  const count = document.getElementById("scCount");
  if(!box) return;

  try{
    const j = await jget("/api/scenario/events");
    const events = Array.isArray(j.events) ? j.events : [];
    if(count) count.textContent = `${events.length} events`;

    if(!events.length){
      box.innerHTML = `<div class="item"><div class="h">Nessun evento</div><div class="small">Invia un Broadcast o Inject.</div></div>`;
      return;
    }

    box.innerHTML = "";
    for(const ev of events){
      const div = document.createElement("div");
      div.className = "item";
      div.innerHTML = `
        <div class="row" style="justify-content:space-between;align-items:flex-start;gap:10px;flex-wrap:wrap">
          <div style="flex:1;min-width:260px">
            <div class="h">${esc(ev.title || "(no title)")}</div>
            <div class="small" style="margin-top:6px">
              <span class="pill mono">${esc(ev.kind)}</span>
              <span class="pill mono">${esc(ev.severity)}</span>
              <span class="pill mono">${esc(ev.audience)}</span>
              ${ev.phase ? `<span class="pill mono">${esc(ev.phase)}</span>` : ``}
              <span class="pill mono">${esc(ev.ts)}</span>
            </div>
            <div style="margin-top:10px;white-space:pre-wrap">${esc(ev.body || "")}</div>
          </div>
          <button class="btn" data-copy>Copy</button>
        </div>
      `;
      div.querySelector("[data-copy]")?.addEventListener("click", async ()=>{
        const txt = `[${ev.ts}] ${ev.kind}/${ev.severity} ${ev.audience}${ev.phase?(" "+ev.phase):""}\n${ev.title||""}\n${ev.body||""}`.trim();
        try{ await navigator.clipboard.writeText(txt); alert("Copiato."); } catch { alert(txt); }
      });
      box.appendChild(div);
    }
  }catch(e){
    if(count) count.textContent = "ERR";
    box.innerHTML = `<div class="item"><div class="h">Errore</div><div class="small mono">${esc(String(e))}</div></div>`;
  }
}
async function loadScenarioLog(){
  const box = document.getElementById("scLog");
  const count = document.getElementById("scCount");
  if(!box) return;

  try{
    const j = await jget("/api/scenario/events");
    const events = Array.isArray(j.events) ? j.events : [];
    if(count) count.textContent = `${events.length} events`;

    if(!events.length){
      box.innerHTML = `<div class="item"><div class="h">Nessun evento</div><div class="small">Invia un Broadcast o Inject.</div></div>`;
      return;
    }

    box.innerHTML = "";
    for(const ev of events){
      const div = document.createElement("div");
      div.className = "item";
      div.innerHTML = `
        <div class="row" style="justify-content:space-between;align-items:flex-start;gap:10px;flex-wrap:wrap">
          <div style="flex:1;min-width:260px">
            <div class="h">${esc(ev.title || "(no title)")}</div>
            <div class="small" style="margin-top:6px">
              <span class="pill mono">${esc(ev.kind)}</span>
              <span class="pill mono">${esc(ev.severity)}</span>
              <span class="pill mono">${esc(ev.audience)}</span>
              ${ev.phase ? `<span class="pill mono">${esc(ev.phase)}</span>` : ``}
              <span class="pill mono">${esc(ev.ts)}</span>
            </div>
            <div style="margin-top:10px;white-space:pre-wrap">${esc(ev.body || "")}</div>
          </div>
          <button class="btn" data-copy>Copy</button>
        </div>
      `;
      div.querySelector("[data-copy]")?.addEventListener("click", async ()=>{
        const txt = `[${ev.ts}] ${ev.kind}/${ev.severity} ${ev.audience}${ev.phase?(" "+ev.phase):""}\n${ev.title||""}\n${ev.body||""}`.trim();
        try{ await navigator.clipboard.writeText(txt); alert("Copiato."); } catch { alert(txt); }
      });
      box.appendChild(div);
    }
  }catch(e){
    if(count) count.textContent = "ERR";
    box.innerHTML = `<div class="item"><div class="h">Errore</div><div class="small mono">${esc(String(e))}</div></div>`;
  }
}

function bindScenario(){
  const send = document.getElementById("scSendBtn");
  const reload = document.getElementById("scReloadBtn");

  if(reload) reload.addEventListener("click", loadScenarioLog);

  if(send) send.addEventListener("click", async ()=>{
    const kind = (document.getElementById("scKind")?.value || "BROADCAST").toUpperCase();
    const severity = (document.getElementById("scSeverity")?.value || "INFO").toUpperCase();
    const audience = (document.getElementById("scAudience")?.value || "ALL").trim() || "ALL";
    const phase = (document.getElementById("scPhase")?.value || "").trim() || null;
    const title = (document.getElementById("scTitle")?.value || "").trim();
    const body = (document.getElementById("scBody")?.value || "").toString();

    if(!body.trim()){
      alert("Inserisci Body.");
      return;
    }

    await jpost("/api/scenario/events", { kind, severity, audience, phase, title, body });

    document.getElementById("scTitle").value = "";
    document.getElementById("scBody").value = "";

    await loadScenarioLog();
    alert("Evento inviato.");
  });
}
document.addEventListener("DOMContentLoaded", () => {
  (async function main(){
    bindTabs();
    bindSetup();
    bindParticipants();
    bindInvites();
    bindScenario();          // ✅ aggiungi qui

    await loadTeams();
    await loadParticipants();
    await loadSystem();
    await loadScenarioLog(); // ✅ aggiungi qui
  })().catch(e => {
    console.error("SimIA admin init error:", e);
    alert("Errore init Admin: " + e);
  });
});