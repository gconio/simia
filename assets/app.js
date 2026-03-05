
(function(){
  const LS = {
    start: "intelsim:startISO",
    overrides: "intelsim:overridesV2",
    instructor: "intelsim:instructorV2",
    team: "intelsim:teamV1",
    phase: "intelsim:phaseV1"
  };

  // ---------- Helpers ----------
  function $(id){ return document.getElementById(id); }
  function safeJsonParse(s, fallback){ try{ return JSON.parse(s); } catch(e){ return fallback; } }
  function nowISO(){ return new Date().toISOString().slice(0,19); } // YYYY-MM-DDTHH:MM:SS (no tz)
  function fmtHHMMSS(sec){
    sec = Math.max(0, Math.floor(sec));
    const h = String(Math.floor(sec/3600)).padStart(2,'0');
    const m = String(Math.floor((sec%3600)/60)).padStart(2,'0');
    const s = String(sec%60).padStart(2,'0');
    return `${h}:${m}:${s}`;
  }
  function pillClass(type){
    const t=(type||"").toLowerCase();
    if(t==="osint") return "pill osint";
    if(t==="humint") return "pill humint";
    if(t==="sigint") return "pill sigint";
    if(t==="imint") return "pill imint";
    if(t==="tasking") return "pill tasking";
    if(t==="deception") return "pill deception";
    return "pill";
  }
  function escapeHtml(s){
    return String(s||'').replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;').replaceAll('"','&quot;').replaceAll("'",'&#39;');
  }

  function downloadText(text, filename, mime){
    const blob = new Blob([text], {type: mime || 'text/plain'});
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = filename || 'download.txt';
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(()=>URL.revokeObjectURL(a.href), 500);
  }

  function downloadJSON(obj, filename){
    const blob = new Blob([JSON.stringify(obj, null, 2)], {type:"application/json;charset=utf-8"});
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = filename;
    a.click();
    URL.revokeObjectURL(a.href);
  }

  // ---------- Layout safeguard ----------
  function layoutSafeguard(){
    try{
      const topbar = document.querySelector("header.topbar");
      const layout = document.querySelector("main.layout");
      const sidebar = document.querySelector("nav.sidebar");
      const content = document.querySelector("section.content");

      const ok = !!(topbar && layout && sidebar && content);

      // Fallback dashboard link if missing
      const dashLink = document.querySelector('.session a.btn[href="/index.html"], .session a.btn[href="index.html"]');
      if(!dashLink && topbar){
        const sessionLine = topbar.querySelector(".session-line");
        if(sessionLine){
          const a = document.createElement("a");
          a.className = "btn";
          a.href = "/";
          a.textContent = "Dashboard";
          sessionLine.appendChild(a);
        }
      }

      if(ok) return;
      const banner = document.createElement("div");
      banner.style.position = "sticky";
      banner.style.top = "0";
      banner.style.zIndex = "9999";
      banner.style.background = "rgba(255, 214, 102, .95)";
      banner.style.color = "#111";
      banner.style.padding = "10px 14px";
      banner.style.fontFamily = "system-ui, -apple-system, Segoe UI, Roboto, sans-serif";
      banner.style.borderBottom = "1px solid rgba(0,0,0,.2)";
      banner.innerHTML = `
        <b>Layout degradato</b> — struttura pagina incompleta.
        <span style="margin-left:10px">Suggerimento: ricarica (Ctrl+F5) o verifica upload su Pages.</span>
        <a href="/index.html" style="margin-left:12px;text-decoration:underline;color:#111">Dashboard</a>
      `;
      document.body.prepend(banner);
    }catch(e){}
  }

  // ---------- Config / Storage ----------
  async function loadBase(){
    const res = await fetch("/assets/data.json", {cache:"no-store"});
    if(!res.ok) throw new Error("Impossibile caricare /assets/data.json ("+res.status+")");
    return await res.json();
  }
  function loadOverrides(){ return safeJsonParse(localStorage.getItem(LS.overrides) || "", {}); }
  function saveOverrides(obj){ localStorage.setItem(LS.overrides, JSON.stringify(obj)); }
  function loadInstructor(){ return safeJsonParse(localStorage.getItem(LS.instructor) || "", {manualReleases:[], injects:[]}); }
  function saveInstructor(obj){ localStorage.setItem(LS.instructor, JSON.stringify(obj)); }

  function applyAll(cfg){
    const ov = loadOverrides();
    ["checkpoints","agents","documents","tasking","activations","teams"].forEach(k=>{
      if(ov[k] && Array.isArray(ov[k])) cfg[k] = ov[k];
    });
    if(ov.platform && typeof ov.platform==="object"){
      cfg.platform = Object.assign({}, cfg.platform||{}, ov.platform);
    }
    return cfg;
  }

  // ---------- Team ----------
  function getTeam(){
    const url = new URL(location.href);
    const t = (url.searchParams.get("team") || "").trim().toUpperCase();
    if(t) return t;
    return (localStorage.getItem(LS.team) || "ALL").toUpperCase();
  }
  function setTeam(team){ localStorage.setItem(LS.team, (team||"ALL").toUpperCase()); }
  function teamMatch(itemTeam, currentTeam){
    const it = String(itemTeam||"ALL").toUpperCase();
    const ct = String(currentTeam||"ALL").toUpperCase();
    if(ct==="ALL") return true;
    if(it==="ALL") return true; // broadcast
    return it===ct;
  }
  
  function getTeamIcon(cfg, teamId){
    const id = String(teamId||"ALL").toUpperCase();
    const teams = getTeamsForUi(cfg) || [];
    const t = teams.find(x=>String(x.id||"ALL").toUpperCase()===id);
    return t && t.icon ? String(t.icon) : "";
  }
  function renderTeamIcon(cfg, teamId){
    const img = document.getElementById("teamIcon");
    if(!img) return;
    const icon = getTeamIcon(cfg, teamId);
    if(icon){
      img.src = icon;
      img.style.display = "block";
      img.parentElement.style.opacity = "1";
    }else{
      img.removeAttribute("src");
      img.style.display = "none";
      img.parentElement.style.opacity = ".5";
    }
  }


  // ---------- D1 API (Phase A: Teams + Participants) ----------
  async function apiGetHealth(){
    const r = await fetch("/api/health", {headers: {"Accept":"application/json"}});
    if(!r.ok) throw new Error("GET /api/health failed");
    return await r.json();
  }
  async function apiGetTeams(){
    const r = await fetch("/api/teams", {headers: {"Accept":"application/json"}});
    if(!r.ok) throw new Error("GET /api/teams failed");
    return await r.json();
  }
  async function apiSaveTeams(teams){
    const r = await fetch("/api/teams", {
      method: "POST",
      headers: {"Content-Type":"application/json"},
      body: JSON.stringify({teams})
    });
    if(!r.ok) throw new Error("POST /api/teams failed");
    return await r.json();
  }
  async function apiGetParticipants(){
    const r = await fetch("/api/participants", {headers: {"Accept":"application/json"}});
    if(!r.ok) throw new Error("GET /api/participants failed");
    return await r.json();
  }
  async function apiUpsertParticipant(p){
    const r = await fetch("/api/participants", {
      method:"POST",
      headers: {"Content-Type":"application/json"},
      body: JSON.stringify(p)
    });
    if(!r.ok) throw new Error("POST /api/participants failed");
    return await r.json();
  }
  async function apiDeleteParticipant(id){
    const u = new URL("/api/participants", location.origin);
    u.searchParams.set("id", id);
    const r = await fetch(u.toString(), {method:"DELETE"});
    if(!r.ok) throw new Error("DELETE /api/participants failed");
    return await r.json();
  }

  let __teamsDb = null;
  async function syncTeamsFromDb(cfg){
    try{
      const j = await apiGetTeams();
      if(j && j.ok && Array.isArray(j.teams)){
        __teamsDb = j.teams.map(t=>({id:String(t.id||"").toUpperCase(), label:t.label||t.id, icon:t.icon||""}));
        cfg.teams = __teamsDb;
      }
    }catch(e){}
  }
  function getTeamsForUi(cfg){
    if(__teamsDb && __teamsDb.length) return __teamsDb;
    const ov = loadOverrides();
    if(ov && Array.isArray(ov.teams) && ov.teams.length) return ov.teams;
    return (cfg.teams && Array.isArray(cfg.teams)) ? cfg.teams : [{id:"ALL",label:"All Teams"}];
  }

function bindTeamSelector(cfg){
    const sel = $("teamSelect");
    if(!sel) return;
    const teams = (cfg.teams && Array.isArray(cfg.teams) && cfg.teams.length)
      ? cfg.teams
      : [{id:"ALL",label:"All Teams"}];

    sel.innerHTML = "";
    teams.forEach(t=>{
      const opt = document.createElement("option");
      opt.value = String(t.id||"ALL").toUpperCase();
      opt.textContent = t.label ? t.label : opt.value;
      sel.appendChild(opt);
    });

    const current = getTeam();
    renderTeamIcon(cfg, current);

    sel.value = teams.some(x=>String(x.id||"ALL").toUpperCase()===current) ? current : "ALL";

    sel.addEventListener("change", ()=>{
      setTeam(sel.value);
      renderTeamIcon(cfg, sel.value);
      const url = new URL(location.href);
      url.searchParams.set("team", sel.value);
      history.replaceState(null, "", url.toString());
      location.reload();
    });
  }

  // ---------- Phase ----------
  function getPhase(){ return (localStorage.getItem(LS.phase) || "").trim().toUpperCase(); }
  function setPhase(v){
    const val = String(v||"").trim().toUpperCase();
    if(!val) localStorage.removeItem(LS.phase);
    else localStorage.setItem(LS.phase, val);
  }
  function renderPhasePill(){
    const el = $("phasePill");
    if(!el) return;
    const v = getPhase();
    el.textContent = "PHASE: " + (v || "—");
    el.classList.remove("good","warn","danger");
    if(v==="GREEN") el.classList.add("good");
    if(v==="AMBER") el.classList.add("warn");
    if(v==="RED") el.classList.add("danger");
  }

  // ---------- Session time ----------
  function getStartISO(){
    const url = new URL(location.href);
    const startParam = url.searchParams.get("start");
    if(startParam) return startParam;
    return localStorage.getItem(LS.start) || "";
  }
  function setStartISO(iso){
    if(iso) localStorage.setItem(LS.start, iso);
    else localStorage.removeItem(LS.start);
  }
  function elapsedSec(){
    const iso = getStartISO();
    if(!iso) return null;
    const t0 = Date.parse(iso);
    if(Number.isNaN(t0)) return null;
    return (Date.now() - t0)/1000;
  }
  function elapsedMin(){
    const s = elapsedSec();
    return s==null ? null : s/60;
  }
  function sessionBadge(){
    const b = $("sessionBadge");
    if(!b) return;
    const e = elapsedSec();
    b.classList.remove("ok","warn");
    if(e==null){ b.textContent="Sessione non avviata"; b.classList.add("warn"); return; }
    b.textContent="Sessione attiva"; b.classList.add("ok");
  }
  function tickTimers(){
    const e = elapsedSec();
    const txt = e==null ? "—" : fmtHHMMSS(e);
    if($("timerSmall")) $("timerSmall").textContent = txt;
    if($("timerBig")) $("timerBig").textContent = txt;
    if($("startInfo")) $("startInfo").textContent = getStartISO() || "—";
  }

  // ---------- Visibility ----------
  function computeVisibleActivations(cfg){
    const tMin = elapsedMin();
    const instr = loadInstructor();
    const manual = new Set((instr.manualReleases||[]).map(x=>String(x)));
    const injects = (instr.injects||[]).slice();
    const currentTeam = getTeam();

    const releasedByTime = (cfg.activations||[]).filter(a=>{
      if(tMin==null) return false;
      const rm = Number(a.releaseMin);
      if(Number.isNaN(rm) || rm>tMin) return false;
      return teamMatch(a.team, currentTeam);
    });

    const releasedByManual = (cfg.activations||[]).filter(a=>{
      if(!manual.has(String(a.id))) return false;
      return teamMatch(a.team, currentTeam);
    });

    const injected = injects
      .filter(x=>String(x.type||"").toUpperCase()!=="TASKING")
      .filter(x=>teamMatch(x.team, currentTeam))
      .map(x=>Object.assign({injected:true, releaseMin: x.releaseMin ?? null}, x));

    const map = new Map();
    [...releasedByTime, ...releasedByManual].forEach(a=>map.set(String(a.id), a));
    injected.forEach(a=>map.set(String(a.id), a));
    return Array.from(map.values());
  }

  // ---------- Dashboard ----------
  function dashboardBind(cfg){
    const startBtn = $("startBtn");
    const resetBtn = $("resetBtn");
    if(startBtn && resetBtn){
      startBtn.addEventListener("click", ()=>{
        const iso = nowISO();
        setStartISO(iso);
        const t = getTeam();
        alert("Sessione avviata.\nCondivisione: aggiungi ?start="+iso+" (e opzionale &team="+t+") ai link.");
        sessionBadge(); tickTimers();
      });
      resetBtn.addEventListener("click", ()=>{
        setStartISO("");
        alert("Sessione resettata (solo su questo browser).");
        sessionBadge(); tickTimers();
      });
    }

    const visible = computeVisibleActivations(cfg);
    if($("releasedCount")) $("releasedCount").textContent = String(visible.length);

    const currentTeam = getTeam();
    const relevantTotal = (cfg.activations||[]).filter(a=>teamMatch(a.team, currentTeam)).length;
    if($("totalCount")) $("totalCount").textContent = String(relevantTotal);

    const tMin = elapsedMin();
    const rel = (cfg.activations||[]).filter(a=>teamMatch(a.team, currentTeam)).slice()
      .sort((a,b)=>(a.releaseMin||0)-(b.releaseMin||0));
    let next = null;
    if(tMin!=null){ next = rel.find(a=>Number(a.releaseMin)>tMin); }
    if($("nextActivationTitle")) $("nextActivationTitle").textContent = next ? `${next.id} — ${next.title}` : "—";
    if($("nextActivationEta")){
      if(!next || tMin==null){ $("nextActivationEta").textContent = "—"; }
      else{
        const eta = (Number(next.releaseMin)-tMin)*60;
        $("nextActivationEta").textContent = fmtHHMMSS(eta);
      }
    }

    const cps = $("checkpointsList");
    if(cps){
      cps.innerHTML = "";
      (cfg.checkpoints||[]).forEach(cp=>{
        const div = document.createElement("div");
        div.className="item";
        div.innerHTML = `
          <div class="row" style="justify-content:space-between">
            <div>
              <div class="h">${cp.id} — ${cp.label}</div>
              <div class="small">${cp.what||""}</div>
            </div>
            <span class="pill mono">T+${cp.dueMin}m</span>
          </div>
        `;
        cps.appendChild(div);
      });
    }
  }

  // ---------- Feed ----------
  function feedBind(cfg){
    const list = $("feedList");
    if(!list) return;

    const filtersWrap = $("feedFilters");
    const filterState = safeJsonParse(sessionStorage.getItem("intelsim:feedFilters")||"", {types:{}});
    function isOn(type){
      if(Object.keys(filterState.types).length===0) return true;
      return !!filterState.types[type];
    }

    function renderFilters(){
      if(!filtersWrap) return;
      filtersWrap.innerHTML = "";
      const currentTeam = getTeam();
      const types = Array.from(new Set((cfg.activations||[])
        .filter(a=>teamMatch(a.team, currentTeam))
        .map(a=>String(a.type||"OTHER").toUpperCase()))).sort();

      types.forEach(t=>{
        const btn = document.createElement("button");
        btn.className = "btn ghost";
        btn.textContent = t;
        const active = isOn(t);
        btn.style.opacity = active ? "1" : ".5";
        btn.addEventListener("click", ()=>{
          if(Object.keys(filterState.types).length===0){ types.forEach(x=>filterState.types[x]=true); }
          filterState.types[t] = !filterState.types[t];
          sessionStorage.setItem("intelsim:feedFilters", JSON.stringify(filterState));
          renderFilters(); render();
        });
        filtersWrap.appendChild(btn);
      });

      const reset = document.createElement("button");
      reset.className = "btn";
      reset.textContent = "Reset filtri";
      reset.addEventListener("click", ()=>{
        sessionStorage.removeItem("intelsim:feedFilters");
        renderFilters(); render();
      });
      filtersWrap.appendChild(reset);
    }

    function render(){
      list.innerHTML = "";
      const e = elapsedSec();
      if(e==null){
        list.innerHTML = `<div class="notice warn"><div class="h">Sessione non avviata</div><div class="small">Avvia dalla Dashboard oppure usa un link con <code>?start=...</code>.</div></div>`;
        return;
      }
      const visible = computeVisibleActivations(cfg);
      const sorted = visible.slice().sort((a,b)=>{
        const ra = (a.injected ? 999999 : Number(a.releaseMin||0));
        const rb = (b.injected ? 999999 : Number(b.releaseMin||0));
        return rb-ra;
      });

      const only = sorted.filter(a=>isOn(String(a.type||"OTHER").toUpperCase()));
      if(!only.length){
        list.innerHTML = `<div class="item"><div class="h">Nessuna attivazione visibile</div><div class="small">Controlla i filtri oppure attendi rilascio.</div></div>`;
        return;
      }

      only.forEach(a=>{
        const div = document.createElement("div");
        div.className="item";
        const t = String(a.type||"OTHER").toUpperCase();
        const rm = (a.injected ? "INJECT" : `T+${a.releaseMin}m`);
        const team = String(a.team||"ALL").toUpperCase();
        div.innerHTML = `
          <div class="row" style="justify-content:space-between;align-items:flex-start">
            <div style="min-width:220px">
              <div class="h">${a.title||"—"}</div>
              <div class="small" style="margin-top:6px;white-space:pre-wrap">${a.body||""}</div>
              <div class="meta"><span class="mono">${a.id||""}</span><span>•</span><span>${a.source||""}</span></div>
            </div>
            <div class="row" style="justify-content:flex-end">
              <span class="pill mono">${team}</span>
              <span class="${pillClass(t)}">${t}</span>
              <span class="pill mono">${rm}</span>
            </div>
          </div>
        `;
        list.appendChild(div);
      });
    }

    renderFilters();
    render();
    setInterval(render, 5000);
  }

  // ---------- Documents ----------
  function documentsBind(cfg){
    const box = $("docsBox");
    if(!box) return;
    box.innerHTML = "";
    (cfg.documents||[]).forEach(d=>{
      const div = document.createElement("div");
      div.className="item";
      const url = (d.url||"").trim();
      const btn = url ? `<a class="btn primary" href="${url}" target="_blank" rel="noopener">Apri</a>` : `<button class="btn" disabled>Apri</button>`;
      div.innerHTML = `
        <div class="row" style="justify-content:space-between">
          <div>
            <div class="h">${d.title||"—"}</div>
            <div class="small">Tipo: ${d.type||"—"}</div>
          </div>
          ${btn}
        </div>
        ${url ? `<div class="meta"><span class="mono">${url}</span></div>` : `<div class="meta"><span class="pill">Configura URL in Admin</span></div>`}
      `;
      box.appendChild(div);
    });
  }

  // ---------- Tasking ----------
  function taskingBind(cfg){
    const box = $("taskingBox");
    if(!box) return;

    function visibleTasking(){
      const tMin = elapsedMin();
      const instr = loadInstructor();
      const currentTeam = getTeam();

      const injected = (instr.injects||[])
        .filter(x=>String(x.type||"").toUpperCase()==="TASKING")
        .filter(x=>teamMatch(x.team, currentTeam));

      const base = (cfg.tasking||[])
        .filter(q=>{
          if(tMin==null) return false;
          const rm = Number(q.releaseMin||0);
          if(rm>tMin) return false;
          return teamMatch(q.team, currentTeam);
        })
        .map(q=>Object.assign({type:"TASKING"}, q));

      const merged = [...base, ...injected.map(x=>Object.assign({injected:true}, x))];
      merged.sort((a,b)=>Number(b.releaseMin||0)-Number(a.releaseMin||0));
      return merged;
    }

    function render(){
      box.innerHTML = "";
      const e = elapsedSec();
      if(e==null){
        box.innerHTML = `<div class="notice warn"><div class="h">Sessione non avviata</div><div class="small">Avvia dalla Dashboard oppure usa <code>?start=...</code>.</div></div>`;
        return;
      }
      const v = visibleTasking();
      if(!v.length){
        box.innerHTML = `<div class="item"><div class="h">Nessun tasking rilasciato</div><div class="small">Aggiungi tasking in Admin o usa Instructor per “inject”.</div></div>`;
        return;
      }
      v.forEach(q=>{
        const div = document.createElement("div");
        div.className="item";
        const pr = q.priority || "—";
        const rm = q.injected ? "INJECT" : `T+${q.releaseMin}m`;
        const team = String(q.team||"ALL").toUpperCase();
        div.innerHTML = `
          <div class="row" style="justify-content:space-between;align-items:flex-start">
            <div>
              <div class="h">${q.id||"Q"} — ${q.question||""}</div>
              ${q.notes ? `<div class="small" style="margin-top:6px;white-space:pre-wrap">${q.notes}</div>`:""}
              <div class="meta"><span class="pill">${pr}</span><span class="pill mono">${rm}</span><span class="pill mono">${team}</span></div>
            </div>
            <span class="${pillClass('TASKING')}">TASKING</span>
          </div>
        `;
        box.appendChild(div);
      });
    }

    render();
    setInterval(render, 5000);
  }

  // ---------- Submit ----------
  function submitBind(cfg){
    const box = $("submitBox");
    if(!box) return;
    box.innerHTML="";
    (cfg.checkpoints||[]).forEach(cp=>{
      const div = document.createElement("div");
      div.className="item";
      const url = (cp.formUrl||"").trim();
      div.innerHTML = `
        <div class="row" style="justify-content:space-between;align-items:flex-start">
          <div>
            <div class="h">${cp.id} — ${cp.label}</div>
            <div class="small">${cp.what||""}</div>
            <div class="meta"><span class="pill mono">T+${cp.dueMin}m</span>${url ? "" : "<span class='pill'>Configura in Admin</span>"}</div>
          </div>
          ${url ? `<a class="btn primary" href="${url}" target="_blank" rel="noopener">Apri modulo</a>` : `<button class="btn" disabled>Apri modulo</button>`}
        </div>
      `;
      box.appendChild(div);
    });
  }

  // ---------- AI ----------
  function aiBind(cfg){
    const box = $("aiBox");
    if(!box) return;
    box.innerHTML="";
    (cfg.agents||[]).forEach(ag=>{
      const div = document.createElement("div");
      div.className="item";
      div.innerHTML = `
        <div class="row" style="justify-content:space-between;align-items:flex-start">
          <div>
            <div class="h">${ag.name||"—"}</div>
            <div class="small">${ag.role||""}</div>
          </div>
          <div class="row">
            <span class="pill mono">${ag.id||""}</span>
            <button class="btn">Copia prompt</button>
          </div>
        </div>
        <div class="sep"></div>
        <div class="small" style="white-space:pre-wrap">${ag.prompt||""}</div>
      `;
      div.querySelector("button").addEventListener("click", async ()=>{
        try{ await navigator.clipboard.writeText(ag.prompt||""); alert("Prompt copiato."); }
        catch(e){ alert("Copia non disponibile. Seleziona e copia manualmente."); }
      });
      box.appendChild(div);
    });
  }

  // ---------- Workspace (team scoped) ----------
  function workspaceBind(){
    const ta = $("workspaceText");
    const saveBtn = $("wsSave");
    const loadBtn = $("wsLoad");
    const clearBtn = $("wsClear");
    const exportBtn = $("wsExport");
    const keySel = $("wsKey");

    const KEYS = {
      "General": "intelsim:ws:general",
      "Hypotheses": "intelsim:ws:hypotheses",
      "Indicators": "intelsim:ws:indicators",
      "ACH": "intelsim:ws:ach",
      "Brief": "intelsim:ws:brief"
    };

    function scopedKey(){
      const team = getTeam();
      const k = KEYS[keySel.value] || KEYS.General;
      return `${k}:${team}`;
    }
    function loadKey(){ ta.value = localStorage.getItem(scopedKey()) || ""; }
    function saveKey(){
      localStorage.setItem(scopedKey(), ta.value);
      alert("Workspace salvato in locale (per team).");
    }

    if(keySel) keySel.addEventListener("change", loadKey);
    if(loadBtn) loadBtn.addEventListener("click", loadKey);
    if(saveBtn) saveBtn.addEventListener("click", saveKey);
    if(clearBtn) clearBtn.addEventListener("click", ()=>{
      if(confirm("Vuoi svuotare il workspace (per questo team)?")){
        ta.value = "";
        saveKey();
      }
    });

    if(exportBtn) exportBtn.addEventListener("click", ()=>{
      const team = getTeam();
      const blob = new Blob([ta.value], {type:"text/plain;charset=utf-8"});
      const a = document.createElement("a");
      a.href = URL.createObjectURL(blob);
      a.download = `intelsim_workspace_${team}.txt`;
      a.click();
      URL.revokeObjectURL(a.href);
    });

    loadKey();
  }

  // ---------- Timeline ----------
  function timelineBind(cfg){
    const list = $("tlList");
    if(!list) return;

    const viewSel = $("tlView");
    const sortSel = $("tlSort");
    const searchInp = $("tlSearch");

    function allItems(){
      const currentTeam = getTeam();
      const acts = (cfg.activations||[])
        .filter(a=>teamMatch(a.team, currentTeam))
        .map(a=>({kind:"ACT", id:a.id, releaseMin:Number(a.releaseMin||0), type:String(a.type||"OTHER").toUpperCase(), team:String(a.team||"ALL").toUpperCase(), title:a.title||"", body:a.body||"", source:a.source||""}));

      const tasks = (cfg.tasking||[])
        .filter(q=>teamMatch(q.team, currentTeam))
        .map(q=>({kind:"TASK", id:q.id, releaseMin:Number(q.releaseMin||0), type:"TASKING", team:String(q.team||"ALL").toUpperCase(), title:q.question||"", body:q.notes||"", source:q.priority||""}));

      const instr = loadInstructor();
      const inj = (instr.injects||[])
        .filter(x=>teamMatch(x.team, currentTeam))
        .map(x=>{
          const t = String(x.type||"OTHER").toUpperCase();
          const kind = (t==="TASKING") ? "TASK" : "ACT";
          return {kind, id:x.id, releaseMin:Number(x.releaseMin||0), type:t, team:String(x.team||"ALL").toUpperCase(), title:(x.title||x.question||""), body:(x.body||x.notes||""), source:(x.source||x.priority||""), injected:true};
        });

      return [...acts, ...tasks, ...inj];
    }

    function isReleased(item){
      const tMin = elapsedMin();
      if(tMin==null) return false;
      if(item.injected) return true;
      return Number(item.releaseMin||0) <= tMin;
    }

    function render(){
      const view = viewSel ? viewSel.value : "ALL";
      const sort = sortSel ? sortSel.value : "ASC";
      const q = (searchInp ? searchInp.value : "").trim().toLowerCase();

      let items = allItems();

      if(view==="ACT") items = items.filter(x=>x.kind==="ACT");
      if(view==="TASK") items = items.filter(x=>x.kind==="TASK");
      if(view==="RELEASED") items = items.filter(isReleased);

      if(q){
        items = items.filter(x=>{
          return (String(x.id).toLowerCase().includes(q) ||
            String(x.title).toLowerCase().includes(q) ||
            String(x.body).toLowerCase().includes(q) ||
            String(x.source).toLowerCase().includes(q) ||
            String(x.type).toLowerCase().includes(q) ||
            String(x.team).toLowerCase().includes(q));
        });
      }

      items.sort((a,b)=> sort==="DESC" ? (b.releaseMin-a.releaseMin) : (a.releaseMin-b.releaseMin));

      list.innerHTML = "";
      if(!items.length){
        list.innerHTML = `<div class="item"><div class="h">Nessun elemento</div><div class="small">Prova a cambiare filtri o team.</div></div>`;
        return;
      }

      items.forEach(it=>{
        const div = document.createElement("div");
        div.className="item tl-item";
        const released = isReleased(it);
        const rm = it.injected ? "INJECT" : `T+${it.releaseMin}m`;
        const tags = `
          <span class="pill mono">${it.team}</span>
          <span class="${pillClass(it.type)}">${it.type}</span>
          <span class="pill mono">${rm}</span>
          <span class="pill">${it.kind==="TASK" ? "TASK" : "ACT"}</span>
          ${released ? '<span class="pill good">RELEASED</span>' : '<span class="pill warn">PENDING</span>'}
        `;
        div.innerHTML = `
          <div class="tl-head">
            <div>
              <div class="h">${it.id} — ${it.title || "—"}</div>
              ${it.source ? `<div class="small">Fonte/Priority: <span class="mono">${it.source}</span></div>` : ""}
              ${it.body ? `<div class="small" style="margin-top:6px;white-space:pre-wrap">${it.body}</div>` : ""}
            </div>
            <div class="tl-tags">${tags}</div>
          </div>
        `;
        list.appendChild(div);
      });
    }

    ["change","keyup"].forEach(ev=>{
      if(viewSel) viewSel.addEventListener(ev, render);
      if(sortSel) sortSel.addEventListener(ev, render);
      if(searchInp) searchInp.addEventListener(ev, render);
    });

    render();
    setInterval(render, 5000);
  }

  // ---------- Instructor ----------
  function instructorBind(cfg){
    const e = elapsedSec();
    if($("instructorHint")){
      $("instructorHint").textContent = e==null
        ? "Avvia prima la sessione dalla Dashboard (o link ?start=...)."
        : "Sessione attiva: puoi rilasciare manualmente o fare inject.";
    }

    // Manual release
    const releaseSel = $("releaseSelect");
    const releaseBtn = $("releaseBtn");
    const clearManual = $("clearManual");
    const manualList = $("manualList");

    const instr = loadInstructor();
    instr.manualReleases = instr.manualReleases || [];
    instr.injects = instr.injects || [];

    function renderManual(){
      if(!manualList) return;
      manualList.innerHTML="";
      if(!instr.manualReleases.length){
        manualList.innerHTML = `<div class="small">Nessun rilascio manuale.</div>`;
        return;
      }
      instr.manualReleases.forEach(id=>{
        const div = document.createElement("div");
        div.className="row";
        div.innerHTML = `<span class="pill mono">${id}</span><button class="btn danger">Rimuovi</button>`;
        div.querySelector("button").addEventListener("click", ()=>{
          instr.manualReleases = instr.manualReleases.filter(x=>x!==id);
          saveInstructor(instr);
          renderManual();
        });
        manualList.appendChild(div);
      });
    }

    if(releaseSel){
      const currentTeam = getTeam();
      releaseSel.innerHTML="";
      (cfg.activations||[])
        .filter(a=>teamMatch(a.team, currentTeam))
        .forEach(a=>{
          const opt = document.createElement("option");
          opt.value = a.id;
          opt.textContent = `${a.id} — ${a.team||"ALL"} — T+${a.releaseMin}m — ${a.title}`;
          releaseSel.appendChild(opt);
        });
    }
    if(releaseBtn && releaseSel){
      releaseBtn.addEventListener("click", ()=>{
        const id = releaseSel.value;
        if(!id) return;
        if(!instr.manualReleases.includes(id)) instr.manualReleases.push(id);
        saveInstructor(instr);
        renderManual();
        alert("Rilascio manuale registrato (locale).");
      });
    }
    if(clearManual){
      clearManual.addEventListener("click", ()=>{
        if(confirm("Vuoi rimuovere tutti i rilasci manuali?")){
          instr.manualReleases = [];
          saveInstructor(instr);
          renderManual();
        }
      });
    }
    renderManual();

    // Inject creator
    const injType = $("injType");
    const injId = $("injId");
    const injSource = $("injSource");
    const injTitle = $("injTitle");
    const injBody = $("injBody");
    const injTeam = $("injTeam");
    const injBtn = $("injBtn");
    const injList = $("injList");
    const clearInj = $("clearInj");

    // Populate injTeam
    if(injTeam){
      injTeam.innerHTML = "";
      const teams = (cfg.teams && Array.isArray(cfg.teams) && cfg.teams.length)
        ? cfg.teams
        : [{id:"ALL",label:"All Teams"}];
      teams.forEach(t=>{
        const opt = document.createElement("option");
        opt.value = String(t.id||"ALL").toUpperCase();
        opt.textContent = t.label ? t.label : opt.value;
        injTeam.appendChild(opt);
      });
      injTeam.value = getTeam();
    }

    function renderInjects(){
      if(!injList) return;
      const instrNow = loadInstructor();
      const items = (instrNow.injects||[]).slice().reverse();
      injList.innerHTML="";
      if(!items.length){
        injList.innerHTML = `<div class="small">Nessun inject.</div>`;
        return;
      }
      items.forEach((item, idx)=>{
        const div = document.createElement("div");
        div.className="item";
        const t = String(item.type||"OTHER").toUpperCase();
        const team = String(item.team||"ALL").toUpperCase();
        div.innerHTML = `
          <div class="row" style="justify-content:space-between">
            <div>
              <div class="h">${item.id} — ${item.title||item.question||""}</div>
              <div class="small" style="white-space:pre-wrap">${item.body||item.notes||""}</div>
              <div class="meta"><span class="${pillClass(t)}">${t}</span><span class="pill mono">${team}</span><span class="pill mono">INJECT</span></div>
            </div>
            <button class="btn danger">Elimina</button>
          </div>
        `;
        div.querySelector("button").addEventListener("click", ()=>{
          const instr2 = loadInstructor();
          instr2.injects = (instr2.injects||[]).filter(x=>String(x.id)!==String(item.id));
          saveInstructor(instr2);
          renderInjects();
        });
        injList.appendChild(div);
      });
    }

    if(injBtn){
      injBtn.addEventListener("click", ()=>{
        const t = String(injType?.value||"OTHER").toUpperCase();
        const id = (injId?.value||"").trim() || ("INJ-"+nowISO().replaceAll(":","").replaceAll("-",""));
        const team = injTeam ? String(injTeam.value||"ALL").toUpperCase() : getTeam();

        const instr2 = loadInstructor();
        instr2.injects = instr2.injects || [];

        if(t==="TASKING"){
          const question = (injTitle?.value||"").trim();
          const notes = (injBody?.value||"").trim();
          instr2.injects.push({type:"TASKING", id, team, releaseMin: (elapsedMin()||0), priority:"High", question, notes});
        }else{
          const title = (injTitle?.value||"").trim();
          const body = (injBody?.value||"").trim();
          const source = (injSource?.value||"").trim();
          instr2.injects.push({type:t, id, team, title, body, source, releaseMin:(elapsedMin()||0)});
        }

        saveInstructor(instr2);
        if(injId) injId.value=""; if(injSource) injSource.value=""; if(injTitle) injTitle.value=""; if(injBody) injBody.value="";
        renderInjects();
        renderWcLog();
        alert("Inject creato (locale).");
      });
    }
    if(clearInj){
      clearInj.addEventListener("click", ()=>{
        if(confirm("Vuoi eliminare tutti gli inject?")){
          const instr2 = loadInstructor();
          instr2.injects = [];
          saveInstructor(instr2);
          renderInjects();
          renderWcLog();
        }
      });
    }

    // Phase controls
    const pG = $("phaseGreen"), pA = $("phaseAmber"), pR = $("phaseRed"), pX = $("phaseReset");
    if(pG) pG.addEventListener("click", ()=>{ setPhase("GREEN"); renderPhasePill(); alert("Phase: GREEN"); });
    if(pA) pA.addEventListener("click", ()=>{ setPhase("AMBER"); renderPhasePill(); alert("Phase: AMBER"); });
    if(pR) pR.addEventListener("click", ()=>{ setPhase("RED"); renderPhasePill(); alert("Phase: RED"); });
    if(pX) pX.addEventListener("click", ()=>{ setPhase(""); renderPhasePill(); alert("Phase: reset"); });

    // Broadcast (TEAM=ALL)
    const bcTitle = $("bcTitle"), bcBody = $("bcBody"), bcSend = $("bcSend"), bcClear = $("bcClear");
    if(bcClear) bcClear.addEventListener("click", ()=>{ if(bcTitle) bcTitle.value=""; if(bcBody) bcBody.value=""; });
    if(bcSend){
      bcSend.addEventListener("click", ()=>{
        const title = (bcTitle?.value||"").trim() || "Instructor broadcast";
        const body = (bcBody?.value||"").trim();
        const id = "BC-"+nowISO().replaceAll(":","").replaceAll("-","");
        const tMin = elapsedMin() || 0;
        const instr2 = loadInstructor();
        instr2.injects = instr2.injects || [];
        instr2.injects.push({type:"OTHER", id, team:"ALL", title, body, source:"Instructor", releaseMin:tMin});
        saveInstructor(instr2);
        if(bcTitle) bcTitle.value=""; if(bcBody) bcBody.value="";
        renderInjects();
        renderWcLog();
        alert("Broadcast inviato (ALL).");
      });
    }

    // White Cell / Control Log
    const wcLog = $("wcLog");
    const wcUndoLast = $("wcUndoLast");
    const wcExport = $("wcExport");
    const wcClearAll = $("wcClearAll");

    function renderWcLog(){
      if(!wcLog) return;
      const instrNow = loadInstructor();
      const items = (instrNow.injects||[]).slice().reverse(); // newest first
      wcLog.innerHTML = "";
      if(!items.length){
        wcLog.innerHTML = `<div class="item"><div class="h">Nessun inject</div><div class="small">Usa Inject o Broadcast per creare eventi.</div></div>`;
        return;
      }
      items.forEach(it=>{
        const t = String(it.type||"OTHER").toUpperCase();
        const team = String(it.team||"ALL").toUpperCase();
        const title = it.title || it.question || "—";
        const body = it.body || it.notes || "";
        const rm = "INJECT";
        const div = document.createElement("div");
        div.className = "item";
        div.innerHTML = `
          <div class="row" style="justify-content:space-between;align-items:flex-start">
            <div>
              <div class="h">${it.id} — ${title}</div>
              ${body ? `<div class="small" style="margin-top:6px;white-space:pre-wrap">${body}</div>` : ""}
              <div class="meta">
                <span class="${pillClass(t)}">${t}</span>
                <span class="pill mono">${team}</span>
                <span class="pill mono">${rm}</span>
              </div>
            </div>
            <div class="row" style="justify-content:flex-end">
              <button class="btn danger" data-del="${it.id}">Elimina</button>
            </div>
          </div>
        `;
        div.querySelector("button").addEventListener("click", ()=>{
          const id = it.id;
          const instr2 = loadInstructor();
          instr2.injects = (instr2.injects||[]).filter(x=>String(x.id)!==String(id));
          saveInstructor(instr2);
          renderInjects();
          renderWcLog();
          alert("Inject eliminato: " + id);
        });
        wcLog.appendChild(div);
      });
    }

    if(wcUndoLast){
      wcUndoLast.addEventListener("click", ()=>{
        const instr2 = loadInstructor();
        instr2.injects = instr2.injects || [];
        if(!instr2.injects.length){ alert("Nessun inject da annullare."); return; }
        const last = instr2.injects.pop();
        saveInstructor(instr2);
        renderInjects();
        renderWcLog();
        alert("Undo: " + (last?.id || "ultimo inject"));
      });
    }
    if(wcClearAll){
      wcClearAll.addEventListener("click", ()=>{
        if(!confirm("Vuoi eliminare TUTTI gli inject?")) return;
        const instr2 = loadInstructor();
        instr2.injects = [];
        saveInstructor(instr2);
        renderInjects();
        renderWcLog();
        alert("Log inject svuotato.");
      });
    }
    if(wcExport){
      wcExport.addEventListener("click", ()=>{
        const payload = {exportedAt: new Date().toISOString(), injects: (loadInstructor().injects||[])};
        downloadJSON(payload, "intelsim_inject_log.json");
      });
    }

    renderInjects();
    renderWcLog();
  }

  // ---------- Admin ----------
  function adminBind(cfg){
    const exp = $("exportConfig");
    const expPack = $("exportPack");
    const imp = $("importConfig");
    const impPack = $("importPack");
    const impFile = $("importFile");
    const resetAll = $("resetAll");

    if(exp){
      exp.addEventListener("click", ()=>{
        const payload = {exportedAt:new Date().toISOString(), overrides: loadOverrides(), instructor: loadInstructor()};
        downloadJSON(payload, "intelsim_config_export.json");
      });
    }
    if(expPack){
      expPack.addEventListener("click", ()=>{
        const payload = {exportedAt:new Date().toISOString(), startISO: getStartISO() || "", phase: getPhase() || "", overrides: loadOverrides(), instructor: loadInstructor()};
        downloadJSON(payload, "intelsim_session_pack.json");
      });
    }

    function importPayload(payload, isPack){
      if(payload.overrides) saveOverrides(payload.overrides);
      if(payload.instructor) saveInstructor(payload.instructor);
      if(isPack && typeof payload.startISO==="string"){
        setStartISO(payload.startISO.trim());
        if(typeof payload.phase==="string") setPhase(payload.phase.trim());
      }
      alert("Import completato. Ricarico…");
      location.reload();
    }

    if(imp && impFile){
      imp.addEventListener("click", ()=>{ impFile.dataset.mode="config"; impFile.click(); });
    }
    if(impPack && impFile){
      impPack.addEventListener("click", ()=>{ impFile.dataset.mode="pack"; impFile.click(); });
    }
    if(impFile){
      impFile.addEventListener("change", async ()=>{
        const file = impFile.files?.[0];
        if(!file) return;
        const text = await file.text();
        const payload = safeJsonParse(text, null);
        if(!payload || typeof payload!=="object"){ alert("File non valido."); return; }
        const mode = impFile.dataset.mode || "config";
        importPayload(payload, mode==="pack");
      });
    }

    if(resetAll){
      resetAll.addEventListener("click", ()=>{
        if(confirm("Reset totale (overrides + instructor + sessione + team + phase)?")){
          localStorage.removeItem(LS.overrides);
          localStorage.removeItem(LS.instructor);
          localStorage.removeItem(LS.start);
          localStorage.removeItem(LS.team);
          localStorage.removeItem(LS.phase);
          alert("Reset completato. Ricarico…");
          location.reload();
        }
      });
    }

    // Health Check
    const hcRun = $("healthCheckRun");
    const hcClear = $("healthCheckClear");
    const hcBox = $("healthCheckResults");

    function hcLine(status, title, detail){
      const div = document.createElement("div");
      div.className = "item";
      const pill = status==="OK" ? "pill good" : (status==="WARN" ? "pill warn" : "pill danger");
      div.innerHTML = `
        <div class="row" style="justify-content:space-between;align-items:flex-start">
          <div>
            <div class="h">${title}</div>
            ${detail ? `<div class="small" style="margin-top:6px;white-space:pre-wrap">${detail}</div>` : ""}
          </div>
          <span class="${pill}">${status}</span>
        </div>
      `;
      return div;
    }

    async function probe(url){
      try{ return await fetch(url, {method:"HEAD", cache:"no-store"}); }
      catch(e){ return await fetch(url, {method:"GET", cache:"no-store"}); }
    }
    async function probeManual(url){
      try{ return await fetch(url, {method:"GET", cache:"no-store", redirect:"manual"}); }
      catch(e){ return null; }
    }

    async function runHealthCheck(){
      if(!hcBox) return;
      hcBox.innerHTML = "";
      const base = location.origin;

      const checks = [
        {name:"assets/app.js", url:"/assets/app.js"},
        {name:"assets/styles.css", url:"/assets/styles.css"},
        {name:"assets/data.json", url:"/assets/data.json"},
        {name:"assets/logo.png", url:"/assets/logo.png"},
        {name:"Dashboard (/) ", url:"/"},
        {name:"Feed (/feed)", url:"/feed"},
        {name:"Timeline (/timeline)", url:"/timeline"},
        {name:"Instructor (/instructor)", url:"/instructor"},
        {name:"Admin (/admin)", url:"/admin"},
        {name:"Documents (/documents)", url:"/documents"},
        {name:"Workspace (/workspace)", url:"/workspace"},
        {name:"Tasking (/tasking)", url:"/tasking"},
        {name:"AI (/ai)", url:"/ai"},
        {name:"Submit (/submit)", url:"/submit"},
      ];

      for(const c of checks){
        try{
          const r = await probe(c.url);
          const ok = r && r.ok;
          const redirected = !!r.redirected;
          const isAsset = String(c.url||"").startsWith("/assets/");
          const status = ok ? ((redirected && isAsset) ? "WARN" : "OK") : "FAIL";
          const detail = `URL: ${base}${c.url}\nHTTP: ${r.status} ${r.statusText}${redirected ? `\nRedirected → ${r.url}` : ""}`;
          hcBox.appendChild(hcLine(status, c.name, detail));
        }catch(err){
          hcBox.appendChild(hcLine("FAIL", c.name, String(err)));
        }
      }

      // _redirects (optional)
      try{
        const r = await probe("/_redirects");
        if(r && r.ok){
          const txt = await (await fetch("/_redirects", {cache:"no-store"})).text();
          const lines = txt.split(/\r?\n/).map(l=>l.trim()).filter(l=>l && !l.startsWith("#"));
          let suspect = [];
          for(const line of lines){
            const parts = line.split(/\s+/);
            if(parts.length >= 3){
              const from = parts[0], to = parts[1], status = parts[2];
              const isRedirect = ["301","302","303","307","308"].includes(status);
              if(isRedirect){
                if((from==="/admin" && to==="/admin/") || (from==="/admin/" && to==="/admin")) suspect.push(line);
                if((from==="/feed" && to==="/feed/") || (from==="/feed/" && to==="/feed")) suspect.push(line);
                if((from==="/timeline" && to==="/timeline/") || (from==="/timeline/" && to==="/timeline")) suspect.push(line);
              }
            }
          }
          hcBox.appendChild(hcLine(suspect.length ? "WARN" : "OK", "_redirects presente", "Righe: "+lines.length + (suspect.length? "\nPossibili loop:\n- "+suspect.join("\n- "): "")));
        }else{
          hcBox.appendChild(hcLine("OK", "_redirects", "Nessun file _redirects (ok per sito multipagina)."));
        }
      }catch(err){
        hcBox.appendChild(hcLine("WARN", "_redirects", "Impossibile verificare _redirects: "+String(err)));
      }

      // Manual redirects
      try{
        const targets = ["/admin","/admin/","/feed","/feed/","/timeline","/timeline/"];
        for(const t of targets){
          const r = await probeManual(t);
          if(!r) continue;
          if([301,302,303,307,308].includes(r.status)){
            const loc = r.headers.get("Location") || "(Location header non accessibile)";
            hcBox.appendChild(hcLine("WARN", "Redirect (manual) " + t, "HTTP: "+r.status+"\nLocation: "+loc));
          }
        }
      }catch(e){}

      // Validate JSON
      try{
        const r = await fetch("/assets/data.json", {cache:"no-store"});
        const txt = await r.text();
        const obj = JSON.parse(txt);
        hcBox.appendChild(hcLine("OK", "data.json — JSON valido", "Chiavi top-level: " + Object.keys(obj||{}).join(", ")));
      }catch(err){
        hcBox.appendChild(hcLine("FAIL", "data.json — JSON non valido", String(err)));
      }
    }

    if(hcClear && hcBox) hcClear.addEventListener("click", ()=>{ hcBox.innerHTML=""; });
    if(hcRun) hcRun.addEventListener("click", runHealthCheck);

    // Branding
    const pt = $("platTitle");
    const ps = $("platSubtitle");
    const savePlat = $("savePlatform");
    const resetPlat = $("resetPlatform");

    const ov = loadOverrides();
    const platOv = (ov.platform && typeof ov.platform==="object") ? ov.platform : {};
    if(pt) pt.value = platOv.title || cfg.platform?.title || "SimIA - Analytical Simulation Platform";
    if(ps) ps.value = platOv.subtitle || cfg.platform?.subtitle || "";

    if(savePlat){
      savePlat.addEventListener("click", ()=>{
        const o = loadOverrides();
        o.platform = {title:(pt?.value||"SimIA - Analytical Simulation Platform").trim(), subtitle:(ps?.value||"").trim(), version: cfg.platform?.version || "3.0"};
        saveOverrides(o);
        alert("Branding salvato (locale).");
      });
    }
    
// --- Logo upload ---
const logoInput = $("logoUpload");
if(logoInput){
  logoInput.addEventListener("change", ()=>{
    const file = logoInput.files[0];
    if(!file) return;
    const reader = new FileReader();
    reader.onload = function(e){
      const o = loadOverrides();
      o.platform = o.platform || {};
      o.platform.logo = e.target.result;
      saveOverrides(o);
      alert("Logo salvato. Ricarico...");
      location.reload();
    };
    reader.readAsDataURL(file);
  });
}

if(resetPlat){
      resetPlat.addEventListener("click", ()=>{
        const o = loadOverrides();
        delete o.platform;
        saveOverrides(o);
        if(pt) pt.value = cfg.platform?.title || "SimIA - Analytical Simulation Platform";
        if(ps) ps.value = cfg.platform?.subtitle || "";
        alert("Reset branding.");
      });
    }

    // Checkpoints (forms)
    const formsBox = $("formsBox");
    const saveForms = $("saveForms");
    const resetForms = $("resetForms");
    if(formsBox){
      formsBox.innerHTML = "";
      const inputs = [];
      (cfg.checkpoints||[]).forEach(cp=>{
        const wrap = document.createElement("div");
        wrap.style.marginBottom="10px";
        wrap.innerHTML = `
          <label class="lbl">${cp.id} — ${cp.label} <span class="pill mono">T+${cp.dueMin}m</span></label>
          <input class="input" placeholder="Link modulo (Google Forms / Tally)..." value="${(cp.formUrl||"").replaceAll('"','&quot;')}"/>
        `;
        inputs.push({id:cp.id, el:wrap.querySelector("input")});
        formsBox.appendChild(wrap);
      });

      const ovCps = (loadOverrides().checkpoints || null);
      if(ovCps){
        inputs.forEach(inp=>{
          const cp = ovCps.find(x=>x.id===inp.id);
          if(cp && cp.formUrl!=null) inp.el.value = cp.formUrl;
        });
      }

      if(saveForms){
        saveForms.addEventListener("click", ()=>{
          const o = loadOverrides();
          const cps = (cfg.checkpoints||[]).map(cp=>{
            const f = inputs.find(x=>x.id===cp.id);
            return Object.assign({}, cp, {formUrl: (f?.el.value||"").trim()});
          });
          o.checkpoints = cps;
          saveOverrides(o);
          alert("Checkpoint salvati (locale).");
        });
      }
      if(resetForms){
        resetForms.addEventListener("click", ()=>{
          const o = loadOverrides();
          delete o.checkpoints;
          saveOverrides(o);
          alert("Reset checkpoints. Ricarico…");
          location.reload();
        });
      }
    }

    // Agents
    const agentsBox = $("agentsBox");
    const saveAgents = $("saveAgents");
    const resetAgents = $("resetAgents");
    if(agentsBox){
      agentsBox.innerHTML="";
      const rows = [];
      (cfg.agents||[]).forEach(ag=>{
        const div = document.createElement("div");
        div.className="item";
        div.innerHTML = `
          <div class="row" style="justify-content:space-between;align-items:flex-start">
            <div style="min-width:220px">
              <div class="h">${ag.name}</div>
              <div class="small">${ag.role}</div>
            </div>
            <span class="pill mono">${ag.id}</span>
          </div>
          <div class="sep"></div>
          <label class="lbl">Prompt</label>
          <textarea rows="5" class="input"></textarea>
        `;
        const ta = div.querySelector("textarea");
        ta.value = ag.prompt || "";
        rows.push({id:ag.id,name:ag.name,role:ag.role,ta});
        agentsBox.appendChild(div);
      });

      const ovAgents = (loadOverrides().agents || null);
      if(ovAgents){
        rows.forEach(r=>{
          const found = ovAgents.find(x=>x.id===r.id);
          if(found && found.prompt!=null) r.ta.value = found.prompt;
        });
      }

      if(saveAgents){
        saveAgents.addEventListener("click", ()=>{
          const o = loadOverrides();
          o.agents = rows.map(r=>({id:r.id,name:r.name,role:r.role,prompt:r.ta.value}));
          saveOverrides(o);
          alert("Agenti salvati (locale).");
        });
      }
      if(resetAgents){
        resetAgents.addEventListener("click", ()=>{
          const o = loadOverrides();
          delete o.agents;
          saveOverrides(o);
          alert("Reset agenti. Ricarico…");
          location.reload();
        });
      }
    }

    // Documents
    const docsBox = $("docsAdminBox");
    const saveDocs = $("saveDocs");
    const resetDocs = $("resetDocs");
    if(docsBox){
      docsBox.innerHTML="";
      const rows=[];
      (cfg.documents||[]).forEach(d=>{
        const div = document.createElement("div");
        div.className="item";
        div.innerHTML = `
          <div class="row" style="justify-content:space-between">
            <div class="h">${d.id}</div>
            <span class="pill">${d.type||"—"}</span>
          </div>
          <div class="sep"></div>
          <label class="lbl">Titolo</label><input class="input" value="${(d.title||"").replaceAll('"','&quot;')}"/>
          <div class="row" style="margin-top:10px">
            <div style="flex:1">
              <label class="lbl">Tipo</label>
              <select class="input">
                ${["PDF","IMG","LINK","TXT","OTHER"].map(t=>`<option ${String(d.type||"").toUpperCase()===t?"selected":""}>${t}</option>`).join("")}
              </select>
            </div>
            <div style="flex:3">
              <label class="lbl">URL</label><input class="input" placeholder="https://..." value="${(d.url||"").replaceAll('"','&quot;')}"/>
            </div>
          </div>
        `;
        const inputs = div.querySelectorAll("input,select");
        rows.push({id:d.id,title:inputs[0],type:inputs[1],url:inputs[2]});
        docsBox.appendChild(div);
      });

      if(saveDocs){
        saveDocs.addEventListener("click", ()=>{
          const o = loadOverrides();
          o.documents = rows.map(r=>({id:r.id,title:r.title.value.trim(),type:r.type.value,url:r.url.value.trim()}));
          saveOverrides(o);
          alert("Documenti salvati (locale).");
        });
      }
      if(resetDocs){
        resetDocs.addEventListener("click", ()=>{
          const o = loadOverrides();
          delete o.documents;
          saveOverrides(o);
          alert("Reset documenti. Ricarico…");
          location.reload();
        });
      }
    }

    // Teams editor
    const teamsBox = $("teamsAdminBox");
    const addTeamBtn = $("addTeam");
    const saveTeamsBtn = $("saveTeams");
    const resetTeamsBtn = $("resetTeams");

    function normalizeTeamId(s){
      return String(s||"").trim().toUpperCase().replace(/[^A-Z0-9_-]/g,"");
    }

    function renderTeamsEditor(list){
      if(!teamsBox) return [];
      teamsBox.innerHTML = "";
      const rows = [];
      list.forEach((t, idx)=>{
        const div = document.createElement("div");
        div.className="item";
        div.innerHTML = `
          <div class="row" style="justify-content:space-between">
            <div class="h">Team</div>
            <div class="row">
              <span class="pill mono">${t.id||""}</span>
              <button class="btn danger" data-action="del">Elimina</button>
            </div>
          </div>
          <div class="sep"></div>
          <div class="row">
            <div style="flex:1">
              <label class="lbl">ID</label>
              <input class="input" value="${(t.id||"").replaceAll('"','&quot;')}"/>
            </div>
            <div style="flex:3">
              <label class="lbl">Label</label>
              <input class="input" value="${(t.label||"").replaceAll('"','&quot;')}"/>
            </div>
          </div>

          <div class="row" style="margin-top:10px;align-items:flex-end">
            <div style="flex:1">
              <label class="lbl">Icona (PNG/SVG, piccola)</label>
              <div class="row" style="align-items:center;gap:10px">
                <div class="teamicon" data-iconbox>
                  ${t.icon ? `<img src="${t.icon}" alt="icon"/>` : `<span class="small">—</span>`}
                </div>
                <div class="row" style="flex-wrap:wrap">
                  <button class="btn" type="button" data-action="iconUpload">Carica</button>
                  <button class="btn ghost" type="button" data-action="iconClear">Rimuovi</button>
                </div>
                <input type="file" accept="image/*" style="display:none" data-action="iconFile"/>
              </div>
              <div class="small">Suggerito: 64×64 o 96×96, &lt; 50KB. Salvata localmente nel browser Admin.</div>
            </div>
          </div>

        `;
        const inputs = div.querySelectorAll("input");
        div.querySelector('[data-action="del"]').addEventListener("click", ()=>{
          if(confirm("Eliminare questo team?")){
            list.splice(idx,1);
            renderTeamsEditor(list);
          }
        });
        const fileEl = div.querySelector('[data-action="iconFile"]');
        div.querySelector('[data-action="iconUpload"]').addEventListener("click", ()=>{
          if(fileEl) fileEl.click();
        });
        div.querySelector('[data-action="iconClear"]').addEventListener("click", ()=>{
          if(confirm("Rimuovere l'icona di questo team?")){
            list[idx].icon = "";
            renderTeamsEditor(list);
          }
        });
        if(fileEl){
          fileEl.addEventListener("change", ()=>{
            const f = fileEl.files && fileEl.files[0];
            if(!f) return;
            if(f.size > 250_000){ alert("File troppo grande. Riduci dimensione (< 250KB)."); fileEl.value=""; return; }
            const reader = new FileReader();
            reader.onload = ()=>{
              list[idx].icon = String(reader.result||"");
              renderTeamsEditor(list);
            };
            reader.readAsDataURL(f);
          });
        }

        rows.push({idx, id:inputs[0], label:inputs[1]});
        teamsBox.appendChild(div);
      });
      return rows;
    }

    let teamsList = (cfg.teams||[{id:"ALL",label:"All Teams"}]).map(x=>Object.assign({}, x));
    if(!teamsList.some(t=>String(t.id).toUpperCase()==="ALL")){
      teamsList.unshift({id:"ALL",label:"All Teams"});
    }
    let teamRows = renderTeamsEditor(teamsList);

    if(addTeamBtn){
      addTeamBtn.addEventListener("click", ()=>{
        teamsList.push({id:"",label:""});
        teamRows = renderTeamsEditor(teamsList);
      });
    }
    if(saveTeamsBtn){
      saveTeamsBtn.addEventListener("click", async ()=>{
        const o = loadOverrides();
        const out = [];
        for(const r of teamRows){
          const id = normalizeTeamId(r.id.value);
          const label = (r.label.value||"").trim();
          if(!id) continue;
          out.push({id, label: label || id, icon: (teamsList[r.idx] && teamsList[r.idx].icon) ? teamsList[r.idx].icon : ''});
        }
        if(!out.some(t=>t.id==="ALL")) out.unshift({id:"ALL",label:"All Teams"});
        o.teams = out;
        saveOverrides(o);
        alert("Teams salvati (locale). Ricarica per aggiornare i selettori.");
      });
    }
    if(resetTeamsBtn){
      resetTeamsBtn.addEventListener("click", ()=>{
        const o = loadOverrides();
        delete o.teams;
        saveOverrides(o);
        alert("Reset teams. Ricarico…");
        location.reload();
      });
    }

    // Tasking CRUD
    const taskingAdminBox = $("taskingAdminBox");
    const addTaskingBtn = $("addTasking");
    const saveTaskingBtn = $("saveTasking");
    const resetTaskingBtn = $("resetTasking");

    const PRIORITIES = ["High","Medium","Low"];

    function teamSelectHTML(selected){
      const list = (loadOverrides().teams || cfg.teams || [{id:"ALL",label:"All Teams"}]);
      const sel = String(selected||"ALL").toUpperCase();
      return `<select class="input">${list.map(t=>{
        const id = String(t.id||"ALL").toUpperCase();
        const label = t.label || id;
        return `<option value="${id}" ${id===sel?"selected":""}>${label}</option>`;
      }).join("")}</select>`;
    }

    function renderTaskingEditor(list){
      if(!taskingAdminBox) return [];
      taskingAdminBox.innerHTML = "";
      const rows = [];
      list.forEach((q, idx)=>{
        const div = document.createElement("div");
        div.className="item";
        div.innerHTML = `
          <div class="row" style="justify-content:space-between;align-items:flex-start">
            <div class="h">Tasking</div>
            <div class="row">
              <span class="pill mono">${q.id||""}</span>
              <button class="btn danger" data-action="del">Elimina</button>
            </div>
          </div>
          <div class="sep"></div>
          <div class="row">
            <div style="flex:1">
              <label class="lbl">ID</label>
              <input class="input" value="${(q.id||"").replaceAll('"','&quot;')}"/>
            </div>
            <div style="flex:1">
              <label class="lbl">Release (min)</label>
              <input class="input" type="number" min="0" value="${Number(q.releaseMin||0)}"/>
            </div>
            <div style="flex:1">
              <label class="lbl">Priority</label>
              <select class="input">
                ${PRIORITIES.map(p=>`<option ${String(q.priority||"").toLowerCase()===p.toLowerCase()?"selected":""}>${p}</option>`).join("")}
              </select>
            </div>
            <div style="flex:1">
              <label class="lbl">Team</label>
              ${teamSelectHTML(q.team)}
            </div>
          </div>
          <label class="lbl" style="margin-top:10px">Question</label>
          <input class="input" value="${(q.question||"").replaceAll('"','&quot;')}"/>
          <label class="lbl" style="margin-top:10px">Notes</label>
          <textarea rows="3" class="input"></textarea>
        `;
        const inputs = div.querySelectorAll("input,select,textarea");
        inputs[5].value = q.notes || "";
        div.querySelector('[data-action="del"]').addEventListener("click", ()=>{
          if(confirm("Eliminare questo tasking?")){
            list.splice(idx,1);
            renderTaskingEditor(list);
          }
        });
        rows.push({id:inputs[0], releaseMin:inputs[1], priority:inputs[2], team:inputs[3], question:inputs[4], notes:inputs[5]});
        taskingAdminBox.appendChild(div);
      });
      return rows;
    }

    let taskingList = (cfg.tasking||[]).map(x=>Object.assign({team:"ALL"}, x));
    let taskingRows = renderTaskingEditor(taskingList);

    if(addTaskingBtn){
      addTaskingBtn.addEventListener("click", ()=>{
        const nextN = taskingList.length + 1;
        taskingList.push({id:`Q${String(nextN).padStart(2,"0")}`, releaseMin:0, priority:"High", team:"ALL", question:"", notes:""});
        taskingRows = renderTaskingEditor(taskingList);
      });
    }
    if(saveTaskingBtn){
      saveTaskingBtn.addEventListener("click", ()=>{
        const o = loadOverrides();
        const out = [];
        for(const r of taskingRows){
          const id = r.id.value.trim();
          if(!id) continue;
          out.push({
            id,
            releaseMin: Number(r.releaseMin.value||0),
            priority: r.priority.value,
            team: String(r.team.value||"ALL").toUpperCase(),
            question: r.question.value.trim(),
            notes: r.notes.value
          });
        }
        out.sort((a,b)=> (a.releaseMin-b.releaseMin) || String(a.id).localeCompare(String(b.id)));
        o.tasking = out;
        saveOverrides(o);
        alert("Tasking salvati (locale).");
      });
    }
    if(resetTaskingBtn){
      resetTaskingBtn.addEventListener("click", ()=>{
        const o = loadOverrides();
        delete o.tasking;
        saveOverrides(o);
        alert("Reset tasking. Ricarico…");
        location.reload();
      });
    }

    // Activations CRUD
    const actAdminBox = $("activationsAdminBox");
    const addActBtn = $("addActivation");
    const saveActBtn = $("saveActivations");
    const resetActBtn = $("resetActivations");
    const TYPE_OPTIONS = ["OSINT","HUMINT","SIGINT","IMINT","TASKING","DECEPTION","DIPLO","CYBINT","OTHER"];

    function renderActivationsEditor(list){
      if(!actAdminBox) return [];
      actAdminBox.innerHTML = "";
      const rows = [];
      list.forEach((a, idx)=>{
        const div = document.createElement("div");
        div.className="item";
        const t = String(a.type||"OTHER").toUpperCase();
        div.innerHTML = `
          <div class="row" style="justify-content:space-between;align-items:flex-start">
            <div class="row">
              <span class="${pillClass(t)}">${t}</span>
              <span class="pill mono">T+${Number(a.releaseMin||0)}m</span>
            </div>
            <div class="row">
              <span class="pill mono">${a.id||""}</span>
              <button class="btn danger" data-action="del">Elimina</button>
            </div>
          </div>

          <div class="sep"></div>

          <div class="row">
            <div style="flex:1">
              <label class="lbl">ID</label>
              <input class="input" value="${(a.id||"").replaceAll('"','&quot;')}"/>
            </div>
            <div style="flex:1">
              <label class="lbl">Release (min)</label>
              <input class="input" type="number" min="0" value="${Number(a.releaseMin||0)}"/>
            </div>
            <div style="flex:1">
              <label class="lbl">Tipo</label>
              <select class="input">
                ${TYPE_OPTIONS.map(x=>`<option ${t===x?"selected":""}>${x}</option>`).join("")}
              </select>
            </div>
            <div style="flex:1">
              <label class="lbl">Team</label>
              ${teamSelectHTML(a.team)}
            </div>
          </div>

          <label class="lbl" style="margin-top:10px">Source</label>
          <input class="input" value="${(a.source||"").replaceAll('"','&quot;')}"/>

          <label class="lbl" style="margin-top:10px">Title</label>
          <input class="input" value="${(a.title||"").replaceAll('"','&quot;')}"/>

          <label class="lbl" style="margin-top:10px">Body</label>
          <textarea rows="4" class="input"></textarea>
        `;
        const inputs = div.querySelectorAll("input,select,textarea");
        inputs[6].value = a.body || "";

        div.querySelector('[data-action="del"]').addEventListener("click", ()=>{
          if(confirm("Eliminare questa attivazione?")){
            list.splice(idx,1);
            renderActivationsEditor(list);
          }
        });

        rows.push({
          id: inputs[0],
          releaseMin: inputs[1],
          type: inputs[2],
          team: inputs[3],
          source: inputs[4],
          title: inputs[5],
          body: inputs[6]
        });
        actAdminBox.appendChild(div);
      });
      return rows;
    }

    let actList = (cfg.activations||[]).map(x=>Object.assign({team:"ALL"}, x));
    let actRows = renderActivationsEditor(actList);

    if(addActBtn){
      addActBtn.addEventListener("click", ()=>{
        const nextN = actList.length + 1;
        actList.push({id:`A${String(nextN).padStart(2,"0")}`, releaseMin:0, type:"OSINT", team:"ALL", source:"", title:"", body:""});
        actRows = renderActivationsEditor(actList);
      });
    }
    if(saveActBtn){
      saveActBtn.addEventListener("click", ()=>{
        const o = loadOverrides();
        const out = [];
        for(const r of actRows){
          const id = r.id.value.trim();
          if(!id) continue;
          out.push({
            id,
            releaseMin: Number(r.releaseMin.value||0),
            type: r.type.value,
            team: String(r.team.value||"ALL").toUpperCase(),
            source: r.source.value.trim(),
            title: r.title.value.trim(),
            body: r.body.value
          });
        }
        out.sort((a,b)=> (a.releaseMin-b.releaseMin) || String(a.id).localeCompare(String(b.id)));
        o.activations = out;
        saveOverrides(o);
        alert("Attivazioni salvate (locale).");
      });
    }
    if(resetActBtn){
      resetActBtn.addEventListener("click", ()=>{
        const o = loadOverrides();
        delete o.activations;
        saveOverrides(o);
        alert("Reset attivazioni. Ricarico…");
        location.reload();
      });
    }
  }


  async function dbStatusBind(){
    const badge = document.getElementById("dbStatusBadge");
    const text = document.getElementById("dbStatusText");
    if(!badge || !text) return;
    try{
      const j = await apiGetHealth();
      if(j && j.ok && j.dbBound && j.dbOk){
        badge.textContent = "DB OK";
        text.textContent = "Binding D1 attivo e query OK.";
      }else if(j && j.ok && j.dbBound && !j.dbOk){
        badge.textContent = "DB ERR";
        text.textContent = "Binding presente ma query fallita (tabelle/migration?).";
      }else{
        badge.textContent = "DB OFF";
        text.textContent = "Binding D1 non configurato (Settings → Functions → D1 bindings).";
      }
    }catch(e){
      badge.textContent = "DB OFF";
      text.textContent = "Endpoint /api/health non raggiungibile: verifica che /functions sia deployata.";
    }
  }

  function participantsDbBind(cfg){
    const root = document.getElementById("participantsDbRoot");
    if(!root) return;

    const nameEl = $("pDbName");
    const emailEl = $("pDbEmail");
    const roleEl = $("pDbRole");
    const teamEl = $("pDbTeam");
    const addBtn = $("pDbAdd");
    const refreshBtn = $("pDbRefresh");
    const listEl = $("pDbList");

    function fillTeams(){
      if(!teamEl) return;
      teamEl.innerHTML = "";
      getTeamsForUi(cfg).forEach(t=>{
        const opt = document.createElement("option");
        opt.value = String(t.id||"ALL").toUpperCase();
        opt.textContent = t.label || opt.value;
        teamEl.appendChild(opt);
      });
      teamEl.value = "ALL";
    }

    async function render(){
      if(!listEl) return;
      listEl.innerHTML = `<div class="item"><div class="h">Caricamento…</div></div>`;
      try{
        const j = await apiGetParticipants();
        const arr = (j && j.ok && Array.isArray(j.participants)) ? j.participants : [];
        if(!arr.length){
          listEl.innerHTML = `<div class="item"><div class="h">Nessun partecipante</div><div class="small">Aggiungi partecipanti sopra.</div></div>`;
          return;
        }
        listEl.innerHTML = "";
        arr.forEach(p=>{
          const div = document.createElement("div");
          div.className = "item";
          const pid = p.id;
          const role = String(p.role||"PLAYER").toUpperCase();
          const team = String(p.team_id||"ALL").toUpperCase();
          div.innerHTML = `
            <div class="row" style="justify-content:space-between;align-items:flex-start;gap:12px">
              <div style="flex:1">
                <div class="h">${escapeHtml(p.name||"")}</div>
                <div class="meta" style="margin-top:6px">
                  ${p.email ? `<span class="pill mono">${escapeHtml(p.email)}</span>` : ``}
                  <span class="pill mono">ID: ${escapeHtml(pid)}</span>
                </div>

                <div class="row" style="margin-top:10px;align-items:flex-end;flex-wrap:wrap">
                  <div style="min-width:160px">
                    <label class="lbl">Ruolo</label>
                    <select class="input" data-role>
                      <option value="PLAYER">PLAYER</option>
                      <option value="OBSERVER">OBSERVER</option>
                      <option value="INSTRUCTOR">INSTRUCTOR</option>
                      <option value="ADMIN">ADMIN</option>
                    </select>
                  </div>
                  <div style="min-width:160px">
                    <label class="lbl">Team</label>
                    <select class="input" data-team></select>
                  </div>
                  <button class="btn" type="button" data-save>Salva</button>
                </div>
              </div>

              <div class="row" style="justify-content:flex-end;flex-wrap:wrap">
                <button class="btn" type="button" data-link>Copia link</button>
                <button class="btn" type="button" data-email>Copia email</button>
                <button class="btn danger" type="button" data-del>Elimina</button>
              </div>
            </div>
          `;

          const roleSel = div.querySelector("[data-role]");
          const teamSel = div.querySelector("[data-team]");
          roleSel.value = role;
          teamSel.innerHTML = "";
          getTeamsForUi(cfg).forEach(t=>{
            const opt = document.createElement("option");
            opt.value = String(t.id||"ALL").toUpperCase();
            opt.textContent = t.label || opt.value;
            teamSel.appendChild(opt);
          });
          teamSel.value = team;

          div.querySelector("[data-save]")?.addEventListener("click", async ()=>{
            try{
              await apiUpsertParticipant({
                id: pid,
                name: p.name,
                email: p.email || "",
                role: String(roleSel.value||"PLAYER").toUpperCase(),
                team_id: String(teamSel.value||"ALL").toUpperCase()
              });
              alert("Partecipante aggiornato.");
              await render();
            }catch(e){
              alert("Errore DB: aggiornamento fallito.");
            }
          });

          div.querySelector("[data-del]")?.addEventListener("click", async ()=>{
            if(!confirm("Eliminare questo partecipante?")) return;
            try{ await apiDeleteParticipant(pid); await render(); }
            catch(e){ alert("Errore DB: eliminazione fallita."); }
          });

          function makeEntryLink(pp){
            // v3.x: no role routes; keep it simple: link to index + team param
            const u = new URL(location.origin + "/index.html");
            u.searchParams.set("team", String(pp.team_id||"ALL").toUpperCase());
            u.searchParams.set("role", String(pp.role||"PLAYER").toUpperCase());
            return u.toString();
          }

          div.querySelector("[data-link]")?.addEventListener("click", async ()=>{
            const link = makeEntryLink(p);
            try{ await navigator.clipboard.writeText(link); alert("Link copiato."); }
            catch(e){ alert("Copia non disponibile: copia manualmente."); }
          });

          div.querySelector("[data-email]")?.addEventListener("click", async ()=>{
            const subj = (document.getElementById("invSubject")?.value || "SimIA — Accesso alla simulazione").trim();
            const tpl = (document.getElementById("invBodyTpl")?.value || "").toString();
            const sender = "Istruttore SimIA";
            const link = makeEntryLink(p);
            const body = tpl.replaceAll("{NAME}", p.name||"")
              .replaceAll("{ROLE}", String(p.role||"PLAYER").toUpperCase())
              .replaceAll("{TEAM}", String(p.team_id||"ALL").toUpperCase())
              .replaceAll("{LINK}", link)
              .replaceAll("{SENDER}", sender);
            const msg = `Subject: ${subj}\n\n${body}`;
            try{ await navigator.clipboard.writeText(msg); alert("Email copiata."); }
            catch(e){ alert("Copia non disponibile: copia manualmente."); }
          });

          listEl.appendChild(div);
        });
      }catch(e){
        listEl.innerHTML = `<div class="item"><div class="h">DB non disponibile</div><div class="small">Configura D1 binding, tabelle e deploy Functions. Poi ricarica.</div></div>`;
      }
    }

    addBtn?.addEventListener("click", async ()=>{
      const name = (nameEl?.value||"").trim();
      const email = (emailEl?.value||"").trim();
      const role = String(roleEl?.value||"PLAYER").toUpperCase();
      const team_id = String(teamEl?.value||"ALL").toUpperCase();
      if(!name){ alert("Inserisci un nome."); return; }
      if(email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)){ alert("Email non valida."); return; }
      try{
        await apiUpsertParticipant({name,email,role,team_id});
        if(nameEl) nameEl.value="";
        if(emailEl) emailEl.value="";
        await render();
      }catch(e){
        alert("Errore DB: inserimento fallito.");
      }
    });

    refreshBtn?.addEventListener("click", render);

    fillTeams();
    render();
  }

  function invitesBind(){
    const root = document.getElementById("invitesRoot");
    if(!root) return;

    const exportCsvBtn = document.getElementById("invExportCsv");
    const exportJsonBtn = document.getElementById("invExportJson");

    exportCsvBtn?.addEventListener("click", async ()=>{
      try{
        const j = await apiGetParticipants();
        const arr = (j && j.ok && Array.isArray(j.participants)) ? j.participants : [];
        const rows = [["name","email","role","team_id","entryLink"]];
        arr.forEach(p=>{
          const u = new URL(location.origin + "/index.html");
          u.searchParams.set("team", String(p.team_id||"ALL").toUpperCase());
          u.searchParams.set("role", String(p.role||"PLAYER").toUpperCase());
          rows.push([p.name||"",p.email||"",String(p.role||"PLAYER").toUpperCase(),String(p.team_id||"ALL").toUpperCase(),u.toString()]);
        });
        const csv = rows.map(r=>r.map(x=>`"${String(x).replaceAll('"','""')}"`).join(",")).join("\n");
        downloadText(csv, "intelsim_invites.csv", "text/csv");
      }catch(e){
        alert("Errore DB: export non disponibile.");
      }
    });

    exportJsonBtn?.addEventListener("click", async ()=>{
      try{
        const j = await apiGetParticipants();
        const arr = (j && j.ok && Array.isArray(j.participants)) ? j.participants : [];
        downloadJSON({exportedAt:new Date().toISOString(), participants: arr}, "intelsim_invites.json");
      }catch(e){
        alert("Errore DB: export non disponibile.");
      }
    });
  }


  function bindAdminConsoleTabs(){
    const btns = document.querySelectorAll("[data-admin-tab]");
    const panels = document.querySelectorAll("[data-admin-panel]");
    if(!btns.length || !panels.length) return;

    function activate(tab){
      panels.forEach(p=>p.style.display = (p.getAttribute("data-admin-panel")===tab) ? "" : "none");
      btns.forEach(b=>b.classList.toggle("ghost", b.getAttribute("data-admin-tab")!==tab));
      try{ localStorage.setItem("simia.admin.tab", tab); }catch(e){}
    }
    btns.forEach(b=>b.addEventListener("click", ()=>activate(b.getAttribute("data-admin-tab"))));
    let saved="setup";
    try{ saved=localStorage.getItem("simia.admin.tab")||"setup"; }catch(e){}
    activate(saved);
  }

  function setHeader(cfg){


  const ov = loadOverrides();
  const logo = ov?.platform?.logo;
  const logoEl = document.querySelector(".logo img");
  if(logo && logoEl){ logoEl.src = logo; }

    if($("hdrTitle")) $("hdrTitle").textContent = cfg.platform?.title || "SimIA - Analytical Simulation Platform";
    if($("hdrSub")) $("hdrSub").textContent = cfg.platform?.subtitle || $("hdrSub").textContent || "";
  }

  window.addEventListener("DOMContentLoaded", async ()=>{
    layoutSafeguard();
    try{
      let cfg = await loadBase();
      cfg = applyAll(cfg);

      setHeader(cfg);
      bindTeamSelector(cfg);

      sessionBadge(); tickTimers(); renderPhasePill();
      setInterval(()=>{ sessionBadge(); tickTimers(); renderPhasePill(); }, 1000);

      if($("dashRoot")) dashboardBind(cfg);
      if($("feedRoot")) feedBind(cfg);
      if($("docsRoot")) documentsBind(cfg);
      if($("taskingRoot")) taskingBind(cfg);
      if($("timelineRoot")) timelineBind(cfg);
      if($("submitRoot")) submitBind(cfg);
      if($("aiRoot")) aiBind(cfg);
      if($("workspaceRoot")) workspaceBind();
      if($("adminRoot")) { bindAdminConsoleTabs(); adminBind(cfg); dbStatusBind(); participantsDbBind(cfg); invitesBind(); }
      if($("instructorRoot")) instructorBind(cfg);

    }catch(err){
      console.error(err);
      const content = document.querySelector(".content");
      if(content){
        const div = document.createElement("div");
        div.className="card";
        div.innerHTML = `
          <div class="card-title">Errore</div>
          <div class="card-body">
            <div class="notice danger">
              <div class="h">${String(err.message||err)}</div>
              <div class="small">Verifica che <code>/assets/app.js</code> e <code>/assets/data.json</code> siano raggiungibili (F12 → Network).</div>
            </div>
          </div>`;
        content.prepend(div);
      }
    }
  });
})();
