// Standalone read-only service. No database bindings or incident writes.
const ORIGIN = 'https://occhrh-dev.github.io';
const UPSTREAM = 'https://api-gateway.gistda.or.th/api/2.0/resources/features/flood/';
const pending = new Map();
const MAX_FEATURES = 2000;
const MAX_BYTES = 8 * 1024 * 1024;
const PROVINCES = new Set('10 11 12 13 14 15 16 17 18 19 20 21 22 23 24 25 26 27 30 31 32 33 34 35 36 37 38 39 40 41 42 43 44 45 46 47 48 49 50 51 52 53 54 55 56 57 58 60 61 62 63 64 65 66 67 70 71 72 73 74 75 76 77 80 81 82 83 84 85 86 90 91 92 93 94 95 96'.split(' '));

function reply(data, status = 200, ttl = 0) {
  return new Response(JSON.stringify(data), {status, headers: {
    'Content-Type': 'application/json; charset=utf-8',
    'Access-Control-Allow-Origin': ORIGIN,
    'Access-Control-Allow-Methods': 'GET, OPTIONS',
    'Cache-Control': ttl ? `public, max-age=${ttl}` : 'no-store',
    'X-Content-Type-Options': 'nosniff'
  }});
}
function fail(code) { throw new Error(code); }
function safeText(value) { return typeof value === 'string' ? value.slice(0, 120) : ''; }
function imageDates(value) {
  if (typeof value !== 'string') return [];
  return [...new Set(Array.from(value.matchAll(/(?:^|[_ ,])(20\d{2})(\d{2})(\d{2})(?=[_ ,]|$)/g))
    .map(m => `${m[1]}-${m[2]}-${m[3]}`)
    .filter(v => !isNaN(Date.parse(v)) && new Date(v).toISOString().slice(0, 10) === v))].sort();
}
function safeGeometry(geometry) {
  if (!geometry || !['Polygon', 'MultiPolygon'].includes(geometry.type)) fail('INVALID_DATA');
  const polygons = geometry.type === 'Polygon' ? [geometry.coordinates] : geometry.coordinates;
  if (!Array.isArray(polygons) || !polygons.length) fail('INVALID_DATA');
  const clean = polygons.map(polygon => {
    if (!Array.isArray(polygon) || !polygon.length) fail('INVALID_DATA');
    return polygon.map(ring => {
      if (!Array.isArray(ring) || ring.length < 4) fail('INVALID_DATA');
      const points = ring.map(p => {
        if (!Array.isArray(p) || typeof p[0] !== 'number' || typeof p[1] !== 'number' ||
          !Number.isFinite(p[0]) || !Number.isFinite(p[1]) || Math.abs(p[0]) > 180 || Math.abs(p[1]) > 90) fail('INVALID_DATA');
        return [p[0], p[1]];
      });
      const first = points[0], last = points[points.length - 1];
      if (first[0] !== last[0] || first[1] !== last[1]) fail('INVALID_DATA');
      return points;
    });
  });
  return {type: geometry.type, coordinates: geometry.type === 'Polygon' ? clean[0] : clean};
}
async function loadFlood(days, apiKey, province = '21') {
  apiKey = String(apiKey).trim();
  if (!apiKey || /[\u0000-\u0020\u007f]/.test(apiKey)) fail('KEY_FORMAT');
  const features = [], deadline = Date.now() + 25000;
  let total = null, bytes = 0, upstreamResponseTime = null;
  for (let offset = 0; offset < MAX_FEATURES; offset += 100) {
    if (Date.now() >= deadline) fail('UPSTREAM_UNAVAILABLE');
    const url = new URL(UPSTREAM + (days === '1' ? '1day' : days + 'days'));
    url.searchParams.set('pv_idn', province);
    url.searchParams.set('limit', '100');
    url.searchParams.set('offset', String(offset));
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), Math.min(8000, deadline - Date.now()));
    let data;
    try {
      let response;
      try {
        response = await fetch(url.toString(), {headers: {'API-Key': apiKey, Accept: 'application/json'},
          redirect: 'manual', signal: controller.signal});
      } catch (error) { fail(error.name === 'AbortError' ? 'UPSTREAM_TIMEOUT' : 'UPSTREAM_NETWORK'); }
      if (response.status >= 300 && response.status < 400) fail('UPSTREAM_REDIRECT');
      if (!response.ok) {
        const error = new Error(response.status === 401 || response.status === 403 ? 'KEY_REJECTED' : 'UPSTREAM_UNAVAILABLE');
        error.upstreamStatus = response.status;
        throw error;
      }
      if (Number(response.headers.get('Content-Length')) > MAX_BYTES) fail('DATA_TOO_LARGE');
      const text = await response.text();
      bytes += new TextEncoder().encode(text).length;
      if (bytes > MAX_BYTES) fail('DATA_TOO_LARGE');
      try { data = JSON.parse(text); } catch (_) { fail('UPSTREAM_FORMAT'); }
    } finally { clearTimeout(timer); }
    if (data.type !== 'FeatureCollection' || !Array.isArray(data.features) || data.features.length > 100 ||
      !Number.isInteger(data.numberMatched) || data.numberMatched < 0 || data.numberReturned !== data.features.length) fail('INVALID_DATA');
    if (total !== null && total !== data.numberMatched) fail('DATA_CHANGED');
    total = data.numberMatched;
    if (total > MAX_FEATURES) fail('DATA_TOO_LARGE');
    upstreamResponseTime = typeof data.timeStamp === 'string' ? data.timeStamp.slice(0, 40) : null;
    data.features.forEach(feature => {
      const p = feature.properties || {};
      if (String(p.pv_idn) !== province) fail('INVALID_DATA');
      features.push({type: 'Feature', id: features.length, geometry: safeGeometry(feature.geometry), properties: {
        province: safeText(p.pv_tn), district: safeText(p.ap_tn), subdistrict: safeText(p.tb_tn),
        imageDates: imageDates(p.file_name).join(', ')
      }});
    });
    if (features.length === total) return {type: 'FeatureCollection', features, meta: {
      source: 'GISTDA', provinceId: province, days: Number(days), numberMatched: total,
      retrievedAt: new Date().toISOString(), upstreamResponseTime,
      complete: true, depthAvailable: false
    }};
    if (features.length > total || data.features.length !== 100) fail('INVALID_DATA');
  }
  fail('DATA_TOO_LARGE');
}

