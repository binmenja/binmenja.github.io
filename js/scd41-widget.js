(function(){
  const REFRESH_MS = 60000;
  const TZ = 'America/New_York';

  function fmtTsET(d){
    try{
      return d.toLocaleString('en-US',{timeZone:TZ,hour:'2-digit',minute:'2-digit',second:'2-digit',month:'short',day:'2-digit'});
    }catch(e){
      return d.toLocaleString();
    }
  }

  function parseText(text){
    const mCO2 = text.match(/CO2:\s*([0-9]+)/i);
    const mT   = text.match(/SCD41_T:\s*([0-9.+-]+)/i);
    const mH   = text.match(/SCD41_H:\s*([0-9.+-]+)/i);
    return {
      co2: mCO2 ? parseInt(mCO2[1],10) : null,
      scd41_t: mT ? parseFloat(mT[1]) : null,
      scd41_h: mH ? parseFloat(mH[1]) : null,
    };
  }

  function baseUrl(endpoint){
    if(!endpoint) return null;
    return /\/reading(\?.*)?$/.test(endpoint)
      ? endpoint.replace(/\/reading(\?.*)?$/, '')
      : endpoint.replace(/\/$/,'');
  }

  function plotUrlTRH(endpoint, hours, days){
    const base = baseUrl(endpoint); if(!base) return null;
    const width = 800, height = 300;
    if(days) return base + '/plot_scd41_trh?days='+encodeURIComponent(days)+'&width='+width+'&height='+height;
    return base + '/plot_scd41_trh?hours='+encodeURIComponent(hours||2)+'&width='+width+'&height='+height;
  }

  function plotUrlCO2(endpoint, hours, days){
    const base = baseUrl(endpoint); if(!base) return null;
    const width = 800, height = 300;
    const q = days
      ? 'days='+encodeURIComponent(days)
      : 'hours='+encodeURIComponent(hours||2);
    return base + '/plot_scd41?'+q+'&width='+width+'&height='+height;
  }

  function updateImg(img, loadingEl, url){
    if(!img || !url) return;
    if(loadingEl) loadingEl.style.display = 'block';
    const ts = Date.now();
    const u = url + '&_t=' + ts;
    const tmp = new Image();
    tmp.onload = function(){
      img.src = tmp.src;
      if(loadingEl) loadingEl.style.display = 'none';
    };
    tmp.onerror = function(){
      console.error('Failed to load plot', u);
      if(loadingEl) loadingEl.style.display = 'none';
    };
    tmp.src = u;
  }

  async function fetchSensor(el){
    const endpoint = el.getAttribute('data-endpoint');
    const co2El = el.querySelector('[data-field="co2"]');
    const tEl   = el.querySelector('[data-field="scd41_t"]');
    const hEl   = el.querySelector('[data-field="scd41_h"]');
    const updEl = el.querySelector('[data-field="updated"]');
    const statusEl = el.querySelector('[data-field="status"]');

    try {
      statusEl.textContent = '';
      const r = await fetch(endpoint,{cache:'no-store'});
      if(!r.ok) throw new Error('HTTP '+r.status);
      const text = await r.text();
      const parsed = parseText(text);
      if(parsed.co2 != null) co2El.textContent = parsed.co2.toString();
      if(parsed.scd41_t != null) tEl.textContent = parsed.scd41_t.toFixed(1)+' °C';
      if(parsed.scd41_h != null) hEl.textContent = parsed.scd41_h.toFixed(0)+' %';
      updEl.textContent = fmtTsET(new Date());
      el.classList.remove('error');
    } catch(e){
      console.error(e);
      statusEl.textContent = '(error)';
      el.classList.add('error');
    }
  }

  function setupRangeButtons(el){
    const buttons = el.querySelectorAll('.range-btn');
    const endpoint = el.getAttribute('data-endpoint');
    const imgTRH = el.querySelector('.scd41-plot-trh');
    const imgCO2 = el.querySelector('.scd41-plot-co2');
    const loadingTRH = el.querySelector('.plot-loading.trh');
    const loadingCO2 = el.querySelector('.plot-loading.co2');

    function applyRange(hours, days){
      updateImg(imgTRH, loadingTRH, plotUrlTRH(endpoint, hours, days));
      updateImg(imgCO2, loadingCO2, plotUrlCO2(endpoint, hours, days));
    }

    buttons.forEach(btn => {
      btn.addEventListener('click', function(){
        buttons.forEach(b => b.classList.remove('active'));
        this.classList.add('active');
        const hours = this.getAttribute('data-hours');
        const days  = this.getAttribute('data-days');
        const h = hours ? parseFloat(hours) : null;
        const d = days ? parseInt(days,10) : null;
        applyRange(h,d);
      });
    });

    // Initial range
    let initialHours = 12, initialDays = null;
    const activeBtn = el.querySelector('.range-btn.active');
    if(activeBtn){
      const hrs = activeBtn.getAttribute('data-hours');
      const days = activeBtn.getAttribute('data-days');
      if(days){ initialDays = parseInt(days,10); initialHours = null; }
      else if(hrs){ initialHours = parseFloat(hrs); }
    }
    applyRange(initialHours, initialDays);
  }

  function init(){
    document.querySelectorAll('#scd41-widget').forEach(el=>{
      setupRangeButtons(el);
      fetchSensor(el);
      setInterval(()=>fetchSensor(el), REFRESH_MS);
    });
  }

  if(document.readyState === 'loading')
    document.addEventListener('DOMContentLoaded', init);
  else
    init();
})();
