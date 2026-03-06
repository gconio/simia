
/* SimIA Theme Manager (platform-controlled theme)
   Priority:
   1) platform default from /api/config
   2) fallback: intel-dark

   NOTE: User theme selector removed. Theme is controlled by Admin only.
*/

(function(){

  const THEMES = [
    "intel-dark",
    "nato-blue",
    "light-analyst",
    "tactical-green"
  ];

  function valid(id){
    return THEMES.includes(id);
  }

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

  function apply(themeId){
    const t = valid(themeId) ? themeId : "intel-dark";
    document.documentElement.setAttribute("data-theme", t);
  }

  async function fetchDefault(){

    try{

      const r = await fetch("/api/config", {
        headers:{ "Accept":"application/json" }
      });

      if(!r.ok) return "";

      const j = await r.json();

      const t = j?.config?.defaultTheme || "";

      return valid(t) ? t : "";

    }catch(e){

      return "";

    }

  }

  document.addEventListener("DOMContentLoaded", async ()=>{

    injectCss();

    const def = await fetchDefault();

    apply(def || "intel-dark");

  });

})();
