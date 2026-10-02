const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const script = fs.readFileSync(path.join(__dirname, '..', 'script2.js'), 'utf8');
function extract(name) {
  const start = script.indexOf('function ' + name + '(');
  assert.notEqual(start, -1);
  const end = script.indexOf(name === 'drawIncidentSpecialMapLayers' ? '\nfunction getFloodLegendTarget(' : '\nfunction ', start + 1);
  return script.slice(start, end < 0 ? script.length : end);
}
const overlays = [];
const context = vm.createContext({
  window:{},
  dashMap:{Overlays:{add(overlay){overlay._map = true; overlays.push(overlay);}}},
  getZoneMarkerType:marker => marker.type,
  getFloodMarkerId:marker => marker.id,
  makeMapTilerPolygonOverlay:() => null,
  makeLongdoHtmlMarker:(position, html, options) => ({position, html, options}),
  removeLongdoOverlay(){throw new Error('Unchanged labels must not be recreated on refresh');},
  roleSafeText:value => String(value).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;'),
  getOCZoneTypeConfig:() => ({})
});
vm.runInContext(['getFloodAreaDepthText','parseFloodAreaMarker','getFloodAreaCentroid','drawIncidentSpecialMapLayers','getFloodLegendTarget'].map(extract).join('\n'),context);
for (const missing of ['', ' ', null, undefined, NaN, Infinity, -1, 'bad', true, false]) {
  assert.equal(context.getFloodAreaDepthText({depthCm:missing}), 'ระดับน้ำ: ไม่มีข้อมูล');
}
for (const value of [0, 20, '20', 12.5]) {
  assert.equal(context.getFloodAreaDepthText({depthCm:value}), 'ระดับน้ำ: ' + Number(value) + ' ซม.');
}
const points = [[101.24,12.7],[101.25,12.7],[101.25,12.71]];
const markers = [
  {id:'known',type:'FloodArea',note:JSON.stringify({kind:'floodArea',name:'ทดสอบ',depthCm:20,points})},
  {id:'missing',type:'FloodArea',note:JSON.stringify({kind:'floodArea',name:'พื้นที่เดิม',points})},
  {id:'zero',type:'FloodArea',note:JSON.stringify({kind:'floodArea',name:'น้ำลด',depthCm:0,points})},
  {id:'html',type:'FloodArea',note:JSON.stringify({kind:'floodArea',name:'<img src=x>',depthCm:'bad',points})}
];
const original = JSON.stringify(markers);
context.drawIncidentSpecialMapLayers(markers);
assert.equal(overlays.length,4);
assert.match(overlays[0].html, /ระดับน้ำ: 20 ซม\./);
assert.match(overlays[1].html, /ระดับน้ำ: ไม่มีข้อมูล/);
assert.match(overlays[2].html, /ระดับน้ำ: 0 ซม\./);
assert.ok(!overlays[3].html.includes('<img src=x>'), 'Area names must stay escaped');
assert.match(overlays[0].options.markerOptions.detail, /ระดับน้ำ: 20 ซม\./);
assert.match(overlays[1].options.markerOptions.detail, /ระดับน้ำ: ไม่มีข้อมูล/);
assert.equal(context.getFloodLegendTarget(markers[1]).detail,'ระดับน้ำ: ไม่มีข้อมูล');
context.drawIncidentSpecialMapLayers(markers);
assert.equal(overlays.length,4,'Refresh must retain labels');
assert.equal(JSON.stringify(markers),original,'Presentation must not modify stored areas');
console.log('PASS: depth labels, missing/invalid values, zero, decimals, escaping, popup, legend and stable refresh');
