/* SimIA Theme Switcher
   - Persists theme in localStorage: simia.theme
   - Injects a small selector into topbar .session (if found)
   - Safe to load on any page (no dependencies)
*/
(function(){
  const KEY = "simia.theme";
  const THEMES = [
    { id:"intel-dark",   label:"Dark Intelligence" },
    { id:"nato-blue",    label:"NATO / Security Blue" },
    { id:"light-analyst",label:"Light Analyst" },
    { id:"tactical-green",label:"Tactical Green" },
  ];

  function apply(themeId){
    const t = THEMES.find(x=>x.id===themeId) ? themeId : "intel-dark";
    document.documentElement.setAttribute("data-theme", t);
    try{ localStorage.setItem(KEY, t); }catch(e){}
    return t;
  }

  function current(){
    try{ return localStorage.getItem(KEY) || "intel-dark"; }catch(e){ return "intel-dark"; }
  }

  function inject(){
    const host = document.querySelector(".topbar .session") || document.querySelector(".session");
    if(!host) return;

    // Avoid duplicates
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

    const active = apply(current());
    sel.value = active;

    sel.addEventListener("change", ()=> apply(sel.value));

    wrap.appendChild(lab);
    wrap.appendChild(sel);

    // Insert first, so existing buttons remain visible
    host.prepend(wrap);
  }

  document.addEventListener("DOMContentLoaded", ()=>{
    apply(current());
    inject();
  });
})();
