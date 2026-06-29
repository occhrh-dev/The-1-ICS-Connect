var dynamicOverlay = null;
var dynamicLabelMarker = null;
var dashEOCMarker = null;
var dashEOCCoordsRaw = '';
var incidentCenter = { lat: 0, lng: 0 };
var GlobalMarkerClass = null;
function removeLongdoOverlay(targetMap, overlay) {
if (targetMap && overlay && targetMap.Overlays) targetMap.Overlays.remove(overlay);
}
function clearLongdoOverlayList(targetMap, list) {
(list || []).forEach(function(overlay) {
removeLongdoOverlay(targetMap, overlay);
});
}
function meterRadiusToDegree(meters) {
return (parseFloat(meters) || 0) / 111320;
}
function hexToRgbaColor(hex, alpha) {
if (!hex || hex.charAt(0) !== '#') return hex;
var value = hex.replace('#', '');
if (value.length === 3) value = value.split('').map(function(c) { return c + c; }).join('');
var r = parseInt(value.substring(0, 2), 16);
var g = parseInt(value.substring(2, 4), 16);
var b = parseInt(value.substring(4, 6), 16);
return 'rgba(' + r + ',' + g + ',' + b + ',' + alpha + ')';
}
function fitLongdoMeters(targetMap, lat, lng, radiusM) {
if (!targetMap || !radiusM) return;
var dLat = radiusM / 111320;
var dLng = radiusM / (111320 * Math.cos(lat * Math.PI / 180));
if (typeof targetMap.fitBounds === 'function') {
targetMap.fitBounds([[lng - dLng, lat - dLat], [lng + dLng, lat + dLat]], {
padding: 60,
duration: 350,
maxZoom: 17
});
return;
}
targetMap.bound({
minLon: lng - dLng,
minLat: lat - dLat,
maxLon: lng + dLng,
maxLat: lat + dLat
});
}
function makeMapTilerCircleOverlay(loc, radiusM, options) {
options = options || {};
var centerLng = parseFloat(loc.lon);
var centerLat = parseFloat(loc.lat);
var radius = parseFloat(radiusM) || 0;
var id = 'mt-circle-' + Date.now() + '-' + Math.random().toString(36).slice(2);
var coords = [];
var latRad = centerLat * Math.PI / 180;
for (var i = 0; i <= 96; i++) {
var angle = (i / 96) * Math.PI * 2;
var dLat = (Math.sin(angle) * radius) / 111320;
var dLng = (Math.cos(angle) * radius) / (111320 * Math.cos(latRad));
coords.push([centerLng + dLng, centerLat + dLat]);
}
return {
_maptilerCircle: true,
_id: id,
_addToMap: function(targetMap) {
var mapObj = targetMap && (targetMap._maptiler || targetMap);
if (!mapObj || !mapObj.addSource) return;
if (typeof mapObj.isStyleLoaded === 'function' && !mapObj.isStyleLoaded()) {
var self = this;
mapObj.once('load', function() { self._addToMap(mapObj); });
return;
}
var sourceId = id + '-source';
if (mapObj.getSource && mapObj.getSource(sourceId)) return;
mapObj.addSource(sourceId, {
type: 'geojson',
data: {
type: 'Feature',
geometry: { type: 'Polygon', coordinates: [coords] },
properties: {}
}
});
mapObj.addLayer({
id: id + '-fill',
type: 'fill',
source: sourceId,
paint: { 'fill-color': options.fillColor || 'rgba(52,152,219,0.12)' }
});
mapObj.addLayer({
id: id + '-line',
type: 'line',
source: sourceId,
paint: {
'line-color': options.lineColor || '#3498db',
'line-width': options.lineWidth || 2,
'line-dasharray': options.dash ? String(options.dash).split(',').map(function(n) { return parseFloat(n) || 1; }) : [1, 0]
}
});
this._map = mapObj;
this._sourceId = sourceId;
this._layerIds = [id + '-fill', id + '-line'];
},
_removeFromMap: function() {
var mapObj = this._map;
if (!mapObj) return;
(this._layerIds || []).forEach(function(layerId) {
try { if (mapObj.getLayer(layerId)) mapObj.removeLayer(layerId); } catch(e) {}
});
try { if (mapObj.getSource(this._sourceId)) mapObj.removeSource(this._sourceId); } catch(e) {}
this._map = null;
}
};
}
function makeLongdoHtmlMarker(loc, html, options) {
options = options || {};
if (typeof maptilersdk !== 'undefined') {
var el = document.createElement('div');
el.className = 'maptiler-html-marker';
el.style.pointerEvents = 'auto';
var inner = document.createElement('div');
inner.className = 'dash-marker-scale-inner';
inner.innerHTML = html;
el.appendChild(inner);
var scaleMode = options.scaleMode || 'default';
if (scaleMode !== 'none') {
inner.classList.add('dash-scaled-marker');
inner.classList.add(scaleMode === 'label' ? 'dash-scaled-label' : 'dash-scaled-symbol');
}
var marker = new maptilersdk.Marker({
element: el,
anchor: (options.offset && options.offset.x === 0 && options.offset.y === 0) ? 'center' : 'bottom',
offset: options.offset ? [options.offset.x || 0, options.offset.y || 0] : [18, 36]
}).setLngLat([parseFloat(loc.lon), parseFloat(loc.lat)]);
var detail = options.markerOptions && options.markerOptions.detail;
if (detail) {
var popup = new maptilersdk.Popup({ offset: 18 }).setHTML(detail);
marker.setPopup(popup);
marker._dashboardPopup = popup;
}
marker._dashboardHtmlElement = inner;
return marker;
}
return new longdo.Marker(loc, Object.assign({
icon: {
html: html,
offset: options.offset || { x: 18, y: 36 }
},
weight: options.weight || longdo.OverlayWeight.Top,
title: options.title || ''
}, options.markerOptions || {}));
}
function updateLongdoHtmlMarker(marker, loc, html, detailHtml) {
if (!marker) return false;
if (marker._dashboardHtmlElement) {
marker._dashboardHtmlElement.innerHTML = html;
if (marker.setLngLat && loc) marker.setLngLat([parseFloat(loc.lon), parseFloat(loc.lat)]);
if (detailHtml) {
if (marker._dashboardPopup && marker._dashboardPopup.setHTML) {
marker._dashboardPopup.setHTML(detailHtml);
} else if (typeof maptilersdk !== 'undefined') {
marker._dashboardPopup = new maptilersdk.Popup({ offset: 18 }).setHTML(detailHtml);
marker.setPopup(marker._dashboardPopup);
}
}
return true;
}
return false;
}
function makeDashboardMapAdapter(mapObj) {
return {
_maptiler: mapObj,
Overlays: {
add: function(overlay) {
if (!overlay) return;
if (typeof overlay._addToMap === 'function') overlay._addToMap(mapObj);
else if (typeof overlay.addTo === 'function') overlay.addTo(mapObj);
},
remove: function(overlay) {
if (!overlay) return;
try {
if (typeof overlay._removeFromMap === 'function') overlay._removeFromMap();
else if (typeof overlay.remove === 'function') overlay.remove();
} catch(e) {}
}
},
location: function(pos, animate) {
if (!pos) return;
mapObj[animate ? 'easeTo' : 'jumpTo']({ center: [parseFloat(pos.lon), parseFloat(pos.lat)] });
},
zoom: function(level) {
if (level == null) return mapObj.getZoom();
mapObj.easeTo({ zoom: level, duration: 250 });
},
bound: function(bounds) {
if (!bounds) return;
mapObj.fitBounds([[bounds.minLon, bounds.minLat], [bounds.maxLon, bounds.maxLat]], {
padding: 60,
duration: 350,
maxZoom: 17
});
},
resize: function() {
mapObj.resize();
},
fitBounds: function(bounds, options) {
mapObj.fitBounds(bounds, options || {});
}
};
}
function updateDashboardMarkerScale() {
var mapObj = dashMap && dashMap._maptiler;
if (!mapObj || !mapObj.getZoom) return;
var zoom = mapObj.getZoom();
// scale หมุด
var scale = zoom >= 15 ? 1 : zoom >= 13 ? 0.85 : zoom >= 11 ? 0.65 : zoom >= 9 ? 0.45 : 0.3;
var root = document.getElementById('scene_Dashboard');
if (root) root.style.setProperty('--dash-marker-scale', scale.toFixed(2));
// zoom < 12 → ซ่อน label หมุดทุกตัวยกเว้น incident+EOC
var hideLabel = zoom < 12;
var hideOthers = zoom < 10;
if (root) {
  root.style.setProperty('--dash-label-display', hideLabel ? 'none' : '');
  root.style.setProperty('--dash-other-display', hideOthers ? 'none' : '');
}
// apply ให้ live location markers และ zone markers
var allMarkerEls = root ? root.querySelectorAll('.dash-live-marker, .dash-zone-marker') : [];
allMarkerEls.forEach(function(el) {
  el.style.display = hideOthers ? 'none' : '';
  var labelEl = el.querySelector('.dash-marker-label');
  if (labelEl) labelEl.style.display = hideLabel ? 'none' : '';
});
if (dashEOCCoordsRaw && !window._dashboardEOCMarkerRendering) {
window._dashboardEOCMarkerRendering = true;
try { renderDashboardEOCMarker(dashEOCCoordsRaw); } catch(e) {}
window._dashboardEOCMarkerRendering = false;
}
}
function buildDashboardPointMarkerHtml(iconHtml, labelHtml, options) {
options = options || {};
var x = parseFloat(options.x || 0) || 0;
var y = parseFloat(options.y || 0) || 0;
var iconSize = parseFloat(options.iconSize || 40) || 40;
var labelTop = y + (iconSize / 2) + (parseFloat(options.labelGap || 5) || 5);
var scale = options.scale === false ? '' : ' scale(var(--dash-marker-scale,1))';
var z = options.zIndex || 1;
return '<div style="position:relative;width:0;height:0;overflow:visible;pointer-events:auto;">' +
'<div style="position:absolute;left:' + x + 'px;top:' + y + 'px;transform:translate(-50%,-50%)' + scale + ';transform-origin:center center;transition:transform .12s ease-out;z-index:' + z + ';">' + iconHtml + '</div>' +
(labelHtml ? '<div style="position:absolute;left:' + x + 'px;top:' + labelTop + 'px;transform:translateX(-50%)' + scale + ';transform-origin:top center;transition:transform .12s ease-out;z-index:' + (z + 1) + ';">' + labelHtml + '</div>' : '') +
'</div>';
}
function buildDashboardIncidentMarkerHtml() {
return buildDashboardPointMarkerHtml(
'<div class="incident-sonar-body" style="transform:scale(.88);transform-origin:center center;"><div class="sonar-ring-1"></div><div class="sonar-ring-2"></div><div class="sonar-ring-3"></div><div class="sonar-core"><i class="fas fa-radiation-alt"></i></div></div>',
'',
{ iconSize: 39, scale: true, zIndex: 10 }
);
}

// ==========================================
// CITIZEN CHECK-IN — หมุดคำขอช่วยเหลือจากประชาชน
// อ่านข้อมูลตรงจาก Supabase ใหม่ (citizen-checkin) ไม่ผ่าน worker หลักของ ICS Connect
// ==========================================
var CITIZEN_CHECKIN_SUPABASE_URL = 'https://cpdhykeogdgjjxmwvnkt.supabase.co';
var CITIZEN_CHECKIN_SUPABASE_KEY = 'sb_publishable_ziI_yJath2uIPrurZkhHtw_HlTOv1bq';
var CITIZEN_CHECKIN_WORKER_URL = 'https://citizen-checkin-worker.occ-hrh.workers.dev';

var helpRequestMarkers = {};
window._lastHelpRequests = [];

var HELP_NEED_META = {
boat: { emoji: '🚤', label: 'ต้องการเรือ', color: '#2980b9' },
medical: { emoji: '💊', label: 'ช่วยทางการแพทย์', color: '#c0392b' },
supplies: { emoji: '🍚', label: 'อาหาร / น้ำ', color: '#16a085' },
trapped: { emoji: '🆘', label: 'ติดอยู่ ออกไม่ได้', color: '#e67e22' }
};
var HELP_STATUS_META = {
new: { label: '🆕 รอคนรับ', color: '#facc15' },
claimed: { label: '✋ มีคนรับแล้ว', color: '#3498db' },
enroute: { label: '🚤 กำลังเดินทาง', color: '#9b59b6' },
arrived: { label: '📍 ถึงจุดแล้ว', color: '#ea580c' },
helped: { label: '✅ ช่วยแล้ว', color: '#27ae60' }
};

function buildHelpRequestMarkerHtml(req) {
var need = HELP_NEED_META[req.need] || { emoji: '🆘', color: '#888' };
var isNew = req.status === 'new';
var bg = isNew ? '#facc15' : (HELP_STATUS_META[req.status] || {}).color || need.color;
var pulseHtml = isNew
? '<div class="help-req-ring"></div>'
: '';
var iconHtml =
'<div class="help-req-marker-body" style="position:relative;">' +
pulseHtml +
'<div class="help-req-marker-core" style="background:' + bg + ';border-color:' + need.color + ';">' + need.emoji + '</div>' +
'</div>';
return buildDashboardPointMarkerHtml(iconHtml, '', { iconSize: 36, scale: true, zIndex: 9 });
}

function buildHelpRequestPopupHtml(req) {
var need = HELP_NEED_META[req.need] || { emoji: '🆘', label: req.need || '-' };
var statusMeta = HELP_STATUS_META[req.status] || { label: req.status || '-' };
var locText = req.loc ? req.loc.replace(/</g, '&lt;').replace(/>/g, '&gt;') : '(ไม่ระบุจุดสังเกต)';
var phoneHtml = req.phone ? '<br>📞 <a href="tel:' + req.phone + '" style="color:#2980b9;">' + req.phone + '</a>' : '';
var photoHtml = req.photo_url ? '<br><img src="' + req.photo_url + '" style="max-width:200px;max-height:150px;object-fit:cover;border-radius:6px;margin-top:6px;cursor:pointer;" onclick="window.open(this.src,\'_blank\')">' : '';
var noteHtml = req.note ? '<br><span style="color:#777;font-size:0.8rem;">' + req.note.replace(/</g, '&lt;').replace(/>/g, '&gt;') + '</span>' : '';

var statusButtons = ['new', 'claimed', 'enroute', 'arrived', 'helped'].map(function(s) {
var meta = HELP_STATUS_META[s] || { label: s, color: '#888' };
var active = s === req.status;
return '<button onclick="updateHelpRequestStatus(' + req.id + ',\'' + s + '\')" ' +
'style="font-size:0.7rem;padding:4px 8px;border-radius:6px;border:1px solid ' + meta.color + ';' +
'background:' + (active ? meta.color : 'white') + ';color:' + (active ? 'white' : meta.color) + ';cursor:pointer;margin:2px;">' +
meta.label + '</button>';
}).join('');

return '<div style="min-width:180px;">' +
'<b>' + need.emoji + ' ' + need.label + '</b> (' + (req.people || 1) + ' คน)<br>' +
'📍 ' + locText +
phoneHtml + noteHtml + photoHtml +
'<div style="margin-top:8px;display:flex;flex-wrap:wrap;gap:2px;">' + statusButtons + '</div>' +
'<div style="font-size:0.65rem;color:#aaa;margin-top:4px;">สถานะปัจจุบัน: ' + statusMeta.label + '</div>' +
'</div>';
}

