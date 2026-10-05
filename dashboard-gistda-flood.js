// Public reference layer only. Never changes an incident, camera or manual area.
(function() {
'use strict';
var ENDPOINT = 'https://the-1-ics-gistda-flood.occ-hrh.workers.dev/flood';
var SOURCE = 'ics-gistda-flood';
var FILL = SOURCE + '-fill', LINE = SOURCE + '-line';
var mapRef = null, enabled = false, days = 1, version = 0;
var data = null, controller = null, popup = null, loading = false;
var memory = {}, failureUntil = {}, timer = null, expiryTimer = null;
var status = 'ยังไม่เปิดน้ำท่วม GISTDA · เฉพาะจังหวัดระยอง';
function empty() { return {type:'FeatureCollection',features:[]}; }
function text(id, value) { var el = document.getElementById(id); if (el) el.textContent = value; }
function closePopup() { if (popup) popup.remove(); popup = null; }
function sync() {
var check = document.getElementById('dashExternalFloodLayerCheck');
var select = document.getElementById('dashExternalFloodPeriod');
var refresh = document.getElementById('dashExternalFloodRefresh');
if (check) check.checked = enabled;
if (select) { select.value = String(days); select.disabled = !enabled; }
if (refresh) refresh.disabled = !enabled || loading;
var notice = document.getElementById('dashExternalFloodMapNotice');
if (notice) {
notice.style.display = enabled ? 'block' : 'none';
notice.textContent = 'GISTDA · ย้อนหลัง ' + days + ' วัน · ' + (loading ? 'กำลังโหลด' : !data ? 'ยังไม่แสดงข้อมูล' : data.features.length ? 'ไม่ใช่สถานการณ์ปัจจุบัน' : 'ไม่พบข้อมูล ไม่ได้แปลว่าไม่ท่วม');
}
text('dashExternalFloodSourceStatus', status);
text('dashExternalFloodBadge', enabled ? 'ย้อนหลัง ' + days + ' วัน' : 'GISTDA');
window.dashboardExternalFloodLabel = enabled ? 'น้ำท่วม GISTDA ย้อนหลัง ' + days + ' วัน' : 'ปิดน้ำท่วม GISTDA';
if (window.syncDashboardMapModeUI) window.syncDashboardMapModeUI();
}
function ready(mapObj) { return mapObj && (!mapObj.isStyleLoaded || mapObj.isStyleLoaded()); }
function render() {
var m = mapRef;
if (!ready(m)) {
if (m && m.once) m.once('idle', function() { if (mapRef === m) render(); });
return;
}
var source = m.getSource(SOURCE);
if (!enabled || !data) {
if (source) source.setData(empty());
return;
}
if (!source) m.addSource(SOURCE, {type:'geojson',data:data,
attribution:'<a href="https://disaster.gistda.or.th/services/open-api" target="_blank" rel="noopener noreferrer">GISTDA · น้ำท่วมย้อนหลัง</a>'});
else source.setData(data);
// Below field reports/closures and tambon boundaries, above basemap/traffic.
var before = (m.getStyle().layers || []).find(function(l) { return /^(mt-(polygon|line|circle)-|tambon-(fill|line)-)/.test(l.id); });
if (!m.getLayer(FILL)) m.addLayer({id:FILL,type:'fill',source:SOURCE,
paint:{'fill-color':'#38bdf8','fill-opacity':0.3}}, before && before.id);
if (!m.getLayer(LINE)) m.addLayer({id:LINE,type:'line',source:SOURCE,
paint:{'line-color':'#0284c7','line-width':1.5}}, before && before.id);
}
function safe(value) { return String(value || '').replace(/[&<>"']/g, function(c) {
return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c];
}); }
function showDetail(event) {
if (!enabled || !data || !ready(mapRef) || !mapRef.getLayer(FILL) || !event.point) return;
var target = event.originalEvent && event.originalEvent.target;
if (target && target.closest && target.closest('.maplibregl-marker,.mapboxgl-marker,.maplibregl-popup,.mapboxgl-popup')) return;
// A manual flood area or closure on top keeps its own interaction.
var hits = mapRef.queryRenderedFeatures(event.point);
var first = hits.find(function(f) { return f.layer && (f.layer.id === FILL || /^mt-(polygon|line|circle)-/.test(f.layer.id)); });
if (!first || first.layer.id !== FILL) { closePopup(); return; }
var p = first.properties || {};
closePopup();
if (typeof maptilersdk === 'undefined' || !maptilersdk.Popup) return;
popup = new maptilersdk.Popup({closeOnClick:false,maxWidth:'300px'}).setLngLat(event.lngLat).setHTML(
'<strong>GISTDA · น้ำท่วมย้อนหลัง ' + days + ' วัน</strong><br>' +
safe([p.subdistrict,p.district,p.province].filter(Boolean).join(' · ')) +
'<br>ระดับน้ำ: ไม่มีข้อมูล<br><small>วันที่ในชื่อชุดภาพต้นทาง: ' + safe(p.imageDates || 'ไม่มีข้อมูล') +
'<br>อาจอ้างหลายภาพ ไม่ใช่วันยืนยันน้ำท่วมเฉพาะจุด และไม่ยืนยันว่าปัจจุบันยังท่วม</small>').addTo(mapRef);
}
function describe(result) {
var when = new Date(result.meta.retrievedAt);
var label = !isNaN(when.getTime()) ? when.toLocaleString('th-TH') : 'ไม่ทราบเวลา';
return 'ระยอง · ย้อนหลัง ' + days + ' วัน · ' + result.features.length +
' ชิ้นขอบเขต (ไม่ใช่จำนวนเหตุ) · ดึงข้อมูล ' + label + ' ไม่ใช่เวลาภาพดาวเทียม' +
(result.features.length ? '' : ' · ไม่พบข้อมูล ไม่ได้แปลว่าไม่มีน้ำท่วม');
}
function validate(result, requestedDays) {
if (!result || result.type !== 'FeatureCollection' || !Array.isArray(result.features) ||
!result.meta || result.meta.complete !== true || result.meta.provinceId !== '21' ||
result.meta.days !== requestedDays || result.meta.numberMatched !== result.features.length) throw new Error('INVALID_DATA');
result.features.forEach(function(f) {
if (!f.geometry || ['Polygon','MultiPolygon'].indexOf(f.geometry.type) < 0) throw new Error('INVALID_DATA');
});
return result;
}
function expireAt(until) {
if (expiryTimer) clearTimeout(expiryTimer);
expiryTimer = setTimeout(function() {
expiryTimer = null;
if (!enabled) return;
closePopup(); data = null; render();
status = 'ข้อมูลที่พักไว้หมดอายุ กดตรวจข้อมูลเพื่อดึงใหม่ · ไม่แสดงขอบเขตเก่าเป็นข้อมูลล่าสุด'; sync();
}, Math.max(1, until - Date.now()));
}
async function load() {
var mine = ++version, requestedDays = days;
if (controller) controller.abort();
if (timer) clearTimeout(timer);
if (expiryTimer) clearTimeout(expiryTimer);
expiryTimer = null;
controller = null; timer = null;
closePopup(); data = null; render();
if (!enabled) { loading = false; status = 'ยังไม่เปิดน้ำท่วม GISTDA · เฉพาะจังหวัดระยอง'; sync(); return; }
var cached = memory[requestedDays];
if (cached && cached.until > Date.now()) {
data = cached.data; loading = false; status = describe(data); expireAt(cached.until); render(); sync(); return;
}
if (failureUntil[requestedDays] > Date.now()) {
loading = false; status = 'โหลดไม่ได้ กรุณารอสักครู่แล้วลองใหม่ · ยังไม่แสดงขอบเขต GISTDA'; sync(); return;
}
loading = true; status = 'กำลังโหลดน้ำท่วมระยองย้อนหลัง ' + days + ' วัน…'; sync();
var own = new AbortController(); controller = own;
timer = setTimeout(function() { own.abort(); }, 35000);
try {
var response = await fetch(ENDPOINT + '?days=' + requestedDays, {credentials:'omit',cache:'no-store',signal:own.signal});
var result = await response.json();
if (!response.ok) throw new Error(result.error || 'UPSTREAM_UNAVAILABLE');
result = validate(result, requestedDays);
if (!enabled || mine !== version) return;
// Cache age starts at server retrieval, not browser load time.
var ttl = result.features.length ? 3600000 : 900000;
var retrieved = Date.parse(result.meta.retrievedAt);
if (!Number.isFinite(retrieved) || Date.now() - retrieved > ttl + 60000) throw new Error('STALE_DATA');
memory[requestedDays] = {data:result,until:retrieved + ttl};
data = result; status = describe(result); expireAt(retrieved + ttl); render();
} catch(error) {
if (!enabled || mine !== version) return;
failureUntil[requestedDays] = Date.now() + 60000;
var message = error.message === 'NOT_CONFIGURED' ? 'ยังไม่ได้ตั้งคีย์ GISTDA ที่ตัวเชื่อม' :
error.message === 'KEY_REJECTED' ? 'GISTDA ไม่ยอมรับคีย์ กรุณาตรวจสิทธิ์' :
error.message === 'DATA_TOO_LARGE' ? 'ข้อมูลมากเกินขีดจำกัด ยังไม่แสดงชุดข้อมูลที่ไม่ครบ' :
error.message === 'STALE_DATA' ? 'ข้อมูลที่ได้รับเก่าเกินช่วงพักข้อมูล กรุณาลองใหม่' : 'โหลด GISTDA ไม่สำเร็จ กรุณาลองใหม่ภายหลัง';
status = message + ' · จุดและพื้นที่หน้างานเดิมยังใช้งานได้';
} finally {
if (mine === version) {
clearTimeout(timer); timer = null; controller = null; loading = false; sync();
}
}
}
window.setDashboardExternalFloodLayer = function(visible) { enabled = !!visible; load(); };
window.setDashboardExternalFloodPeriod = function(value) {
var next = Number(value);
if ([1,7,30].indexOf(next) < 0 || next === days) return;
days = next; if (enabled) load(); else sync();
};
window.refreshDashboardExternalFlood = function() { if (enabled && !loading) load(); };
window.restoreDashboardExternalFlood = function() { render(); };
window.attachDashboardExternalFlood = function(mapObj) {
if (!mapObj || mapRef === mapObj) return;
closePopup(); mapRef = mapObj;
mapObj.on('style.load', function() { if (mapRef === mapObj) render(); });
mapObj.on('click', function(event) { if (mapRef === mapObj) showDetail(event); });
mapObj.on('error', function(event) {
if (mapRef === mapObj && enabled && event && event.sourceId === SOURCE) {
status = 'ขอบเขต GISTDA แสดงผลไม่สำเร็จ / อาจไม่ครบ · ใช้รายงานหน้างานประกอบ'; sync();
}
});
render();
};
sync();
if (typeof dashMap !== 'undefined' && dashMap && dashMap._maptiler) window.attachDashboardExternalFlood(dashMap._maptiler);
})();
