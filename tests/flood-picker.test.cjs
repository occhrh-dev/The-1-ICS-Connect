const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const root = path.join(__dirname, '..');
const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
const script2 = fs.readFileSync(path.join(root, 'script2.js'), 'utf8');
function extract(source, name) {
  const start = source.indexOf('function ' + name + '(');
  assert.notEqual(start, -1, 'Missing function ' + name);
  const next = source.indexOf('\nfunction ', start + 1);
  return source.slice(start, next < 0 ? source.length : next);
}
const pickerNames = ['initLongdoMap','setPickerMapStyle','getPickerFloodStyle','setPickerFloodReferenceAreas','clearPickerFloodReferenceAreas','renderPickerFloodReferenceAreas','makePickerFloodPolygonOverlay','updatePickerFloodTools','clearPickerFloodVertexMarkers','renderPickerFloodVertexMarkers','renderPickerFloodDraft','addPickerFloodVertex','undoPickerFloodVertex','clearPickerFloodDraft','getPickerFloodCentroid','focusFloodAreaReferenceOnPicker','focusRoadClosureStartOnPicker','makePickerHtmlMarker','renderPickerMapContext','initializePickerMapView','configureMapPickerUI','openFloodAreaMapPicker','openRoadClosureMapPicker','openMap','closeMap','confirmMap'];
const markerNames = ['parseFloodAreaMarker','getZoneMarkerType','getFloodMarkerId'];
const code = pickerNames.map(name => extract(html,name)).concat(markerNames.map(name=>extract(script2,name))).join('\n');
module.exports = { html, code };

