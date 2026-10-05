const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const html=fs.readFileSync('index.html','utf8');
const js=fs.readFileSync('script3.js','utf8');
function deferred(){let resolve,reject;const promise=new Promise((a,b)=>{resolve=a;reject=b});return {promise,resolve,reject};}
const response=data=>({ok:true,json:async()=>data});
const tick=()=>new Promise(resolve=>setImmediate(resolve));
async function bridgeTests(){
 let calls=[];
 const ctx={console,Map,AbortController,setTimeout,clearTimeout,WORKER_URL:'https://example.invalid',fetch:(url,options)=>{const d=deferred();calls.push({url,options,...d});return d.promise;}};
 vm.createContext(ctx);
 vm.runInContext(html.slice(html.indexOf('  var bridgePendingReads'),html.indexOf('  async function callWorker')),ctx);
 const p=ctx.bridgeFetchData('getOCState',{agencyId:'A',joinToken:'one'});
 const p2=ctx.bridgeFetchData('getOCState',{agencyId:'A',joinToken:'one'});
 assert.equal(p,p2);assert.equal(calls.length,1);
 const isolated=ctx.bridgeFetchData('getOCState',{agencyId:'B',joinToken:'one'});
 const token=ctx.bridgeFetchData('getOCState',{agencyId:'A',joinToken:'two'});
 assert.equal(calls.length,3);
 calls.slice().forEach(c=>c.resolve(response({zoneMarkers:[]})));await Promise.all([p,p2,isolated,token]);
 assert.equal(ctx.bridgePendingReads.size,0);
 const fresh=ctx.bridgeFetchData('getOCState',{agencyId:'A',joinToken:'one'});assert.equal(calls.length,4);calls[3].resolve(response({}));await fresh;
 const w=ctx.bridgeFetchData('saveZoneMarker',{agencyId:'A'}),w2=ctx.bridgeFetchData('saveZoneMarker',{agencyId:'A'});
 assert.equal(calls.length,6);assert.equal(calls[4].options.signal,undefined);calls[4].resolve(response({}));calls[5].resolve(response({}));await Promise.all([w,w2]);
 const failure=ctx.bridgeFetchData('getAllLiveLocations',{agencyId:'A'});calls[6].reject(new Error('network'));await assert.rejects(failure);assert.equal(ctx.bridgePendingReads.size,0);
 const retry=ctx.bridgeFetchData('getAllLiveLocations',{agencyId:'A'});calls[7].resolve(response([]));await retry;
 const old=ctx.bridgeFetchData('getOCState',{agencyId:'A'});
 const write=ctx.bridgeFetchData('saveZoneMarker',{agencyId:'A'});
 const afterWrite=ctx.bridgeFetchData('getOCState',{agencyId:'A'});
 assert.notEqual(old,afterWrite);assert.equal(calls.length,11);
 calls[8].resolve(response({}));calls[9].resolve(response({}));calls[10].resolve(response({}));await Promise.all([old,write,afterWrite]);
 assert.match(html,/JSON\.parse\(JSON\.stringify\(sharedData\)\)/);
}
async function weatherTests(){
 let clock=1000000,flood=false,calls=[],displays=[],waiting=0;
 const ctx={console,AbortController,setTimeout,clearTimeout,Number,Date:{now:()=>clock},window:{_lastEmergState:{}},isDashboardFloodIncident:()=>flood,
 applyWindDisplay:(...args)=>displays.push(args),applyWindWaitingDisplay:()=>waiting++,fetch:(url,options)=>{let d=deferred();calls.push({url,options,...d});return d.promise;}};
 vm.createContext(ctx);vm.runInContext(js.slice(js.indexOf('var lastWeatherCoords'),js.indexOf('var eocStartTime')),ctx);
 let p=ctx.updateWeather(12.7,101.2);await ctx.updateWeather(12.7,101.2);assert.equal(calls.length,1);
 calls[0].resolve(response({current:{wind_speed_10m:2,wind_direction_10m:90}}));await p;
 for(let i=0;i<60;i++){clock+=1000;await ctx.updateWeather(12.7,101.2);}assert.equal(calls.length,1);
 flood=true;await ctx.updateWeather(12.7,101.2);assert.equal(calls.length,1);
 flood=false;ctx.window._lastEmergState.wind={directionDeg:45,speedMs:4};await ctx.updateWeather(12.7,101.2);assert.equal(calls.length,1);assert.equal(displays.at(-1)[0],45);
 ctx.window._lastEmergState.wind=null;clock+=600000;p=ctx.updateWeather(12.7,101.2);assert.equal(calls.length,2);
 ctx.window._lastEmergState.wind={directionDeg:180,speedMs:4};let before=displays.length;calls[1].resolve(response({current:{wind_speed_10m:9,wind_direction_10m:0}}));await p;assert.equal(displays.length,before);
 ctx.window._lastEmergState.wind=null;p=ctx.updateWeather(12.8,101.3);let newer=ctx.updateWeather(13,100);assert.equal(calls[2].options.signal.aborted,true);
 calls[2].resolve(response({current:{wind_speed_10m:8,wind_direction_10m:0}}));await p;
 calls[3].resolve(response({current:{wind_speed_10m:1,wind_direction_10m:0}}));await newer;assert.equal(displays.at(-1)[1],'1.0');
 p=ctx.updateWeather(14,100);calls[4].reject(new Error('offline'));await p;await ctx.updateWeather(14,100);assert.equal(calls.length,5);assert.equal(waiting,1);
 clock+=60001;p=ctx.updateWeather(14,100);flood=true;await ctx.updateWeather(14,100);assert.equal(calls[5].options.signal.aborted,true);
 before=displays.length;calls[5].resolve(response({current:{wind_speed_10m:9,wind_direction_10m:0}}));await p;assert.equal(displays.length,before);
}
async function bridgeIntegration(){
 const calls=[];const ctx={console,AbortController,setTimeout,clearTimeout,sessionStorage:{getItem:()=>null},window:{APP_AGENCY_ID:'A'},fetch:(url,options)=>{let d=deferred();calls.push({url,options,...d});return d.promise;}};
 vm.createContext(ctx);vm.runInContext(html.match(/<script>\s*([\s\S]*?)<\/script>/)[1],ctx);
 const run=ctx.window.google.script.run;let first,second,failures=0;
 run.withSuccessHandler(d=>{first=d;d.zoneMarkers.push('changed');}).getOCState();
 run.withSuccessHandler(d=>{second=d;}).getICDashboardOCData('ignored-by-existing-body-map');
 assert.equal(calls.length,1);calls[0].resolve(response({zoneMarkers:[]}));await tick();
 assert.equal(first.zoneMarkers.length,1);assert.equal(second.zoneMarkers.length,0);
 run.withFailureHandler(()=>failures++).getOCState();run.withFailureHandler(()=>failures++).getOCState();
 assert.equal(calls.length,2);calls[1].reject(new Error('offline'));await tick();assert.equal(failures,2);
 run.withSuccessHandler(()=>{}).getOCState();assert.equal(calls.length,3);calls[2].resolve(response({}));await tick();
 run.withSuccessHandler(()=>{}).saveZoneMarker({name:'one'});run.withSuccessHandler(()=>{}).saveZoneMarker({name:'one'});
 assert.equal(calls.length,5);calls[3].resolve(response({}));calls[4].resolve(response({}));await tick();
}
(async()=>{await bridgeTests();await bridgeIntegration();await weatherTests();console.log('PASS: identical in-flight reads shared, callbacks isolated, agency/token isolation, no completed cache, writes untouched, failures retry; weather 10min cache, flood skip, manual priority, stale/abort and retry cooldown');})().catch(e=>{console.error(e);process.exitCode=1;});
