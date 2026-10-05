const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const root=path.resolve(__dirname,'..');
const source=fs.readFileSync(path.join(root,'flood-incident-settings.js'),'utf8');
const zone=fs.readFileSync(path.join(root,'script2.js'),'utf8');
const html=fs.readFileSync(path.join(root,'index.html'),'utf8');
const point={id:'primary-id',type:'IncidentPoint',label:'จุดหลัก',lat:12.7,lng:101.27,note:JSON.stringify({kind:'incidentPoint',version:1,primary:true,extra:'keep-me'})};
const area={id:'area-id',type:'FloodArea'};
function harness(markers=[point],options={}) {
  markers=JSON.parse(JSON.stringify(markers));
  const button={style:{display:'none'}};
  const writes=[],reads=[];
  const ctx=vm.createContext({window:{},APP_ACCESS_ROLE:'admin',document:{getElementById:id=>id==='dashFloodAreaManageBtn'?button:null},Error});
  function runner() {
    let success,failure;
    const r={withSuccessHandler(fn){success=fn;return r;},withFailureHandler(fn){failure=fn;return r;},
      getZoneMarkers(){reads.push(true);if(options.readError) failure(new Error('Read error'));else success(markers);},
      updateZoneMarker(...args){writes.push(args);if(options.writeError) failure(new Error('Write error'));else success({ok:true});}};
    return r;
  }
  ctx.google={script:{get run(){return runner();}}};
  vm.runInContext(source,ctx);
  return {ctx,w:ctx.window,button,writes,reads};
}
const h=harness(),w=h.w;
assert.equal(h.reads.length,0,'Loading metadata module must never fetch or mutate data');
assert.equal(w.isDashboardFloodIncident([]),false);
assert.equal(w.isDashboardFloodIncident([point]),false,'Do not infer checkbox from incident label');
assert.equal(w.isDashboardFloodIncident([area,point]),true,'Legacy polygons remain accessible');
for(const enabled of [true,false]) {
  const explicit={...point,note:JSON.stringify({kind:'incidentPoint',primary:true,floodEnabled:enabled})};
  assert.equal(w.isDashboardFloodIncident([explicit,area]),enabled,'Explicit checkbox beats legacy heuristic');
  w.syncDashboardFloodAreaManageVisibility([explicit]);
  assert.equal(h.button.style.display,enabled?'inline-block':'none');
  h.ctx.APP_ACCESS_ROLE='staff';w.syncDashboardFloodAreaManageVisibility();
  assert.equal(h.button.style.display,'none','No admin permission expansion');
  h.ctx.APP_ACCESS_ROLE='admin';
}
// New checked incident with NO polygon is remembered across browser reloads.
let error='not called';w.persistDeclaredFloodSetting(true,point,'ผู้ประกาศ','admin',e=>error=e);
assert.equal(error,null);assert.equal(h.writes.length,1);
const args=h.writes[0];assert.deepEqual(args.slice(0,5),['primary-id','IncidentPoint','จุดหลัก',12.7,101.27]);
const saved=JSON.parse(args[5]);assert.equal(saved.floodEnabled,true);assert.equal(saved.primary,true);assert.equal(saved.extra,'keep-me');assert.equal(args[7],'admin');
const reload=harness([{...point,note:args[5]}]);reload.w.syncDashboardFloodAreaManageVisibility([{...point,note:args[5]}]);
assert.equal(reload.button.style.display,'inline-block');
// An explicit false is also persisted, never coerced away as an omitted value.
const unchecked=harness([{...point,note:point.note}]);
unchecked.w.persistDeclaredFloodSetting(false,point,'ผู้ประกาศ','admin',e=>assert.equal(e,null));
assert.equal(JSON.parse(unchecked.writes[0][5]).floodEnabled,false);
for(const options of [{readError:true},{writeError:true}]) {
  const failed=harness([point],options);let result;
  failed.w.persistDeclaredFloodSetting(true,point,'ผู้ประกาศ','admin',e=>result=e);
  assert.ok(result instanceof Error,'A post-ACTIVE failure must be visible, not claimed successful');
}
const wrong=harness([{...point,lat:13}]);let missing;
wrong.w.persistDeclaredFloodSetting(true,point,'ผู้ประกาศ','admin',e=>missing=e);
assert.ok(missing);assert.equal(wrong.writes.length,0,'Must not stamp a mismatched incident point');
const unauth=harness();unauth.w.persistDeclaredFloodSetting(true,point,'ผู้ประกาศ','staff',()=>{});
assert.equal(unauth.reads.length,0);assert.equal(unauth.writes.length,0);
assert.match(zone,/hasFlood \? \(window\._pendingDeclareFloodAreas \|\| \[\]\) : \[\],\s*hasFlood/);
assert.match(zone,/saveFloodSetting\(v\[14\], \(v\[12\] \|\| \[\]\)\[0\]/);
assert.match(zone,/typeof persistDeclaredFloodSetting === 'function'/,'Module loading failure must not break ACTIVE success flow');
assert.match(zone,/html: floodSettingWarning \+ joinHtml/);
assert.ok(html.indexOf('/flood-incident-settings.js?')<html.indexOf('/script2.js?'),'Load helper before declaration flow');
console.log('PASS: checkbox metadata, legacy fallback, no polygon, reload, explicit false, admin guard, note preservation, failures and activation wiring (mock backend only)');
