// Public reference only. Camera moves only on explicit province/near-me actions.
(function() {
'use strict';
var ENDPOINT = 'https://the-1-ics-gistda-flood.occ-hrh.workers.dev/flood';
var SOURCE = 'ics-gistda-flood';
var FILL = SOURCE + '-fill', LINE = SOURCE + '-line';
var mapRef = null, enabled = false, days = 1, version = 0;
var province = window.gistdaProvinces ? 'all' : '21', selectionVersion=0, initialChecked=false, geoBusy=false;
var TILE_SOURCE=SOURCE+'-tiles', TILE_LAYER=TILE_SOURCE+'-layer', tilePeriod=null;
var countryExpired=false;
var provinceTiles=false,tileBounds=null;
var data = null, controller = null, popup = null, loading = false;
var memory = {}, failureUntil = {}, timer = null, expiryTimer = null;
var status = 'ยังไม่เปิดน้ำท่วม GISTDA · เลือกจังหวัดหรือทั่วประเทศได้';
function provinceName(){var p=(window.gistdaProvinces||[]).find(function(p){return p.id===province;});return province==='all'?'ทั่วประเทศ':p?p.name:'ระยอง';}
function tileOff(){
if(!ready(mapRef))return;
if(mapRef.getLayer(TILE_LAYER))mapRef.removeLayer(TILE_LAYER);
if(mapRef.getSource(TILE_SOURCE))mapRef.removeSource(TILE_SOURCE);
tilePeriod=null;
}
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
var area=document.getElementById('dashExternalFloodProvince');
if(area){area.value=province;area.disabled=!enabled;}
var geo=document.getElementById('dashExternalFloodNearMe');
if(geo)geo.disabled=geoBusy;
var notice = document.getElementById('dashExternalFloodMapNotice');
if (notice) {
notice.style.display = enabled ? 'block' : 'none';
notice.textContent = 'GISTDA · '+provinceName()+' · ย้อนหลัง ' + days + ' วัน · ' + (loading ? 'กำลังโหลด' : (province==='all'||provinceTiles)?(countryExpired?'หมดอายุ กดตรวจข้อมูล':'ภาพรวมย้อนหลัง ไม่ใช่ภาพสด'):!data ? 'ยังไม่แสดงข้อมูล' : data.features.length ? 'ไม่ใช่สถานการณ์ปัจจุบัน' : 'ไม่พบข้อมูล ไม่ได้แปลว่าไม่ท่วม');
}
text('dashExternalFloodSourceStatus', status);
text('dashExternalFloodBadge', enabled ? 'ย้อนหลัง ' + days + ' วัน' : 'GISTDA');
window.dashboardExternalFloodLabel = enabled ? 'น้ำท่วม GISTDA '+provinceName()+' ย้อนหลัง ' + days + ' วัน' : 'ปิดน้ำท่วม GISTDA';
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
if(enabled && (province==='all'||provinceTiles)){
if(source)source.setData(empty());
if(countryExpired){tileOff();return;}
if(tilePeriod!==province+':'+days || !m.getSource(TILE_SOURCE)){
tileOff();
m.addSource(TILE_SOURCE,{type:'raster',tiles:[ENDPOINT.replace('/flood','')+'/tiles/'+days+'/{z}/{x}/{y}.png'],tileSize:512,
minzoom:0,maxzoom:12,bounds:provinceTiles&&tileBounds?tileBounds:[97,5,106,21],attribution:'GISTDA · น้ำท่วมย้อนหลัง'});
var beforeTile=(m.getStyle().layers||[]).find(function(l){return /^(ics-gistda-flood-fill|mt-(polygon|line|circle)-|tambon-(fill|line)-)/.test(l.id);});
m.addLayer({id:TILE_LAYER,type:'raster',source:TILE_SOURCE,paint:{'raster-opacity':0.65,'raster-fade-duration':0}},beforeTile&&beforeTile.id);
tilePeriod=province+':'+days;
}return;
}
tileOff();
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
return provinceName()+' · ย้อนหลัง ' + days + ' วัน · ' + result.features.length +
' ชิ้นขอบเขต (ไม่ใช่จำนวนเหตุ) · ดึงข้อมูล ' + label + ' ไม่ใช่เวลาภาพดาวเทียม' +
(result.features.length ? '' : ' · ไม่พบข้อมูล ไม่ได้แปลว่าไม่มีน้ำท่วม');
}
function validate(result, requestedDays, requestedProvince) {
if (!result || result.type !== 'FeatureCollection' || !Array.isArray(result.features) ||
!result.meta || result.meta.complete !== true || result.meta.provinceId !== requestedProvince ||
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
closePopup(); data = null; provinceTiles=false; render();
status = 'ข้อมูลที่พักไว้หมดอายุ กดตรวจข้อมูลเพื่อดึงใหม่ · ไม่แสดงขอบเขตเก่าเป็นข้อมูลล่าสุด'; sync();
}, Math.max(1, until - Date.now()));
}
async function load() {
var mine = ++version, requestedDays = days, requestedProvince=province, scope=province+':'+days;
if (controller) controller.abort();
if (timer) clearTimeout(timer);
if (expiryTimer) clearTimeout(expiryTimer);
expiryTimer = null;
controller = null; timer = null;
closePopup(); data = null; provinceTiles=false; render();
if (!enabled) { loading = false; status = 'ยังไม่เปิดน้ำท่วม GISTDA · เลือกจังหวัดหรือทั่วประเทศได้'; sync(); return; }
if(province==='all'){
countryExpired=false;loading=false;status='ภาพรวมประเทศย้อนหลัง '+days+' วัน · โหลดภาพไทล์เฉพาะบริเวณที่ดู · เลือกจังหวัดเพื่อกดรายละเอียดขอบเขต · ไม่มีสีไม่ได้แปลว่าไม่ท่วม';render();sync();
expiryTimer=setTimeout(expireTiles,3600000);return;
}
var cached = memory[scope];
if (cached && cached.until > Date.now()) {
data = cached.data; loading = false; status = describe(data); expireAt(cached.until); render(); sync(); return;
}
if (failureUntil[scope] > Date.now()) {
loading = false; status = 'โหลดไม่ได้ กรุณารอสักครู่แล้วลองใหม่ · ยังไม่แสดงขอบเขต GISTDA'; sync(); return;
}
loading = true; status = 'กำลังโหลดน้ำท่วม'+provinceName()+'ย้อนหลัง ' + days + ' วัน…'; sync();
var own = new AbortController(); controller = own;
timer = setTimeout(function() { own.abort(); }, 35000);
try {
var response = await fetch(ENDPOINT + '?days=' + requestedDays+'&province='+requestedProvince, {credentials:'omit',cache:'no-store',signal:own.signal});
var result = await response.json();
if (!response.ok) throw new Error(result.error || 'UPSTREAM_UNAVAILABLE');
result = validate(result, requestedDays,requestedProvince);
if (!enabled || mine !== version) return;
// Cache age starts at server retrieval, not browser load time.
var ttl = result.features.length ? 3600000 : 900000;
var retrieved = Date.parse(result.meta.retrievedAt);
if (!Number.isFinite(retrieved) || Date.now() - retrieved > ttl + 60000) throw new Error('STALE_DATA');
memory[scope] = {data:result,until:retrieved + ttl};
if(Object.keys(memory).length>6)delete memory[Object.keys(memory)[0]];
data = result; status = describe(result); expireAt(retrieved + ttl); render();
} catch(error) {
if (!enabled || mine !== version) return;
if(error.message==='DATA_TOO_LARGE'&&window.gistdaProvinceBounds){
try{
var bounds=await window.gistdaProvinceBounds(requestedProvince);
if(!enabled||mine!==version)return;
if(bounds){provinceTiles=true;tileBounds=bounds;countryExpired=false;status=provinceName()+' · ขอบเขตจำนวนมาก ใช้ภาพไทล์ย้อนหลัง '+days+' วันแทน · อาจเห็นพื้นที่ข้างเคียง ไม่ใช่การตัดตามแนวจังหวัด · ยังไม่เปิดรายละเอียดรายขอบเขต';render();expiryTimer=setTimeout(expireTiles,3600000);return;}
}catch(_){}
}
failureUntil[scope] = Date.now() + 60000;
var message = error.message === 'NOT_CONFIGURED' ? 'ยังไม่ได้ตั้งคีย์ GISTDA ที่ตัวเชื่อม' :
error.message === 'KEY_REJECTED' ? 'GISTDA ไม่ยอมรับคีย์ กรุณาตรวจสิทธิ์' :
error.message === 'DATA_TOO_LARGE' ? 'ข้อมูลจังหวัดมากเกินขีดจำกัด กรุณาเลือกทั่วประเทศเพื่อดูภาพไทล์ · ยังไม่แสดงชุดข้อมูลที่ไม่ครบ' :
error.message === 'STALE_DATA' ? 'ข้อมูลที่ได้รับเก่าเกินช่วงพักข้อมูล กรุณาลองใหม่' : 'โหลด GISTDA ไม่สำเร็จ กรุณาลองใหม่ภายหลัง';
status = message + ' · จุดและพื้นที่หน้างานเดิมยังใช้งานได้';
} finally {
if (mine === version) {
clearTimeout(timer); timer = null; controller = null; loading = false; sync();
}
}
}
function expireTiles(){if(enabled&&(province==='all'||provinceTiles)){countryExpired=true;render();status='ไทล์ที่พักไว้หมดอายุ กดตรวจข้อมูลเพื่อโหลดใหม่';sync();}}
window.setDashboardExternalFloodLayer = function(visible) { enabled = !!visible; load(); };
window.setDashboardExternalFloodPeriod = function(value) {
var next = Number(value);
if ([1,7,30].indexOf(next) < 0 || next === days) return;
days = next; if (enabled) load(); else sync();
};
window.refreshDashboardExternalFlood = function() { if (enabled && !loading) load(); };
window.setDashboardExternalFloodProvince=async function(value){
if(value!=='all'&&!(window.gistdaProvinces||[]).some(function(p){return p.id===value;}))return;
var choice=++selectionVersion;province=value;sync();if(enabled)load();
try{localStorage.setItem('ics-gistda-province',value);}catch(_){}
// Only an explicit province choice moves the camera, never period/style/polling.
if(!mapRef)return;
if(value==='all'){mapRef.fitBounds([[97,5.5],[106,20.6]],{padding:30,duration:700});return;}
try{var b=await window.gistdaProvinceBounds(value);if(b&&choice===selectionVersion&&mapRef)mapRef.fitBounds([[b[0],b[1]],[b[2],b[3]]],{padding:35,duration:700});}catch(_){text('dashExternalFloodLocationStatus','เลื่อนแผนที่ไปจังหวัดไม่ได้ แต่ข้อมูลน้ำท่วมยังโหลดได้');}
};
async function chooseIncidentProvince(){
if(initialChecked||selectionVersion||!window.gistdaProvinceAt||typeof incidentCenter==='undefined'||!incidentCenter.lat||!incidentCenter.lng)return;
initialChecked=true;var mine=selectionVersion;
try{var p=await window.gistdaProvinceAt(Number(incidentCenter.lng),Number(incidentCenter.lat));
if(mine!==selectionVersion)return;
if(p){province=p.id;sync();if(enabled)load();text('dashExternalFloodLocationStatus','เริ่มที่จังหวัดของจุดเกิดเหตุ: '+p.name);}
else text('dashExternalFloodLocationStatus','ระบุจังหวัดของเหตุไม่ได้ เลือกจังหวัดได้เอง');
}catch(_){text('dashExternalFloodLocationStatus','หาจังหวัดของเหตุไม่ได้ เลือกจังหวัดได้เอง');}
}
window.showDashboardFloodNearMe=function(){
if(geoBusy)return;
if(typeof navigator==='undefined'||!navigator.geolocation){text('dashExternalFloodLocationStatus','อุปกรณ์นี้ไม่รองรับตำแหน่ง เลือกจังหวัดได้เอง');return;}
var mine=++selectionVersion;geoBusy=true;sync();text('dashExternalFloodLocationStatus','กำลังขอตำแหน่ง · ไม่บันทึกพิกัดลงระบบเหตุ');
navigator.geolocation.getCurrentPosition(async function(position){
try{
var lng=position.coords.longitude,lat=position.coords.latitude;
if(!Number.isFinite(lng)||!Number.isFinite(lat))throw Error('LOCATION');
var p=await window.gistdaProvinceAt(lng,lat);if(mine!==selectionVersion)return;
if(!p){text('dashExternalFloodLocationStatus','ระบุจังหวัดจากตำแหน่งไม่ได้หรืออยู่นอกไทย เลือกจังหวัดได้เอง');return;}
province=p.id;sync();if(enabled)load();
if(mapRef)mapRef.flyTo({center:[lng,lat],zoom:12,duration:700});
text('dashExternalFloodLocationStatus','ใกล้ฉัน: '+p.name+' · คลาดเคลื่อนประมาณ '+Math.round(position.coords.accuracy||0)+' ม. · เปลี่ยนจังหวัดได้เอง');
}catch(_){if(mine===selectionVersion)text('dashExternalFloodLocationStatus','อ่านตำแหน่งไม่ได้ เลือกจังหวัดได้เอง');}
finally{geoBusy=false;sync();}
},function(){geoBusy=false;sync();if(mine===selectionVersion)text('dashExternalFloodLocationStatus','ไม่อนุญาตหรืออ่านตำแหน่งไม่ได้ เลือกจังหวัดได้เอง');},
{enableHighAccuracy:false,timeout:12000,maximumAge:60000});
};
window.restoreDashboardExternalFlood = function() { render(); };
window.attachDashboardExternalFlood = function(mapObj) {
if (!mapObj || mapRef === mapObj) return;
closePopup(); mapRef = mapObj;
chooseIncidentProvince();
mapObj.on('idle',chooseIncidentProvince);
mapObj.on('style.load', function() { if (mapRef === mapObj) render(); });
mapObj.on('click', function(event) { if (mapRef === mapObj) showDetail(event); });
mapObj.on('error', function(event) {
if (mapRef === mapObj && enabled && event && (event.sourceId === SOURCE || event.sourceId === TILE_SOURCE)) {
status = 'ขอบเขต GISTDA แสดงผลไม่สำเร็จ / อาจไม่ครบ · ใช้รายงานหน้างานประกอบ'; sync();
}
});
render();
};
var areaSelect=document.getElementById('dashExternalFloodProvince');
if(areaSelect&&window.gistdaProvinces){
window.gistdaProvinces.forEach(function(p){var option=document.createElement('option');option.value=p.id;option.textContent=p.name;areaSelect.appendChild(option);});
try{var stored=localStorage.getItem('ics-gistda-province');if(stored==='all'||window.gistdaProvinces.some(function(p){return p.id===stored;}))province=stored;}catch(_){}
}
sync();
if (typeof dashMap !== 'undefined' && dashMap && dashMap._maptiler) window.attachDashboardExternalFlood(dashMap._maptiler);
})();
