// Checkbox metadata uses the existing, agency-scoped zone-marker API.
// No new schema, Worker deployment, local-only storage or historical-data edits.
(function() {
'use strict';
function markerType(marker) { return marker.type || marker.ZoneType || marker.zone_type || ''; }
function readNote(marker) {
var raw = marker.note !== undefined ? marker.note : marker.Note;
try {
var note = typeof raw === 'string' ? JSON.parse(raw) : raw;
return note && typeof note === 'object' && !Array.isArray(note) ? note : null;
} catch(error) { return null; }
}
window.isDashboardFloodIncident = function(markers) {
markers = Array.isArray(markers) ? markers : [];
var settings = markers.filter(function(marker) { return markerType(marker) === 'IncidentPoint'; }).map(readNote);
var primary = settings.find(function(note) { return note && note.primary === true && typeof note.floodEnabled === 'boolean'; });
if (!primary) primary = settings.find(function(note) { return note && typeof note.floodEnabled === 'boolean'; });
if (primary) return primary.floodEnabled;
// Legacy incidents did not persist the checkbox. Preserve access to existing
// saved polygons, but never guess from incident names or map layer selections.
return markers.some(function(marker) { return markerType(marker) === 'FloodArea'; });
};
window.syncDashboardFloodAreaManageVisibility = function(markers) {
if (Array.isArray(markers)) window._dashboardFloodIncidentMarkers = markers;
var enabled = window.isDashboardFloodIncident(window._dashboardFloodIncidentMarkers || window._icZoneMarkers || []);
var button = document.getElementById('dashFloodAreaManageBtn');
if (button) button.style.display = typeof APP_ACCESS_ROLE !== 'undefined' && APP_ACCESS_ROLE === 'admin' && enabled ? 'inline-block' : 'none';
var windPanel = document.getElementById('wind_panel');
if (windPanel) windPanel.style.display = enabled ? 'none' : '';
if (enabled && typeof clearDashWindOverlay === 'function') clearDashWindOverlay();
if (!enabled && window._dashboardWindHiddenForFlood && window._dashboardDisplayedWind && typeof drawWindArrowOnDashMap === 'function') {
drawWindArrowOnDashMap(window._dashboardDisplayedWind.directionDeg, window._dashboardDisplayedWind.speed);
}
window._dashboardWindHiddenForFlood = enabled;
return enabled;
};
window.persistDeclaredFloodSetting = function(enabled, primaryPoint, reporter, accessRole, done) {
var finished = false;
function finish(error) { if (!finished) { finished = true; done(error || null); } }
if (accessRole !== 'admin' || !primaryPoint) { finish(new Error('ไม่พบจุดหลักสำหรับบันทึกประเภทเหตุ')); return; }
try {
google.script.run.withSuccessHandler(function(markers) {
try {
var marker = (Array.isArray(markers) ? markers : []).find(function(item) {
return markerType(item) === 'IncidentPoint' &&
Math.abs(Number(item.lat !== undefined ? item.lat : item.Lat) - Number(primaryPoint.lat)) < 0.0000001 &&
Math.abs(Number(item.lng !== undefined ? item.lng : item.Lng) - Number(primaryPoint.lng)) < 0.0000001 &&
String(item.label || item.Label || '') === String(primaryPoint.label || '');
});
var note = marker && readNote(marker);
var id = marker && (marker.id || marker.markerId || marker.marker_id);
if (!marker || !note || note.kind !== 'incidentPoint' || !id) { finish(new Error('ไม่พบข้อมูลจุดเกิดเหตุหลักที่บันทึกไว้')); return; }
if (note.floodEnabled === !!enabled) { window.syncDashboardFloodAreaManageVisibility(markers); finish(); return; }
// Preserve primary flag, coordinates, label and every existing note property.
note.floodEnabled = !!enabled;
var savedNote = JSON.stringify(note);
google.script.run.withSuccessHandler(function() {
marker.note = savedNote;
window.syncDashboardFloodAreaManageVisibility(markers);
finish();
}).withFailureHandler(finish).updateZoneMarker(id, 'IncidentPoint', marker.label || marker.Label || '',
marker.lat !== undefined ? marker.lat : marker.Lat, marker.lng !== undefined ? marker.lng : marker.Lng,
savedNote, reporter || 'Admin', accessRole);
} catch(error) { finish(error); }
}).withFailureHandler(finish).getZoneMarkers();
} catch(error) { finish(error); }
};
})();
