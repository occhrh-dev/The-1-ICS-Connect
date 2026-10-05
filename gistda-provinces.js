// Names/official codes; camera bounds and point lookup use existing local tambon data.
(function(){
'use strict';
var rows=`10|กรุงเทพมหานคร|bangkok_metropolis
11|สมุทรปราการ|samut_prakan
12|นนทบุรี|nonthaburi
13|ปทุมธานี|pathum_thani
14|พระนครศรีอยุธยา|phra_nakhon_si_ayutthaya
15|อ่างทอง|ang_thong
16|ลพบุรี|lop_buri
17|สิงห์บุรี|sing_buri
18|ชัยนาท|chai_nat
19|สระบุรี|saraburi
20|ชลบุรี|chon_buri
21|ระยอง|rayong
22|จันทบุรี|chanthaburi
23|ตราด|trat
24|ฉะเชิงเทรา|chachoengsao
25|ปราจีนบุรี|prachin_buri
26|นครนายก|nakhon_nayok
27|สระแก้ว|sa_kaeo
30|นครราชสีมา|nakhon_ratchasima
31|บุรีรัมย์|buri_ram
32|สุรินทร์|surin
33|ศรีสะเกษ|si_sa_ket
34|อุบลราชธานี|ubon_ratchathani
35|ยโสธร|yasothon
36|ชัยภูมิ|chaiyaphum
37|อำนาจเจริญ|amnat_charoen
38|บึงกาฬ|bueng_kan
39|หนองบัวลำภู|nong_bua_lam_phu
40|ขอนแก่น|khon_kaen
41|อุดรธานี|udon_thani
42|เลย|loei
43|หนองคาย|nong_khai
44|มหาสารคาม|maha_sarakham
45|ร้อยเอ็ด|roi_et
46|กาฬสินธุ์|kalasin
47|สกลนคร|sakon_nakhon
48|นครพนม|nakhon_phanom
49|มุกดาหาร|mukdahan
50|เชียงใหม่|chiang_mai
51|ลำพูน|lamphun
52|ลำปาง|lampang
53|อุตรดิตถ์|uttaradit
54|แพร่|phrae
55|น่าน|nan
56|พะเยา|phayao
57|เชียงราย|chiang_rai
58|แม่ฮ่องสอน|mae_hong_son
60|นครสวรรค์|nakhon_sawan
61|อุทัยธานี|uthai_thani
62|กำแพงเพชร|kamphaeng_phet
63|ตาก|tak
64|สุโขทัย|sukhothai
65|พิษณุโลก|phitsanulok
66|พิจิตร|phichit
67|เพชรบูรณ์|phetchabun
70|ราชบุรี|ratchaburi
71|กาญจนบุรี|kanchanaburi
72|สุพรรณบุรี|suphan_buri
73|นครปฐม|nakhon_pathom
74|สมุทรสาคร|samut_sakhon
75|สมุทรสงคราม|samut_songkhram
76|เพชรบุรี|phetchaburi
77|ประจวบคีรีขันธ์|prachuap_khiri_khan
80|นครศรีธรรมราช|nakhon_si_thammarat
81|กระบี่|krabi
82|พังงา|phangnga
83|ภูเก็ต|phuket
84|สุราษฎร์ธานี|surat_thani
85|ระนอง|ranong
86|ชุมพร|chumphon
90|สงขลา|songkhla
91|สตูล|satun
92|ตรัง|trang
93|พัทลุง|phatthalung
94|ปัตตานี|pattani
95|ยะลา|yala
96|นราธิวาส|narathiwat`;
var provinces=rows.split('\n').map(function(row){var a=row.split('|');return{id:a[0],name:a[1],slug:a[2]};});
provinces.sort(function(a,b){return a.name.localeCompare(b.name,'th');});
window.gistdaProvinces=provinces;
var base='https://occhrh-dev.github.io/The-1-ICS-Connect/tambon_by_province/', indexPromise, files={};
async function index(){
if(!indexPromise) indexPromise=fetch(base+'_index.json').then(function(r){if(!r.ok)throw Error('INDEX');return r.json();}).catch(function(e){indexPromise=null;throw e;});
return indexPromise;
}
function inRing(point,ring){
var inside=false;
for(var i=0,j=ring.length-1;i<ring.length;j=i++){
var a=ring[i],b=ring[j];
if(((a[1]>point[1])!==(b[1]>point[1]))&&point[0]<(b[0]-a[0])*(point[1]-a[1])/(b[1]-a[1])+a[0])inside=!inside;
}return inside;
}
function inGeometry(point,g){
if(!g||!Array.isArray(g.coordinates))return false;
var polygons=g.type==='Polygon'?[g.coordinates]:g.type==='MultiPolygon'?g.coordinates:[];
return polygons.some(function(p){return p.length&&inRing(point,p[0])&&!p.slice(1).some(function(r){return inRing(point,r);});});
}
window.gistdaProvinceBounds=async function(id){var p=provinces.find(function(v){return v.id===id;});var idx=await index();return p&&idx[p.slug]&&idx[p.slug].bbox;};
window.gistdaProvinceAt=async function(lng,lat){
if(!Number.isFinite(lng)||!Number.isFinite(lat))return null;
var idx=await index(),point=[lng,lat];
var candidates=provinces.filter(function(p){var b=idx[p.slug]&&idx[p.slug].bbox;return b&&lng>=b[0]&&lng<=b[2]&&lat>=b[1]&&lat<=b[3];});
if(candidates.length>6)return null;
for(var p of candidates){
if(!files[p.slug]){
var r=await fetch(base+p.slug+'.json');if(!r.ok)continue;files[p.slug]=await r.json();
if(Object.keys(files).length>6)delete files[Object.keys(files)[0]];
}
if(files[p.slug].features.some(function(f){return inGeometry(point,f.geometry);}))return p;
}return null;
};
window.gistdaPointInGeometry=inGeometry;
})();
