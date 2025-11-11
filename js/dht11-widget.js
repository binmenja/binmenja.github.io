(function(){
  const KEY = 'dht11History'; // localStorage key
  const MAX_POINTS = 720; // 12 hours at 1/minute
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
  // Removed legacy canvas plotting; using server-side PNG /plot instead.
  function hoursFor(el){
    const h = parseFloat(el.getAttribute('data-hours')); return isNaN(h)?2:h;
  }
  function seriesUrlFrom(endpoint){
    if(!endpoint) return null;
    if(/\/reading(\?.*)?$/.test(endpoint)) return endpoint.replace(/\/reading(\?.*)?$/, '/series?hours=2');
    return endpoint.replace(/\/$/,'') + '/series?hours=2';
  }
  function plotUrlFrom(endpoint, hours){
    if(!endpoint) return null;
    const base = /\/reading(\?.*)?$/.test(endpoint) ? endpoint.replace(/\/reading(\?.*)?$/, '') : endpoint.replace(/\/$/,'');
    return base + '/plot?hours='+encodeURIComponent(hours)+'&width=800&height=300';
  }

  async function fetchSeries(el){
    const endpoint = el.getAttribute('data-endpoint');
    const seriesUrl = seriesUrlFrom(endpoint);
  // canvas removed; server-side plot only
    if(!seriesUrl) return;
    try {
      const r = await fetch(seriesUrl,{cache:'no-store'});
      if(!r.ok) throw new Error('HTTP '+r.status);
      const data = await r.json();
      if(Array.isArray(data.points)){
        setHistory(el, data.points.map(p=>({t:p.t, temperature:p.temperature, humidity:p.humidity})));
        drawChart(canvas, getHistory(el));
      }
    } catch(e){ /* ignore, fallback to local history */ }
  }

  async function fetchSensor(el){
    const endpoint = el.getAttribute('data-endpoint');
    const tempEl = el.querySelector('[data-field="temperature"]');
    const humEl = el.querySelector('[data-field="humidity"]');
    const updEl = el.querySelector('[data-field="updated"]');
    const statusEl = el.querySelector('[data-field="status"]');
    const canvas = el.querySelector('.sensor-chart');
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
  // no client-side redraw
  }
  function init(){
    document.querySelectorAll('#dht11-widget').forEach(el=>{
  setHistory(el, loadHistory());
      // try to load last couple hours from server
      const hrs = hoursFor(el);
      // update series URL hours parameter
      const endpoint = el.getAttribute('data-endpoint');
      // override series URL by hours value
      const origSeriesUrl = seriesUrlFrom(endpoint);
      const customSeriesUrl = origSeriesUrl.replace(/hours=2/, 'hours='+hrs);
      // temporarily fetch custom series
      (async()=>{
        try {
          const r = await fetch(customSeriesUrl,{cache:'no-store'});
          if(r.ok){
            const data = await r.json();
            if(Array.isArray(data.points)){
              setHistory(el, data.points.map(p=>({t:p.t, temperature:p.temperature, humidity:p.humidity})));
              // server plot only
            }
          }
        } catch(e){}
        fetchSensor(el);
        setInterval(()=>fetchSensor(el), REFRESH_MS);
        // set static PNG plot img src
        const plotImg = el.querySelector('.sensor-plot');
        if(plotImg){ plotImg.src = plotUrlFrom(endpoint, hrs); }
      })();
    });
  }
  if(document.readyState==='loading') document.addEventListener('DOMContentLoaded',init); else init();
})();
