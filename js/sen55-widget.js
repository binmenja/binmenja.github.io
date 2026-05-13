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
    const mPM1   = text.match(/PM1\.0:\s*([0-9.+-]+)/i);
    const mPM25  = text.match(/PM2\.5:\s*([0-9.+-]+)/i);
    const mPM4   = text.match(/PM4\.0:\s*([0-9.+-]+)/i);
    const mPM10  = text.match(/PM10\.0:\s*([0-9.+-]+)/i);
    const mVOC   = text.match(/VOC:\s*([0-9.+-]+)/i);
    const mNOx   = text.match(/NOx:\s*([0-9.+-]+)/i);
    const mT     = text.match(/SEN55_T:\s*([0-9.+-]+)/i);
    const mH     = text.match(/SEN55_H:\s*([0-9.+-]+)/i);
    return {
      pm1: mPM1 ? parseFloat(mPM1[1]) : null,
      pm25: mPM25 ? parseFloat(mPM25[1]) : null,
      pm4: mPM4 ? parseFloat(mPM4[1]) : null,
      pm10: mPM10 ? parseFloat(mPM10[1]) : null,
      voc: mVOC ? parseFloat(mVOC[1]) : null,
      nox: mNOx ? parseFloat(mNOx[1]) : null,
      sen55_t: mT ? parseFloat(mT[1]) : null,
      sen55_h: mH ? parseFloat(mH[1]) : null,
    };
  }

  function baseUrl(endpoint){
    if(!endpoint) return null;
    return /\/reading(\?.*)?$/.test(endpoint)
      ? endpoint.replace(/\/reading(\?.*)?$/, '')
      : endpoint.replace(/\/$/,'');
  }

  function plotUrlPM(endpoint, hours, days){
    const base = baseUrl(endpoint); if(!base) return null;
    const width = 800, height = 300;
    if(days) return base + '/plot_sen55_pm?days='+encodeURIComponent(days)+'&width='+width+'&height='+height;
    return base + '/plot_sen55_pm?hours='+encodeURIComponent(hours||2)+'&width='+width+'&height='+height;
  }

  function plotUrlVOCNOx(endpoint, hours, days){
    const base = baseUrl(endpoint); if(!base) return null;
    const width = 800, height = 300;
    const q = days
      ? 'days='+encodeURIComponent(days)
      : 'hours='+encodeURIComponent(hours||2);
    return base + '/plot_sen55_voc_nox?'+q+'&width='+width+'&height='+height;
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
    const pm1El    = el.querySelector('[data-field="pm1"]');
    const pm25El   = el.querySelector('[data-field="pm25"]');
    const pm4El    = el.querySelector('[data-field="pm4"]');
    const pm10El   = el.querySelector('[data-field="pm10"]');
    const vocEl    = el.querySelector('[data-field="voc"]');
    const noxEl    = el.querySelector('[data-field="nox"]');
    const tEl      = el.querySelector('[data-field="sen55_t"]');
    const hEl      = el.querySelector('[data-field="sen55_h"]');
    const updEl    = el.querySelector('[data-field="updated"]');
    const statusEl = el.querySelector('[data-field="status"]');

    try {
      statusEl.textContent = '';
      const r = await fetch(endpoint,{cache:'no-store'});
      if(!r.ok) throw new Error('HTTP '+r.status);
      const text = await r.text();
      const parsed = parseText(text);
      if(parsed.pm1 != null) pm1El.textContent = parsed.pm1.toFixed(1);
      if(parsed.pm25 != null) pm25El.textContent = parsed.pm25.toFixed(1);
      if(parsed.pm4 != null) pm4El.textContent = parsed.pm4.toFixed(1);
      if(parsed.pm10 != null) pm10El.textContent = parsed.pm10.toFixed(1);
      if(parsed.voc != null) vocEl.textContent = (parsed.voc / 10.0).toFixed(1);
      if(parsed.nox != null) noxEl.textContent = (parsed.nox / 10.0).toFixed(1);
      if(parsed.sen55_t != null) tEl.textContent = parsed.sen55_t.toFixed(1)+' °C';
      if(parsed.sen55_h != null) hEl.textContent = parsed.sen55_h.toFixed(0)+' %';
      
      updEl.textContent = fmtTsET(new Date());
      el.classList.remove('error');
    } catch(e){
      console.error(e);
      statusEl.textContent = '(error)';
      el.classList.add('error');
    }
  }

  function setupRangeButtons(el){
    const buttons = el.querySelectorAll('.sen55-range-btn');
    const endpoint = el.getAttribute('data-endpoint');
    const imgPM = el.querySelector('.sen55-plot-pm');
    const imgVOCNOx = el.querySelector('.sen55-plot-voc-nox');
    const loadingPM = el.querySelector('.plot-loading.pm');
    const loadingVOCNOx = el.querySelector('.plot-loading.voc-nox');

    function applyRange(hours, days){
      updateImg(imgPM, loadingPM, plotUrlPM(endpoint, hours, days));
      updateImg(imgVOCNOx, loadingVOCNOx, plotUrlVOCNOx(endpoint, hours, days));
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
    const activeBtn = el.querySelector('.sen55-range-btn.active');
    if(activeBtn){
      const hrs = activeBtn.getAttribute('data-hours');
      const days = activeBtn.getAttribute('data-days');
      if(days){ initialDays = parseInt(days,10); initialHours = null; }
      else if(hrs){ initialHours = parseFloat(hrs); }
    }
    applyRange(initialHours, initialDays);
  }

  function init(){
    document.querySelectorAll('#sen55-widget').forEach(el=>{
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