if (require.main === module) {
  for (const match of html.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/gi)) {
    if (!/\bsrc\s*=/.test(match[1]) && match[2].trim()) new vm.Script(match[2]);
  }
  const elements = {};
  const element = id => elements[id] ||= { style:{}, classList:{toggle(){},remove(){},contains(){return false;}}, addEventListener(){}, innerHTML:'', textContent:'' };
  element('modal_MapPicker').style.display = 'flex';
  const events = {}, sources = {}, layers = {}, calls = { camera:0, fits:[], sourceUpdates:0 };
  const mockMap = {
    zoomValue:16, center:{lng:101.25,lat:12.7},
    on(event,callback){ (events[event] ||= []).push(callback); },
    once(){}, addControl(){}, resize(){}, loaded(){return true;}, isStyleLoaded(){return true;},
    getZoom(){return this.zoomValue;}, getCenter(){return this.center;},
    flyTo(options){calls.camera++; if(options.zoom!=null)this.zoomValue=options.zoom; if(options.center)this.center={lng:options.center[0],lat:options.center[1]};},
    easeTo(options){this.flyTo(options);}, setZoom(zoom){calls.camera++;this.zoomValue=zoom;}, setCenter(center){calls.camera++;this.center={lng:center[0],lat:center[1]};},
    fitBounds(bounds,options){calls.camera++;calls.fits.push({bounds,options});},
    getSource(id){return sources[id];}, addSource(id,options){sources[id]={data:options.data,setData(data){calls.sourceUpdates++;this.data=data;}}; (events.styledata||[]).forEach(fn=>fn());}, removeSource(id){delete sources[id]; (events.styledata||[]).forEach(fn=>fn());},
    getLayer(id){return layers[id];}, addLayer(layer){layers[layer.id]=layer; (events.styledata||[]).forEach(fn=>fn());}, removeLayer(id){delete layers[id]; (events.styledata||[]).forEach(fn=>fn());}, setStyle(){Object.keys(layers).forEach(id=>delete layers[id]);Object.keys(sources).forEach(id=>delete sources[id]);}
  };
  const marker = class { setLngLat(position){this.position=position;return this;} addTo(){return this;} remove(){} on(){} };
  const timers = [];
  const context = vm.createContext({
    window:{}, document:{getElementById:element,createElement:()=>element('new-element')}, console,
    map:null, marker:null, MAPTILER_API_KEY:'test', pickerIncidentMarker:null, pickerErgOverlays:[],pickerZoneOverlays:[],pickerSearchMarkers:[],
    mapPickerMode:'flood-area',mapPickLockToCurrent:false,pickerFloodVertices:[],pickerFloodDraftOverlay:null,pickerRoadStartMarker:null,pickerFloodVertexMarkers:[],
    pickerFloodReferenceAreas:[],pickerFloodReferenceSignature:'',pickerFloodReferenceRendering:false,pickerViewInitialized:false,pickerOpenSequence:0,tempLat:'',tempLng:'',
    maptilersdk:{config:{},Map:class {constructor(){return mockMap;}},Marker:marker,NavigationControl:class{},MapStyle:{HYBRID:'hybrid',STREETS:'streets'}},
    getIncidentLngLat:()=>({lon:101.25,lat:12.7}),getDeclareIncidentFormLngLat:()=>null,getEOCFormLngLat:()=>null,
    clearPickerErgOverlays(){},clearPickerZoneOverlays(){},clearPickerSearchMarkers(){},toggleMapFullscreen(){},
    showIncidentOnPickerMap(){},showERGOnPickerMap(){},renderExistingZoneMarkersOnPickerMap(){},fetchPickerERGStateIfNeeded(){},
    setTimeout:callback=>timers.push(callback),_loadLongdoScript_:callback=>callback()
  });
  vm.runInContext(code,context);
  context.initLongdoMap();
  const a = {name:'พื้นที่เดิม',severity:'severe',points:[[101.24,12.69],[101.26,12.69],[101.26,12.71]]};
  const original = JSON.stringify(a);
  context.setPickerFloodReferenceAreas({referenceAreas:[a]});
  context.renderPickerMapContext(true);
  assert.equal(sources['picker-flood-reference'].data.features.length,2);
  assert.equal(sources['picker-flood-reference'].data.features[0].properties.fill,'#ef4444');
  assert.deepEqual(sources['picker-flood-reference'].data.features[0].geometry.coordinates[0][0],sources['picker-flood-reference'].data.features[0].geometry.coordinates[0].at(-1));
  assert.equal(JSON.stringify(a),original);
  a.points[0][0] = 100;
  assert.equal(context.pickerFloodReferenceAreas[0].points[0][0],101.24,'Reference geometry must be a snapshot');
  context.initializePickerMapView();
  assert.equal(context.pickerFloodVertices.length,0,'Opening must not add a vertex');
  const cameraCount = calls.camera;
  mockMap.zoomValue=11;
  for(let i=0;i<5;i++) { (events.idle||[]).forEach(fn=>fn());context.renderPickerMapContext(true); }
  assert.equal(mockMap.zoomValue,11,'Idle/refresh must preserve user zoom');
  assert.equal(calls.camera,cameraCount);
  assert.equal(calls.sourceUpdates,0,'Unchanged reference data must not be replaced');
  context.setPickerMapStyle('satellite');
  assert.equal(mockMap.zoomValue,11,'Satellite switching must preserve drawing zoom');
  (events.styledata||[]).forEach(fn=>fn());
  assert.ok(layers['picker-flood-reference-fill'],'References must survive a style switch');
  const saved = [{id:'a',type:'FloodArea',note:{kind:'floodArea',...a}},{id:'b',type:'FloodArea',note:{kind:'floodArea',name:'พื้นที่สอง',severity:'moderate',points:[[101.27,12.7],[101.28,12.7],[101.28,12.71]]}}];
  context.setPickerFloodReferenceAreas({referenceMarkers:saved,excludeAreaId:'a'});
  assert.equal(context.pickerFloodReferenceAreas.length,1,'Exclude only the adjusted area');
  context.pickerFloodVertices=[[101.24,12.69],[101.26,12.69],[101.26,12.71]];
  context.pickerViewInitialized=false;
  context.initializePickerMapView();
  assert.equal(JSON.stringify(calls.fits.at(-1).bounds),'[[101.24,12.69],[101.26,12.71]]');
  assert.equal(calls.fits.at(-1).options.padding,60);
  context.pickerFloodVertices=[];
  context.window._mapPickerContext={focusPoints:[[101.1,12.6],[101.4,12.9],[101.3,12.8]]};
  context.pickerViewInitialized=false; context.initializePickerMapView();
  assert.equal(JSON.stringify(calls.fits.at(-1).bounds),'[[101.1,12.6],[101.4,12.9]]','Redraw must frame original boundary');
  context.renderPickerFloodDraft();
  context.addPickerFloodVertex(101.2,12.7);
  assert.equal(context.pickerFloodDraftOverlay,null,'First click must not draw a line');
  context.addPickerFloodVertex(101.21,12.7);
  assert.ok(context.pickerFloodDraftOverlay);
  let confirmations=0;
  context.openFloodAreaMapPicker(()=>confirmations++,[],{referenceAreas:[a]});
  context.closeMap();
  const cameraBeforeClose=calls.camera;
  timers.splice(0).forEach(fn=>fn());
  assert.equal(confirmations,0,'Cancel must not save');
  assert.equal(calls.camera,cameraBeforeClose,'A delayed opening callback must not run after cancel');
  assert.equal(sources['picker-flood-reference'],undefined,'Closing must remove reference layers');
  assert.equal(context.pickerFloodVertices.length,0);
  const sourceCount=Object.keys(sources).length;
  let styleReady=false;
  const deferred=[];
  const delayedMap={...mockMap,isStyleLoaded:()=>styleReady,once(event,callback){deferred.push({event,callback});}};
  const cancelledOverlay=context.makePickerFloodPolygonOverlay([[101.2,12.7],[101.21,12.7],[101.21,12.71]]);
  cancelledOverlay._addToMap(delayedMap);
  assert.equal(deferred[0].event,'idle','Draft must wait for loaded sources, not an early styledata event');
  cancelledOverlay._removeFromMap();
  styleReady=true;deferred.splice(0).forEach(item=>item.callback());
  assert.equal(Object.keys(sources).length,sourceCount,'Cancelled delayed polygon must never reappear');
  const visibleOverlay=context.makePickerFloodPolygonOverlay([[101.2,12.7],[101.21,12.7],[101.21,12.71]]);
  styleReady=false;visibleOverlay._addToMap(delayedMap);
  styleReady=true;deferred.splice(0).forEach(item=>item.callback());
  assert.ok(visibleOverlay._layerIds.length,'Draft must render when the map becomes ready');
  visibleOverlay._removeFromMap();
  let confirmed;
  const initial=[[101.2,12.7],[101.21,12.7],[101.21,12.71]];
  context.openFloodAreaMapPicker((points,center)=>{confirmed={points,center};},initial,{referenceAreas:[]});
  context.confirmMap();
  assert.equal(confirmed.points.length,3,'Confirmation must deliver all vertices after closing');
  confirmed.points[0][0]=99;
  assert.equal(initial[0][0],101.2,'Confirmed draft must not mutate existing geometry');
  assert.equal(element('modal_MapPicker').style.display,'none');
  console.log('PASS: inline syntax, references, style reload, stable zoom, framing, first click, cancel, delayed layers and confirmation');
}
