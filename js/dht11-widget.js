(function(){
  const KEY = 'dht11History'; // localStorage key
  const MAX_POINTS = 2880; // up to 48 hours at 1/minute
  const REFRESH_MS = 60000; // 60s
  const TZ = 'America/New_York';

  function loadHistory(){
    try { return JSON.parse(localStorage.getItem(KEY)||'[]'); } catch(e){ return []; }
  }
  function saveHistory(arr){
    try { localStorage.setItem(KEY, JSON.stringify(arr)); } catch(e){}
  }
  function getHistory(el){ return el._history || loadHistory(); }
  function setHistory(el, arr){ el._history = arr; saveHistory(arr); }
  function fmtTsET(d){
    return d.toLocaleString('en-US',{timeZone:TZ,hour:'2-digit',minute:'2-digit',second:'2-digit',month:'short',day:'2-digit'});
  }
  function parseText(text){
    let t = text.match(/Temperature:\s*([0-9.+-]+)/i);
    let h = text.match(/Relative Humidity:\s*([0-9.+-]+)/i);
    return {
      temperature: t?parseFloat(t[1]):null,
      humidity: h?parseFloat(h[1]):null
    };
  }
  function addPoint(history, point){
    history.push(point);
    if(history.length > MAX_POINTS) history.splice(0, history.length - MAX_POINTS);
  }
  
  function hoursFor(el){
    const h = parseFloat(el.getAttribute('data-hours')); return isNaN(h)?2:h;
  }
  
  function seriesUrlFrom(endpoint, hours){
    if(!endpoint) return null;
    const base = /\/reading(\?.*)?$/.test(endpoint) ? endpoint.replace(/\/reading(\?.*)?$/, '') : endpoint.replace(/\/$/,'');
    return base + '/series?hours='+encodeURIComponent(hours);
  }
  
  function historyUrlFrom(endpoint, days){
    if(!endpoint) return null;
    const base = /\/reading(\?.*)?$/.test(endpoint) ? endpoint.replace(/\/reading(\?.*)?$/, '') : endpoint.replace(/\/$/,'');
    return base + '/history?days='+encodeURIComponent(days);
  }
  
  function plotUrlFrom(endpoint, hours, days){
    if(!endpoint) return null;
    const base = /\/reading(\?.*)?$/.test(endpoint) ? endpoint.replace(/\/reading(\?.*)?$/, '') : endpoint.replace(/\/$/,'');
    // For longer ranges, use more points in plot
    const width = 800;
    const height = 300;
    if(days && days >= 1){
      // Use history endpoint for 1+ days
      return base + '/plot?days='+encodeURIComponent(days)+'&width='+width+'&height='+height;
    }
    return base + '/plot?hours='+encodeURIComponent(hours||2)+'&width='+width+'&height='+height;
  }

  async function fetchSeries(el, hours){
    const endpoint = el.getAttribute('data-endpoint');
    const seriesUrl = seriesUrlFrom(endpoint, hours);
    if(!seriesUrl) return;
    try {
      const r = await fetch(seriesUrl,{cache:'no-store'});
      if(!r.ok) throw new Error('HTTP '+r.status);
      const data = await r.json();
      if(Array.isArray(data.points)){
        setHistory(el, data.points.map(p=>({t:p.t, temperature:p.temperature, humidity:p.humidity})));
      }
    } catch(e){ /* ignore, fallback to local history */ }
  }
  
  async function fetchHistory(el, days){
    const endpoint = el.getAttribute('data-endpoint');
    const historyUrl = historyUrlFrom(endpoint, days);
    if(!historyUrl) return;
    try {
      const r = await fetch(historyUrl,{cache:'no-store'});
      if(!r.ok) throw new Error('HTTP '+r.status);
      const data = await r.json();
      if(Array.isArray(data.points)){
        setHistory(el, data.points.map(p=>({t:p.t, temperature:p.temperature, humidity:p.humidity})));
      }
    } catch(e){ 
      console.warn('Failed to fetch history:', e);
    }
  }
  
  function updatePlot(el, hours, days){
    const endpoint = el.getAttribute('data-endpoint');
    const plotImg = el.querySelector('.sensor-plot');
    const loading = el.querySelector('.plot-loading');
    if(!plotImg) return;
    
    if(loading) loading.style.display = 'block';
    
    const timestamp = Date.now();
    let plotUrl = plotUrlFrom(endpoint, hours, days);
    if(plotUrl) plotUrl += '&_t=' + timestamp;
    
    // Create new image to preload
    const tempImg = new Image();
    tempImg.onload = function(){
      plotImg.src = tempImg.src;
      if(loading) loading.style.display = 'none';
    };
    tempImg.onerror = function(){
      console.error('Failed to load plot:', plotUrl);
      if(loading) loading.style.display = 'none';
    };
    if(plotUrl) tempImg.src = plotUrl;
  }

  async function fetchSensor(el){
    const endpoint = el.getAttribute('data-endpoint');
    const tempEl = el.querySelector('[data-field="temperature"]');
    const humEl = el.querySelector('[data-field="humidity"]');
    const updEl = el.querySelector('[data-field="updated"]');
    const statusEl = el.querySelector('[data-field="status"]');
    let history = getHistory(el);
    statusEl.textContent='';
    try {
      const r = await fetch(endpoint,{cache:'no-store'});
      if(!r.ok) throw new Error('HTTP '+r.status);
      const text = await r.text();
      const parsed = parseText(text);
      if(parsed.temperature!=null) tempEl.textContent = parsed.temperature.toFixed(1)+' °C';
      if(parsed.humidity!=null) humEl.textContent = parsed.humidity.toFixed(0)+' %';
      const now = Date.now();
      addPoint(history,{t:now, temperature:parsed.temperature, humidity:parsed.humidity});
      setHistory(el, history);
      updEl.textContent = fmtTsET(new Date());
      el.classList.remove('error');
    } catch(e){
      statusEl.textContent='(error)';
      el.classList.add('error');
    }
  }
  
  function setupRangeButtons(el){
    const buttons = el.querySelectorAll('.range-btn');
    buttons.forEach(btn => {
      btn.addEventListener('click', async function(){
        // Update active state
        buttons.forEach(b => b.classList.remove('active'));
        this.classList.add('active');
        
        const hours = this.getAttribute('data-hours');
        const days = this.getAttribute('data-days');
        
        if(days){
          // Fetch from history endpoint
          await fetchHistory(el, parseInt(days));
          updatePlot(el, null, parseInt(days));
        } else if(hours){
          // Fetch from series endpoint (in-memory)
          await fetchSeries(el, parseFloat(hours));
          updatePlot(el, parseFloat(hours), null);
        }
      });
    });
  }
  
  function init(){
    document.querySelectorAll('#dht11-widget').forEach(el=>{
      setHistory(el, loadHistory());
      
      // Setup interactive range buttons
      setupRangeButtons(el);
      
      // Determine initial range (default to 12 hours)
      const activeBtn = el.querySelector('.range-btn.active');
      let initialHours = 12;
      let initialDays = null;
      
      if(activeBtn){
        const hrs = activeBtn.getAttribute('data-hours');
        const days = activeBtn.getAttribute('data-days');
        if(days){
          initialDays = parseInt(days);
          initialHours = null;
        } else if(hrs){
          initialHours = parseFloat(hrs);
        }
      }
      
      // Initial data load
      (async()=>{
        try {
          if(initialDays){
            await fetchHistory(el, initialDays);
          } else {
            await fetchSeries(el, initialHours);
          }
        } catch(e){}
        
        // Fetch current reading and start refresh loop
        fetchSensor(el);
        setInterval(()=>fetchSensor(el), REFRESH_MS);
        
        // Update plot image
        updatePlot(el, initialHours, initialDays);
      })();
    });
  }
  if(document.readyState==='loading') document.addEventListener('DOMContentLoaded',init); else init();
})();