async function fetchHelpRequests() {
var agencyId = (typeof APP_AGENCY_ID !== 'undefined' && APP_AGENCY_ID) || '';
if (!agencyId) return []; // ไม่มี agency ปัจจุบัน — ไม่ดึงอะไรเลย กันข้อมูลปนกัน
try {
var res = await fetch(
CITIZEN_CHECKIN_SUPABASE_URL + '/rest/v1/help_requests?select=*&agency_id=eq.' + encodeURIComponent(agencyId) + '&order=created_at.desc&limit=200',
{
headers: {
'apikey': CITIZEN_CHECKIN_SUPABASE_KEY,
'Authorization': 'Bearer ' + CITIZEN_CHECKIN_SUPABASE_KEY
}
}
);
if (!res.ok) return null;
return await res.json();
} catch (e) {
return null;
}
}

async function updateHelpRequestMarkers() {
if (!dashMap) return;
var requests = await fetchHelpRequests();
if (!requests) return; // fetch ล้มเหลว — เก็บหมุดเดิมไว้ ไม่ลบทิ้งเปล่าๆ
window._lastHelpRequests = requests;
renderHelpRequestPanel(requests);

var nextMarkers = {};
requests.forEach(function(req) {
try {
if (!req.lat || !req.lng) return;
var signature = [req.status, req.need, req.people, req.loc, req.photo_url].join('|');
var existing = helpRequestMarkers[req.id];
if (existing && existing._signature === signature) {
nextMarkers[req.id] = existing;
return;
}
if (existing) {
removeLongdoOverlay(dashMap, existing);
}
var html = buildHelpRequestMarkerHtml(req);
var marker = makeLongdoHtmlMarker({ lon: req.lng, lat: req.lat }, html, {
offset: { x: 0, y: 0 },
weight: 60,
title: (HELP_NEED_META[req.need] || {}).label || 'คำขอช่วยเหลือ',
scaleMode: 'none',
markerOptions: { detail: buildHelpRequestPopupHtml(req) }
});
marker._signature = signature;
dashMap.Overlays.add(marker);
nextMarkers[req.id] = marker;
} catch (markerErr) {
console.error('[Citizen Check-in] สร้างหมุดคำขอ #' + req.id + ' ไม่สำเร็จ:', markerErr);
// เก็บ marker เดิมไว้ถ้ามี เพื่อไม่ให้หมุดหายไปจากจอเพราะ error ของตัวนี้ตัวเดียว
if (helpRequestMarkers[req.id]) nextMarkers[req.id] = helpRequestMarkers[req.id];
}
});

Object.keys(helpRequestMarkers).forEach(function(id) {
if (nextMarkers[id]) return;
removeLongdoOverlay(dashMap, helpRequestMarkers[id]);
});
helpRequestMarkers = nextMarkers;
}

async function updateHelpRequestStatus(id, status) {
try {
var res = await fetch(CITIZEN_CHECKIN_WORKER_URL + '/?action=updateStatus', {
method: 'POST',
headers: { 'Content-Type': 'application/json' },
body: JSON.stringify({
id: id,
status: status,
updatedBy: (typeof USER_NAME !== 'undefined' && USER_NAME) || 'IC'
})
});
if (!res.ok) throw new Error('update failed');
updateHelpRequestMarkers();
} catch (e) {
alert('⚠️ อัปเดตสถานะไม่สำเร็จ กรุณาตรวจสอบสัญญาณอินเทอร์เน็ตแล้วลองอีกครั้ง');
}
}

function renderHelpRequestPanel(requests) {
var countEl = document.getElementById('help_request_waiting_count');
if (!countEl) return;

var waiting = requests.filter(function(r) { return r.status !== 'helped'; });
countEl.innerText = waiting.length;

var counts = { boat: 0, medical: 0, supplies: 0, trapped: 0 };
waiting.forEach(function(r) {
if (counts.hasOwnProperty(r.need)) counts[r.need]++;
});
['boat', 'medical', 'supplies', 'trapped'].forEach(function(k) {
var el = document.getElementById('help_count_' + k);
if (el) el.innerText = counts[k];
});

// ถ้า modal รายละเอียดเปิดอยู่ ให้ re-render เนื้อหาใน modal ด้วย (sync กับข้อมูลล่าสุด)
if (window._helpRequestModalOpen) {
renderHelpRequestModalBody(window._lastHelpRequests || [], window._helpRequestModalTab || 'all');
}
}

