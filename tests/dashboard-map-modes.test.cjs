const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const root = path.resolve(__dirname, '..');
const source = fs.readFileSync(path.join(root, 'dashboard-map-modes.js'), 'utf8');
const mapCode = fs.readFileSync(path.join(root, 'script3.js'), 'utf8');
const zoneCode = fs.readFileSync(path.join(root, 'script2.js'), 'utf8');
const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
function extract(code, name) {
  const start = code.indexOf('function ' + name + '(');
  const end = code.indexOf(name === 'drawIncidentSpecialMapLayers' ? '\nfunction getFloodLegendTarget(' : '\nfunction ', start + 1);
  return code.slice(start, end < 0 ? code.length : end);
}
function harness(fetchImpl) {
  const elements = new Map();
  const element = id => {
    if (!elements.has(id)) elements.set(id, {id, style:{}, textContent:'', checked:false, setAttribute(name, value) { this[name] = value; }});
    return elements.get(id);
  };
  const events = {}, sources = {}, layers = [];
  const timers = new Map();
  let timerId = 0, changes = 0, restores = 0;
  const appliedStyles=[];
  const road = {_addToMap(map) {
    restores++;
    if (!map.getSource('road-source')) map.addSource('road-source', {type:'geojson',data:{type:'FeatureCollection',features:[]}});
    if (!map.getLayer('mt-line-test-line')) map.addLayer({id:'mt-line-test-line',source:'road-source',type:'line'});
  }};
  const marker = {remove() { throw new Error('Must not remove DOM markers'); }, addTo() { throw new Error('Must not recreate DOM markers'); }};
  const map = {
    ready:true, center:[101.27,12.7], zoom:15,
    on(event, fn) { (events[event] ||= []).push(fn); },
    once(event, fn) { (events[event] ||= []).push(fn); },
    isStyleLoaded() { return this.ready; },
    getSource(id) { return sources[id]; },
    getLayer(id) { return layers.find(layer => layer.id === id); },
    addSource(id, value) { assert.ok(!sources[id], 'No duplicate source'); sources[id] = value; },
    addLayer(layer, before) { assert.ok(!this.getLayer(layer.id), 'No duplicate layer'); const i=layers.findIndex(l=>l.id===before); layers.splice(i<0?layers.length:i,0,layer); },
    removeLayer(id) { const i=layers.findIndex(layer=>layer.id===id); if(i>=0) layers.splice(i,1); },
    removeSource(id) { delete sources[id]; },
    getStyle() { return {layers, sources}; },
    setStyle(style) { changes++; appliedStyles.push(style); Object.keys(sources).forEach(id=>delete sources[id]); layers.length=0; },
    flyTo() { throw new Error('Mode switch must not recenter'); },
    fitBounds() { throw new Error('Mode switch must not refit'); }
  };
  const ctx = vm.createContext({
    window:{_dashboardMapStyle:'satellite', _icOCZoneOverlays:[marker], _incidentSpecialMapOverlays:[road,road]},
    document:{getElementById:element,addEventListener() {},hidden:false},
    dashMap:{_maptiler:map}, otherMarkers:[marker],zoneCircles:[],hazmatZoneOverlays:[],
    maptilersdk:{MapStyle:{HYBRID:'hybrid',SATELLITE:'satellite',STREETS:'streets'}},
    tambonBoundaryVisible:false,
    setTambonBoundaryVisibility(visible) { ctx.tambonBoundaryVisible=visible; },
    toggleFloodMapLayer() { ctx.window._floodLayerVisible = ctx.window._floodLayerVisible === false; },
    fetch:fetchImpl,URL,AbortController,Set,Date,
    setTimeout(fn, ms) { timers.set(++timerId,{fn,ms}); return timerId; },
    clearTimeout(id) { timers.delete(id); }
  });
  vm.runInContext(extract(mapCode,'setDashboardMapStyle'),ctx);
  ctx.setDashboardMapStyle = ctx.setDashboardMapStyle.bind(ctx);
  vm.runInContext(source,ctx);
  Object.assign(ctx,ctx.window);
  return {ctx,map,events,element,timers,changes:()=>changes,restores:()=>restores,road,appliedStyles};
}
const tick = () => new Promise(resolve=>setImmediate(resolve));
const style = {version:8,layers:['forward','reverse'].map(direction=>({id:'traffic-'+direction,source:'traffic','source-layer':'traffic',type:'line',paint:{'line-color':'red'}}))};
const caps = {tiles:['https://msv.longdo.com/maps/traffic/{z}/{x}/{y}.pbf'],minzoom:5,maxzoom:12,bounds:[97,5,105,21]};
const successfulFetch = async(url, options) => {
  assert.ok(url.startsWith('https://msv.longdo.com/'));
  assert.equal(options.credentials,'omit'); assert.equal(options.cache,'no-store');
  return {ok:true,json:async()=>url.includes('/vector/')?style:caps};
};
(async()=>{
  const h=harness(successfulFetch),w=h.ctx.window;
  w.setDashboardBaseLayer('satellite',true); assert.equal(h.changes(),0,'Same base must not reload');
  w.setDashboardBaseLayer('streets',true); assert.equal(h.changes(),1);
  assert.equal(h.appliedStyles.at(-1),'hybrid','Both base checkboxes use real satellite with roads');
  assert.equal(h.element('dashStreetLayerCheck').checked,true);
  assert.equal(h.element('dashSatelliteLayerCheck').checked,true);
  assert.equal(w._floodLayerVisible !== false,true);
  h.events['style.load'].forEach(fn=>fn());
  assert.equal(h.restores(),1,'Restore once per unique object, not DOM markers');
  w.setDashboardTrafficLayer(true); await tick();
  assert.equal(h.changes(),1,'Traffic is an overlay, not another map');
  assert.ok(h.map.getSource('ics-longdo-traffic'));
  assert.equal(h.map.getStyle().layers.at(-1).id,'mt-line-test-line','Closure remains above traffic');
  assert.match(h.element('dashTrafficSourceStatus').textContent,/ไม่ใช่เวลาสำรวจต้นทาง/);
  w.setDashboardTambonLayer(true);
  assert.equal(h.element('dashTambonLayerCheck').checked,true);
  assert.ok(h.map.getSource('ics-longdo-traffic'),'Boundaries independent of traffic');
  w.setDashboardBaseLayer('streets',false); h.events['style.load'].forEach(fn=>fn()); await tick();
  assert.equal(h.appliedStyles.at(-1),'satellite','Satellite alone is imagery, not hybrid');
  assert.ok(h.map.getSource('ics-longdo-traffic'),'Traffic survives base switch');
  assert.equal(h.element('dashTambonLayerCheck').checked,true,'Base switch retains boundary checkbox');
  w.setDashboardBaseLayer('satellite',false); h.events['style.load'].forEach(fn=>fn()); await tick();
  assert.equal(h.appliedStyles.at(-1).layers[0].type,'background','Both bases off means neutral background');
  assert.ok(h.map.getSource('ics-longdo-traffic'),'Can show selected overlays without base');
  w.setDashboardBaseLayer('streets',true); h.events['style.load'].forEach(fn=>fn()); await tick();
  assert.equal(h.appliedStyles.at(-1),'streets','Roads without satellite');
  assert.deepEqual(h.map.center,[101.27,12.7]); assert.equal(h.map.zoom,15);
  const refresh=[...h.timers.values()].find(timer=>timer.ms===180000);
  assert.ok(refresh,'Refresh cadence three minutes');
  h.ctx.document.hidden=true; refresh.fn(); await tick();
  assert.ok(h.map.getSource('ics-longdo-traffic'),'Hidden tab should keep last source, not reload');
  w.setDashboardTrafficLayer(false); assert.equal(h.map.getSource('ics-longdo-traffic'),undefined);
  assert.ok(h.map.getLayer('mt-line-test-line'),'Disabling traffic must not affect closures');

  // A pending provider response must not resurrect a layer that was switched off.
  const pendingResolves=[];
  const pending=harness(()=>new Promise(resolve=>{ pendingResolves.push(resolve); }));
  pending.ctx.window.setDashboardTrafficLayer(true);
  pending.ctx.window.setDashboardTrafficLayer(false);
  pendingResolves.forEach(resolve=>resolve({ok:false})); await tick();
  assert.equal(pending.map.getSource('ics-longdo-traffic'),undefined);

  const failed=harness(async()=>({ok:false}));
  failed.ctx.window.setDashboardTrafficLayer(true); await tick();
  assert.match(failed.element('dashTrafficSourceStatus').textContent,/โหลดจราจรไม่ได้/);
  assert.equal(failed.map.getSource('ics-longdo-traffic'),undefined);
  assert.deepEqual(failed.map.center,[101.27,12.7]);
  const invalid=harness(async url=>({ok:true,json:async()=>url.includes('/vector/')?style:{...caps,tiles:['https://unknown.example/tiles/{z}/{x}/{y}']}}));
  invalid.ctx.window.setDashboardTrafficLayer(true); await tick();
  assert.equal(invalid.map.getSource('ics-longdo-traffic'),undefined,'Reject unexpected provider origins');

  // Source metadata and its one-time handlers survive a base style replacement.
  h.map.addSource('tambon-src-rayong',{type:'geojson',data:{type:'FeatureCollection',features:[]}});
  h.map.addLayer({id:'tambon-line-rayong',type:'line',source:'tambon-src-rayong'});
  w.captureDashboardBoundaryLayers(h.map); h.map.setStyle();
  h.ctx.tambonBoundaryVisible=true; w.restoreDashboardViewOverlays(h.map);
  assert.equal(h.map.getLayer('tambon-line-rayong').layout.visibility,'visible');

  // Water-off must still render a solid red road closure using the real renderer.
  let roadDraws=0;
  const roads=vm.createContext({window:{_floodLayerVisible:false},dashMarker:{},incidentCenter:{},dashMap:{Overlays:{add(){}}},
    getZoneMarkerType:z=>z.type,getFloodMarkerId:z=>z.id,
    parseRoadClosureMarker:z=>({label:'ถนนทดสอบ',points:[[101.2,12.7],[101.21,12.71]]}),
    makeMapTilerLineOverlay:()=>{roadDraws++;return {_map:true};},
    makeLongdoHtmlMarker:()=>({}),removeLongdoOverlay(){},
    getFloodAreaCentroid:()=>({lat:12.7,lng:101.2}),roleSafeText:String});
  vm.runInContext(extract(zoneCode,'drawIncidentSpecialMapLayers'),roads);
  roads.drawIncidentSpecialMapLayers([{id:'road',type:'RoadClosed'}]);
  assert.equal(roadDraws,1,'Closure must not be inside the water-visibility block');
  assert.match(zoneCode,/window\._floodLayerVisible === false && type === 'FloodDepth'/);
  // Removing a not-yet-loaded overlay must cancel its queued idle rendering.
  for(const name of ['makeMapTilerPolygonOverlay','makeMapTilerCircleOverlay','makeMapTilerLineOverlay']) {
    const callbacks=[];
    const m={ready:false,isStyleLoaded(){return this.ready;},once(event,fn){assert.equal(event,'idle');callbacks.push(fn);},addSource(){throw new Error('Removed delayed overlay must not render');}};
    const c=vm.createContext({Date,Math,hexToRgbaColor:value=>value});
    vm.runInContext(extract(name==='makeMapTilerLineOverlay'?zoneCode:mapCode,name),c);
    const overlay=name==='makeMapTilerCircleOverlay'?c[name]({lon:101.2,lat:12.7},100):c[name]([[101.2,12.7],[101.21,12.71],[101.22,12.7]]);
    overlay._addToMap(m);overlay._removeFromMap();m.ready=true;
    callbacks.forEach(fn=>fn());
  }
  assert.match(html,/mapViewControls\.contains\(target\)/);
  const viewControls=html.slice(html.indexOf('<div id="dashMapViewControls"'),html.indexOf('<button id="dashFloodManageBtn"'));
  assert.doesNotMatch(viewControls,/openAdmin|openAddBuilding|google\.script/,'Viewer exemption contains only view actions');
  assert.doesNotMatch(source,/google\.script|supabase\.|localStorage\.setItem|example.*key/i,'Modes cannot write data/keys');
  const checkboxNames=[...viewControls.matchAll(/id="(dash\w+LayerCheck)"/g)].map(m=>m[1]);
  assert.deepEqual(checkboxNames,['dashStreetLayerCheck','dashSatelliteLayerCheck','dashExternalFloodLayerCheck','dashTrafficLayerCheck','dashTambonLayerCheck']);
  assert.doesNotMatch(viewControls,/dashFieldFloodLayerCheck|selectDashboardMapMode/,'External water is never the manual water toggle');
  assert.match(viewControls,/id="dashExternalFloodLayerCheck" type="checkbox" disabled/,'Not connected must not appear to work');
  assert.doesNotMatch(html,/id="dashTambonToggleBtn"/,'No duplicate boundary button');
  assert.equal((html.match(/id="wind_panel"/g)||[]).length,1);
  assert.ok(html.indexOf('id="wind_panel"')<html.indexOf('<div class="dash-map-toolbar">'),'Wind is in heading, not competing with toolbar');
  assert.doesNotMatch(extract(mapCode,'handleTambonAutoShowOnZoom'),/tambonBoundaryVisible\s*=/,'Zoom cannot override checkbox');
  assert.match(fs.readFileSync(path.join(root,'sw.js'),'utf8'),/hostname === 'msv\.longdo\.com'\) return/);
  console.log('PASS: independent base/overlay checkboxes, all 4 base combinations, no camera/marker reset, async cancellation, traffic errors/origin validation, refresh, boundaries, closures, wind placement and viewer-safe controls');
})().catch(error=>{console.error(error);process.exitCode=1;});
