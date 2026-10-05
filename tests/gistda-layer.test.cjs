const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
const code = fs.readFileSync(path.join(__dirname,'../dashboard-gistda-flood.js'),'utf8');
const tick = () => new Promise(resolve => setImmediate(resolve));
function result(days, count=1) {
  return {type:'FeatureCollection',features:Array.from({length:count},()=>({type:'Feature',properties:{subdistrict:'<img src=x onerror=1>',imageDates:'2026-09-26'},
    geometry:{type:'Polygon',coordinates:[[[101,12],[102,12],[102,13],[101,12]]]}})),
    meta:{days,provinceId:'21',complete:true,numberMatched:count,retrievedAt:new Date().toISOString()}};
}
function harness(fetcher) {
  const els={},sources={},events={},timers=new Map();
  let id=0,requests=0;
  const layers=[{id:'traffic',type:'line'},{id:'mt-line-road',type:'line'}];
  const el = name => els[name] ||= {textContent:'',checked:false,disabled:false,value:'',style:{}};
  const map={ready:true,on(e,fn){(events[e] ||= []).push(fn);},once(e,fn){(events[e] ||= []).push(fn);},
    isStyleLoaded(){return this.ready;},getSource(name){return sources[name];},getLayer(name){return layers.find(l=>l.id===name);},
    getStyle(){return{layers};},addSource(name,s){assert.ok(!sources[name]);sources[name]={...s,setData(d){this.data=d;}};},
    addLayer(layer,before){assert.ok(!this.getLayer(layer.id));const i=layers.findIndex(l=>l.id===before);layers.splice(i<0?layers.length:i,0,layer);},
    flyTo(){throw Error('No camera reset');},fitBounds(){throw Error('No camera reset');},
    hits:[],queryRenderedFeatures(){return this.hits;}};
  const popups=[];
  class Popup { constructor(){popups.push(this);} remove(){this.removed=true;} setLngLat(p){this.position=p;return this;}
    setHTML(h){this.html=h;return this;} addTo(m){this.map=m;return this;} }
  const context=vm.createContext({window:{syncDashboardMapModeUI(){}},document:{getElementById:el},dashMap:{_maptiler:map},
    maptilersdk:{Popup},Date,Number,AbortController,setTimeout(fn,ms){timers.set(++id,{fn,ms});return id;},clearTimeout(i){timers.delete(i);},
    fetch(url,options){requests++;assert.match(url,/\.workers\.dev\/flood\?days=(1|7|30)$/);assert.equal(options.credentials,'omit');
      assert.equal(options.cache,'no-store');return fetcher(url,options);}});
  vm.runInContext(code,context);
  return{w:context.window,map,el,events,popups,sources,layers,timers,requests:()=>requests};
}
(async()=>{
  const h=harness(async url=>({ok:true,json:async()=>result(Number(new URL(url).searchParams.get('days')))}));
  assert.equal(h.requests(),0,'Off by default; never part of ACTIVE');
  h.w.setDashboardExternalFloodLayer(true);await tick();
  assert.equal(h.requests(),1);
  assert.equal(h.sources['ics-gistda-flood'].data.meta.days,1);
  assert.deepEqual(h.layers.map(l=>l.id),['traffic','ics-gistda-flood-fill','ics-gistda-flood-line','mt-line-road']);
  h.w.setDashboardExternalFloodPeriod('7');await tick();
  assert.equal(h.sources['ics-gistda-flood'].data.meta.days,7);
  h.w.setDashboardExternalFloodPeriod('30');await tick();
  assert.equal(h.sources['ics-gistda-flood'].data.meta.days,30);
  h.w.setDashboardExternalFloodPeriod('3');await tick();assert.equal(h.requests(),3);
  h.w.setDashboardExternalFloodPeriod('1');await tick();assert.equal(h.requests(),3,'Per-period cache avoids repeated queries');
  assert.match(h.el('dashExternalFloodSourceStatus').textContent,/ไม่ใช่เวลาภาพดาวเทียม/);
  h.map.hits=[{layer:{id:'ics-gistda-flood-fill'},properties:result(1).features[0].properties}];
  h.events.click[0]({point:{x:1,y:1},lngLat:{lng:101,lat:12}});
  assert.match(h.popups[0].html,/&lt;img/);assert.doesNotMatch(h.popups[0].html,/<img/);
  assert.match(h.popups[0].html,/ระดับน้ำ: ไม่มีข้อมูล/);
  h.map.hits=[{layer:{id:'mt-line-road'}},...h.map.hits];
  h.events.click[0]({point:{x:1,y:1}});assert.equal(h.popups.length,1,'Manual report keeps interaction priority');
  h.w.setDashboardExternalFloodLayer(false);await tick();
  assert.equal(h.sources['ics-gistda-flood'].data.features.length,0);
  assert.ok(h.map.getLayer('mt-line-road'),'Never remove field data');
  h.w.setDashboardExternalFloodLayer(true);await tick();
  const before=h.requests();
  delete h.sources['ics-gistda-flood'];h.layers.splice(1,2);
  h.events['style.load'][0]();
  assert.ok(h.map.getLayer('ics-gistda-flood-fill'),'Restores on base-map changes');
  assert.equal(h.requests(),before,'No refetch on style change');
  h.w.attachDashboardExternalFlood(h.map);assert.equal(h.events.click.length,1);
  assert.match(h.el('dashExternalFloodMapNotice').textContent,/ย้อนหลัง 1 วัน/,'Period remains visible with menu closed');
  const expiry=[...h.timers.values()].find(t=>t.ms>35000);assert.ok(expiry);expiry.fn();
  assert.equal(h.sources['ics-gistda-flood'].data.features.length,0,'Expired data cannot silently remain on screen');
  assert.match(h.el('dashExternalFloodSourceStatus').textContent,/หมดอายุ/);

  const waiting=[];
  const p=harness(()=>new Promise(resolve=>waiting.push(resolve)));
  p.w.setDashboardExternalFloodLayer(true);p.w.setDashboardExternalFloodPeriod('7');
  waiting[1]({ok:true,json:async()=>result(7)});await tick();
  waiting[0]({ok:true,json:async()=>result(1)});await tick();
  assert.equal(p.sources['ics-gistda-flood'].data.meta.days,7,'Stale response cannot overwrite a new period');
  p.w.setDashboardExternalFloodPeriod('30');p.w.setDashboardExternalFloodLayer(false);
  waiting[2]({ok:true,json:async()=>result(30)});await tick();
  assert.equal(p.sources['ics-gistda-flood'].data.features.length,0,'Off cannot be resurrected by pending request');

  const empty=harness(async()=>({ok:true,json:async()=>result(1,0)}));
  empty.w.setDashboardExternalFloodLayer(true);await tick();
  assert.match(empty.el('dashExternalFloodSourceStatus').textContent,/ไม่พบข้อมูล ไม่ได้แปลว่าไม่มีน้ำท่วม/);
  const bad=harness(async()=>({ok:false,json:async()=>({error:'NOT_CONFIGURED'})}));
  bad.w.setDashboardExternalFloodLayer(true);await tick();
  assert.match(bad.el('dashExternalFloodSourceStatus').textContent,/ยังไม่ได้ตั้งคีย์/);
  bad.w.refreshDashboardExternalFlood();await tick();assert.equal(bad.requests(),1,'Failed requests have a cooldown');
  const partial=harness(async()=>({ok:true,json:async()=>({...result(1),meta:{...result(1).meta,complete:false}})}));
  partial.w.setDashboardExternalFloodLayer(true);await tick();assert.equal(partial.map.getSource('ics-gistda-flood'),undefined);
  assert.doesNotMatch(code,/google\.script|supabase|fitBounds\(|flyTo\(|setInterval\(/);
  assert.match(fs.readFileSync(path.join(__dirname,'../sw.js'),'utf8'),/hostname === 'the-1-ics-gistda-flood\.occ-hrh\.workers\.dev'\) return/);
  console.log('PASS: 1/7/30 periods, cache, layer order, manual priority, popup escaping, style restore, empty/error/cooldown, cancellation and no camera/backend writes');
})().catch(error=>{console.error(error);process.exitCode=1;});
