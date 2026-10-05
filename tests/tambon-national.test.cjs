const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const code = fs.readFileSync('script3.js','utf8');
assert.equal(Object.keys(JSON.parse(fs.readFileSync('tambon_by_province/_index.json','utf8'))).length,77);
assert.match(fs.readFileSync('script2.js','utf8'), /syncTambonIncidentScope\(allZones\)/);
const events={},sources={},layers={};
let fetched=0,lookups=0,releaseLookup=null;
const map={
 getZoom:()=>6,isStyleLoaded:()=>true,
 on(event,layer,handler){(events[event]||=[]).push(handler||layer);},
 off(event,layer,handler){events[event]=(events[event]||[]).filter(fn=>fn!==handler);},
 getSource:id=>sources[id],addSource(id,value){sources[id]=value;},removeSource(id){delete sources[id];},
 getLayer:id=>layers[id],addLayer(value){layers[value.id]=value;},removeLayer(id){delete layers[id];},
 setLayoutProperty(id,name,value){layers[id].layout[name]=value;}
};
const ctx={console,window:{gistdaProvinceAt:async(lng,lat)=>{
 lookups++;
 if(releaseLookup) await new Promise(resolve=>{releaseLookup=resolve;});
 return lng===101?{slug:'rayong',name:'ระยอง'}:lng===99?{slug:'chiang_mai',name:'เชียงใหม่'}:null;
}},incidentCenter:{lat:12.7,lng:101},dashMap:{_maptiler:map},fetch:async()=>{
 fetched++;await new Promise(resolve=>setTimeout(resolve,1));
 return {ok:true,json:async()=>({type:'FeatureCollection',features:[]})};
}};
vm.createContext(ctx);vm.runInContext(code.slice(code.indexOf('var TAMBON_DATA_BASE_URL')),ctx);
const point=(lng,lat=12.7)=>({type:'IncidentPoint',lng,lat});
async function settled(){while(ctx.tambonRefreshRunning)await new Promise(resolve=>setTimeout(resolve,2));}
(async()=>{
 ctx.initTambonBoundaryControls();ctx.initTambonBoundaryControls();
 assert.equal(events.moveend.length,1);assert.equal(events.zoomend.length,1);
 ctx.syncTambonIncidentScope([point(101),point(101,12.8),{type:'Food',lng:99,lat:18}]);
 ctx.setTambonBoundaryVisibility(true);await settled();
 assert.deepEqual(Object.keys(sources),['tambon-src-rayong']);assert.equal(fetched,1);
 const before=lookups;
 ctx.syncTambonIncidentScope([point(101,12.8),point(101)]);
 events.moveend.forEach(fn=>fn());events.zoomend.forEach(fn=>fn());await settled();
 assert.equal(lookups,before);assert.equal(fetched,1);
 ctx.syncTambonIncidentScope([point(101),point(99,18)]);await settled();
 assert.equal(Object.keys(sources).length,2);
 ctx.syncTambonIncidentScope([point(99,18)]);await settled();
 assert.deepEqual(Object.keys(sources),['tambon-src-chiang_mai']);assert.equal(events.click.length,1);
 ctx.syncTambonIncidentScope([]);await settled();assert.deepEqual(Object.keys(sources),['tambon-src-rayong']);
 ctx.setTambonBoundaryVisibility(false);
 events.moveend.forEach(fn=>fn());await settled();assert.ok(Object.values(layers).every(l=>l.layout.visibility==='none'));
 ctx.syncTambonIncidentScope([point(150)]);ctx.setTambonBoundaryVisibility(true);await settled();
 assert.equal(Object.keys(sources).length,0);
 releaseLookup=true;ctx.syncTambonIncidentScope([point(101)]);
 await new Promise(resolve=>setTimeout(resolve,0));const release=releaseLookup;releaseLookup=null;
 ctx.syncTambonIncidentScope([point(99,18)]);release();await settled();
 assert.deepEqual(Object.keys(sources),['tambon-src-chiang_mai']);
 Object.keys(sources).forEach(k=>delete sources[k]);Object.keys(layers).forEach(k=>delete layers[k]);
 await ctx.refreshTambonLayersForViewport();await settled();assert.deepEqual(Object.keys(sources),['tambon-src-chiang_mai']);
 assert.equal(events.click.length,1);
 console.log('PASS: incident-only provinces, multiple provinces, cached scope, cleanup, legacy fallback, unknown/stale lookup and style rebuild');
})().catch(e=>{console.error(e);process.exitCode=1;});
