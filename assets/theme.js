/* SimIA Theme Manager (Platform default via D1 + per-user override)
Priority:
1) localStorage simia.theme (user override)
2) /api/config (platform default: defaultTheme)
3) fallback: intel-dark

Also injects /assets/theme.css automatically if not present.
Optionally injects a Theme selector into the topbar.
*/
(function(){
  const KEY = "simia.theme";
  const THEMES = [
    { id:"intel-dark",    label:"Dark Intelligence" },
    { id:"nato-blue",     label:"NATO / Security Blue" },
    { id:"light-analyst", label:"Light Analyst" },
    { id:"tactical-green",label:"Tactical Green" }
  ];

  function valid(id){ return THEMES.some(t=>t.id===id); }

  function injectCss(){
    const href = "/assets/theme.css";
    const exists = Array.from(document.querySelectorAll('link[rel="stylesheet"]'))
      .some(l => (l.getAttribute("href")||"").endsWith(href));
    if(exists) return;
    const link = document.createElement("link");
    link.rel = "stylesheet";
    link.href = href;
    document.head.appendChild(link);
  }

  function apply(themeId, persist){
    const t = valid(themeId) ? themeId : "intel-dark";
    document.documentElement.setAttribute("data-theme", t);
    if(persist){
      try{ localStorage.setItem(KEY, t); }catch(e){}
    }
    return t;
  }

  function currentOverride(){
    try{ return localStorage.getItem(KEY) || ""; }catch(e){ return ""; }
  }

  async function fetchDefault(){
    try{
      const r = await fetch("/api/config", { headers:{ "Accept":"application/json" }});
      if(!r.ok) return "";
      const j = await r.json();
      const t = j?.config?.defaultTheme || j?.defaultTheme || "";
      return valid(t) ? t : "";
    }catch(e){
      return "";
    }
  }

  function injectSelector(activeTheme){
    const host = document.querySelector(".topbar .session") || document.querySelector(".session");
    if(!host) return;
    if(document.getElementById("simiaThemeSelect")) return;

    const wrap = document.createElement("div");
    wrap.style.display = "flex";
    wrap.style.alignItems = "center";
    wrap.style.gap = "8px";
    wrap.style.flexWrap = "wrap";

    const lab = document.createElement("span");
    lab.className = "small";
    lab.textContent = "Theme";

    const sel = document.createElement("select");
    sel.className = "input";
    sel.id = "simiaThemeSelect";
    sel.style.minWidth = "190px";
    sel.style.padding = "6px 10px";

    for(const t of THEMES){
      const o = document.createElement("option");
      o.value = t.id;
      o.textContent = t.label;
      sel.appendChild(o);
    }
    sel.value = activeTheme;

    sel.addEventListener("change", ()=> apply(sel.value, true));

    wrap.appendChild(lab);
    wrap.appendChild(sel);

    host.prepend(wrap);
  }

  document.addEventListener("DOMContentLoaded", async ()=>{
    injectCss();

    const override = currentOverride();
    if(valid(override)){
      const t = apply(override, false);
      injectSelector(t);
      return;
    }

    const def = await fetchDefault();
    const t = apply(def || "intel-dark", false);
    injectSelector(t);
  });
})();