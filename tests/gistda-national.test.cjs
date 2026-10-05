const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),path=require('node:path');
const root=path.join(__dirname,'..'),tick=()=>new Promise(r=>setImmediate(r));
const els={},layers=[],sources={},events={},camera=[],calls=[],timers=new Map();let next=0,geoCalls=0,geoSuccess,geoError;
const el=id=>els[id]||=( {textContent:'',value:'',style:{},appendChild(o){(this.options||=[]).push(o);}} );
const map={on(e,f){(events[e]||=[]).push(f);},once(e,f){(events[e]||=[]).push(f);},isStyleLoaded(){return true;},
getSource(id){return sources[id];},getLayer(id){return layers.find(l=>l.id===id);},getStyle(){return{layers};},
addSource(id,s){sources[id]={...s,setData(d){this.data=d;}};},addLayer(l){layers.push(l);},removeSource(id){delete sources[id];},
removeLayer(id){layers.splice(layers.findIndex(l=>l.id===id),1);},fitBounds(b){camera.push({kind:'fit',bounds:b});},flyTo(p){camera.push({kind:'fly',...p});}};
const c=vm.createContext({window:{syncDashboardMapModeUI(){}},document:{getElementById:el,createElement(){return{};}},dashMap:{_maptiler:map},
incidentCenter:{lng:101.243688,lat:12.716308},localStorage:{getItem(){return null;},setItem(k,v){assert.equal(k,'ics-gistda-province');assert.match(v,/^(all|\d\d)$/);}},
navigator:{geolocation:{getCurrentPosition(s,e){geoCalls++;geoSuccess=s;geoError=e;}}},Date,Number,AbortController,
setTimeout(f,ms){timers.set(++next,{f,ms});return next;},clearTimeout(id){timers.delete(id);},
fetch:async(url)=>{
if(url.includes('/tambon_by_province/'))return{ok:true,json:async()=>JSON.parse(fs.readFileSync(path.join(root,'tambon_by_province',url.split('/').pop()),'utf8'))};
calls.push(url);const u=new URL(url),province=u.searchParams.get('province');if(province==='65')return{ok:false,json:async()=>({error:'DATA_TOO_LARGE'})};return{ok:true,json:async()=>({type:'FeatureCollection',features:[],
meta:{provinceId:province,days:Number(u.searchParams.get('days')),complete:true,numberMatched:0,retrievedAt:new Date().toISOString()}})};
}});
(async()=>{
vm.runInContext(fs.readFileSync(path.join(root,'gistda-provinces.js'),'utf8'),c);
assert.equal(c.window.gistdaProvinces.length,77);assert.equal(new Set(c.window.gistdaProvinces.map(p=>p.id)).size,77);
const idx=JSON.parse(fs.readFileSync(path.join(root,'tambon_by_province/_index.json')));
for(const p of c.window.gistdaProvinces)assert.ok(idx[p.slug],p.slug);
assert.equal((await c.window.gistdaProvinceAt(101.243688,12.716308)).id,'21');
assert.equal(await c.window.gistdaProvinceAt(0,0),null);
const polygon={type:'Polygon',coordinates:[[[0,0],[4,0],[4,4],[0,4],[0,0]],[[1,1],[3,1],[3,3],[1,3],[1,1]]]};
assert.equal(c.window.gistdaPointInGeometry([0.5,0.5],polygon),true);assert.equal(c.window.gistdaPointInGeometry([2,2],polygon),false,'Respect holes');
vm.runInContext(fs.readFileSync(path.join(root,'dashboard-gistda-flood.js'),'utf8'),c);await tick();await tick();
assert.equal(el('dashExternalFloodProvince').options.length,77);assert.equal(el('dashExternalFloodProvince').value,'21','Incident first');
assert.equal(geoCalls,0,'Never request location automatically');assert.equal(camera.length,0,'Default incident province does not move camera');
c.window.setDashboardExternalFloodLayer(true);await tick();assert.match(calls[0],/province=21/);
await c.window.setDashboardExternalFloodProvince('50');await tick();assert.match(calls.at(-1),/province=50/);assert.equal(camera.length,1,'Explicit province frames province');
const before=camera.length;c.window.setDashboardExternalFloodPeriod('30');await tick();assert.equal(camera.length,before,'Period never moves camera');
await c.window.setDashboardExternalFloodProvince('all');await tick();assert.ok(sources['ics-gistda-flood-tiles']);
assert.match(sources['ics-gistda-flood-tiles'].tiles[0],/\/tiles\/30\/\{z\}\/\{x\}\/\{y\}\.png$/);
const requests=calls.length;c.window.setDashboardExternalFloodPeriod('7');assert.equal(calls.length,requests,'Country uses tiles, not national huge JSON');
assert.match(sources['ics-gistda-flood-tiles'].tiles[0],/\/tiles\/7\//);
c.window.setDashboardExternalFloodLayer(false);assert.ok(!sources['ics-gistda-flood-tiles'],'Off stops tile requests');
c.window.setDashboardExternalFloodLayer(true);assert.ok(sources['ics-gistda-flood-tiles']);
const expiry=[...timers.values()].find(t=>t.ms===3600000);assert.ok(expiry);expiry.f();assert.ok(!sources['ics-gistda-flood-tiles'],'Hide expired national tiles');
c.window.refreshDashboardExternalFlood();assert.ok(sources['ics-gistda-flood-tiles']);
c.window.showDashboardFloodNearMe();assert.equal(geoCalls,1);geoError({code:1});assert.match(el('dashExternalFloodLocationStatus').textContent,/เลือกจังหวัดได้เอง/);
c.window.showDashboardFloodNearMe();const cc=camera.length;await geoSuccess({coords:{longitude:101.243688,latitude:12.716308,accuracy:200}});await tick();
assert.equal(el('dashExternalFloodProvince').value,'21');assert.equal(camera.length,cc+1);assert.equal(camera.at(-1).kind,'fly');
assert.match(el('dashExternalFloodLocationStatus').textContent,/200/);
c.window.showDashboardFloodNearMe();const old=geoSuccess;await c.window.setDashboardExternalFloodProvince('50');const cm=camera.length;
await old({coords:{longitude:101.243688,latitude:12.716308,accuracy:200}});assert.equal(camera.length,cm,'Late geolocation cannot override manual province');
await c.window.setDashboardExternalFloodProvince('65');await tick();await tick();
assert.ok(sources['ics-gistda-flood-tiles'],'Large province uses tiles, never partial geometry');
assert.equal(JSON.stringify(sources['ics-gistda-flood-tiles'].bounds),JSON.stringify(idx.phitsanulok.bbox));
assert.match(el('dashExternalFloodSourceStatus').textContent,/อาจเห็นพื้นที่ข้างเคียง/);
await c.window.setDashboardExternalFloodProvince('21');await tick();assert.ok(!sources['ics-gistda-flood-tiles'],'Returning to small province clears fallback tiles');
console.log('PASS: 77 provinces, actual incident lookup, polygon holes, per-province requests, national tile periods/off/expiry, explicit camera only, denied location and stale geolocation');
})().catch(e=>{console.error(e);process.exitCode=1;});
