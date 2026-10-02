// View-only map presets. No GAS/Supabase calls and no incident-data writes.
// Longdo's official SDK TRAFFIC definition uses this public MapLibre style:
// https://api.longdo.com/map3/ and https://map.longdo.com/docs/v3/javascript/maplayers/trafficmap/
(function() {
'use strict';
var mode = 'satellite';
var trafficVisible = false;
var mapRef = null;
var generation = 0;
var refreshTimer = null;
var definitionPromise = null;
var boundarySources = {};
var boundaryLayers = {};
var trafficStatus = 'ยังไม่เปิดชั้นจราจร';
var SOURCE = 'ics-longdo-traffic';
var LAYERS = ['ics-longdo-traffic-forward', 'ics-longdo-traffic-reverse'];
var STYLE_URL = 'https://msv.longdo.com/vector/longdo_traffic.json';
var CAPS_URL = 'https://msv.longdo.com/capabilities/traffic.json';

function setText(id, text) {
var el = document.getElementById(id);
if (el) el.textContent = text;
}
function styleReady(mapObj) {
return mapObj && (!mapObj.isStyleLoaded || mapObj.isStyleLoaded());
}
window.syncDashboardMapModeUI = function() {
var waterVisible = window._floodLayerVisible !== false;
var buttons = { streets:'dashStyleStreet', satellite:'dashStyleSat', traffic:'dashModeTraffic', flood:'dashModeFlood' };
Object.keys(buttons).forEach(function(name) {
var button = document.getElementById(buttons[name]);
if (!button) return;
button.setAttribute('aria-pressed', name === mode ? 'true' : 'false');
button.style.background = name === mode ? '#2563eb' : 'white';
button.style.color = name === mode ? 'white' : '#334155';
});
var trafficCheck = document.getElementById('dashTrafficLayerCheck');
var waterCheck = document.getElementById('dashFieldFloodLayerCheck');
if (trafficCheck) trafficCheck.checked = trafficVisible;
if (waterCheck) waterCheck.checked = waterVisible;
var labels = [window._dashboardMapStyle === 'streets' ? 'พื้นถนน' : 'พื้นดาวเทียม'];
if (trafficVisible) labels.push('จราจร Longdo');
if (waterVisible) labels.push('ขอบเขตน้ำหน้างาน');
labels.push('น้ำท่วมดาวเทียมยังไม่เชื่อม');
setText('dashMapModeStatus', labels.join(' · '));
setText('dashTrafficSourceStatus', trafficStatus);
};
window.selectDashboardMapMode = function(nextMode) {
if (['streets','satellite','traffic','flood'].indexOf(nextMode) === -1) return;
mode = nextMode;
// Presets change the base and enable the requested layer, never turn off the
// other independent layer. Street/satellite also retain both checkbox choices.
setDashboardMapStyle(nextMode === 'satellite' ? 'satellite' : 'streets');
if (nextMode === 'traffic') window.setDashboardTrafficLayer(true);
if (nextMode === 'flood') window.setDashboardFieldFloodLayer(true);
window.syncDashboardMapModeUI();
};
window.setDashboardFieldFloodLayer = function(visible) {
if ((window._floodLayerVisible !== false) !== !!visible) toggleFloodMapLayer();
if (!visible && mode === 'flood') mode = window._dashboardMapStyle || 'satellite';
window.syncDashboardMapModeUI();
};
function removeTraffic(mapObj) {
if (!mapObj) return;
LAYERS.slice().reverse().forEach(function(id) {
if (mapObj.getLayer(id)) mapObj.removeLayer(id);
});
if (mapObj.getSource(SOURCE)) mapObj.removeSource(SOURCE);
}
function clearRefresh() {
if (refreshTimer !== null) clearTimeout(refreshTimer);
refreshTimer = null;
}
window.setDashboardTrafficLayer = function(visible) {
trafficVisible = !!visible;
generation++;
clearRefresh();
if (!trafficVisible) {
removeTraffic(mapRef);
trafficStatus = 'ยังไม่เปิดชั้นจราจร';
if (mode === 'traffic') mode = window._dashboardMapStyle || 'satellite';
window.syncDashboardMapModeUI();
return;
}
renderTraffic();
};
async function readProviderJSON(url) {
var controller = new AbortController();
var timer = setTimeout(function() { controller.abort(); }, 12000);
try {
var response = await fetch(url, { credentials:'omit', cache:'no-store', signal:controller.signal });
if (!response.ok) throw new Error('Provider request failed');
return await response.json();
} finally { clearTimeout(timer); }
}
function loadDefinition() {
if (!definitionPromise) {
definitionPromise = Promise.all([readProviderJSON(STYLE_URL), readProviderJSON(CAPS_URL)]).then(function(results) {
var style = results[0], caps = results[1];
if (style.version !== 8 || !Array.isArray(style.layers) || !Array.isArray(caps.tiles) || !caps.tiles.length) throw new Error('Invalid traffic definition');
var tiles = caps.tiles.map(function(tile) {
var url = new URL(tile);
if (url.protocol !== 'https:' || url.hostname !== 'msv.longdo.com' || url.username || url.password) throw new Error('Invalid provider origin');
return tile;
});
var layers = style.layers.filter(function(layer) {
return ['traffic-forward','traffic-reverse'].indexOf(layer.id) !== -1 && layer.source === 'traffic' && layer.type === 'line';
});
if (layers.length !== 2) throw new Error('Missing traffic layers');
return { tiles:tiles, layers:layers, minzoom:caps.minzoom, maxzoom:caps.maxzoom, bounds:caps.bounds };
}).catch(function(error) { definitionPromise = null; throw error; });
}
return definitionPromise;
}
function scheduleRefresh() {
clearRefresh();
// Longdo's documented built-in traffic refresh cadence is three minutes.
refreshTimer = setTimeout(function() {
refreshTimer = null;
if (!trafficVisible) return;
if (document.hidden) { scheduleRefresh(); return; }
renderTraffic();
}, 180000);
}
async function renderTraffic() {
if (!trafficVisible) return;
var mapObj = mapRef;
var requestGeneration = ++generation;
clearRefresh();
trafficStatus = 'กำลังโหลดจราจร Longdo…';
window.syncDashboardMapModeUI();
if (!styleReady(mapObj)) {
// Adding sources can briefly make isStyleLoaded false without a new style.load.
// An idle retry is view-only and respects cancellation / rapid preset changes.
if (mapObj && mapObj.once) mapObj.once('idle', function() {
if (trafficVisible && mapRef === mapObj && requestGeneration === generation) renderTraffic();
});
return;
}
try {
var definition = await loadDefinition();
if (!trafficVisible || requestGeneration !== generation || mapObj !== mapRef || !styleReady(mapObj)) return;
removeTraffic(mapObj);
var stamp = Date.now();
mapObj.addSource(SOURCE, {
type:'vector',
tiles:definition.tiles.map(function(tile) { return tile + (tile.indexOf('?') === -1 ? '?' : '&') + '_ics_refresh=' + stamp; }),
minzoom:definition.minzoom,
maxzoom:definition.maxzoom,
bounds:definition.bounds,
attribution:'<a href="https://traffic.longdo.com/" target="_blank" rel="noopener noreferrer">Longdo Traffic</a>'
});
// Keep field-water polygons and solid red closure lines above traffic.
var beforeLayer = (mapObj.getStyle().layers || []).find(function(layer) { return /^mt-(polygon|line|circle)-/.test(layer.id); });
definition.layers.forEach(function(layer, index) {
var copy = JSON.parse(JSON.stringify(layer));
copy.id = LAYERS[index];
copy.source = SOURCE;
mapObj.addLayer(copy, beforeLayer ? beforeLayer.id : undefined);
});
trafficStatus = 'โหลดชั้นจราจรเมื่อ ' + new Date(stamp).toLocaleTimeString('th-TH') + ' · ตรวจใหม่ทุก 3 นาที (ไม่ใช่เวลาสำรวจต้นทาง)';
window.syncDashboardMapModeUI();
scheduleRefresh();
} catch(error) {
if (!trafficVisible || requestGeneration !== generation || mapObj !== mapRef) return;
trafficStatus = 'โหลดจราจรไม่ได้ / ข้อมูลอาจเก่า กรุณาดู Longdo โดยตรง แผนที่และข้อมูลหน้างานยังใช้งานได้';
window.syncDashboardMapModeUI();
scheduleRefresh();
}
}

window.captureDashboardBoundaryLayers = function(mapObj) {
var style = mapObj.getStyle();
(style.layers || []).filter(function(layer) { return /^tambon-(fill|line)-/.test(layer.id); }).forEach(function(layer) {
if (!style.sources[layer.source]) return;
boundarySources[layer.source] = JSON.parse(JSON.stringify(style.sources[layer.source]));
boundaryLayers[layer.id] = JSON.parse(JSON.stringify(layer));
});
};
window.restoreDashboardViewOverlays = function(mapObj) {
if (!styleReady(mapObj)) {
if (mapObj && mapObj.once) mapObj.once('idle', function() {
if (mapRef === mapObj) window.restoreDashboardViewOverlays(mapObj);
});
return;
}
Object.keys(boundarySources).forEach(function(id) {
if (!mapObj.getSource(id)) mapObj.addSource(id, boundarySources[id]);
});
Object.keys(boundaryLayers).forEach(function(id) {
if (mapObj.getLayer(id)) return;
var layer = JSON.parse(JSON.stringify(boundaryLayers[id]));
layer.layout = layer.layout || {};
layer.layout.visibility = typeof tambonBoundaryVisible !== 'undefined' && tambonBoundaryVisible ? 'visible' : 'none';
mapObj.addLayer(layer);
});
// Restore existing objects only; do not recreate markers, refetch backend,
// fitBounds, flyTo or restore a stale snapshot of removed incident features.
var overlays = [].concat(
typeof otherMarkers !== 'undefined' ? otherMarkers : [],
typeof zoneCircles !== 'undefined' ? zoneCircles : [],
window._icOCZoneOverlays || [], window._icOCZoneCircles || [],
window._icOCReqAlertOverlays || [], window._incidentSpecialMapOverlays || [],
typeof hazmatZoneOverlays !== 'undefined' ? hazmatZoneOverlays : [],
typeof dynamicOverlay !== 'undefined' && dynamicOverlay ? [dynamicOverlay] : []
);
var seen = new Set();
overlays.forEach(function(overlay) {
if (!overlay || seen.has(overlay) || typeof overlay._addToMap !== 'function') return;
seen.add(overlay);
overlay._addToMap(mapObj);
});
};
window.attachDashboardMapModes = function(mapObj) {
if (!mapObj || mapRef === mapObj) return;
mapRef = mapObj;
generation++;
clearRefresh();
mode = window._dashboardMapStyle || 'satellite';
mapObj.on('style.load', function() {
if (mapRef !== mapObj) return;
window.restoreDashboardViewOverlays(mapObj);
if (trafficVisible) renderTraffic();
window.syncDashboardMapModeUI();
});
mapObj.on('error', function(event) {
if (mapRef !== mapObj || !trafficVisible || !event || event.sourceId !== SOURCE) return;
trafficStatus = 'ไทล์จราจรบางส่วนโหลดไม่ได้ / อาจไม่ครบ ดู Longdo โดยตรงประกอบ';
window.syncDashboardMapModeUI();
});
window.syncDashboardMapModeUI();
if (trafficVisible && styleReady(mapObj)) renderTraffic();
};
document.addEventListener('click', function(event) {
var menu = document.getElementById('dashMapLayerMenu');
if (menu && menu.open && !menu.contains(event.target)) menu.open = false;
});
document.addEventListener('keydown', function(event) {
if (event.key !== 'Escape') return;
var menu = document.getElementById('dashMapLayerMenu');
if (menu) menu.open = false;
});
window.syncDashboardMapModeUI();
if (typeof dashMap !== 'undefined' && dashMap && dashMap._maptiler) window.attachDashboardMapModes(dashMap._maptiler);
})();
