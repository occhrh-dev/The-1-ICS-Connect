const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
const root = path.resolve(__dirname, '..');
const s2 = fs.readFileSync(path.join(root,'script2.js'),'utf8');
const s3 = fs.readFileSync(path.join(root,'script3.js'),'utf8');
function extract(source,name) {
  const start=source.indexOf('function '+name+'(');
  assert.ok(start>=0);
  const end=source.indexOf('\nfunction ',start+1);
  return source.slice(start,end<0?source.length:end);
}
const elements={};
for(const id of ['declare-incident-point-list','show-coords','hidden-lat','hidden-lng','wind_panel','dashFloodAreaManageBtn']) elements[id]={style:{},value:'',innerHTML:'',textContent:''};
const calls={fits:[],add:0,remove:0};
const map={fitBounds(bounds,options){calls.fits.push({bounds,options});},Overlays:{add(){calls.add++;},remove(){calls.remove++;}}};
const ctx=vm.createContext({window:{},document:{getElementById:id=>elements[id]||null},APP_ACCESS_ROLE:'admin',dashMap:map,incidentCenter:{lat:12.7,lng:101.2},roleSafeText:s=>s,renderPendingDeclareFloodReferenceChoices(){},getZoneMarkerType:m=>m.type,getCurrentIncidentKey:()=> 'incident-1',makeLongdoHtmlMarker:()=>({})});
vm.runInContext(fs.readFileSync(path.join(root,'flood-incident-settings.js'),'utf8'),ctx);
vm.runInContext(['renderPendingDeclareIncidentPoints','drawWindArrowOnDashMap','clearDashWindOverlay'].map(n=>extract(s2,n)).join('\n')+'\n'+extract(s3,'fitDashboardIncidentPoints'),ctx);
const points=[{type:'IncidentPoint',label:'A',lat:12.7,lng:101.2},{type:'IncidentPoint',label:'B',lat:12.9,lng:101.6}];
for(const count of [0,1,2,1]) {
  ctx.window._pendingDeclareIncidentPoints=points.slice(0,count);
  ctx.renderPendingDeclareIncidentPoints();
  assert.doesNotMatch(elements['declare-incident-point-list'].innerHTML,/จุดหลัก|พิกัดหลัก|#f97316/);
  assert.doesNotMatch(elements['show-coords'].textContent,/จุดหลัก|พิกัดหลัก/);
  if(count===1) assert.match(elements['declare-incident-point-list'].innerHTML,/fa-fire/);
  if(count===2) { assert.doesNotMatch(elements['declare-incident-point-list'].innerHTML,/fa-fire/);assert.match(elements['show-coords'].textContent,/2 จุด/); }
  assert.equal(elements['hidden-lat'].value,count?12.7:'','Legacy backend reference unchanged');
}
assert.equal(ctx.fitDashboardIncidentPoints(points),true);
assert.equal(calls.fits.length,1);
assert.deepEqual(JSON.parse(JSON.stringify(calls.fits[0].bounds)),[[101.2,12.7],[101.6,12.9]]);
ctx.fitDashboardIncidentPoints([...points].reverse());assert.equal(calls.fits.length,1,'Polling/order changes must not reset zoom');
ctx.window._userInteractingMap=true;ctx.fitDashboardIncidentPoints([...points,{type:'IncidentPoint',lat:13,lng:102}]);assert.equal(calls.fits.length,1,'Respect user zoom/pan');
ctx.window._userInteractingMap=false;ctx.fitDashboardIncidentPoints(points.slice(0,1));assert.equal(calls.fits.length,1);
ctx.fitDashboardIncidentPoints(points);assert.equal(calls.fits.length,2,'Returning to multi-point fits again');
ctx.isDashboardFloodIncident=ctx.window.isDashboardFloodIncident;
const flood=[{...points[0],note:JSON.stringify({floodEnabled:true})}];
ctx.window._dashWindOverlays=[{}];
ctx.window.syncDashboardFloodAreaManageVisibility(flood);
assert.equal(elements.wind_panel.style.display,'none');assert.equal(calls.remove,1);
ctx.drawWindArrowOnDashMap(90,4);assert.equal(calls.add,0,'Updates cannot restore wind in flood mode');
ctx.window._dashboardDisplayedWind={directionDeg:90,speed:4};
ctx.window.syncDashboardFloodAreaManageVisibility([{...points[0],note:JSON.stringify({floodEnabled:false})}]);
assert.equal(elements.wind_panel.style.display,'');assert.equal(calls.add,1,'Non-flood mode restores wind');
ctx.window.syncDashboardFloodAreaManageVisibility([{type:'FloodArea'}]);
assert.equal(elements.wind_panel.style.display,'none','Legacy flood polygons hide wind too');
console.log('PASS: equal points, single fire, legacy reference, fit-all once, user camera guard, flood wind hide and non-flood restore');