function escapeHtml(s) {
return String(s == null ? '' : s).replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function buildHelpRequestDetailCard(req) {
var need = HELP_NEED_META[req.need] || { emoji: '🆘', label: req.need || '-' };
var statusMeta = HELP_STATUS_META[req.status] || { label: req.status || '-', color: '#888' };
var locText = req.loc ? escapeHtml(req.loc) : '(ไม่ระบุจุดสังเกต)';
var phoneHtml = req.phone ? '<div style="font-size:0.78rem;color:#2563eb;margin-top:2px;">📞 <a href="tel:' + req.phone + '" style="color:#2563eb;text-decoration:none;">' + req.phone + '</a></div>' : '';
var noteHtml = req.note ? '<div style="font-size:0.75rem;color:#777;margin-top:4px;">📝 ' + escapeHtml(req.note) + '</div>' : '';
var photoHtml = req.photo_url ? '<img src="' + req.photo_url + '" style="max-width:100%;max-height:220px;width:auto;border-radius:6px;margin-top:6px;display:block;object-fit:cover;cursor:pointer;" onclick="window.open(this.src,\'_blank\')">' : '';

// โชว์ว่ากู้ภัยคนไหนรับงานนี้อยู่ (ไม่มีถ้ายัง status=new)
var responderHtml = '';
if (req.responder_name && req.status !== 'new') {
responderHtml = '<div style="background:rgba(255,255,255,0.5);border-radius:6px;padding:6px 8px;margin-top:6px;font-size:0.76rem;">' +
'🚑 ผู้รับงาน: <b>' + escapeHtml(req.responder_name) + '</b>' +
(req.responder_phone ? ' · <a href="tel:' + req.responder_phone + '" style="color:#2563eb;text-decoration:none;">' + req.responder_phone + '</a>' : '') +
'</div>';
}

// ปุ่ม admin override — ใช้กรณี IC ต้องแก้สถานะเองด้วยมือ (เช่น กู้ภัยลืมอัปเดต)
var statusBtns = ['new', 'claimed', 'enroute', 'arrived', 'helped'].map(function(s) {
var meta = HELP_STATUS_META[s];
var active = s === req.status;
return '<button onclick="updateHelpRequestStatus(' + req.id + ',\'' + s + '\')" ' +
'style="font-size:0.66rem;padding:4px 8px;border-radius:6px;border:1px solid ' + meta.color + ';' +
'background:' + (active ? meta.color : 'white') + ';color:' + (active ? 'white' : meta.color) + ';cursor:pointer;margin:2px 2px 0 0;font-family:inherit;">' +
meta.label + '</button>';
}).join('');

// ย้อมสีทั้งการ์ดตามสถานะ ให้เห็นชัดจากระยะไกล ไม่ต้องอ่านป้ายเล็กๆ
var cardBg = 'rgba(' + hexToRgbParts(statusMeta.color) + ',0.25)';
var cardBorder = statusMeta.color;

return '<div style="border:2px solid ' + cardBorder + ';background:' + cardBg + ';border-radius:8px;padding:10px;margin-bottom:8px;text-align:left;">' +
'<div style="display:flex;justify-content:space-between;align-items:center;">' +
'<b style="font-size:0.85rem;">' + need.emoji + ' ' + need.label + '</b>' +
'<span style="font-size:0.72rem;font-weight:900;color:white;background:' + statusMeta.color + ';padding:2px 8px;border-radius:999px;">' + statusMeta.label + '</span>' +
'</div>' +
'<div style="font-size:0.78rem;color:#555;margin-top:4px;">📍 ' + locText + ' · 👥 ' + (req.people || 1) + ' คน</div>' +
phoneHtml + noteHtml + responderHtml + photoHtml +
'<div style="margin-top:8px;border-top:1px solid rgba(0,0,0,0.08);padding-top:6px;">' +
'<div style="font-size:0.62rem;color:#999;margin-bottom:3px;">แก้สถานะด้วยมือ (admin):</div>' +
statusBtns +
'</div>' +
'</div>';
}

function hexToRgbParts(hex) {
hex = (hex || '#888888').replace('#', '');
var r = parseInt(hex.substring(0, 2), 16) || 136;
var g = parseInt(hex.substring(2, 4), 16) || 136;
var b = parseInt(hex.substring(4, 6), 16) || 136;
return r + ',' + g + ',' + b;
}

function renderHelpRequestModalBody(requests, tab) {
var body = document.getElementById('help_request_modal_body');
if (!body) return;
var waiting = requests.filter(function(r) { return r.status !== 'helped'; });
var filtered = tab === 'all' ? waiting : waiting.filter(function(r) { return r.need === tab; });

document.querySelectorAll('.hr-modal-tab').forEach(function(t) {
t.classList.toggle('active', t.dataset.tab === tab);
});

if (filtered.length === 0) {
body.innerHTML = '<div style="font-size:0.8rem;color:#aaa;text-align:center;padding:20px 0;">ไม่มีคำขอในหมวดนี้</div>';
return;
}
body.innerHTML = filtered.map(buildHelpRequestDetailCard).join('');
}

function openHelpRequestDetailModal() {
window._helpRequestModalOpen = true;
window._helpRequestModalTab = 'all';
var requests = window._lastHelpRequests || [];
var waiting = requests.filter(function(r) { return r.status !== 'helped'; });
var counts = { boat: 0, medical: 0, supplies: 0, trapped: 0 };
waiting.forEach(function(r) { if (counts.hasOwnProperty(r.need)) counts[r.need]++; });

var tabsHtml = [
{ key: 'all', label: 'ทั้งหมด (' + waiting.length + ')' },
{ key: 'boat', label: '🚤 เรือ (' + counts.boat + ')' },
{ key: 'medical', label: '💊 แพทย์ (' + counts.medical + ')' },
{ key: 'supplies', label: '🍚 อาหาร (' + counts.supplies + ')' },
{ key: 'trapped', label: '🆘 ติดอยู่ (' + counts.trapped + ')' }
].map(function(t) {
return '<div class="hr-modal-tab' + (t.key === 'all' ? ' active' : '') + '" data-tab="' + t.key + '" onclick="switchHelpRequestModalTab(\'' + t.key + '\')">' + t.label + '</div>';
}).join('');

Swal.fire({
title: '🆘 คำขอช่วยเหลือจากประชาชน',
html: '<div class="hr-modal-tabs">' + tabsHtml + '</div><div id="help_request_modal_body" style="max-height:420px;overflow-y:auto;margin-top:10px;"></div>',
width: '92vw',
confirmButtonText: 'ปิด',
showCloseButton: true,
didOpen: function() {
renderHelpRequestModalBody(window._lastHelpRequests || [], 'all');
},
willClose: function() {
window._helpRequestModalOpen = false;
}
});
}

function switchHelpRequestModalTab(tab) {
window._helpRequestModalTab = tab;
renderHelpRequestModalBody(window._lastHelpRequests || [], tab);
}

function flyToHelpRequest(lat, lng) {
if (!dashMap || !dashMap._maptiler) return;
dashMap._maptiler.flyTo({ center: [lng, lat], zoom: 17, duration: 800 });
}

function startHelpRequestPolling() {
updateHelpRequestMarkers();
if (window._helpRequestPollInterval) clearInterval(window._helpRequestPollInterval);
window._helpRequestPollInterval = setInterval(updateHelpRequestMarkers, 5000);
}
function getDashboardScreenDistance(locA, locB) {
var mapObj = dashMap && dashMap._maptiler;
if (!mapObj || !mapObj.project || !locA || !locB) return null;
try {
var a = mapObj.project([parseFloat(locA.lon), parseFloat(locA.lat)]);
var b = mapObj.project([parseFloat(locB.lon), parseFloat(locB.lat)]);
if (!a || !b) return null;
var dx = (a.x || 0) - (b.x || 0);
var dy = (a.y || 0) - (b.y || 0);
return Math.sqrt(dx * dx + dy * dy);
} catch(e) {
return null;
}
}
function parseDashboardEOCLoc() {
if (!dashEOCCoordsRaw || String(dashEOCCoordsRaw).indexOf(',') === -1) return null;
var parts = String(dashEOCCoordsRaw).split(',');
var lat = parseFloat(parts[0]);
var lng = parseFloat(parts[1]);
if (isNaN(lat) || isNaN(lng)) return null;
return { lon: lng, lat: lat };
}
function getDashboardIncidentLoc() {
if (!incidentCenter || !incidentCenter.lat || !incidentCenter.lng) return null;
return { lon: parseFloat(incidentCenter.lng), lat: parseFloat(incidentCenter.lat) };
}
function ensureDashboardMarkerSeparationZoom() {
var mapObj = dashMap && dashMap._maptiler;
if (!mapObj || !mapObj.getZoom || !mapObj.project) return;
try {
if (mapObj.setMinZoom) mapObj.setMinZoom(3);
} catch(e) {}
}
function renderDashboardEOCMarker(eocCoords) {
if (!dashMap) return;
dashEOCCoordsRaw = eocCoords || dashEOCCoordsRaw || '';
removeLongdoOverlay(dashMap, dashEOCMarker);
dashEOCMarker = null;
if (!eocCoords || String(eocCoords).indexOf(',') === -1) return;
var parts = String(eocCoords).split(',');
var lat = parseFloat(parts[0]);
var lng = parseFloat(parts[1]);
if (isNaN(lat) || isNaN(lng)) return;
var eocLoc = { lon: lng, lat: lat };
var incidentLoc = (incidentCenter && incidentCenter.lat && incidentCenter.lng) ? { lon: incidentCenter.lng, lat: incidentCenter.lat } : null;
var screenDist = getDashboardScreenDistance(eocLoc, incidentLoc);
var zoom = dashMap && dashMap._maptiler && dashMap._maptiler.getZoom ? dashMap._maptiler.getZoom() : 16;
var compact = (screenDist !== null && screenDist < 70) || zoom < 8;
var hideLabel = compact || zoom < 10;
var iconSize = compact ? 26 : 34;
var html = buildDashboardPointMarkerHtml(
'<div style="width:' + iconSize + 'px;height:' + iconSize + 'px;border-radius:50%;background:#2563eb;border:' + (compact ? 2 : 3) + 'px solid #fff;box-shadow:0 2px 10px rgba(15,23,42,.4);display:flex;align-items:center;justify-content:center;color:#fff;font-size:' + (compact ? 9 : 14) + 'px;"><i class="fas fa-house-flag"></i></div>',
hideLabel ? '' : '<div style="background:#1d4ed8;color:#fff;font-weight:900;font-size:10px;padding:2px 7px;border-radius:6px;white-space:nowrap;box-shadow:0 2px 8px rgba(15,23,42,.25);">EOC</div>',
{ iconSize: iconSize, scale: true, zIndex: compact ? 2 : 8 }
);
// 🔧 ใช้ offset {0,0} เหมือนหมุดจุดเกิดเหตุ (dashMarker) — ทำให้ anchor เป็น 'center' ปักกึ่งกลางไอคอนพอดีกับพิกัดจริง
// เดิม offset {0,-6} ทำให้ anchor กลายเป็น 'bottom' (ปักที่ขอบล่างของป้าย EOC แทนที่จะเป็นกึ่งกลางไอคอน) จึงดูเหมือนหมุดเลื่อน/ไม่นิ่งเวลาซูม
dashEOCMarker = makeLongdoHtmlMarker(eocLoc, html, {
offset: { x: 0, y: 0 },
weight: (typeof longdo !== 'undefined' && longdo.OverlayWeight) ? longdo.OverlayWeight.Top : 0,
title: 'ที่ตั้ง EOC',
scaleMode: 'none'
});
dashMap.Overlays.add(dashEOCMarker);
ensureDashboardMarkerSeparationZoom();
}
function setDashboardMapStyle(mode) {
window._dashboardMapStyle = mode === 'satellite' ? 'satellite' : 'streets';
var streetBtn = document.getElementById('dashStyleStreet');
var satBtn = document.getElementById('dashStyleSat');
if (streetBtn && satBtn) {
var sat = window._dashboardMapStyle === 'satellite';
streetBtn.style.background = sat ? 'white' : '#2563eb';
streetBtn.style.color = sat ? '#334155' : 'white';
satBtn.style.background = sat ? '#2563eb' : 'white';
satBtn.style.color = sat ? 'white' : '#334155';
}
if (!dashMap || !dashMap._maptiler || typeof maptilersdk === 'undefined') return;
var style = window._dashboardMapStyle === 'satellite'
? (maptilersdk.MapStyle.HYBRID || 'https://api.maptiler.com/maps/hybrid/style.json?key=' + encodeURIComponent(MAPTILER_API_KEY))
: maptilersdk.MapStyle.STREETS;
clearLongdoOverlayList(dashMap, otherMarkers);
clearLongdoOverlayList(dashMap, zoneCircles);
clearLongdoOverlayList(dashMap, window._icOCZoneOverlays || []);
clearLongdoOverlayList(dashMap, window._icOCZoneCircles || []);
clearLongdoOverlayList(dashMap, window._icOCReqAlertOverlays || []);
clearLongdoOverlayList(dashMap, Object.values(helpRequestMarkers || {}));
otherMarkers = [];
zoneCircles = [];
helpRequestMarkers = {};
window._dashboardLiveMarkerRecords = {};
window._icOCZoneOverlayRecords = {};
window._icOCZoneOverlays = [];
window._icOCZoneCircles = [];
window._icOCReqAlertOverlays = [];
window._icOCZoneDrawKey = '';
dashMap._maptiler.setStyle(style);
dashMap._maptiler.once('styledata', function() {
setTimeout(function() {
try {
if (window._lastEmergState) applyDashboardEmergencyState(window._lastEmergState);
if (typeof updateLiveMarkers === 'function') updateLiveMarkers();
if (typeof updateHelpRequestMarkers === 'function') updateHelpRequestMarkers();
if (typeof drawHazmatZonesOnDashMap === 'function' && window._lastHazmatZoneData) {
drawHazmatZonesOnDashMap(window._lastHazmatZoneData);
}
} catch(e) {
}
}, 150);
});
}
function getDashboardIncidentPoint() {
if (incidentCenter && incidentCenter.lat && incidentCenter.lng) {
return { lat: parseFloat(incidentCenter.lat), lng: parseFloat(incidentCenter.lng) };
}
var coords = window._lastEmergState && window._lastEmergState.evtCoords;
if (coords && String(coords).indexOf(',') !== -1) {
var parts = String(coords).split(',').map(function(v) { return parseFloat(v.trim()); });
if (!isNaN(parts[0]) && !isNaN(parts[1])) return { lat: parts[0], lng: parts[1] };
}
return { lat: 12.6814, lng: 101.2816 };
}
function openLongdoTrafficMap() {
if (typeof longdo === 'undefined' || !longdo.Map) {
Swal.fire('ยังเปิดจราจรไม่ได้', 'Longdo Map API ยังโหลดไม่เสร็จ กรุณาลองอีกครั้ง', 'warning');
return;
}
var point = getDashboardIncidentPoint();
Swal.fire({
title: '<i class="fas fa-road"></i> แผนที่จราจร Longdo',
html:
'<div style="text-align:left;font-size:13px;color:#475569;margin-bottom:8px;">ดูสภาพจราจรโดยไม่กระทบแผนที่หลักของ Dashboard</div>' +
'<div id="longdo_traffic_map" style="width:100%;height:68vh;border-radius:8px;overflow:hidden;border:1px solid #cbd5e1;background:#eef2f7;"></div>',
width: '92vw',
confirmButtonText: 'ปิด',
didOpen: function() {
setTimeout(function() {
var holder = document.getElementById('longdo_traffic_map');
if (!holder) return;
holder.innerHTML = '';
var trafficLayers = [];
if (longdo.Layers) {
trafficLayers.push(longdo.Layers.GRAY || longdo.Layers.GRAY_EN || longdo.Layers.NORMAL);
trafficLayers.push(longdo.Layers.TRAFFIC);
}
trafficLayers = trafficLayers.filter(Boolean);
var trafficMap = new longdo.Map({
placeholder: holder,
language: 'th',
location: { lon: point.lng, lat: point.lat },
zoom: 14,
lastView: false,
layer: trafficLayers.length ? trafficLayers : undefined
});
window._longdoTrafficMap = trafficMap;
try {
trafficMap.Overlays.add(new longdo.Marker({ lon: point.lng, lat: point.lat }, {
title: 'จุดเกิดเหตุ',
detail: 'ตำแหน่งเหตุการณ์ปัจจุบัน'
}));
} catch(e) {}
try {
if (longdo.Overlays && longdo.Overlays.events) trafficMap.Overlays.load(longdo.Overlays.events);
if (longdo.Overlays && longdo.Overlays.cameras) trafficMap.Overlays.load(longdo.Overlays.cameras);
} catch(e) {}
}, 120);
},
willClose: function() {
window._longdoTrafficMap = null;
}
});
}
async function initDashMap(coords) {
if (!coords || !coords.includes(',')) return;
const [lat, lng] = coords.split(',').map(c => parseFloat(c.trim()));
const pos = { lon: lng, lat: lat };
incidentCenter.lat = lat;
incidentCenter.lng = lng;
let now = Date.now();
if (coords !== lastWeatherCoords || now - lastWeatherTime > 10 * 60 * 1000) {
updateWeather(lat, lng);
lastWeatherCoords = coords;
lastWeatherTime = now;
}
if (!dashMap) {
if (typeof maptilersdk === 'undefined') {
return;
}
maptilersdk.config.apiKey = MAPTILER_API_KEY;
window._dashboardMapStyle = 'satellite';
var initialDashStyle = maptilersdk.MapStyle.SATELLITE || 'https://api.maptiler.com/maps/satellite/style.json?key=' + encodeURIComponent(MAPTILER_API_KEY);
var mapObj = new maptilersdk.Map({
container: 'dash_map_canvas',
style: initialDashStyle,
center: [lng, lat],
zoom: 16,
language: 'th'
});
mapObj.addControl(new maptilersdk.NavigationControl(), 'top-right');
dashMap = makeDashboardMapAdapter(mapObj);
mapObj.on('load', function() {
if (dashMap && dashMap.resize) dashMap.resize();
updateDashboardMarkerScale();
if (incidentCenter.lat && incidentCenter.lng) {
mapObj.flyTo({ center: [incidentCenter.lng, incidentCenter.lat], zoom: 16, duration: 1000 });
}
});
mapObj.on('zoom', updateDashboardMarkerScale);
mapObj.on('zoomend', updateDashboardMarkerScale);
mapObj.on('zoomend', ensureDashboardMarkerSeparationZoom);
mapObj.on('moveend', ensureDashboardMarkerSeparationZoom);
mapObj.on('dragstart', function() { window._userInteractingMap = true; });
mapObj.on('zoomstart', function(e) { if (e.originalEvent) window._userInteractingMap = true; });
mapObj.on('dragend', function() { setTimeout(function(){ window._userInteractingMap = false; }, 3000); });
mapObj.on('zoomend', function(e) { if (e.originalEvent) setTimeout(function(){ window._userInteractingMap = false; }, 3000); });
updateDashboardMarkerScale();
}
removeLongdoOverlay(dashMap, dashMarker);
dashMarker = null;
dashMarker = makeLongdoHtmlMarker(pos, buildDashboardIncidentMarkerHtml(), {
offset: { x: 0, y: 0 },
weight: (typeof longdo !== 'undefined' && longdo.OverlayWeight) ? longdo.OverlayWeight.Top : 0,
title: 'จุดเกิดเหตุ',
scaleMode: 'none'
});
dashMap.Overlays.add(dashMarker);
renderDashboardEOCMarker(window._lastEmergState && window._lastEmergState.evtEOCCoords);
if (!window._userInteractingMap) { dashMap.location(pos, true); }
setTimeout(ensureDashboardMarkerSeparationZoom, 350);
if (window._lastEmergState && window._lastEmergState.wind && window._lastEmergState.wind.directionDeg != null) {
drawWindArrowOnDashMap(window._lastEmergState.wind.directionDeg, window._lastEmergState.wind.speed || 0);
}
setTimeout(refreshDashboardERGZone, 350);
setTimeout(function() {
if (typeof refreshICOCFeedsDirect === 'function') refreshICOCFeedsDirect();
}, 600);
}
async function changeRadius() {
var val = document.getElementById('zone_radius_select').value;
if (!dashMap || incidentCenter.lat === 0) return;
var lat = incidentCenter.lat;
var lng = incidentCenter.lng;
if (val === "0") {
removeLongdoOverlay(dashMap, dynamicOverlay);
removeLongdoOverlay(dashMap, dynamicLabelMarker);
dynamicOverlay = null;
dynamicLabelMarker = null;
dashMap.zoom(17);
dashMap.location({ lon: lng, lat: lat }, true);
return;
}
var r = parseInt(val);
removeLongdoOverlay(dashMap, dynamicOverlay);
dynamicOverlay = makeMapTilerCircleOverlay({ lon: lng, lat: lat }, r, {
lineWidth: 2,
lineColor: '#3498db',
fillColor: 'rgba(52, 152, 219, 0.10)',
label: false
});
dashMap.Overlays.add(dynamicOverlay);
var dLng = r / (111320 * Math.cos(lat * Math.PI / 180));
var edgePos = { lon: lng + dLng, lat: lat };
var labelText = r >= 1000 ? (r / 1000) + " กม." : r + " เมตร";
removeLongdoOverlay(dashMap, dynamicLabelMarker);
dynamicLabelMarker = makeLongdoHtmlMarker(edgePos,
'<div style="background:rgba(255,255,255,0.9);color:#3498db;font-weight:bold;font-size:12px;padding:4px 8px;border-radius:12px;border:2px solid #3498db;box-shadow:0 2px 4px rgba(0,0,0,0.3);white-space:nowrap;">' + labelText + '</div>',
{ offset: { x: 0, y: 0 }, weight: (typeof longdo !== 'undefined' && longdo.OverlayWeight) ? longdo.OverlayWeight.Top : 0, scaleMode: 'label' }
);
dashMap.Overlays.add(dynamicLabelMarker);
fitLongdoMeters(dashMap, lat, lng, r);
setTimeout(ensureDashboardMarkerSeparationZoom, 420);
}
function clickEscalate() {
if (APP_ACCESS_ROLE !== 'admin') {
Swal.fire('ต้องใช้สิทธิ์ Admin', 'ผู้ดูอย่างเดียวไม่สามารถแก้ไขแผนได้', 'warning');
return;
}
var currentPlan = document.getElementById('dash_ban_status').innerText || '';
var isPrep = currentPlan.includes('เตรียมรองรับ');
if (isPrep) {
Swal.fire({
title: '⚠️ เปลี่ยนแผนปฏิบัติการ',
input: 'select',
inputOptions: {
'เตรียมรองรับสถานการณ์': 'เตรียมรองรับสถานการณ์ (ไม่มีระดับ)',
'แผนป้องกันและบรรเทาสาธารณภัย': 'แผนป้องกันและบรรเทาสาธารณภัย',
'แผนอัคคีภัย': 'แผนอัคคีภัย',
'แผนรับอุบัติภัยหมู่ (RESCUE-C)': 'แผนรับอุบัติภัยหมู่ (RESCUE-C)',
'แผนพิทักษ์ระยอง': 'แผนพิทักษ์ระยอง',
},
showCancelButton: true,
confirmButtonColor: '#e67e22',
confirmButtonText: 'ถัดไป →'
}).then((r1) => {
if (!r1.isConfirmed) return;
var selectedPlan = r1.value;
if (selectedPlan === 'เตรียมรองรับสถานการณ์') {
google.script.run.withSuccessHandler(() => { fetchData(); })
.withFailureHandler(function(err) { Swal.fire('อัปเดตไม่สำเร็จ', err && err.message ? err.message : String(err), 'error'); })
.updateIncidentLevel(selectedPlan, APP_ACCESS_ROLE, APP_AGENCY_ID || '');
return;
}
var levelOptions = {};
if (selectedPlan === 'แผนป้องกันและบรรเทาสาธารณภัย') {
levelOptions = { '1':'ระดับ 1', '2':'ระดับ 2', '3':'ระดับ 3' };
} else if (selectedPlan === 'แผนอัคคีภัย') {
levelOptions = { '1':'ระดับ 1', '2':'ระดับ 2' };
} else if (selectedPlan === 'แผนรับอุบัติภัยหมู่ (RESCUE-C)') {
levelOptions = { '1':'ระดับ 1', '2':'ระดับ 2', '3':'ระดับ 3' };
} else if (selectedPlan === 'แผนพิทักษ์ระยอง') {
levelOptions = { '1':'ระดับ 1', '2':'ระดับ 2', '3':'ระดับ 3', '4':'ระดับ 4' };
}
Swal.fire({
title: selectedPlan,
text: 'เลือกระดับ',
input: 'select',
inputOptions: levelOptions,
showCancelButton: true,
confirmButtonColor: '#e67e22',
confirmButtonText: 'ยืนยัน'
}).then((r2) => {
if (!r2.isConfirmed) return;
var fullPlan = selectedPlan + ' (ระดับ ' + r2.value + ')';
Swal.fire({title:'กำลังอัปเดต...', didOpen:()=>Swal.showLoading()});
google.script.run.withSuccessHandler(() => {
Swal.close(); fetchData();
}).withFailureHandler(function(err) {
Swal.close();
Swal.fire('อัปเดตไม่สำเร็จ', err && err.message ? err.message : String(err), 'error');
}).updateIncidentLevel(fullPlan, APP_ACCESS_ROLE, APP_AGENCY_ID || '');
});
});
} else {
var levelMax = currentPlan.includes('พิทักษ์ระยอง') ? 4 :
currentPlan.includes('อัคคีภัย') ? 2 : 3;
var levelOptions = {};
for (var i = 1; i <= levelMax; i++) { levelOptions[i] = 'ระดับ ' + i; }
Swal.fire({
title: '⚠️ ยกระดับความรุนแรง',
text: currentPlan.replace(/\s*\(ระดับ.*?\)/, ''),
input: 'select',
inputOptions: levelOptions,
showCancelButton: true,
confirmButtonColor: '#e67e22',
confirmButtonText: 'ยืนยัน'
}).then((result) => {
if (!result.isConfirmed) return;
var basePlan = currentPlan.replace(/\s*\(ระดับ.*?\)/, '').trim();
var fullPlan = basePlan + ' (ระดับ ' + result.value + ')';
Swal.fire({title:'กำลังอัปเดต...', didOpen:()=>Swal.showLoading()});
google.script.run.withSuccessHandler(() => {
Swal.close(); fetchData();
}).withFailureHandler(function(err) {
Swal.close();
Swal.fire('อัปเดตไม่สำเร็จ', err && err.message ? err.message : String(err), 'error');
}).updateIncidentLevel(fullPlan, APP_ACCESS_ROLE, APP_AGENCY_ID || '');
});
}
}
function handleCheckIn() {
if (typeof requireFeature === 'function' && !requireFeature('live_location', 'รายงานตำแหน่งสด (ระดับ 2+)')) return;
Swal.fire({
title: '📍 ระบุจุดปฏิบัติการ',
html: `
<div style="text-align:left;font-size:0.9rem;margin-bottom:5px;">ชื่อผู้รายงาน / ทีม</div>
<input id="checkin_name" class="swal2-input" value="${USER_NAME}" placeholder="ระบุชื่อ...">
<div style="text-align:left;font-size:0.9rem;margin-top:15px;margin-bottom:5px;">ประเภทจุด</div>
<select id="checkin_type" class="swal2-input" style="width:100%;margin-top:0;">
<option value="Staff">👤 ตำแหน่งตัวฉัน (ไม่ต้องตีวง 20m)</option>
<option value="CP">🚩 กองอำนวยการ (พื้นที่ 20m)</option>
<option value="Treatment">🏥 จุดปฐมพยาบาล (พื้นที่ 20m)</option>
<option value="Staging">🚛 จุดพักคอย (พื้นที่ 20m)</option>
</select>
`,
showCancelButton: true,
showDenyButton: true,
confirmButtonText: '<i class="fas fa-location-arrow"></i> ใช้ GPS ปัจจุบัน',
denyButtonText: '<i class="fas fa-map"></i> จิ้มบนแผนที่',
cancelButtonText: 'ยกเลิก',
confirmButtonColor: '#2ecc71',
denyButtonColor: '#3498db',
preConfirm: () => {
return {
name: document.getElementById('checkin_name').value,
type: document.getElementById('checkin_type').value
}
}
}).then((result) => {
if (!result.isConfirmed && !result.isDenied) return;
const data = document.getElementById('checkin_name').value ?
{name: document.getElementById('checkin_name').value, type: document.getElementById('checkin_type').value} : null;
if(!data || !data.name) return Swal.fire('Error', 'กรุณาระบุชื่อ', 'error');
if (result.isConfirmed) {
Swal.fire({title: 'กำลังดึงพิกัด GPS...', didOpen: () => Swal.showLoading()});
navigator.geolocation.getCurrentPosition((pos) => {
google.script.run.withSuccessHandler((msg) => { Swal.fire('สำเร็จ', msg, 'success'); fetchData(); })
.checkInLocation(data.name, TEMP_ROLE, data.type, pos.coords.latitude, pos.coords.longitude);
}, () => { Swal.fire('Error', 'ไม่สามารถดึงพิกัด GPS ได้', 'error'); });
} else if (result.isDenied) {
isCheckInMode = true;
checkInTempData = data;
document.getElementById('selectedCoordText').innerText = `พิกัด: ยังไม่ได้เลือก (กำลังตั้งจุด ${data.type})`;
openMap();
}
});
}
async function updateLiveMarkers() {
if (!dashMap) return;
google.script.run.withSuccessHandler(function(locs) {
if (!locs) locs = [];
if (!locs.length && window._dashboardLiveMarkerRecords && Object.keys(window._dashboardLiveMarkerRecords).length) {
window._dashboardLiveEmptyCount = (window._dashboardLiveEmptyCount || 0) + 1;
if (window._dashboardLiveEmptyCount < 3) return;
} else {
window._dashboardLiveEmptyCount = 0;
}
var liveRecords = window._dashboardLiveMarkerRecords || {};
var nextRecords = {};
var nextMarkers = [];
var nextCircles = [];
locs.forEach(l => {
let iconClass = "", bgClass = "", hexColor = "";
let labelText = l.type;
var lat = parseFloat(l.lat);
var lng = parseFloat(l.lng);
if (isNaN(lat) || isNaN(lng)) return;
switch(l.type) {
case 'CP':
iconClass = "fa-landmark"; bgClass = "mk-cp"; hexColor = "#2c3e50"; labelText = "กองอำนวยการ"; break;
case 'Treatment':
iconClass = "fa-hand-holding-medical"; bgClass = "mk-treat"; hexColor = "#e74c3c"; labelText = "จุดปฐมพยาบาล"; break;
case 'Staging':
iconClass = "fa-truck-ramp-box"; bgClass = "mk-stage"; hexColor = "#f39c12"; labelText = "จุดพักคอย"; break;
default:
iconClass = "fa-user"; bgClass = "mk-staff"; hexColor = "#3498db";
}
var markerKey = [
l.type || 'Staff',
l.name || '',
l.role || '',
l.phone || '',
l.tel || ''
].join('|');
var markerSignature = [
markerKey,
lat.toFixed(6),
lng.toFixed(6),
labelText
].join('|');
var existing = liveRecords[markerKey];
if (existing && existing.signature === markerSignature) {
nextRecords[markerKey] = existing;
if (existing.marker) nextMarkers.push(existing.marker);
if (existing.circle) nextCircles.push(existing.circle);
return;
}
if (existing) {
removeLongdoOverlay(dashMap, existing.marker);
removeLongdoOverlay(dashMap, existing.circle);
}
var markerHtml = '';
var circle = null;
if (l.type === 'Staff') {
markerHtml = buildDashboardPointMarkerHtml(
`<div class="c-marker-icon ${bgClass} dash-live-marker"><i class="fas ${iconClass}"></i></div>`,
'',
{ iconSize: 30, scale: true }
);
} else {
markerHtml = buildDashboardPointMarkerHtml(
`<div class="c-marker-icon ${bgClass} dash-live-marker"><i class="fas ${iconClass}"></i></div>`,
`<div class="c-marker-label" style="margin-top:0;">${labelText}</div>`,
{ iconSize: 40, scale: true }
);
circle = makeMapTilerCircleOverlay({ lon: lng, lat: lat }, 20, {
lineColor: hexColor,
lineWidth: 1,
fillColor: hexToRgbaColor(hexColor, 0.2)
});
dashMap.Overlays.add(circle);
nextCircles.push(circle);
}
const marker = makeLongdoHtmlMarker({ lon: lng, lat: lat }, markerHtml, {
offset: { x: 0, y: 0 },
weight: (l.type === 'Staff') ? 50 : 80,
title: l.name || labelText,
scaleMode: 'none',
markerOptions: {
detail: (l.type === 'Staff')
? `<b>${l.name || '-'}</b><br><span style="font-size:0.8rem;color:#777;">${l.role || '-'}</span>`
: labelText
}
});
dashMap.Overlays.add(marker);
nextMarkers.push(marker);
nextRecords[markerKey] = { marker: marker, circle: circle, signature: markerSignature };
});
Object.keys(liveRecords).forEach(function(key) {
if (nextRecords[key]) return;
removeLongdoOverlay(dashMap, liveRecords[key].marker);
removeLongdoOverlay(dashMap, liveRecords[key].circle);
});
window._dashboardLiveMarkerRecords = nextRecords;
otherMarkers = nextMarkers;
zoneCircles = nextCircles;
google.script.run.withSuccessHandler(function(zones) {
drawOCZoneMarkersOnICMap(zones || [], window._icSupportReqs || []);
drawOCSupportRequestAlertsOnMap(zones || [], window._icSupportReqs || []);
}).getZoneMarkers();
}).getAllLiveLocations();
}
function normalizeThaiPhone(phone) {
var value = String(phone || '').trim().replace(/^'/, '').replace(/[^\d+]/g, '');
if (/^\d{9}$/.test(value)) return '0' + value;
return value;
}
function findPhoneForStaffName(name) {
var target = String(name || '').trim();
if (!target || !window._attendanceData) return '';
for (var i = window._attendanceData.length - 1; i >= 0; i--) {
if (String(window._attendanceData[i].name || '').trim() === target) {
return normalizeThaiPhone(window._attendanceData[i].phone || '');
}
}
return '';
}
function ackOCSupportRequest() {
google.script.run.withSuccessHandler(function() {
Swal.fire({ icon:'success', title:'รับทราบแล้ว', timer:1200, showConfirmButton:false });
fetchData();
}).addCommanderLog('✅ IC รับทราบคำขอสนับสนุนจาก OC/ICP', USER_NAME || 'IC');
}
function setupUserUI() {
const checkInBtn = document.getElementById('btn_checkin');
const endBtn = document.getElementById('dash_end_btn');
const escalateBtn = document.getElementById('dash_escalate_btn');
const isAdmin = APP_ACCESS_ROLE === 'admin';
if (endBtn) endBtn.style.display = isAdmin ? 'inline-block' : 'none';
if (escalateBtn) escalateBtn.style.display = isAdmin ? 'inline-block' : 'none';
if (!checkInBtn) return;
if (TEMP_ROLE === 'IC') {
checkInBtn.style.display = 'none';
} else {
checkInBtn.style.display = 'inline-block';
}
}
var lastWeatherCoords = "";
var lastWeatherTime = 0;
async function updateWeather(lat, lng) {
if (!lat || !lng) return;
var stateWind = (window._lastEmergState && window._lastEmergState.wind) ? window._lastEmergState.wind : null;
if (stateWind && stateWind.directionDeg !== null && stateWind.directionDeg !== '' && !isNaN(Number(stateWind.directionDeg))) {
var windSpeed = Number(stateWind.speedMs || stateWind.speed || stateWind.SpeedMs) || 0;
applyWindDisplay(Number(stateWind.directionDeg), windSpeed, stateWind.source || 'OC', stateWind.updatedBy || stateWind.UpdatedBy || '');
return;
}
try {
const url = 'https://api.open-meteo.com/v1/forecast?latitude=' + lat + '&longitude=' + lng + '&current=wind_speed_10m,wind_direction_10m&wind_speed_unit=ms';
const response = await fetch(url);
const data = await response.json();
if (data && data.current) {
const speed = data.current.wind_speed_10m.toFixed(1);
const meteoDeg = data.current.wind_direction_10m;
const destDeg = (meteoDeg + 180) % 360;
const directions = ['เหนือ', 'ตะวันออกเฉียงเหนือ', 'ตะวันออก', 'ตะวันออกเฉียงใต้', 'ใต้', 'ตะวันตกเฉียงใต้', 'ตะวันตก', 'ตะวันตกเฉียงเหนือ'];
const dirIndex = Math.round(destDeg / 45) % 8;
const dirName = directions[dirIndex];
applyWindDisplay(destDeg, speed, 'auto', '');
}
} catch (error) {
applyWindWaitingDisplay();
}
}
var eocStartTime = null;
function getEmergencyStartMs() {
var state = window._lastEmergState || {};
var raw = state.timestamp || state.StartTime || state.startTime || '';
var dt = raw ? new Date(raw) : null;
if (dt && !isNaN(dt.getTime())) return dt.getTime();
if (eocStartTime && !isNaN(eocStartTime.getTime())) return eocStartTime.getTime();
return 0;
}
function updateRoleTimerElement(elId) {
var el = document.getElementById(elId);
if (!el) return;
var startMs = getEmergencyStartMs();
if (!startMs) { el.textContent = '00:00:00'; return; }
var diff = Math.max(0, Math.floor((Date.now() - startMs) / 1000));
var h = Math.floor(diff / 3600), m = Math.floor((diff % 3600) / 60), s = diff % 60;
el.textContent = String(h).padStart(2,'0') + ':' + String(m).padStart(2,'0') + ':' + String(s).padStart(2,'0');
}
function runEocTimer() {
var now = new Date();
document.getElementById('clock_now').innerText = now.toLocaleTimeString('th-TH', { hour12: false });
if (eocStartTime) {
var diff = now.getTime() - eocStartTime.getTime();
var h = Math.floor(diff / (1000 * 60 * 60));
var m = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
var s = Math.floor((diff % (1000 * 60)) / 1000);
h = (h < 10) ? "0" + h : h;
m = (m < 10) ? "0" + m : m;
s = (s < 10) ? "0" + s : s;
document.getElementById('eoc_timer').innerText = h + ":" + m + ":" + s;
}
}
autoDetectTime();
setInterval(runEocTimer, 1000);
function switchTab(tabId, btn) {
// 🔒 กันคลิกเข้า tab ที่ tier ปัจจุบันยังไม่ปลดล็อค (ribbon ทำได้แค่แสดงผล ไม่ได้กันคลิก)
if (tabId === 'tab_sitrep' && typeof requireFeature === 'function' && !requireFeature('sitrep', 'SITREP (ระดับ 2+)')) return;
if (tabId === 'tab_erg' && typeof requireFeature === 'function' && !requireFeature('erg', 'สารเคมี / ERG (ระดับ 2+)')) return;
document.querySelectorAll('.eoc-tab-content').forEach(t => t.classList.remove('active'));
document.querySelectorAll('.eoc-tab').forEach(b => b.classList.remove('active'));
document.getElementById(tabId).classList.add('active');
btn.classList.add('active');
if (tabId === 'tab_resource') loadResources();
if (tabId === 'tab_erg') autoDetectTime();
if (tabId === 'tab_start') startReset();
}
var _ergSuggestions = [];
var _ergSearchResults = [];
function ergSafeHtml(v) {
return String(v == null ? '' : v)
.replace(/&/g, '&amp;')
.replace(/</g, '&lt;')
.replace(/>/g, '&gt;')
.replace(/"/g, '&quot;')
.replace(/'/g, '&#39;');
}
function ergSelectResult(un) {
var input = document.getElementById('erg_query');
if (input) input.value = String(un || '');
ergLookup();
}
function renderERGSearchResults(q, results) {
const box = document.getElementById('erg_result_box');
const txt = document.getElementById('erg_result_text');
_ergSearchResults = results || [];
const shown = _ergSearchResults.slice(0, 60);
const qLabel = ergSafeHtml(q);
const rows = shown.map(function(r) {
const guide = r.guide_num ? 'ERG #' + r.guide_num : 'ERG -';
const iso = r.sm_iso ? 'กั้นแยก ' + r.sm_iso + ' m' : 'ไม่มีค่า isolation';
return '<button type="button" onclick="ergSelectResult(' + Number(r.mtl_id || 0) + ')" style="width:100%;text-align:left;background:#111827;color:white;border:1px solid #334155;border-radius:8px;padding:9px 10px;margin:5px 0;cursor:pointer;font-family:&quot;Prompt&quot;,sans-serif;">' +
'<div style="display:flex;gap:8px;align-items:flex-start;justify-content:space-between;">' +
'<div style="min-width:0;"><b style="color:#facc15;">UN ' + ergSafeHtml(r.mtl_id) + '</b> <span style="font-weight:900;">' + ergSafeHtml(r.name) + '</span>' +
'<div style="font-size:11px;color:#94a3b8;margin-top:2px;">' + ergSafeHtml(guide) + ' | ' + ergSafeHtml(iso) + '</div></div>' +
'<span style="font-size:11px;color:#bfdbfe;white-space:nowrap;">เลือก</span>' +
'</div>' +
'</button>';
}).join('');
txt.innerHTML =
'<div style="color:#facc15;font-size:0.9rem;font-weight:900;margin-bottom:6px;">พบ ' + _ergSearchResults.length + ' รายการที่มีคำว่า "' + qLabel + '"</div>' +
'<div style="color:#cbd5e1;font-size:0.75rem;margin-bottom:8px;">กรุณาเลือกสารให้ตรงก่อน ระบบจะยังไม่วาด ERG zone จนกว่าจะเลือกสาร</div>' +
rows +
(_ergSearchResults.length > shown.length ? '<div style="color:#94a3b8;font-size:11px;margin-top:8px;">แสดง 60 รายการแรก ลองพิมพ์ชื่อให้เจาะจงขึ้นถ้ายังไม่พบ</div>' : '');
box.style.display = 'block';
}
function ergLookup() {
if (typeof requireFeature === 'function' && !requireFeature('erg', 'ERG ค้นหาสารเคมี (ระดับ 2+)')) return;
const q = document.getElementById('erg_query').value.trim();
if (!q) return;
const box = document.getElementById('erg_result_box');
const txt = document.getElementById('erg_result_text');
const qNum = parseInt(q, 10);
const qUp = q.toUpperCase();
let results = [];
if (!isNaN(qNum)) {
results = ERG_DATABASE.filter(r => r.mtl_id === qNum);
}
if (results.length === 0) {
results = ERG_DATABASE.filter(r => r.name.toUpperCase().includes(qUp));
results.sort(function(a, b) {
const an = String(a.name || '').toUpperCase();
const bn = String(b.name || '').toUpperCase();
const ar = an === qUp ? 0 : an.startsWith(qUp + 'INE') ? 1 : an.startsWith(qUp) ? 2 : an.split(/[^A-Z0-9]+/).some(function(part){ return part.startsWith(qUp); }) ? 3 : 4;
const br = bn === qUp ? 0 : bn.startsWith(qUp + 'INE') ? 1 : bn.startsWith(qUp) ? 2 : bn.split(/[^A-Z0-9]+/).some(function(part){ return part.startsWith(qUp); }) ? 3 : 4;
if (ar !== br) return ar - br;
return an.localeCompare(bn);
});
}
if (results.length === 0) {
txt.innerHTML = `<span style="color:#f1c40f;">⚠️ ไม่พบ "<b>${q}</b>" ในฐานข้อมูล ERG (2,923 รายการ)<br>
<small style="color:#aaa;">ลองพิมพ์ UN number เช่น 1017, 1053 หรือชื่อสาร เช่น Chlorine, Ammonia</small></span>`;
box.style.display = 'block';
return;
}
if (isNaN(qNum) && results.length > 1) {
renderERGSearchResults(q, results);
return;
}
const found = results[0];
const un = found.mtl_id;
const isoM = found.lg_iso || found.sm_iso || 30;
const dayProtM = found.lg_dy || found.sm_dy || null;
const nightProtM = found.lg_nte || found.sm_nte || null;
const g = found.guide_num;
const isToxic = (g >= 151 && g <= 175);
const isFlam = (g >= 115 && g <= 132) || (g >= 135 && g <= 139);
const isReact = (g >= 135 && g <= 148);
const hazTags = [
isFlam ? `<span class="erg-tag fire">🔥 ไวไฟ/ระเบิด</span>` : '',
isToxic ? `<span class="erg-tag health">☠️ พิษ (TIH)</span>` : '',
isReact ? `<span class="erg-tag react">⚡ ทำปฏิกิริยา</span>` : '',
].filter(Boolean).join('') || `<span style="color:#aaa;font-size:0.72rem;">ดูรายละเอียดใน ERG Guide #${g}</span>`;
const protHTML = dayProtM
? `<div style="color:#aaa;font-size:0.72rem;margin-top:2px;">
📡 เขตเฝ้าระวัง/อพยพตามลม:
☀️ small: <b style="color:#eee;">${found.sm_dy||'—'}</b> / 🌙 <b style="color:#eee;">${found.sm_nte||'—'}</b> m &nbsp;|&nbsp;
☀️ large: <b style="color:#2ecc71;">${found.lg_dy||'—'}</b> / 🌙 <b style="color:#2ecc71;">${found.lg_nte||'—'}</b> m
<br><span style="color:#666;">เลือก scenario ด้านล่างแล้ววาดบนแผนที่</span>
</div>`
: `<div style="color:#aaa;font-size:0.72rem;">⚠️ ไม่มีข้อมูล TIH protective action</div>`;
const moreHTML = results.length > 1
? `<div style="color:#f1c40f;font-size:0.7rem;margin-top:6px;">🔍 พบ ${results.length} รายการ — แสดงรายการแรก (UN ${results[0].mtl_id})<br>
<span style="color:#aaa;">อื่นๆ: ${results.slice(1,4).map(r => `UN ${r.mtl_id} ${r.name}`).join(', ')}${results.length > 4 ? '...' : ''}</span></div>`
: '';
txt.innerHTML = `
<div style="color:#f1c40f;font-size:1rem;font-weight:bold;">UN ${un} — ${found.name}</div>
<div style="margin:4px 0;">${hazTags}</div>
<div style="color:#aaa;font-size:0.7rem;">ERG Guide: <b style="color:white;">#${g}</b></div>
<hr style="border-color:#444;margin:6px 0;">
<div>🚧 <span class="erg-iso">เขตกั้นแยก (รั่วไหลน้อย): ${found.sm_iso || '-'} m</span>
${found.lg_iso ? `&nbsp;|&nbsp; <span class="erg-iso">เขตกั้นแยก (รั่วไหลมาก): ${found.lg_iso} m</span>` : ''}</div>
${protHTML}
${moreHTML}
`;
_ergCurrent = {
name: found.name || '',
un: un || '',
sm_iso: found.sm_iso || 0,
lg_iso: found.lg_iso || 0,
fire_iso: found.fire_iso || 0,
sm_dy: found.sm_dy || null,
sm_nte: found.sm_nte || null,
lg_dy: found.lg_dy || null,
lg_nte: found.lg_nte || null,
};
updateZonePreview();
if (typeof google !== 'undefined' && google.script && google.script.run) {
google.script.run.saveERGSelection({
name: found.name || '',
un: un || '',
isoM: found.sm_iso || 0,
dayM: found.sm_dy || found.lg_dy || 0,
nightM: found.sm_nte || found.lg_nte || 0
});
}
var hdrErg = document.getElementById('header_erg_name');
if (hdrErg && found) hdrErg.innerText = 'UN ' + un + ' ' + found.name.split(' ')[0];
box.style.display = 'block';
}
function getErgRecordBySavedState(erg) {
erg = erg || {};
if (typeof ERG_DATABASE === 'undefined' || !Array.isArray(ERG_DATABASE) || !ERG_DATABASE.length) return null;
var unNum = parseInt(erg.un, 10);
if (!isNaN(unNum)) {
var byUn = ERG_DATABASE.find(function(r) { return parseInt(r.mtl_id, 10) === unNum; });
if (byUn) return byUn;
}
var name = String(erg.name || '').trim().toUpperCase();
if (!name) return null;
return ERG_DATABASE.find(function(r) { return String(r.name || '').trim().toUpperCase() === name; }) || null;
}
function buildFallbackErgRecord(erg) {
erg = erg || {};
var isoM = Number(erg.isoM || erg.sm_iso || erg.isolation_m || 0) || 0;
var dayM = Number(erg.dayM || erg.day_prot_m || erg.sm_dy || 0) || 0;
var nightM = Number(erg.nightM || erg.night_prot_m || erg.sm_nte || 0) || 0;
if (!String(erg.name || '').trim() && !String(erg.un || '').trim() && !isoM && !dayM && !nightM) return null;
return {
mtl_id: String(erg.un || '').trim(),
name: String(erg.name || '').trim() || 'Unknown',
guide_num: '',
sm_iso: isoM,
lg_iso: isoM,
fire_iso: 0,
sm_dy: dayM,
lg_dy: dayM,
sm_nte: nightM,
lg_nte: nightM
};
}
function renderSavedERGSelectionFromState(erg) {
erg = erg || window._lastERGState || {};
var found = getErgRecordBySavedState(erg) || buildFallbackErgRecord(erg);
var hdrErg = document.getElementById('header_erg_name');
var box = document.getElementById('erg_result_box');
var txt = document.getElementById('erg_result_text');
var input = document.getElementById('erg_query');
if (!found) {
if (hdrErg) hdrErg.innerText = '— ยังไม่ค้น —';
return;
}
var un = found.mtl_id || erg.un || '';
var name = found.name || erg.name || '';
var isoM = Number(found.sm_iso || erg.isoM || erg.sm_iso || 0) || 0;
var dayM = Number(found.sm_dy || found.lg_dy || erg.dayM || erg.day_prot_m || 0) || 0;
var nightM = Number(found.sm_nte || found.lg_nte || erg.nightM || erg.night_prot_m || 0) || 0;
var guide = found.guide_num ? ('#' + found.guide_num) : '—';
_ergCurrent = {
name: name,
un: un,
sm_iso: isoM,
lg_iso: Number(found.lg_iso || isoM) || isoM,
fire_iso: Number(found.fire_iso || 0) || 0,
sm_dy: dayM || null,
sm_nte: nightM || null,
lg_dy: Number(found.lg_dy || dayM) || dayM || null,
lg_nte: Number(found.lg_nte || nightM) || nightM || null
};
if (input && !input.value) input.value = String(un || name || '');
if (hdrErg) hdrErg.innerText = ('UN ' + (un || '?') + ' ' + String(name).split(' ')[0]).trim();
if (txt) {
txt.innerHTML =
'<div style="color:#f1c40f;font-size:1rem;font-weight:bold;">UN ' + ergSafeHtml(un || '?') + ' — ' + ergSafeHtml(name || '-') + '</div>' +
'<div style="margin:4px 0;color:#aaa;font-size:0.7rem;">ERG Guide: <b style="color:white;">' + ergSafeHtml(guide) + '</b></div>' +
'<hr style="border-color:#444;margin:6px 0;">' +
'<div>🚧 <span class="erg-iso">เขตกั้นแยก: ' + ergSafeHtml(isoM || '-') + ' m</span></div>' +
((dayM || nightM) ? (
'<div style="color:#aaa;font-size:0.72rem;margin-top:4px;">📡 เขตเฝ้าระวัง/อพยพตามลม: ' +
'☀️ <b style="color:#eee;">' + ergSafeHtml(dayM || '—') + '</b> / 🌙 <b style="color:#eee;">' + ergSafeHtml(nightM || '—') + '</b> m</div>'
) : '<div style="color:#aaa;font-size:0.72rem;margin-top:4px;">⚠️ ไม่มีข้อมูล TIH protective action</div>');
}
if (box) box.style.display = 'block';
updateZonePreview();
}
var hazmatZoneOverlays = [];
var hazmatZoneLabels = [];
function metersBetweenLatLng(aLat, aLng, bLat, bLng) {
var meanLat = ((Number(aLat) || 0) + (Number(bLat) || 0)) / 2 * Math.PI / 180;
var dx = ((Number(aLng) || 0) - (Number(bLng) || 0)) * 111320 * Math.cos(meanLat);
var dy = ((Number(aLat) || 0) - (Number(bLat) || 0)) * 111320;
return Math.sqrt(dx * dx + dy * dy);
}
function smartCircleLabelPoint(lat, lng, radiusM, labelIndex) {
var avoid = [];
if (window._icZoneMarkers && window._icZoneMarkers.length) {
window._icZoneMarkers.forEach(function(z) {
var zLat = parseFloat(z.lat || z.Lat);
var zLng = parseFloat(z.lng || z.Lng);
if (!isNaN(zLat) && !isNaN(zLng)) avoid.push({ lat: zLat, lng: zLng });
});
}
var candidates = labelIndex % 2 === 0 ? [35, 315, 80, 280, 140, 220, 0, 180] : [80, 280, 35, 315, 140, 220, 0, 180];
var best = null;
candidates.forEach(function(deg) {
var rad = deg * Math.PI / 180;
var dLat = Math.sin(rad) * radiusM / 111320;
var dLng = Math.cos(rad) * radiusM / (111320 * Math.cos(lat * Math.PI / 180));
var p = { lat: lat + dLat, lng: lng + dLng };
var score = avoid.length ? Math.min.apply(null, avoid.map(function(a) { return metersBetweenLatLng(p.lat, p.lng, a.lat, a.lng); })) : 9999;
if (deg === 0) score -= 80;
if (!best || score > best.score) best = { point: p, score: score };
});
return best ? best.point : { lat: lat, lng: lng };
}
var _ergCurrent = {};
var _spillSize = 'sm';
var _timeOfDay = 'dy';
var _withFire = false;
function selectSpill(v) {
_spillSize = v;
document.getElementById('spill_sm').style.opacity = v === 'sm' ? '1' : '0.45';
document.getElementById('spill_lg').style.opacity = v === 'lg' ? '1' : '0.45';
updateZonePreview();
}
function autoDetectTime() {
const h = new Date().getHours();
const isDaytime = h >= 6 && h < 18;
_timeOfDay = isDaytime ? 'dy' : 'nte';
const label = isDaytime ? 'กลางวัน (06:00–17:59)' : 'กลางคืน (18:00–05:59)';
const icon = isDaytime ? '☀️' : '🌙';
const el = document.getElementById('time_auto_label');
const ic = document.getElementById('time_auto_icon');
if (el) el.innerText = label;
if (ic) ic.innerText = ' ' + icon;
}
function selectTime(v) { }
function selectFire(v) {
_withFire = v;
document.getElementById('fire_no').style.opacity = !v ? '1' : '0.45';
document.getElementById('fire_yes').style.opacity = v ? '1' : '0.45';
updateZonePreview();
}
function updateZonePreview() {
autoDetectTime();
const prev = document.getElementById('zone_radius_preview');
if (!_ergCurrent || !_ergCurrent.sm_iso) { prev.style.display = 'none'; return; }
const isoM = _withFire
? (_ergCurrent.fire_iso || 800)
: (_spillSize === 'lg' ? _ergCurrent.lg_iso : _ergCurrent.sm_iso) || 0;
const protKey = _spillSize + '_' + _timeOfDay;
const protM = _ergCurrent[protKey] || null;
document.getElementById('prev_iso').innerText = isoM ? isoM + ' เมตร' : '— (ไม่มีข้อมูล)';
const protRow = document.getElementById('prev_prot_row');
if (protM) {
document.getElementById('prev_prot').innerText = protM + ' เมตร';
protRow.style.display = 'block';
} else {
protRow.style.display = 'none';
}
prev.style.display = 'block';
}
async function drawHazmatZones() {
if (typeof requireFeature === 'function' && !requireFeature('erg', 'ERG วาด Zone สารเคมี (ระดับ 2+)')) return;
if (!dashMap || incidentCenter.lat === 0) {
Swal.fire('แจ้งเตือน', 'ยังไม่มีแผนที่/พิกัดเหตุ กรุณาเปิดแผนที่ก่อน', 'warning');
return;
}
autoDetectTime();
let isoM = 0, protM = null;
if (_ergCurrent && _ergCurrent.sm_iso) {
isoM = _withFire
? (_ergCurrent.fire_iso || 800)
: (_spillSize === 'lg' ? _ergCurrent.lg_iso : _ergCurrent.sm_iso) || 0;
const protKey = _spillSize + '_' + _timeOfDay;
protM = _ergCurrent[protKey] || null;
} else {
const { value: manualR } = await Swal.fire({
title: 'กรอกรัศมี Isolation',
text: 'ไม่มีข้อมูลสาร ERG — กรอกรัศมีเอง (เมตร)',
input: 'number',
inputValue: 100,
inputAttributes: { min: 1, step: 1 },
confirmButtonText: 'วาด Zone',
showCancelButton: true,
cancelButtonText: 'ยกเลิก',
});
if (!manualR) return;
isoM = parseInt(manualR) || 100;
}
if (!isoM) {
Swal.fire('ข้อมูลไม่ครบ', 'ไม่มีค่า Isolation radius — กรุณาค้นหาสารก่อน', 'warning');
return;
}
clearHazmatZones();
const lat = incidentCenter.lat;
const lng = incidentCenter.lng;
const zones = [];
zones.push({
r: isoM,
fill: 'rgba(192,57,43,0.25)',
stroke: '#c0392b',
dash: '',
label: `เขตกั้นแยก ${isoM} m`,
labelColor: '#c0392b',
});
if (protM && protM > isoM) {
zones.unshift({
r: protM,
fill: 'rgba(142,68,173,0.10)',
stroke: '#8e44ad',
dash: '8,4',
label: `เขตเฝ้าระวังตามลม ${protM} m`,
labelColor: '#8e44ad',
});
}
zones.forEach((z, idx) => {
const dLng = z.r / (111320 * Math.cos(lat * Math.PI / 180));
const overlay = makeMapTilerCircleOverlay({ lon: lng, lat: lat }, z.r, {
lineWidth: 2,
lineColor: z.stroke,
fillColor: z.fill,
label: false
});
dashMap.Overlays.add(overlay);
hazmatZoneOverlays.push(overlay);
const labelPoint = smartCircleLabelPoint(lat, lng, z.r * 1.02, idx);
const lMarker = makeLongdoHtmlMarker({ lon: labelPoint.lng, lat: labelPoint.lat },
`<div style="background:rgba(255,255,255,0.92);color:${z.labelColor};font-weight:bold;font-size:10px;padding:2px 8px;border-radius:10px;border:2px solid ${z.stroke};white-space:nowrap;">${z.label}</div>`,
{ offset: { x: 0, y: 0 }, weight: (typeof longdo !== 'undefined' && longdo.OverlayWeight) ? longdo.OverlayWeight.Top : 0, scaleMode: 'label' }
);
dashMap.Overlays.add(lMarker);
hazmatZoneLabels.push(lMarker);
});
const outerR = protM && protM > isoM ? protM : isoM;
fitLongdoMeters(dashMap, lat, lng, outerR);
setTimeout(ensureDashboardMarkerSeparationZoom, 420);
document.getElementById('chip_iso_m').innerText = isoM + ' m';
document.getElementById('chip_iso').style.display = 'flex';
if (protM) {
document.getElementById('chip_prot_m').innerText = protM + ' m';
document.getElementById('chip_prot').style.display = 'flex';
} else {
document.getElementById('chip_prot').style.display = 'none';
}
document.getElementById('zone_chips').style.display = 'block';
}
function clearHazmatZones() {
clearLongdoOverlayList(dashMap, hazmatZoneOverlays);
clearLongdoOverlayList(dashMap, hazmatZoneLabels);
hazmatZoneOverlays = [];
hazmatZoneLabels = [];
document.getElementById('zone_chips').style.display = 'none';
document.getElementById('zone_radius_preview').style.display = 'none';
}
function getDashboardERGTimeKey() {
if (typeof _timeOfDay !== 'undefined' && (_timeOfDay === 'dy' || _timeOfDay === 'nte')) return _timeOfDay;
var h = new Date().getHours();
return (h >= 6 && h < 18) ? 'dy' : 'nte';
}
function drawHazmatZonesFromState(erg) {
erg = erg || window._lastERGState || {};
if (!dashMap || !incidentCenter || !incidentCenter.lat || !incidentCenter.lng) return;
var isoM = Number(erg.isoM || erg.sm_iso || erg.isolation_m || 0) || 0;
var timeKey = getDashboardERGTimeKey();
var protM = timeKey === 'nte'
? Number(erg.nightM || erg.night_prot_m || erg.sm_nte || erg.lg_nte || 0)
: Number(erg.dayM || erg.day_prot_m || erg.sm_dy || erg.lg_dy || 0);
protM = Number(protM) || 0;
if (!isoM && !protM) return;
clearHazmatZones();
var lat = incidentCenter.lat;
var lng = incidentCenter.lng;
var zones = [];
if (protM && protM > isoM) {
zones.push({
r: protM,
fill: 'rgba(142,68,173,0.10)',
stroke: '#8e44ad',
label: 'เขตเฝ้าระวังตามลม ' + protM + ' m',
labelColor: '#8e44ad'
});
}
if (isoM) {
zones.push({
r: isoM,
fill: 'rgba(192,57,43,0.25)',
stroke: '#c0392b',
label: 'เขตกั้นแยก ' + isoM + ' m',
labelColor: '#c0392b'
});
}
zones.forEach(function(z, idx) {
var overlay = makeMapTilerCircleOverlay({ lon: lng, lat: lat }, z.r, {
lineWidth: 2,
lineColor: z.stroke,
fillColor: z.fill,
label: false
});
dashMap.Overlays.add(overlay);
hazmatZoneOverlays.push(overlay);
var labelPoint = smartCircleLabelPoint(lat, lng, z.r * 1.02, idx);
var lMarker = makeLongdoHtmlMarker({ lon: labelPoint.lng, lat: labelPoint.lat },
'<div style="background:rgba(255,255,255,0.92);color:' + z.labelColor + ';font-weight:bold;font-size:10px;padding:2px 8px;border-radius:10px;border:2px solid ' + z.stroke + ';white-space:nowrap;">' + z.label + '</div>',
{ offset: { x: 0, y: 0 }, weight: (typeof longdo !== 'undefined' && longdo.OverlayWeight) ? longdo.OverlayWeight.Top : 0, scaleMode: 'label' }
);
dashMap.Overlays.add(lMarker);
hazmatZoneLabels.push(lMarker);
});
if (isoM) {
document.getElementById('chip_iso_m').innerText = isoM + ' m';
document.getElementById('chip_iso').style.display = 'flex';
}
if (protM) {
document.getElementById('chip_prot_m').innerText = protM + ' m';
document.getElementById('chip_prot').style.display = 'flex';
} else {
document.getElementById('chip_prot').style.display = 'none';
}
document.getElementById('zone_chips').style.display = 'block';
}
function refreshDashboardERGZone() {
if (!dashMap || !incidentCenter || !incidentCenter.lat) return;
if (window._lastERGState && (window._lastERGState.isoM || window._lastERGState.dayM || window._lastERGState.nightM)) {
renderSavedERGSelectionFromState(window._lastERGState);
drawHazmatZonesFromState(window._lastERGState);
return;
}
if (typeof google === 'undefined' || !google.script || !google.script.run || window._dashboardERGLoading) return;
window._dashboardERGLoading = true;
google.script.run
.withSuccessHandler(function(erg) {
window._dashboardERGLoading = false;
window._lastERGState = erg || window._lastERGState || {};
renderSavedERGSelectionFromState(window._lastERGState);
drawHazmatZonesFromState(window._lastERGState);
})
.withFailureHandler(function() {
window._dashboardERGLoading = false;
})
// 🔧 ส่ง agency/token ให้ server route ไปยัง sheet ที่ถูกต้อง (Join Link session จำเป็นมากตอนนี้)
.getERGState(
  (typeof APP_AGENCY_ID !== 'undefined' ? APP_AGENCY_ID : '') || '',
  (typeof APP_AGENCY_SHEET_ID !== 'undefined' ? APP_AGENCY_SHEET_ID : '') || '',
  (typeof getActiveJoinToken === 'function' ? getActiveJoinToken() : '')
);
}
const START_STEPS = [
{
id: 'walk',
progress: 'ขั้นตอนที่ 1/4 — เดินได้?',
q: 'ผู้ป่วยเดินได้เองไหม?',
yes: { next: null, result: 'green', label: '🟢 GREEN — เดินได้ Minor' },
no: { next: 'breathe' }
},
{
id: 'breathe',
progress: 'ขั้นตอนที่ 2/4 — หายใจได้?',
q: 'เปิดทางเดินหายใจแล้ว — หายใจได้ไหม?',
yes: { next: 'resp_rate' },
no: { next: null, result: 'black', label: '⚫ BLACK — หยุดหายใจ / สิ้นหวัง' }
},
{
id: 'resp_rate',
progress: 'ขั้นตอนที่ 3/4 — อัตราหายใจ?',
q: 'อัตราการหายใจ < 10 หรือ > 30 ครั้ง/นาที?',
yes: { next: null, result: 'red', label: '🔴 RED — หายใจผิดปกติ IMMEDIATE' },
no: { next: 'perfusion' }
},
{
id: 'perfusion',
progress: 'ขั้นตอนที่ 4/4 — Radial Pulse / CRT?',
q: 'ไม่มี Radial pulse หรือ CRT > 2 วินาที?',
yes: { next: null, result: 'red', label: '🔴 RED — Shock IMMEDIATE' },
no: { next: 'mental' }
},
{
id: 'mental',
progress: 'ขั้นตอนที่ 5/5 — Mental Status?',
q: 'ไม่สามารถปฏิบัติตามคำสั่งง่ายๆ ได้?',
yes: { next: null, result: 'red', label: '🔴 RED — Mental ผิดปกติ IMMEDIATE' },
no: { next: null, result: 'yellow', label: '🟡 YELLOW — Delayed (รอได้)' }
}
];
var startCurrentStep = 'walk';
var startHistoryLog = [];
function startReset() {
startCurrentStep = 'walk';
startHistoryLog = [];
renderStartStep();
}
function renderStartStep() {
const step = START_STEPS.find(s => s.id === startCurrentStep);
if (!step) return;
document.getElementById('start_progress').innerText = step.progress;
document.getElementById('start_question_area').innerHTML = `
<div class="start-question">
<div class="q-text">${step.q}</div>
<div class="start-ans-row">
<button class="start-ans yes" onclick="startAnswer(true)">✅ ใช่</button>
<button class="start-ans no" onclick="startAnswer(false)">❌ ไม่ใช่</button>
</div>
</div>`;
renderStartHistory();
}
function startAnswer(ans) {
const step = START_STEPS.find(s => s.id === startCurrentStep);
if (!step) return;
const branch = ans ? step.yes : step.no;
startHistoryLog.push({ q: step.q, a: ans ? 'ใช่' : 'ไม่ใช่' });
if (branch.result) {
const colors = { red: 'red', yellow: 'yellow', green: 'green', black: 'black' };
document.getElementById('start_progress').innerText = '✅ ผลการ Triage';
document.getElementById('start_question_area').innerHTML = `
<div class="start-result ${colors[branch.result]}">${branch.label}</div>
<button class="mod-btn gray" style="width:100%;margin-top:8px;" onclick="startReset()">↺ ผู้ป่วยรายต่อไป</button>`;
renderStartHistory();
} else {
startCurrentStep = branch.next;
renderStartStep();
}
}
function renderStartHistory() {
const el = document.getElementById('start_history');
if (startHistoryLog.length === 0) { el.innerHTML = ''; return; }
el.innerHTML = startHistoryLog.map((x, i) => `<span style="color:#bbb;">${i+1}. ${x.q}</span> → <b>${x.a}</b>`).join('<br>');
}
function addTriageCount(type) {
// ถ้าเรียกจาก START tab → ต้องการ Tier 3 / ถ้าจาก MED tab ปกติ → Tier 2+
var calledFromStart = document.getElementById('healthtab_field') &&
document.getElementById('healthtab_field').style.display !== 'none';
if (calledFromStart) {
if (typeof requireFeature === 'function' && !requireFeature('mci', 'START Triage Protocol (ระดับ 3+)')) return;
} else {
if (typeof requireFeature === 'function' && !requireFeature('triage', 'Triage 4 สี (ระดับ 2+)')) return;
}
const valEl = document.getElementById('val_' + type);
const currentVal = parseInt((valEl && valEl.innerText) || '0', 10);
const newVal = currentVal + 1;
if (typeof google !== 'undefined' && google.script) {
google.script.run.withSuccessHandler(() => {
Swal.fire({ icon: 'success', title: `+ 1 ${type.toUpperCase()}`, timer: 800, showConfirmButton: false });
fetchData();
}).updateEmerCount(type, newVal, 'Field', USER_NAME || 'Staff');
} else {
Swal.fire({ icon: 'info', text: 'ทดสอบ: +1 ' + type, timer: 800, showConfirmButton: false });
}
}
var _resCache = { ambulance: 0, fireTruck: 0, staff: 0, decon: 0 };
function loadResources() {
if (typeof google === 'undefined' || !google.script) return;
google.script.run.withSuccessHandler(function(data) {
if (!data) return;
_resCache = data;
renderResources(data);
}).getResources();
}
function openAddResourceModalByKey(key) {
var cfg = getOCResourceConfig(key);
openAddResourceModal(cfg.label);
}
function updateRes(type, delta) {
if (APP_ACCESS_ROLE !== 'admin') {
Swal.fire('โหมดดูอย่างเดียว', 'ต้องใช้สิทธิ์ Admin จึงจะแก้ไขทรัพยากรได้', 'info');
return;
}
const keyMap = {
'Ambulance': 'ambulance', 'FireTruck': 'fireTruck',
'Staff': 'staff', 'Decon': 'decon'
};
const key = keyMap[type];
const newVal = Math.max(0, (_resCache[key] || 0) + delta);
_resCache[key] = newVal;
const elMap = { 'Ambulance': 'rt_ambulance', 'FireTruck': 'rt_fireTruck', 'Staff': 'rt_staff', 'Decon': 'rt_decon' };
const el = document.getElementById(elMap[type]);
if (el) el.innerText = newVal;
const status = document.getElementById('rt_status');
if (typeof google !== 'undefined' && google.script) {
status.style.color = '#aaa';
status.innerText = 'กำลังบันทึก...';
google.script.run.withSuccessHandler(function() {
status.style.color = '#27ae60';
status.innerText = '✅ บันทึก ' + type + ' = ' + newVal + ' แล้ว';
setTimeout(() => { status.innerText = ''; }, 2000);
}).withFailureHandler(function(e) {
status.style.color = '#e74c3c';
status.innerText = '❌ Error: ' + e.message;
}).updateResource(type, newVal);
}
}
function submitExposure() {
// 🎚️ ตาม TIER_CONFIG: exposure_log = Tier 3 เท่านั้น (เช็คผ่าน feature flag จะได้ตรงกับการ์ดที่ซ่อน/แสดง)
if (typeof requireFeature === 'function' && !requireFeature('exposure_log', 'บันทึก Exposure (ระดับ 3 เท่านั้น)')) return;
const name = document.getElementById('exp_name').value.trim();
const role = document.getElementById('exp_role').value.trim();
const chem = document.getElementById('exp_chem').value.trim();
const un = document.getElementById('exp_un').value.trim();
const dur = document.getElementById('exp_dur').value;
const ppe = document.getElementById('exp_ppe').value;
const note = document.getElementById('exp_note').value.trim();
if (!name || !chem) {
Swal.fire('ข้อมูลไม่ครบ', 'กรุณาระบุชื่อผู้สัมผัสและชื่อสาร', 'warning');
return;
}
Swal.fire({ title: 'กำลังบันทึก...', didOpen: () => Swal.showLoading() });
if (typeof google !== 'undefined' && google.script) {
google.script.run.withSuccessHandler(function() {
Swal.fire({ icon: 'success', title: 'บันทึก Exposure แล้ว', timer: 1200, showConfirmButton: false });
['exp_name','exp_role','exp_chem','exp_un','exp_dur','exp_note'].forEach(id => {
document.getElementById(id).value = '';
});
loadExposureLog();
}).withFailureHandler(function(e) {
Swal.fire('Error', e.message, 'error');
}).logExposure(name, role, chem, un, parseInt(dur) || 0, ppe, note, USER_NAME || 'Staff');
} else {
Swal.fire({ icon: 'info', text: 'Dev mode: ' + JSON.stringify({name,chem,un,dur,ppe}), timer: 1500, showConfirmButton: false });
}
}
function loadExposureLog() {
const tbody = document.getElementById('exp_tbody');
tbody.innerHTML = '<tr><td colspan="5" style="text-align:center;color:#aaa;padding:8px;">กำลังโหลด...</td></tr>';
if (typeof google !== 'undefined' && google.script) {
google.script.run.withSuccessHandler(function(rows) {
if (!rows || rows.length === 0) {
tbody.innerHTML = '<tr><td colspan="5" style="text-align:center;color:#aaa;padding:8px;">ยังไม่มีข้อมูล</td></tr>';
return;
}
const ppeBadge = (p) => {
const cls = p.includes('A') ? 'ppe-a' : p.includes('B') ? 'ppe-b' : p.includes('C') ? 'ppe-c' : p.includes('D') ? 'ppe-d' : 'ppe-d';
return `<span class="ppe-badge ${cls}">${p}</span>`;
};
tbody.innerHTML = rows.slice(0, 30).map(r => {
const t = typeof r.time === 'string' ? r.time.split(' ')[1] || r.time : String(r.time || '').split(' ')[1] || '';
return `<tr>
<td>${t}</td>
<td><b>${r.name}</b><br><small style="color:#aaa;">${r.role}</small></td>
<td>${r.chemical}<br><small style="color:#f1c40f;">UN ${r.un}</small></td>
<td>${r.duration}</td>
<td>${ppeBadge(r.ppe || '-')}</td>
</tr>`;
}).join('');
}).withFailureHandler(function(e) {
tbody.innerHTML = '<tr><td colspan="5" style="color:#e74c3c;">Error: ' + e.message + '</td></tr>';
}).getExposureLog();
} else {
tbody.innerHTML = '<tr><td colspan="5" style="text-align:center;color:#aaa;">Dev mode</td></tr>';
}
}
function previewSitrep() {
const s = document.getElementById('sitrep_s').value || '-';
const m = document.getElementById('sitrep_m').value || '-';
const e = document.getElementById('sitrep_e').value || '-';
const a = document.getElementById('sitrep_a').value || '-';
const now = new Date().toLocaleString('th-TH', { hour12: false });
const SEP = '--------------------';
const preview = `🚨 SITREP — [EOC]\n📅 ${now}\n${SEP}\n[S] :\n${s}\n\n[M] :\n${m}\n\n[E] :\n${e}\n\n[A] :\n${a}\n${SEP}\n(ข้อมูล Triage จะเพิ่มอัตโนมัติเมื่อส่งจริง)`;
document.getElementById('sitrep_preview_text').innerText = preview;
document.getElementById('sitrep_preview_box').style.display = 'block';
}
function updateObjective() {
var objText = document.getElementById('input_objective').value;
if(!objText) {
Swal.fire('แจ้งเตือน', 'กรุณาระบุเป้าหมายก่อนประกาศครับ', 'warning');
return;
}
Swal.fire({
title: 'ยืนยันการประกาศ',
text: "เป้าหมาย: " + objText,
icon: 'info',
showCancelButton: true,
confirmButtonText: 'ประกาศให้ทุกทีมทราบ',
cancelButtonText: 'ยกเลิก'
}).then((result) => {
if (result.isConfirmed) {
google.script.run.withSuccessHandler(function(logs) {
renderLogList(logs);
Swal.fire('ประกาศแล้ว!', 'ส่งเป้าหมายให้ทุกทีมเรียบร้อย', 'success');
}).addCommanderLog('🎯 [เป้าหมาย EOC] ' + objText, USER_NAME || 'IC');
}
});
}
function sendQuickCmd(command) {
Swal.fire({
title: 'ยืนยันสั่งการด่วน?',
text: command,
icon: 'warning',
showCancelButton: true,
confirmButtonColor: '#d33',
cancelButtonColor: '#3085d6',
confirmButtonText: 'ใช่, สั่งการทันที!'
}).then((result) => {
if (result.isConfirmed) {
google.script.run.withSuccessHandler(function(logs) {
renderLogList(logs);
Swal.fire('สั่งการสำเร็จ', 'ส่งคำสั่ง "' + command + '" ลงในบันทึกเหตุการณ์แล้ว', 'success');
}).addCommanderLog('⚡ [Quick CMD] ' + command, USER_NAME || 'IC');
}
});
}
function renderLogList(logs) {
var el = document.getElementById('logList');
if (!el) return;
if (!logs || !Array.isArray(logs) || logs.length === 0) {
el.innerHTML = '<div style="color:#aaa;text-align:center;padding:10px;">ยังไม่มีบันทึก</div>';
return;
}
var h = "";
logs.forEach(function(x) {
var timeStr = x.time ? (typeof x.time === 'string' ? x.time.split(' ')[1] || x.time : '') : '';
h += '<div style="border-bottom:1px solid #eee;margin-bottom:5px;padding:2px 0;">' +
'<b style="color:#3498db;">' + timeStr + '</b> ' + x.msg + '</div>';
});
el.innerHTML = h;
}
function renderDashboardEvacPoints(points) {
points = Array.isArray(points) ? points.filter(function(p) {
return p && (p.pointName || p.leaderName || p.evacueeCount || p.staffCount);
}) : [];
window._dashboardEvacPoints = points;
var emptyHtml = '<div style="font-size:0.72rem;color:#aaa;text-align:center;padding:8px 0;">ยังไม่มีรายงานจากจุดอพยพ</div>';
var icEl = document.getElementById('ic_evac_point_list');
if (icEl) {
if (!points.length) {
icEl.innerHTML = emptyHtml;
} else {
icEl.innerHTML = points.slice(0, 4).map(function(p) {
return '<div style="background:#f8fafc;border:1px solid #dbe8cf;border-radius:8px;padding:8px;">' +
'<div style="font-size:0.82rem;font-weight:900;color:#14532d;margin-bottom:7px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">' + roleSafeText(p.pointName || '-') + '</div>' +
'<div style="display:grid;grid-template-columns:repeat(3,1fr);gap:6px;text-align:center;">' +
'<div style="background:#ecfdf5;border:1px solid #bbf7d0;border-radius:7px;padding:6px 4px;"><div style="font-size:1.25rem;font-weight:900;color:#16a34a;line-height:1;">' + (p.evacueeCount || 0) + '</div><div style="font-size:0.6rem;color:#166534;margin-top:3px;">ผู้อพยพ</div></div>' +
'<button onclick="openICEvacPointDetails(' + p.rowIndex + ')" style="background:#eff6ff;border:1px solid #bfdbfe;border-radius:7px;padding:6px 4px;cursor:pointer;font-family:Prompt,sans-serif;"><div style="font-size:1.05rem;font-weight:900;color:#2563eb;line-height:1;"><i class="fas fa-boxes-stacked"></i></div><div style="font-size:0.6rem;color:#1d4ed8;margin-top:3px;">สิ่งของ</div></button>' +
'<div style="background:#fff7ed;border:1px solid #fed7aa;border-radius:7px;padding:6px 4px;"><div style="font-size:1.25rem;font-weight:900;color:#ea580c;line-height:1;">' + (p.staffCount || 0) + '</div><div style="font-size:0.6rem;color:#9a3412;margin-top:3px;">เจ้าหน้าที่</div></div>' +
'</div>' +
'</div>';
}).join('');
}
}
var el = document.getElementById('dash_evac_point_list');
if (!el) return;
if (!points.length) {
el.innerHTML = emptyHtml;
return;
}
el.innerHTML = points.slice(0, 3).map(function(p, i) {
return '<div style="display:flex;align-items:center;gap:5px;background:#f8f9fa;border:1px solid #eee;border-radius:5px;padding:4px 6px;">' +
'<span style="background:#2980b9;color:white;padding:2px 6px;border-radius:3px;font-size:0.68rem;font-weight:bold;">' + (i + 1) + '</span>' +
'<div style="flex:1;min-width:0;">' +
'<div style="font-size:0.72rem;font-weight:bold;color:#2c3e50;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">' + roleSafeText(p.pointName || '-') + '</div>' +
'<div style="font-size:0.63rem;color:#777;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">หัวหน้า ' + roleSafeText(p.leaderName || '-') + ' | จนท. ' + (p.staffCount || 0) + '</div>' +
'</div>' +
'<div style="font-size:0.95rem;font-weight:900;color:#2980b9;min-width:36px;text-align:right;">' + (p.evacueeCount || 0) + '</div>' +
'</div>';
}).join('');
}
function refreshDashboardEvacPointsDirect() {
if (typeof google === 'undefined' || !google.script || !google.script.run) return;
google.script.run
.withFailureHandler(function(err) {
if (!window._dashboardEvacPoints || !window._dashboardEvacPoints.length) {
renderDashboardEvacPoints([]);
}
})
.withSuccessHandler(function(points) {
renderDashboardEvacPoints(Array.isArray(points) ? points : []);
})
.getEvacuationPoints();
}
function openICEvacPointDetails(rowIndex) {
var p = (window._dashboardEvacPoints || []).find(function(x) { return parseInt(x.rowIndex, 10) === parseInt(rowIndex, 10); });
if (!p) return;
var html = '<div style="text-align:left;font-size:13px;">' +
'<b>' + (p.pointName || '-') + '</b><br>' +
'<span>ผู้อพยพ ' + (p.evacueeCount || 0) + ' คน | เจ้าหน้าที่ ' + (p.staffCount || 0) + ' คน</span><hr>' +
'<div>น้ำดื่ม: <b>' + (p.water || 0) + '</b></div>' +
'<div>อาหาร: <b>' + (p.food || 0) + '</b></div>' +
'<div>ผ้าห่ม: <b>' + (p.blanket || 0) + '</b></div>' +
'<div>เตียงนอน: <b>' + (p.bed || 0) + '</b></div>' +
'<div>อื่นๆ: <b>' + (p.otherResources || '-') + '</b></div>' +
(p.note ? '<hr><div>หมายเหตุ: ' + p.note + '</div>' : '') +
'</div>';
Swal.fire({ title: 'ทรัพยากรจุดอพยพ', html: html, confirmButtonText: 'ปิด' });
}
function openICTriageColorDetails(color) {
// 🔒 Tier 2 เห็นแค่จำนวน, รายละเอียดว่าอยู่ รพ.ใด ต้อง Tier 3+ (mci)
if (typeof requireFeature === 'function' && !requireFeature('mci', 'รายละเอียดผู้บาดเจ็บ / รพ. (ระดับ 3+)')) return;
var labelMap = { red:'แดง', yellow:'เหลือง', green:'เขียว', black:'ดำ' };
var rows = (window._icPatientTransfers || []).filter(function(t) {
return String(t.triage || '').toLowerCase() === color;
});
if (!rows.length) {
Swal.fire({ title: 'ผู้บาดเจ็บสี' + (labelMap[color] || color), html: '<div style="color:#999;">ยังไม่มีข้อมูลการส่งต่อไปโรงพยาบาล</div>', confirmButtonText: 'ปิด' });
return;
}
var byHosp = {};
rows.forEach(function(r) {
var hosp = r.hospital || 'ไม่ระบุ รพ.';
if (!byHosp[hosp]) byHosp[hosp] = { qty:0, rows:[] };
byHosp[hosp].qty += parseInt(r.qty, 10) || 1;
byHosp[hosp].rows.push(r);
});
if (typeof groupMedicalTriageRowsByHospital === 'function') byHosp = groupMedicalTriageRowsByHospital(rows);
var html = Object.keys(byHosp).map(function(hosp) {
return '<div style="text-align:left;border-bottom:1px solid #eee;padding:7px 0;">' +
'<b>' + hosp + '</b> <span style="float:right;">' + byHosp[hosp].qty + ' ราย</span><br>' +
byHosp[hosp].rows.map(function(r) {
return '<div style="font-size:12px;color:#666;">' + (r.time || '-') + ' | ' + (r.loggedBy || 'MED') + ' | ' + (r.qty || 1) + ' ราย</div>';
}).join('') +
'</div>';
}).join('');
Swal.fire({ title: 'ผู้บาดเจ็บสี' + (labelMap[color] || color), html: html, confirmButtonText: 'ปิด' });
}
async function updateIncidentMarker(coords) {
if (!coords || !coords.includes(',')) return;
if (!dashMap) return;
const [lat, lng] = coords.split(',').map(c => parseFloat(c.trim()));
if (isNaN(lat) || isNaN(lng)) return;
const pos = { lon: lng, lat: lat };
incidentCenter.lat = lat;
incidentCenter.lng = lng;
// ลบ marker เดิมถ้ามี
if (dashMarker) {
try { removeLongdoOverlay(dashMap, dashMarker); } catch(e) {}
dashMarker = null;
}
// สร้าง marker ใหม่เสมอ (ไม่ว่า dashMarker จะเป็น null หรือไม่)
try {
dashMarker = makeLongdoHtmlMarker(pos, buildDashboardIncidentMarkerHtml(), {
offset: { x: 0, y: 0 },
weight: (typeof longdo !== 'undefined' && longdo.OverlayWeight) ? longdo.OverlayWeight.Top : 0,
title: 'จุดเกิดเหตุ',
scaleMode: 'none'
});
dashMap.Overlays.add(dashMarker);
renderDashboardEOCMarker(window._lastEmergState && window._lastEmergState.evtEOCCoords);
setTimeout(ensureDashboardMarkerSeparationZoom, 350);
} catch(e) {}
}
var ocCurrentUser = '';
var ocSelectedSitTag = '';
var ocTimerInterval = null;
var _logCounts = { ambulance:0, fire:0, rescue:0, police:0, personnel:0 };
function logAdjust(key, delta) {
_logCounts[key] = Math.max(0, (_logCounts[key] || 0) + delta);
document.getElementById('log_' + key).textContent = _logCounts[key];
}
function resetLogModal() {
_logCounts = { ambulance:0, fire:0, rescue:0, police:0, personnel:0 };
['ambulance','fire','rescue','police','personnel'].forEach(function(k) {
var el = document.getElementById('log_' + k);
if (el) el.textContent = '0';
});
['logNameInput','logAgencyInput','logPhoneInput'].forEach(function(id) {
var el = document.getElementById(id);
if (el) el.value = '';
});
}
function submitLogistics() {
var agency = (document.getElementById('logAgencyInput').value || '').trim();
if (!agency) {
Swal.fire('กรุณาระบุหน่วยงาน', '', 'warning');
return;
}
var name = (document.getElementById('logNameInput').value || '').trim() || agency;
var phone = (document.getElementById('logPhoneInput').value || '').trim();
var amb = _logCounts.ambulance || 0;
var fire = _logCounts.fire || 0;
var police = _logCounts.police || 0;
var personnel= _logCounts.personnel || 0;
USER_NAME = name;
currentUserName = name;
TEMP_ROLE = 'Logistics';
TEMP_ROLE_LABEL = agency;
currentRole = 'Logistics';
window.currentUserPhone = phone;
document.getElementById('modal_Logistics').style.display = 'none';
Swal.fire({ title:'กำลังรายงานตัว...', allowOutsideClick:false, showConfirmButton:false, didOpen:function(){ Swal.showLoading(); } });
try {
google.script.run
.withSuccessHandler(function() {})
.withFailureHandler(function(e) { })
.submitEmergencyAttendance(name, agency, 'Logged In', phone, 'Logistics');
} catch(e) {}
var rescue = _logCounts.rescue || 0;
var resources = [
{ type:'รถพยาบาล', qty: amb },
{ type:'รถดับเพลิง', qty: fire },
{ type:'กู้ชีพ/กู้ภัย', qty: rescue },
{ type:'ตำรวจ', qty: police }
].filter(function(r) {
return r.qty > 0;
});
resources.forEach(function(r, idx) {
var personnelForThisRow = idx === 0 ? personnel : 0;
try {
google.script.run
.withSuccessHandler(function() {})
.withFailureHandler(function(e) { })
.saveResourceIncoming(r.type, r.qty, personnelForThisRow, agency, phone);
} catch(e) {}
});
if (resources.length === 0 && personnel > 0) {
try {
google.script.run
.withSuccessHandler(function() {})
.withFailureHandler(function(e) { })
.saveResourceIncoming('กำลังพล', 0, personnel, agency, phone);
} catch(e) {}
}
Swal.close();
saveLastRoleSession();
enterRoleWorkScene('Logistics');
}
var OC_LOCK_SELECTORS = [
'.oc-quick-res',
'button[onclick="sendOCReport()"]',
'button[onclick="submitOCRequest()"]',
'button[onclick="refreshOCData()"]',
'button[onclick="openOCZoneActionPopup()"]',
'button[onclick="openOCSitrepPopup()"]',
'button[onclick="openOCCasualtyPopup()"]',
'button[onclick="openOCSupportPopup()"]',
'button[onclick="openOCWindInput()"]',
'button[onclick="openWindInputModal()"]',
'button[onclick="useCurrentLocationForICP()"]',
'button[onclick="openICPMapPicker()"]',
'button[onclick="openZoneMapPicker()"]',
'#oc_req_type',
'#oc_req_detail',
'.oc-preset-btn',
'#oc_icp_label',
'#oc_zone_type_sel',
'#oc_zone_label'
];
var HEALTH_LOCK_SELECTORS = [
// 📝 Note + แนบรูป เปิดให้ทุกคนในกล่อง (ตามสเปค) — ไม่ใส่ submitHealthNote / #health_note_text / ปุ่มแนบไฟล์
'button[onclick="openUpdateMedicalTriage()"]',
'button[onclick="openAddPatientTransfer()"]',
'button[onclick="openAddHealthUnit()"]',
'button[onclick="submitHealthRequest()"]',
'button[onclick="sendHealthReport()"]',
'button[onclick="refreshHealthData()"]',
'#health_req_type',
'#health_req_detail',
'.health-tab'
];
var EVAC_LOCK_SELECTORS = [
'button[onclick="submitEvacPointReport()"]',
'button[onclick="openEvacMapPicker()"]',
'button[onclick="refreshEvacPointData()"]',
'#evac_point_name',
'#evac_coords',
'#evac_leader',
'#evac_staff_count',
'#evac_people_count',
'#evac_water',
'#evac_food',
'#evac_blanket',
'#evac_bed',
'#evac_other',
'#evac_note'
];
function _setSceneLock(sceneId, selectors, locked) {
var scene = document.getElementById(sceneId);
if (!scene) return;
var oldBanner = scene.querySelector('.ops-readonly-banner');
if (oldBanner) oldBanner.remove();
if (locked) {
var banner = document.createElement('div');
banner.className = 'ops-readonly-banner';
banner.style.cssText = [
'background:#fef3c7',
'border-bottom:2px solid #f59e0b',
'padding:10px 16px',
'font-size:13px',
'color:#92400e',
'font-weight:700',
'flex-shrink:0',
'display:flex',
'align-items:center',
'gap:10px'
].join(';');
banner.innerHTML =
'<i class="fas fa-lock" style="font-size:16px;flex-shrink:0;"></i>' +
'<span>คุณไม่ได้เป็นหัวหน้า/ผู้ประสานหน่วยนี้ — แก้ข้อมูลไม่ได้ ' +
'แต่ส่ง <b>Note</b> และ <b>แนบภาพ/วิดีโอ</b> เข้า IC ได้</span>';
var children = scene.children;
var insertAfterIndex = Math.min(2, children.length - 1);
var refNode = children[insertAfterIndex];
if (refNode && refNode.nextSibling) {
scene.insertBefore(banner, refNode.nextSibling);
} else {
scene.appendChild(banner);
}
}
selectors.forEach(function(sel) {
try {
scene.querySelectorAll(sel).forEach(function(el) {
if (locked) {
el.setAttribute('data-lock-was-disabled', el.disabled ? '1' : '0');
el.disabled = true;
el.style.opacity = '0.38';
el.style.pointerEvents = 'none';
el.style.cursor = 'not-allowed';
} else {
var was = el.getAttribute('data-lock-was-disabled');
el.disabled = (was === '1');
el.style.opacity = '';
el.style.pointerEvents = '';
el.style.cursor = '';
}
});
} catch (e) { }
});
}
function applyOpsSceneLock(roleCode, isLead) {
var locked = !isLead && !IS_COORD;
if (roleCode === 'OSC') {
_setSceneLock('scene_OC', OC_LOCK_SELECTORS, locked);
} else if (roleCode === 'MED') {
_setSceneLock('scene_Health', HEALTH_LOCK_SELECTORS, locked);
} else if (roleCode === 'EVAC_POINT') {
_setSceneLock('scene_EvacPoint', EVAC_LOCK_SELECTORS, locked);
}
}
function enterOCScene(userName) {
ocCurrentUser = userName || currentUserName || 'OC';
document.getElementById('oc_username').textContent = ocCurrentUser;
document.getElementById('scene_OrgChart').style.display = 'none';
document.getElementById('scene_OC').style.display = 'flex';
if (typeof startRoleBroadcastPolling === 'function') startRoleBroadcastPolling('OSC');
startOCTimer();
applyOpsSceneLock('OSC', IS_LEAD);
refreshOCData();
setTimeout(function() {
try { refreshOCResourcesDirect(); } catch (e) { }
}, 700);
}
function exitOC() {
if (typeof stopRoleBroadcastPolling === 'function') stopRoleBroadcastPolling();
if (ocTimerInterval) clearInterval(ocTimerInterval);
document.getElementById('scene_OC').style.display = 'none';
document.getElementById('scene_OrgChart').style.display = 'flex';
}
function startOCTimer() {
if (ocTimerInterval) clearInterval(ocTimerInterval);
updateRoleTimerElement('oc_timer');
ocTimerInterval = setInterval(function() {
updateRoleTimerElement('oc_timer');
}, 1000);
}
function switchOCTab(tabId, btn) {
document.querySelectorAll('.oc-tab-content').forEach(function(el) { el.style.display = 'none'; });
document.querySelectorAll('.oc-tab').forEach(function(el) { el.classList.remove('active'); });
document.getElementById('octab_' + tabId).style.display = 'block';
btn.classList.add('active');
}