// Provider calls this TMS, but a live 6/50/29 check confirms XYZ row numbering.
// Only Thailand-intersecting tiles, no arbitrary URL.
async function tileResponse(url, env) {
  const match = url.pathname.match(/^\/tiles\/(1|7|30)\/(\d+)\/(\d+)\/(\d+)\.png$/);
  if (!match || url.search) return reply({error:'INVALID_TILE'},400);
  const [,days,zs,xs,ys] = match, z=Number(zs), x=Number(xs), y=Number(ys), n=2**z;
  if (z>12 || x>=n || y>=n || String(z)!==zs || String(x)!==xs || String(y)!==ys) return reply({error:'INVALID_TILE'},400);
  const lat = row => Math.atan(Math.sinh(Math.PI*(1-2*row/n)))*180/Math.PI;
  if ((x+1)/n*360-180<97 || x/n*360-180>106 || lat(y)<5 || lat(y+1)>21) return reply({error:'OUTSIDE_THAILAND'},400);
  if (!env.GISTDA_API_KEY) return reply({error:'NOT_CONFIGURED'},503);
  const key = new Request(`${url.origin}/cache-national-v2${url.pathname}`), cache=caches.default;
  const cached=await cache.match(key); if(cached) return cached;
  let response;
  try {
    const apiKey=String(env.GISTDA_API_KEY).trim();
    if (!apiKey || /[\u0000-\u0020\u007f]/.test(apiKey)) fail('KEY_FORMAT');
    const controller=new AbortController(), timer=setTimeout(()=>controller.abort(),8000);
    try {
      const upstream=await fetch(`https://api-gateway.gistda.or.th/api/2.0/resources/maps/flood/${days==='1'?'1day':days+'days'}/tms/${z}/${x}/${y}`,
        {headers:{'API-Key':apiKey,Accept:'image/png'},redirect:'manual',signal:controller.signal});
      if (!upstream.ok || !/^image\/png\b/i.test(upstream.headers.get('Content-Type')||'')) fail('TILE_UNAVAILABLE');
      if (Number(upstream.headers.get('Content-Length'))>2*1024*1024) fail('TILE_UNAVAILABLE');
      const bytes=new Uint8Array(await upstream.arrayBuffer());
      if (bytes.length>2*1024*1024 || bytes.length<24 || ![137,80,78,71,13,10,26,10].every((b,i)=>bytes[i]===b)) fail('TILE_UNAVAILABLE');
      response=new Response(bytes,{headers:{'Content-Type':'image/png','Access-Control-Allow-Origin':ORIGIN,
        'Cache-Control':'public, max-age=3600','X-Content-Type-Options':'nosniff'}});
    } finally {clearTimeout(timer);}
  } catch (_) {response=reply({error:'TILE_UNAVAILABLE'},503,60);}
  try{await cache.put(key,response.clone());}catch(_){}
  return response;
}

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    if (url.pathname === '/health' && request.method === 'GET') return reply({service: 'ics-gistda-flood',
      version: 3, configured: !!env.GISTDA_API_KEY, coverage:'Thailand', provinces:77, periods: [1, 7, 30]});
    // CORS is not authentication: this intentionally exposes only fixed public
    // Thailand datasets, never a generic upstream proxy or a secret-bearing link.
    if (request.headers.get('Origin') !== ORIGIN) return reply({error: 'ORIGIN_NOT_ALLOWED'}, 403);
    if (url.pathname.startsWith('/tiles/') && request.method==='GET') return tileResponse(url,env);
    if (url.pathname !== '/flood') return reply({error: 'NOT_FOUND'}, 404);
    if (request.method === 'OPTIONS') return new Response(null, {status: 204, headers: {
      'Access-Control-Allow-Origin': ORIGIN, 'Access-Control-Allow-Methods': 'GET, OPTIONS',
      'Access-Control-Max-Age': '86400'
    }});
    if (request.method !== 'GET') return reply({error: 'METHOD_NOT_ALLOWED'}, 405);
    const days = url.searchParams.get('days');
    const province=url.searchParams.get('province')||'21';
    if (!PROVINCES.has(province) || url.searchParams.getAll('province').length>1) return reply({error:'INVALID_PROVINCE'},400);
    if (!['1', '7', '30'].includes(days) || [...url.searchParams.keys()].some(k => !['days','province'].includes(k)) ||
      url.searchParams.getAll('days').length !== 1) return reply({error: 'INVALID_PERIOD'}, 400);
    if (!env.GISTDA_API_KEY) return reply({error: 'NOT_CONFIGURED'}, 503);
    const scope=days+':'+province;
    const key = new Request(`${url.origin}/cache-province-v1/flood?days=${days}&province=${province}`);
    const cache = caches.default;
    const cached = await cache.match(key);
    if (cached) return cached;
    if (!pending.has(scope)) pending.set(scope, (async () => {
      let response;
      try {
        const data = await loadFlood(days, env.GISTDA_API_KEY,province);
        response = reply(data, 200, data.features.length ? 3600 : 900);
      } catch (error) {
        const allowed = ['KEY_REJECTED', 'KEY_FORMAT', 'DATA_TOO_LARGE', 'INVALID_DATA', 'DATA_CHANGED', 'UPSTREAM_FORMAT', 'UPSTREAM_NETWORK', 'UPSTREAM_TIMEOUT', 'UPSTREAM_REDIRECT'];
        // Never log/return upstream messages, URLs, links or credentials.
        const details = {error: allowed.includes(error.message) ? error.message : 'UPSTREAM_UNAVAILABLE'};
        if (Number.isInteger(error.upstreamStatus)) details.upstreamStatus = error.upstreamStatus;
        response = reply(details, 503, 60);
      }
      // A cache outage must not turn a valid data response into an app failure.
      try { await cache.put(key, response.clone()); } catch (_) {}
      return response;
    })());
    try { return (await pending.get(scope)).clone(); }
    finally { pending.delete(scope); }
  }
};
