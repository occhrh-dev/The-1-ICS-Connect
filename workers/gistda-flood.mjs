// Standalone read-only service. No database bindings or incident writes.
const ORIGIN = 'https://occhrh-dev.github.io';
const UPSTREAM = 'https://api-gateway.gistda.or.th/api/2.0/resources/features/flood/';
const pending = new Map();
const MAX_FEATURES = 2000;
const MAX_BYTES = 8 * 1024 * 1024;

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
async function loadFlood(days, apiKey) {
  const features = [], deadline = Date.now() + 25000;
  let total = null, bytes = 0, upstreamResponseTime = null;
  for (let offset = 0; offset < MAX_FEATURES; offset += 100) {
    if (Date.now() >= deadline) fail('UPSTREAM_UNAVAILABLE');
    const url = new URL(UPSTREAM + (days === '1' ? '1day' : days + 'days'));
    url.searchParams.set('pv_idn', '21');
    url.searchParams.set('limit', '100');
    url.searchParams.set('offset', String(offset));
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), Math.min(8000, deadline - Date.now()));
    let data;
    try {
      const response = await fetch(url, {headers: {'API-Key': apiKey, Accept: 'application/json'},
        redirect: 'error', signal: controller.signal});
      if (!response.ok) fail(response.status === 401 || response.status === 403 ? 'KEY_REJECTED' : 'UPSTREAM_UNAVAILABLE');
      if (Number(response.headers.get('Content-Length')) > MAX_BYTES) fail('DATA_TOO_LARGE');
      const text = await response.text();
      bytes += new TextEncoder().encode(text).length;
      if (bytes > MAX_BYTES) fail('DATA_TOO_LARGE');
      data = JSON.parse(text);
    } finally { clearTimeout(timer); }
    if (data.type !== 'FeatureCollection' || !Array.isArray(data.features) || data.features.length > 100 ||
      !Number.isInteger(data.numberMatched) || data.numberMatched < 0 || data.numberReturned !== data.features.length) fail('INVALID_DATA');
    if (total !== null && total !== data.numberMatched) fail('DATA_CHANGED');
    total = data.numberMatched;
    if (total > MAX_FEATURES) fail('DATA_TOO_LARGE');
    upstreamResponseTime = typeof data.timeStamp === 'string' ? data.timeStamp.slice(0, 40) : null;
    data.features.forEach(feature => {
      const p = feature.properties || {};
      if (String(p.pv_idn) !== '21') fail('INVALID_DATA');
      features.push({type: 'Feature', id: features.length, geometry: safeGeometry(feature.geometry), properties: {
        province: safeText(p.pv_tn), district: safeText(p.ap_tn), subdistrict: safeText(p.tb_tn),
        imageDates: imageDates(p.file_name).join(', ')
      }});
    });
    if (features.length === total) return {type: 'FeatureCollection', features, meta: {
      source: 'GISTDA', provinceId: '21', days: Number(days), numberMatched: total,
      retrievedAt: new Date().toISOString(), upstreamResponseTime,
      complete: true, depthAvailable: false
    }};
    if (features.length > total || data.features.length !== 100) fail('INVALID_DATA');
  }
  fail('DATA_TOO_LARGE');
}

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    if (url.pathname === '/health' && request.method === 'GET') return reply({service: 'ics-gistda-flood',
      version: 1, configured: !!env.GISTDA_API_KEY, provinceId: '21', periods: [1, 7, 30]});
    // CORS is not authentication: this intentionally exposes only fixed public
    // Rayong datasets, never a generic upstream proxy or a secret-bearing link.
    if (request.headers.get('Origin') !== ORIGIN) return reply({error: 'ORIGIN_NOT_ALLOWED'}, 403);
    if (url.pathname !== '/flood') return reply({error: 'NOT_FOUND'}, 404);
    if (request.method === 'OPTIONS') return new Response(null, {status: 204, headers: {
      'Access-Control-Allow-Origin': ORIGIN, 'Access-Control-Allow-Methods': 'GET, OPTIONS',
      'Access-Control-Max-Age': '86400'
    }});
    if (request.method !== 'GET') return reply({error: 'METHOD_NOT_ALLOWED'}, 405);
    const days = url.searchParams.get('days');
    if (!['1', '7', '30'].includes(days) || [...url.searchParams.keys()].some(k => k !== 'days') ||
      url.searchParams.getAll('days').length !== 1) return reply({error: 'INVALID_PERIOD'}, 400);
    if (!env.GISTDA_API_KEY) return reply({error: 'NOT_CONFIGURED'}, 503);
    const key = new Request(`${url.origin}/cache-v1/flood?days=${days}`);
    const cache = caches.default;
    const cached = await cache.match(key);
    if (cached) return cached;
    if (!pending.has(days)) pending.set(days, (async () => {
      let response;
      try {
        const data = await loadFlood(days, env.GISTDA_API_KEY);
        response = reply(data, 200, data.features.length ? 3600 : 900);
      } catch (error) {
        const allowed = ['KEY_REJECTED', 'DATA_TOO_LARGE', 'INVALID_DATA', 'DATA_CHANGED'];
        // Never log/return upstream messages, URLs, links or credentials.
        response = reply({error: allowed.includes(error.message) ? error.message : 'UPSTREAM_UNAVAILABLE'}, 503, 60);
      }
      // A cache outage must not turn a valid data response into an app failure.
      try { await cache.put(key, response.clone()); } catch (_) {}
      return response;
    })());
    try { return (await pending.get(days)).clone(); }
    finally { pending.delete(days); }
  }
};
