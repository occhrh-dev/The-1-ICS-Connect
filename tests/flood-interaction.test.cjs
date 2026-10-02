const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const root = path.resolve(__dirname, '..');
const script = fs.readFileSync(path.join(root, 'script2.js'), 'utf8');
const mapCode = fs.readFileSync(path.join(root, 'script3.js'), 'utf8');
const css = fs.readFileSync(path.join(root, 'dashboard-layout.css'), 'utf8');
const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
function extract(name) {
  const start = script.indexOf('function ' + name + '(');
  assert.notEqual(start, -1);
  const end = script.indexOf(name === 'ensureFloodLegendInteraction' ? '\nfunction toggleFloodMapLayer(' : '\nfunction ', start + 1);
  return script.slice(start, end < 0 ? script.length : end);
}

// Dragging releases bottom/right anchors, freezes width and only changes x/y.
assert.doesNotMatch(css, /#dash_flood_legend\s*\{[^}]*bottom:[^}]*!important/);
assert.match(html, /id="dash_flood_legend"[^>]*bottom:30px/);
const legendEvents = {}, documentEvents = {};
const parent = {clientWidth:800,clientHeight:550,getBoundingClientRect:()=>({left:100,top:150})};
const legend = {
  dataset:{}, style:{}, offsetParent:parent, offsetWidth:220, offsetHeight:90,
  getBoundingClientRect:()=>({left:660,top:580,width:220,height:90}),
  addEventListener(name,fn){(legendEvents[name] ||= []).push(fn);},
  setPointerCapture(id){this.captured=id;},
  releasePointerCapture(id){assert.equal(id,this.captured);this.captured=null;}
};
const documentMock = {
  getElementById:()=>legend,
  addEventListener(name,fn){documentEvents[name]=fn;},
  removeEventListener(name,fn){assert.equal(documentEvents[name],fn);delete documentEvents[name];}
};
const dragContext = vm.createContext({document:documentMock});
vm.runInContext(extract('ensureFloodLegendInteraction'),dragContext);
dragContext.ensureFloodLegendInteraction();dragContext.ensureFloodLegendInteraction();
assert.equal(legendEvents.pointerdown.length,1,'No duplicate drag handlers on refresh');
const handle = {closest:selector=>selector==='button'?null:{}};
const down = (target=handle,button=0)=>({target,button,pointerId:7,clientX:680,clientY:590,preventDefault(){this.prevented=true;},stopPropagation(){this.stopped=true;}});
legendEvents.pointerdown[0](down({closest:()=>({})}));
assert.equal(Object.keys(documentEvents).length,0,'Collapse button cannot start a drag');
legendEvents.pointerdown[0](down(handle,2));
assert.equal(Object.keys(documentEvents).length,0,'Right-click cannot drag');
const event=down();legendEvents.pointerdown[0](event);
assert.equal(legend.style.bottom,'auto');assert.equal(legend.style.right,'auto');
assert.equal(legend.style.width,'220px');
assert.equal(legend.style.top,'430px');assert.equal(legend.style.left,'560px');
assert.ok(event.prevented && event.stopped);
documentEvents.pointermove({pointerId:9,clientX:0,clientY:0});
assert.equal(legend.style.left,'560px','Other pointers do not move the widget');
documentEvents.pointermove({pointerId:7,clientX:350,clientY:300});
assert.equal(legend.style.left,'230px');assert.equal(legend.style.top,'140px');
assert.equal(legend.style.width,'220px');assert.equal(legend.style.height,undefined);
documentEvents.pointermove({pointerId:7,clientX:9999,clientY:9999});
assert.equal(legend.style.left,'580px');assert.equal(legend.style.top,'460px');
documentEvents.pointerup({pointerId:9});assert.ok(documentEvents.pointermove);
documentEvents.pointerup({pointerId:7});
assert.equal(Object.keys(documentEvents).length,0);assert.equal(legend.captured,null);
legendEvents.pointerdown[0](down());documentEvents.pointercancel({pointerId:7});
assert.equal(Object.keys(documentEvents).length,0,'Cancel cleans up the drag');

// One click handler looks up only current visible flood layers after refresh.
let clickHandler, registrations=0, queryCount=0, hits=[], queryOptions;
const existingLayers = new Set(['area-a-fill','area-a-line','area-b-fill']);
const map = {
  on(name,fn){assert.equal(name,'click');clickHandler=fn;registrations++;},
  getLayer:id=>existingLayers.has(id), isStyleLoaded:()=>true,
  queryRenderedFeatures(point,options){queryCount++;queryOptions=options;return hits;}
};
function label(name) {
  const target={name};
  const popup={opens:0,closes:0,setLngLat(p){this.position=p;return this;},addTo(m){assert.equal(m,map);this.opens++;return this;},remove(){this.closes++;return this;}};
  return {target,_dashboardHtmlElement:{contains:t=>t===target},_dashboardPopup:popup};
}
const a=label('a'),b=label('b');
const state={_incidentSpecialMapRecords:{
  'flood:a':{overlays:[{_layerIds:['area-a-fill','area-a-line']},a]},
  'flood:b':{overlays:[{_layerIds:['area-b-fill']},b]},
  'road:c':{overlays:[{_layerIds:['road-line']}]}
}};
const popupContext=vm.createContext({window:state,dashMap:{_maptiler:map}});
vm.runInContext(extract('ensureDashboardFloodAreaInteraction'),popupContext);
popupContext.ensureDashboardFloodAreaInteraction();popupContext.ensureDashboardFloodAreaInteraction();
assert.equal(registrations,1,'Style switches/refresh cannot bind duplicate clicks');
const click={point:{x:20,y:30},lngLat:{lng:101.2,lat:12.7},originalEvent:{target:{closest:()=>null}}};
hits=[{layer:{id:'area-a-fill'}}];clickHandler(click);
assert.equal(a._dashboardPopup.opens,1);assert.equal(b._dashboardPopup.opens,0);
assert.equal(a._dashboardPopup.position,click.lngLat);
assert.deepEqual(Array.from(queryOptions.layers),['area-a-fill','area-a-line','area-b-fill']);
hits=[{layer:{id:'area-b-fill'}},{layer:{id:'area-a-fill'}}];clickHandler(click);
assert.equal(b._dashboardPopup.opens,1,'Topmost rendered area wins at an overlap');
assert.ok(a._dashboardPopup.closes>0);
hits=[{layer:{id:'area-a-line'}}];clickHandler(click);
assert.equal(a._dashboardPopup.opens,2,'Outline clicks work too');
const before=queryCount;
clickHandler({...click,originalEvent:{target:a.target}});
assert.equal(queryCount,before);assert.equal(a._dashboardPopup.opens,2,'Label click is not toggled twice');
clickHandler({...click,originalEvent:{target:{closest:()=>({})}}});
assert.equal(queryCount,before,'Popup content is not treated as another area click');
clickHandler({...click,originalEvent:{target:{closest:selector=>selector.includes('-marker')?{}:null}}});
assert.equal(queryCount,before,'An incident/EOC/operational marker cannot open an area beneath it');
hits=[];clickHandler(click);
assert.equal(a._dashboardPopup.opens,2,'No hit means no popup even inside a bounding box');
existingLayers.clear();clickHandler(click);
assert.equal(queryCount,before+1,'Removed/style-pending layers cannot be queried');
const c=label('new');existingLayers.add('new-fill');
state._incidentSpecialMapRecords={'flood:new':{overlays:[{_layerIds:['new-fill']},c]}};
hits=[{layer:{id:'new-fill'}}];clickHandler(click);
assert.equal(c._dashboardPopup.opens,1,'Handler reads the new registry, not stale areas');

popupContext.roleSafeText=s=>String(s).replace(/</g,'&lt;').replace(/>/g,'&gt;');
popupContext.getFloodAreaDepthText=area=>area.depthCm==null?'ระดับน้ำ: ไม่มีข้อมูล':'ระดับน้ำ: '+area.depthCm+' ซม.';
vm.runInContext(extract('getFloodAreaDetailHtml'),popupContext);
assert.match(popupContext.getFloodAreaDetailHtml({name:'<img>',severity:'severe',depthCm:100}),/&lt;img&gt;.*รุนแรง\/อันตราย.*100 ซม\./);
assert.match(popupContext.getFloodAreaDetailHtml({name:'เดิม',severity:'monitor'}),/เฝ้าระวัง.*ไม่มีข้อมูล/);
assert.match(script,/popupOptions:\{closeOnClick:false\}/,'Repeated area clicks cannot close their newly opened popup');
assert.match(mapCode,/new maptilersdk\.Popup\(Object\.assign\(\{ offset:18 \}, options\.popupOptions \|\| \{\}\)\)/);
assert.doesNotMatch(extract('ensureDashboardFloodAreaInteraction'),/google\.script|supabase|fitBounds|flyTo|setStyle/,'Viewing an area cannot write data or change the camera');
console.log('PASS: fixed-size drag, bounds, pointer cleanup, one popup handler, actual visible fill/outline hit testing, overlap order, refresh/style retention, escaped details and no data writes');
