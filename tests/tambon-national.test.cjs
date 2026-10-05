const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const code = fs.readFileSync('script3.js','utf8');
const index = JSON.parse(fs.readFileSync('tambon_by_province/_index.json','utf8'));
assert.equal(Object.keys(index).length,77);
assert.match(code,/dashMap = makeDashboardMapAdapter\(mapObj\);\s*initTambonBoundaryControls\(\)/);
const events={}, sources={}, layers={};
let active=0, peak=0, fetched=0;
let bounds=[97,5,106,21];
const map={
 getBounds(){return {getWest:()=>bounds[0],getSouth:()=>bounds[1],getEast:()=>bounds[2],getNorth:()=>bounds[3]};},
 getZoom(){return 6;}, isStyleLoaded(){return true;},
 on(name,fn){(events[name]||=[]).push(fn);},
 getSource(id){return sources[id];},addSource(id,value){sources[id]=value;},
 getLayer(id){return layers[id];},addLayer(value){layers[value.id]=value;},
 setLayoutProperty(id,name,value){layers[id].layout[name]=value;}
};
const ctx={console,dashMap:{_maptiler:map},fetch:async url=>{
 if(url.endsWith('_index.json')) return {ok:true,json:async()=>index};
 active++; peak=Math.max(peak,active); fetched++;
 await new Promise(resolve=>setTimeout(resolve,1)); active--;
 return {ok:true,json:async()=>({type:'FeatureCollection',features:[]})};
}};
vm.createContext(ctx);vm.runInContext(code.slice(code.indexOf('var TAMBON_DATA_BASE_URL')),ctx);
async function settled(){while(ctx.tambonRefreshRunning) await new Promise(resolve=>setTimeout(resolve,2));}
(async()=>{
 ctx.initTambonBoundaryControls();ctx.initTambonBoundaryControls();
 assert.equal(events.moveend.length,1);assert.equal(events.zoomend.length,1);
 ctx.setTambonBoundaryVisibility(true);await settled();
 assert.equal(fetched,77);assert.equal(Object.keys(sources).length,77);assert.ok(peak<=4);
 await ctx.refreshTambonLayersForViewport();assert.equal(fetched,77);
 ctx.setTambonBoundaryVisibility(false);
 events.moveend.forEach(fn=>fn());events.zoomend.forEach(fn=>fn());await settled();
 assert.equal(fetched,77);assert.ok(Object.values(layers).every(l=>l.layout.visibility==='none'));
 // Simulate moving from a local viewport to a distant province without toggling.
 ctx.tambonLoadedProvinces={};Object.keys(sources).forEach(k=>delete sources[k]);
 bounds=[101.2,12.6,101.4,12.8];ctx.setTambonBoundaryVisibility(true);await settled();
 const before=fetched;bounds=[98.8,18.6,99.2,19];events.moveend.forEach(fn=>fn());await settled();
 assert.ok(fetched>before);assert.ok(sources['tambon-src-chiang_mai']);
 // Repeated move events while fetching must settle on the latest viewport.
 ctx.tambonLoadedProvinces={};bounds=[97,5,106,21];
 const pending=ctx.refreshTambonLayersForViewport();bounds=[98.8,18.6,99.2,19];
 events.moveend.forEach(fn=>fn());await pending;await settled();assert.equal(ctx.tambonRefreshRequested,false);
 assert.ok(peak<=4);
 console.log('PASS: 77 provinces, four concurrent requests, cached loads, idempotent controls, move/zoom and hidden-layer guard');
})().catch(e=>{console.error(e);process.exitCode=1;});
