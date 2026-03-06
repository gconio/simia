/* SimIA Admin — Platform Theme Setup (writes /api/config defaultTheme)
Safe standalone script. Load only in admin.html.
*/
(function(){
  const THEMES = [
    { id:"intel-dark",    label:"Dark Intelligence" },
    { id:"nato-blue",     label:"NATO / Security Blue" },
    { id:"light-analyst", label:"Light Analyst" },
    { id:"tactical-green",label:"Tactical Green" }
  ];

  async function jget(url){
    const r = await fetch(url, { headers:{ "Accept":"application/json" }});
    const t = await r.text();
    let j; try{ j = JSON.parse(t);}catch{ j={raw:t}; }
    if(!r.ok) throw new Error(j?.error || ("HTTP "+r.status));
    return j;
  }

  async function jpost(url, body){
    const r = await fetch(url, {
      method:"POST",
      headers:{ "Content-Type":"application/json", "Accept":"application/json" },
      body: JSON.stringify(body)
    });
    const t = await r.text();
    let j; try{ j = JSON.parse(t);}catch{ j={raw:t}; }
    if(!r.ok) throw new Error(j?.error || ("HTTP "+r.status));
    return j;
  }

  function mount(){
    const setupPanel = document.querySelector('[data-panel="setup"]');
    if(!setupPanel) return;
    if(document.getElementById("cfgTheme")) return;

    const card = document.createElement("div");
    card.className = "card span12";
    card.innerHTML = `
      <div class="card-title">Platform Theme (default)</div>
      <div class="card-body">
        <div class="notice">
          <div class="h">Impostazione globale</div>
          <div class="small">Tema di default applicato automaticamente su tutte le pagine (salvato in D1 via /api/config). Gli utenti possono sovrascriverlo col selettore Theme.</div>
        </div>
        <div class="sep"></div>
        <div class="row" style="gap:10px;flex-wrap:wrap;align-items:flex-end">
          <div style="min-width:260px;flex:1">
            <label class="lbl">Default theme</label>
            <select class="input" id="cfgTheme"></select>
          </div>
          <button class="btn primary" id="cfgThemeSave">Save</button>
          <span class="pill mono" id="cfgThemeStatus">—</span>
        </div>
      </div>
    `;

    setupPanel.appendChild(card);

    const sel = document.getElementById("cfgTheme");
    for(const t of THEMES){
      const o = document.createElement("option");
      o.value = t.id;
      o.textContent = t.label;
      sel.appendChild(o);
    }

    document.getElementById("cfgThemeSave")?.addEventListener("click", async ()=>{
      const status = document.getElementById("cfgThemeStatus");
      status.textContent = "Saving...";
      try{
        const theme = sel.value;
        await jpost("/api/config", { defaultTheme: theme });
        status.textContent = "OK";
        document.documentElement.setAttribute("data-theme", theme);
      }catch(e){
        status.textContent = "ERR";
        alert("Errore salvataggio config: " + e);
      }
    });

    (async ()=>{
      const status = document.getElementById("cfgThemeStatus");
      status.textContent = "Loading...";
      try{
        const j = await jget("/api/config");
        const t = j?.config?.defaultTheme || j?.defaultTheme || "intel-dark";
        sel.value = t;
        status.textContent = "OK";
      }catch(e){
        status.textContent = "ERR";
      }
    })();
  }

  document.addEventListener("DOMContentLoaded", mount);
})();