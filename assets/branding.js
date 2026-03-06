/* SimIA Global Branding Loader
   Applies brand name, subtitle and logo from /api/config
   to any page that contains:
   - .brand .logo
   - .brand .brand-title
   - .brand .brand-sub

   Optional overrides:
   - data-brand-title-default
   - data-brand-sub-default
*/
(async function(){
  async function jget(url){
    const r = await fetch(url, { headers:{ "Accept":"application/json" }});
    const t = await r.text();
    let j; try{ j = JSON.parse(t); }catch{ j = { raw:t }; }
    if(!r.ok) throw new Error(j?.error || ("HTTP " + r.status));
    return j;
  }

  function applyBranding(cfg){
    const brand = document.querySelector(".brand");
    if(!brand) return;

    const logoEl = brand.querySelector(".logo");
    const titleEl = brand.querySelector(".brand-title");
    const subEl = brand.querySelector(".brand-sub");

    const defaultTitle = brand.getAttribute("data-brand-title-default") || (titleEl ? titleEl.textContent : "SimIA");
    const defaultSub = brand.getAttribute("data-brand-sub-default") || (subEl ? subEl.textContent : "");

    const brandName = cfg.brandName || defaultTitle || "SimIA";
    const exerciseSubtitle = cfg.exerciseSubtitle || defaultSub || "";

    if(titleEl) titleEl.textContent = brandName;
    if(subEl) subEl.textContent = exerciseSubtitle || defaultSub;

    if(logoEl){
      const mode = cfg.logoMode || "url";
      const logoData = cfg.logoData || "";
      const logoUrl = cfg.logoUrl || "";

      if(mode === "upload" && logoData){
        logoEl.innerHTML = `<img src="${logoData}" alt="logo" style="width:40px;height:40px;object-fit:contain;border-radius:8px"/>`;
      }else if(mode === "url" && logoUrl){
        logoEl.innerHTML = `<img src="${logoUrl}" alt="logo" style="width:40px;height:40px;object-fit:contain;border-radius:8px"/>`;
      }
    }
  }

  try{
    const j = await jget("/api/config");
    applyBranding(j.config || {});
  }catch(e){
    // silent fallback to page defaults
  }
})();
