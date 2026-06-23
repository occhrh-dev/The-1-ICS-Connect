// ============================================================
// Optimistic UI Helper
// ============================================================
function _optimisticRun_(gasFn, args, successMsg, failMsg, onSuccess, onFail) {
// แสดง success ทันที
Swal.fire({ icon:'success', title: successMsg || 'ส่งแล้ว', timer:1200, showConfirmButton:false });
// ส่ง GAS เบื้องหลัง
var runner = google.script.run.withSuccessHandler(function(result) {
if (typeof onSuccess === 'function') onSuccess(result);
}).withFailureHandler(function(err) {
// ถ้า error ค่อยแจ้ง
Swal.fire('ส่งข้อมูลไม่สำเร็จ', (err && err.message ? err.message : String(err)) + '\n(กรุณาลองอีกครั้ง)', 'error');
if (typeof onFail === 'function') onFail(err);
});
runner[gasFn].apply(runner, args || []);
}


var healthCurrentUser = '';
var healthTimerInterval = null;
var HEALTH_HOSPITAL_NAMES = ['รพ.ระยอง','รพ.เฉลิมพระเกียรติฯ ระยอง','รพ.นิคมพัฒนา','รพ.ปลวกแดง','รพ.บ้านฉาง','รพ.แกลง','รพ.บ้านค่าย','รพ.วังจันทร์','รพ.เขาชะเมา','รพ.กรุงเทพระยอง','รพ.ศรีระยอง','รพ.จุฬารัตน์'];
var healthHospitals = HEALTH_HOSPITAL_NAMES.map(function(name) {
return { name:name, red:0, yellow:0, green:0, black:0, capacity:0, status:'normal' };
});
var healthUnits = [
{ type:'EMS', cls:'ub-ems', name:'รพ.ระยอง — หน่วย ALS', status:'ในพื้นที่', detail:'2 คัน 4 คน' },
{ type:'EMS', cls:'ub-ems', name:'มูลนิธิร่วมกตัญญู', status:'ในพื้นที่', detail:'3 คัน 6 คน' },
{ type:'รพ.', cls:'ub-hosp', name:'รพ.เฉลิมพระเกียรติฯ ระยอง — ทีม ER', status:'เตรียมรับ', detail:'' },
{ type:'กรม', cls:'ub-dpm', name:'กรมควบคุมโรค — CDCU', status:'ETA 30 นาที', detail:'' }
];
function enterHealthScene(userName) {
if (typeof clearDashboardSceneLocks === 'function') clearDashboardSceneLocks();
healthCurrentUser = userName || currentUserName || 'MED';
document.getElementById('health_username').textContent = healthCurrentUser;
document.getElementById('scene_OrgChart').style.display = 'none';
var healthScene = document.getElementById('scene_Health');
if (healthScene) {
healthScene.removeAttribute('aria-hidden');
healthScene.style.display = 'flex';
}
if (typeof setHealthMediaFooterVisible === 'function') setHealthMediaFooterVisible(true);
if (typeof startRoleBroadcastPolling === 'function') startRoleBroadcastPolling('MED');
startHealthTimer();
applyOpsSceneLock('MED', IS_LEAD);
// 🎚️ ซ่อน/แสดง tabs ตาม Tier
(function() {
var tier = typeof getCurrentTier === 'function' ? parseInt(getCurrentTier(), 10) : 2;
var tabPatient = document.getElementById('health_tab_patient_btn');
var tabField = document.getElementById('health_tab_field_btn');
if (tier < 2) {
if (tabPatient) tabPatient.style.display = 'none';
if (tabField) tabField.style.display = 'none';
} else {
if (tabPatient) tabPatient.style.display = '';
if (tabField) tabField.style.display = '';
}
// reset to Tab 1 เสมอตอนเข้า scene
var btn1 = healthScene ? healthScene.querySelector('.health-tab.active') : document.querySelector('.health-tab.active');
if (btn1) btn1.classList.remove('active');
var overviewBtn = healthScene ? healthScene.querySelector('button[onclick*="overview"]') : document.querySelector('button[onclick*="overview"]');
if (overviewBtn) overviewBtn.classList.add('active');
var healthTabs = healthScene ? healthScene.querySelectorAll('.health-tab-content') : document.querySelectorAll('.health-tab-content');
healthTabs.forEach(function(el) { el.style.display = 'none'; });
var overview = document.getElementById('healthtab_overview');
if (overview) overview.style.display = 'block';
})();
// 🏥 ทำเนียบโรงพยาบาลในพื้นที่ — Tier 3+
(function() {
var card = document.getElementById('health_hospital_directory_card');
if (!card) return;
var show = (typeof hasFeature === 'function') ? hasFeature('hospital_directory') : false;
card.style.display = show ? 'block' : 'none';
if (show) loadHospitalDirectoryForHealthCard();
})();
// 🎚️ Tier guards สำหรับ MED scene buttons
if (typeof applyTierUIRestrictions === 'function') applyTierUIRestrictions();
// Tag ปุ่ม editHospitalCapacity → Tier 2+
document.querySelectorAll('button[onclick*="editHospitalCapacity"]').forEach(function(btn) {
if (!btn.getAttribute('data-min-tier')) {
btn.setAttribute('data-require-feature', 'hospital_capacity');
btn.setAttribute('data-min-tier', '2');
}
});
// Tag ปุ่ม "รายละเอียด" triage → Tier 2+
document.querySelectorAll('button[onclick*="openHealthTriageDetails"]').forEach(function(btn) {
if (!btn.getAttribute('data-min-tier')) {
btn.setAttribute('data-require-feature', 'triage');
btn.setAttribute('data-min-tier', '2');
}
});
// Tag ปุ่ม Tier 3 ให้ ribbon
['button[onclick="openAddPatientTransfer()"]',
'button[onclick="openAddHealthUnit()"]',
'button[onclick="submitHealthRequest()"]'].forEach(function(sel) {
var btn = document.querySelector('#scene_Health ' + sel) ||
document.querySelector(sel);
if (btn && !btn.getAttribute('data-min-tier')) {
btn.setAttribute('data-require-feature', 'mci');
btn.setAttribute('data-min-tier', '3');
}
});
// Tag ปุ่ม Tier 2
// Tag ปุ่ม Tier 2
[{sel:'button[onclick="openUpdateMedicalTriage()"]', feat:'triage'},
{sel:'button[onclick="submitHealthRequest()"]', feat:'support_request'},
{sel:'button[onclick="sendHealthReport()"]', feat:'triage'}].forEach(function(item) {
var btn = document.querySelector(item.sel);
if (btn && !btn.getAttribute('data-min-tier')) {
btn.setAttribute('data-require-feature', item.feat);
btn.setAttribute('data-min-tier', '2');
}
});
if (typeof applyTierUIRestrictions === 'function') applyTierUIRestrictions();
refreshHealthData();
}
function exitHealthScene() {
if (typeof stopRoleBroadcastPolling === 'function') stopRoleBroadcastPolling();
if (healthTimerInterval) clearInterval(healthTimerInterval);
document.getElementById('scene_Health').style.display = 'none';
document.getElementById('scene_OrgChart').style.display = 'flex';
}
function startHealthTimer() {
if (healthTimerInterval) clearInterval(healthTimerInterval);
updateRoleTimerElement('health_timer');
healthTimerInterval = setInterval(function() {
updateRoleTimerElement('health_timer');
}, 1000);
}
function switchHealthTab(tabId, btn) {
var scene = document.getElementById('scene_Health') || document;
scene.querySelectorAll('.health-tab-content').forEach(function(el) { el.style.display = 'none'; });
scene.querySelectorAll('.health-tab').forEach(function(el) { el.classList.remove('active'); });
var target = document.getElementById('healthtab_' + tabId);
if (target) target.style.display = 'block';
if (btn) btn.classList.add('active');
}
function renderHospitalDirectoryForHealthCard(list) {
var box = document.getElementById('health_hospital_directory_list');
if (!box) return;
list = list || [];
if (!list.length) { box.innerHTML = '<div style="color:#94a3b8;text-align:center;padding:8px;">ยังไม่มีข้อมูลทำเนียบโรงพยาบาล — ติดต่อแอดมินเพื่อเพิ่มรายการ</div>'; return; }
box.innerHTML = list.map(function(h) {
return '<div style="background:white;border:1px solid #bfdbfe;border-radius:8px;padding:8px 12px;">' +
'<div style="font-weight:900;color:#0f172a;font-size:13px;">' + roleSafeText(h.name) + '</div>' +
'<div style="color:#2563eb;font-size:12px;margin-top:2px;"><i class="fas fa-notes-medical"></i> รับผู้ป่วยประเภท: ' + roleSafeText(h.acceptTypes || '-') + '</div>' +
(h.phone ? '<a href="tel:' + roleSafeText(h.phone) + '" style="color:#16a34a;font-size:12px;font-weight:900;text-decoration:none;"><i class="fas fa-phone"></i> ' + roleSafeText(h.phone) + '</a>' : '') +
'</div>';
}).join('');
}
function loadHospitalDirectoryForHealthCard() {
if (typeof google === 'undefined' || !google.script || !google.script.run) return;
google.script.run
.withSuccessHandler(function(list) { renderHospitalDirectoryForHealthCard(list || []); })
.withFailureHandler(function() { renderHospitalDirectoryForHealthCard([]); })
.getHospitalDirectory(APP_AGENCY_ID || '');
}
function refreshHealthData() {
google.script.run
.withSuccessHandler(function(state) {
state = state || {};
window._lastHealthState = state;
var es = state.emergState || state.emergencyState || window._lastEmergState || {};
applyHealthEmergencyState(es, state.triageDetails || []);
if (!((es.triageDetails || state.triageDetails || []).length)) refreshHealthEmergencyDirect();
renderHealthSitrep(state.roleSitrep || null);
if (!state.roleSitrep) refreshHealthSitrepDirect();
})
.withFailureHandler(function(err) {
var fallbackEvtName = document.getElementById('ban_name') ? document.getElementById('ban_name').textContent : '-';
var fallbackEvtLoc = document.getElementById('ban_loc') ? document.getElementById('ban_loc').textContent : '-';
var fallbackCommander = document.getElementById('org_ic_name') ? document.getElementById('org_ic_name').textContent : '-';
document.getElementById('health_evtName').textContent = fallbackEvtName || '-';
document.getElementById('health_evtLoc').textContent = fallbackEvtLoc || '-';
document.getElementById('health_evtCommander').textContent = fallbackCommander || '-';
renderHealthSitrep(null);
})
.getHealthState();
}
function refreshHealthEmergencyDirect() {
if (typeof google === 'undefined' || !google.script || !google.script.run) return;
google.script.run
.withSuccessHandler(function(es) { applyHealthEmergencyState(es || {}, []); })
.withFailureHandler(function(err) { })
.getEmergencyStateForAgency(typeof APP_AGENCY_ID !== "undefined" ? APP_AGENCY_ID : "", typeof APP_AGENCY_SHEET_ID !== "undefined" ? APP_AGENCY_SHEET_ID : "", typeof getActiveJoinToken === "function" ? getActiveJoinToken() : "");
}
function applyHealthEmergencyState(es, detailFallback) {
es = es || {};
window._lastEmergState = es;
updateRoleTimerElement('health_timer');
var fallbackEvtName = document.getElementById('ban_name') ? document.getElementById('ban_name').textContent : '';
var fallbackEvtLoc = document.getElementById('ban_loc') ? document.getElementById('ban_loc').textContent : '';
var fallbackCommander = document.getElementById('org_ic_name') ? document.getElementById('org_ic_name').textContent : '';
var evtName = es.evtName || es.incidentName || es.IncidentName || fallbackEvtName || '-';
var evtLoc = es.evtLoc || es.incidentLocation || es.IncidentLocation || fallbackEvtLoc || '-';
document.getElementById('health_evtName').textContent = evtName;
document.getElementById('health_evtLoc').textContent = evtLoc;
var healthCommanderEl = document.getElementById('health_evtCommander');
if (healthCommanderEl) {
var hcName = (es.registeredICName || '').trim() || 'ยังไม่มี IC';
healthCommanderEl.textContent = (es.commanderPosition ? es.commanderPosition + ' ' : '') + hcName;
}
var triage = es.triage || {};
window._healthTriageDetails = es.triageDetails || detailFallback || [];
['red','yellow','green','black'].forEach(function(c) {
var v = triage[c] || 0;
var el1 = document.getElementById('health_' + c);
var el2 = document.getElementById('health_' + c + '2');
if (el1) el1.textContent = v;
if (el2) el2.textContent = v;
});
var field = es.fieldCasualty || {};
var fieldBox = document.getElementById('health_field_estimate_box');
if (fieldBox) {
fieldBox.textContent = 'ยอดประมาณการจาก ICP: รวม ' + (field.totalEstimate || 0) +
' ราย | ยังในพื้นที่ ' + (field.stillInArea || 0) +
' | อพยพ/ส่งออกแล้ว ' + (field.evacuatedOrSent || 0);
}
}
function renderHealthSitrep(sit) {
var box = document.getElementById('health_sitrep_box');
var content = document.getElementById('health_sitrep_content');
if (!box || !content) return;
var text = sit && (sit.text || sit.Text) ? String(sit.text || sit.Text) : '';
if (!text.trim()) {
content.innerHTML = '<div style="text-align:center;color:#aaa;padding:12px;font-size:13px;">ยังไม่มีรายงาน</div>';
return;
}
var time = sit.time || '';
var situation = typeof extractRoleSitrepSection === 'function' ? extractRoleSitrepSection(text, 'S') : compactRoleSitrepText(text, 78);
var mission = typeof extractRoleSitrepSection === 'function' ? extractRoleSitrepSection(text, 'M') : '-';
var action = typeof extractRoleSitrepSection === 'function' ? extractRoleSitrepSection(text, 'E') : '-';
var full = encodeURIComponent(text);
var encodedTime = encodeURIComponent(time);
content.innerHTML =
'<div style="display:grid;grid-template-columns:repeat(3,1fr);gap:8px;text-align:left;">' +
'<div style="background:#fff7ed;border:1px solid #fed7aa;border-radius:8px;padding:8px;"><b style="display:block;color:#9a3412;font-size:12px;margin-bottom:4px;">สถานการณ์</b><span style="font-size:12px;color:#475569;">' + roleSafeText(situation) + '</span></div>' +
'<div style="background:#eff6ff;border:1px solid #bfdbfe;border-radius:8px;padding:8px;"><b style="display:block;color:#1d4ed8;font-size:12px;margin-bottom:4px;">ภารกิจ</b><span style="font-size:12px;color:#475569;">' + roleSafeText(mission) + '</span></div>' +
'<div style="background:#f0fdf4;border:1px solid #bbf7d0;border-radius:8px;padding:8px;"><b style="display:block;color:#166534;font-size:12px;margin-bottom:4px;">การปฏิบัติ</b><span style="font-size:12px;color:#475569;">' + roleSafeText(action) + '</span></div>' +
'</div>' +
'<button onclick="showRoleSitrepFull(\'' + full + '\', \'' + encodedTime + '\')" style="margin-top:8px;background:#34495e;color:white;border:none;border-radius:6px;padding:7px 12px;font-size:12px;font-weight:bold;cursor:pointer;width:100%;"><i class="fas fa-eye"></i> ดู SITREP เต็ม</button>';
}
function refreshHealthSitrepDirect() {
if (typeof google === 'undefined' || !google.script || !google.script.run) return;
google.script.run
.withSuccessHandler(function(sit) { renderHealthSitrep(sit || null); })
.withFailureHandler(function(err) { })
.getLatestRoleSitrep();
}
function submitHealthNote() {
var noteEl = document.getElementById('health_note_text');
var note = noteEl ? noteEl.value.trim() : '';
if (!note) return Swal.fire('กรุณาพิมพ์ Note ก่อนส่ง', '', 'warning');
if (noteEl) noteEl.value = '';
_optimisticRun_('addRoleNote',
['MED', 'สาธารณสุข/1669', healthCurrentUser || USER_NAME || 'MED', window.currentUserPhone || '', note],
'ส่ง Note เข้า IC แล้ว ✓', 'ส่ง Note ไม่สำเร็จ');
}
// 📝 Note ของ OC/ICP และจุดอพยพ — เปิดให้ทุกคนในกล่อง (ไม่อยู่ใน lock selectors เหมือนปุ่มแนบไฟล์)
function submitOCNote() {
var noteEl = document.getElementById('oc_note_text');
var note = noteEl ? noteEl.value.trim() : '';
if (!note) return Swal.fire('กรุณาพิมพ์ Note ก่อนส่ง', '', 'warning');
if (noteEl) noteEl.value = '';
_optimisticRun_('addRoleNote',
['OSC', 'OC/ICP', ocCurrentUser || USER_NAME || 'OC', window.currentUserPhone || '', note],
'ส่ง Note เข้า IC แล้ว ✓', 'ส่ง Note ไม่สำเร็จ');
}
function submitEvacNote() {
var noteEl = document.getElementById('evac_note_text');
var note = noteEl ? noteEl.value.trim() : '';
if (!note) return Swal.fire('กรุณาพิมพ์ Note ก่อนส่ง', '', 'warning');
if (noteEl) noteEl.value = '';
_optimisticRun_('addRoleNote',
['EVAC_POINT', 'จุดอพยพ', evacCurrentUser || USER_NAME || 'EVAC', window.currentUserPhone || '', note],
'ส่ง Note เข้า IC แล้ว ✓', 'ส่ง Note ไม่สำเร็จ');
}
function submitHealthRequest() {
if (typeof requireFeature === 'function' && !requireFeature('support_request', 'ขอสนับสนุน/รายงานสาธารณสุข (ระดับ 2+)')) return;
var type = document.getElementById('health_req_type').value;
var detail = document.getElementById('health_req_detail').value.trim();
if (!type) { Swal.fire('กรุณาเลือกประเภท', '', 'warning'); return; }
if (!detail) { Swal.fire('กรุณากรอกรายละเอียด', '', 'warning'); return; }
Swal.fire({ title:'กำลังส่งคำขอ...', text:'กำลังส่งคำขอสนับสนุนเข้า EOC', allowOutsideClick:false, allowEscapeKey:false, showConfirmButton:false, didOpen:function(){ Swal.showLoading(); } });
google.script.run
.withSuccessHandler(function() {
document.getElementById('health_req_detail').value = '';
document.getElementById('health_req_type').selectedIndex = 0;
refreshHealthData();
Swal.fire({ icon:'success', title:'ส่งคำขอแล้ว', timer:1500, showConfirmButton:false });
})
.withFailureHandler(function(err) {
Swal.fire('ส่งคำขอไม่สำเร็จ', err && err.message ? err.message : String(err), 'error');
})
.submitSupportRequest(type, detail, healthCurrentUser || 'MED', (typeof APP_AGENCY_ID !== 'undefined' ? APP_AGENCY_ID : ''));
}
function openUpdateMedicalTriage() {
if (typeof requireFeature === 'function' && !requireFeature('triage', 'Triage 4 สี (ระดับ 2+)')) return;
var state = window._lastHealthState || {};
var triage = (state.emergState && state.emergState.triage) ? state.emergState.triage : {};
Swal.fire({
title: 'อัปเดตยอดผู้บาดเจ็บยืนยัน',
html:
'<input id="med_red" type="number" min="0" class="swal2-input" placeholder="RED" value="' + (triage.red || 0) + '">' +
'<input id="med_yellow" type="number" min="0" class="swal2-input" placeholder="YELLOW" value="' + (triage.yellow || 0) + '">' +
'<input id="med_green" type="number" min="0" class="swal2-input" placeholder="GREEN" value="' + (triage.green || 0) + '">' +
'<input id="med_black" type="number" min="0" class="swal2-input" placeholder="BLACK" value="' + (triage.black || 0) + '">',
showCancelButton: true,
confirmButtonText: 'บันทึกยอดยืนยัน'
}).then(function(r) {
if (!r.isConfirmed) return;
Swal.fire({ title:'กำลังบันทึกยอด...', text:'กำลังส่งยอดผู้บาดเจ็บยืนยันเข้า EOC', allowOutsideClick:false, allowEscapeKey:false, showConfirmButton:false, didOpen:function(){ Swal.showLoading(); } });
google.script.run
.withSuccessHandler(function() {
refreshHealthData();
Swal.fire({ icon:'success', title:'อัปเดตยอดยืนยันแล้ว', timer:1400, showConfirmButton:false });
})
.withFailureHandler(function(err) {
Swal.fire('บันทึกไม่สำเร็จ', err && err.message ? err.message : String(err), 'error');
})
.updateMedicalTriage(
document.getElementById('med_red').value,
document.getElementById('med_yellow').value,
document.getElementById('med_green').value,
document.getElementById('med_black').value,
0,
'Health/1669',
healthCurrentUser || 'MED'
);
});
}
function editHospitalCapacity(rowIndex) {
if (typeof requireFeature === 'function' && !requireFeature('hospital_capacity', 'แก้ไข Capacity โรงพยาบาล (ระดับ 2+)')) return;
var state = window._lastHealthState || {};
var hosp = (state.hospitals || []).find(function(h) { return h.rowIndex === rowIndex; });
if (!hosp) return Swal.fire('ไม่พบข้อมูล รพ.', '', 'error');
Swal.fire({
title: 'แก้ Capacity: ' + hosp.name,
html:
'<input id="h_red" type="number" class="swal2-input" placeholder="Red capacity" value="' + hosp.redCap + '">' +
'<input id="h_yellow" type="number" class="swal2-input" placeholder="Yellow capacity" value="' + hosp.yellowCap + '">' +
'<input id="h_green" type="number" class="swal2-input" placeholder="Green capacity" value="' + hosp.greenCap + '">' +
'<select id="h_status" class="swal2-input"><option value="normal">ปกติ</option><option value="warn">ใกล้เต็ม</option><option value="divert">Divert</option></select>' +
'<input id="h_contact" class="swal2-input" placeholder="ผู้ประสาน/เบอร์โทร" value="' + (hosp.contact || '') + '">',
didOpen: function() { document.getElementById('h_status').value = hosp.status || 'normal'; },
showCancelButton: true,
confirmButtonText: 'บันทึก'
}).then(function(r) {
if (!r.isConfirmed) return;
Swal.fire({ title:'กำลังบันทึกข้อมูล รพ....', text:'กำลังส่งข้อมูล capacity เข้า EOC', allowOutsideClick:false, allowEscapeKey:false, showConfirmButton:false, didOpen:function(){ Swal.showLoading(); } });
google.script.run.withSuccessHandler(function() {
refreshHealthData();
Swal.fire({ icon:'success', title:'บันทึกแล้ว', timer:1200, showConfirmButton:false });
}).withFailureHandler(function(err) {
Swal.fire('บันทึกไม่สำเร็จ', err && err.message ? err.message : String(err), 'error');
}).updateHospitalCapacity(
rowIndex,
document.getElementById('h_red').value,
document.getElementById('h_yellow').value,
document.getElementById('h_green').value,
0,
document.getElementById('h_status').value,
document.getElementById('h_contact').value,
healthCurrentUser || 'MED'
);
});
}
function openAddPatientTransfer() {
if (typeof requireFeature === 'function' && !requireFeature('mci', 'บันทึกส่งต่อผู้ป่วย (ระดับ 3+)')) return;
var hospitals = ((window._lastHealthState || {}).hospitals || []).map(function(h) { return h.name; });
if (!hospitals.length) hospitals = HEALTH_HOSPITAL_NAMES.slice();
var hospitalOptions = hospitals.map(function(h) { return '<option>' + h + '</option>'; }).join('');
Swal.fire({
title: 'เพิ่มรายการส่งต่อผู้ป่วย',
html:
'<input id="pt_id" class="swal2-input" placeholder="Patient/Tag ID เช่น RED-001">' +
'<select id="pt_color" class="swal2-input"><option value="red">RED</option><option value="yellow">YELLOW</option><option value="green">GREEN</option><option value="black">BLACK</option></select>' +
'<select id="pt_hosp" class="swal2-input">' + hospitalOptions + '</select>' +
'<input id="pt_amb" class="swal2-input" placeholder="รถ/หน่วยที่นำส่ง">' +
'<input id="pt_eta" class="swal2-input" placeholder="ETA เช่น 8 นาที">' +
'<select id="pt_decon" class="swal2-input"><option value="ผ่าน Decon แล้ว">ผ่าน Decon แล้ว</option><option value="ยังไม่ผ่าน Decon">ยังไม่ผ่าน Decon</option><option value="ไม่ปนเปื้อน">ไม่ปนเปื้อน</option></select>',
showCancelButton: true,
confirmButtonText: 'บันทึก'
}).then(function(r) {
if (!r.isConfirmed) return;
Swal.fire({ title:'กำลังบันทึกการส่งต่อ...', text:'กำลังส่งข้อมูลผู้ป่วยเข้า EOC', allowOutsideClick:false, allowEscapeKey:false, showConfirmButton:false, didOpen:function(){ Swal.showLoading(); } });
google.script.run.withSuccessHandler(function() {
refreshHealthData();
Swal.fire({ icon:'success', title:'เพิ่มรายการแล้ว', timer:1200, showConfirmButton:false });
}).withFailureHandler(function(err) {
Swal.fire('บันทึกไม่สำเร็จ', err && err.message ? err.message : String(err), 'error');
}).addPatientTransfer(
document.getElementById('pt_id').value,
document.getElementById('pt_color').value,
document.getElementById('pt_hosp').value,
document.getElementById('pt_amb').value,
document.getElementById('pt_eta').value,
document.getElementById('pt_decon').value,
'',
healthCurrentUser || 'MED'
);
});
}
function openAddHealthUnit() {
if (typeof requireFeature === 'function' && !requireFeature('mci', 'เพิ่มหน่วยสาธารณสุข (ระดับ 3+)')) return;
Swal.fire({
title: 'เพิ่มหน่วยสาธารณสุข',
html:
'<select id="hu_type" class="swal2-input"><option>EMS</option><option>รพ.</option><option>กรม</option><option>สสจ.</option><option>อื่นๆ</option></select>' +
'<input id="hu_name" class="swal2-input" placeholder="ชื่อหน่วย เช่น รพ.ระยอง ALS">' +
'<input id="hu_agency" class="swal2-input" placeholder="หน่วยงานต้นทาง">' +
'<input id="hu_qty" type="number" class="swal2-input" placeholder="จำนวน" value="1">' +
'<select id="hu_status" class="swal2-input"><option value="incoming">กำลังมา</option><option value="onsite">ในพื้นที่</option><option value="ready">พร้อมรับ</option><option value="standby">Standby</option></select>' +
'<input id="hu_eta" class="swal2-input" placeholder="ETA/เวลา">',
showCancelButton: true,
confirmButtonText: 'บันทึก'
}).then(function(r) {
if (!r.isConfirmed) return;
Swal.fire({ title:'กำลังบันทึกหน่วย...', text:'กำลังส่งข้อมูลหน่วยสาธารณสุขเข้า EOC', allowOutsideClick:false, allowEscapeKey:false, showConfirmButton:false, didOpen:function(){ Swal.showLoading(); } });
google.script.run.withSuccessHandler(function() {
refreshHealthData();
Swal.fire({ icon:'success', title:'เพิ่มหน่วยแล้ว', timer:1200, showConfirmButton:false });
}).withFailureHandler(function(err) {
Swal.fire('บันทึกไม่สำเร็จ', err && err.message ? err.message : String(err), 'error');
}).addHealthUnit(
document.getElementById('hu_type').value,
document.getElementById('hu_name').value,
document.getElementById('hu_agency').value,
document.getElementById('hu_qty').value,
document.getElementById('hu_status').value,
document.getElementById('hu_eta').value,
'',
healthCurrentUser || 'MED'
);
});
}
function sendHealthReport() {
if (!requireFeature('triage', 'ส่งรายงาน สสอ./สสจ. (ระดับ 2+)')) return;
var red = document.getElementById('health_red').textContent;
var yellow = document.getElementById('health_yellow').textContent;
var green = document.getElementById('health_green').textContent;
var black = document.getElementById('health_black').textContent;
var text = 'รายงานสาธารณสุข/1669: RED=' + red + ', YELLOW=' + yellow + ', GREEN=' + green + ', BLACK=' + black;
Swal.fire({ title:'กำลังส่งรายงาน...', text:'กำลังส่งรายงานสาธารณสุขเข้า EOC', allowOutsideClick:false, allowEscapeKey:false, showConfirmButton:false, didOpen:function(){ Swal.showLoading(); } });
google.script.run
.withSuccessHandler(function() {
Swal.fire({ icon:'success', title:'ส่งรายงานแล้ว', timer:1500, showConfirmButton:false });
})
.withFailureHandler(function(err) {
Swal.fire('ส่งรายงานไม่สำเร็จ', err && err.message ? err.message : String(err), 'error');
})
.addCommanderLog(text, healthCurrentUser || 'MED');
}
var evacCurrentUser = '';
var evacTimerInterval = null;
var evacSelectedLat = '';
var evacSelectedLng = '';
var evacLayoutReady = false;
function adjustNumberInput(id, delta) {
var el = document.getElementById(id);
if (!el) return;
var next = Math.max(0, (parseInt(el.value, 10) || 0) + delta);
el.value = next;
}
function makeEvacStepper(inputId) {
var input = document.getElementById(inputId);
if (!input || input.dataset.stepperReady === '1') return;
input.dataset.stepperReady = '1';
input.style.textAlign = 'center';
input.style.padding = '7px';
input.style.border = '1px solid #ddd';
input.style.borderRadius = '6px';
input.style.minWidth = '0';
var wrap = document.createElement('div');
wrap.style.cssText = 'display:grid;grid-template-columns:30px 1fr 30px;gap:4px;align-items:center;margin-top:3px;';
var minus = document.createElement('button');
minus.type = 'button';
minus.textContent = '-';
minus.style.cssText = 'height:32px;border:1px solid #ddd;background:#fff;border-radius:999px;font-weight:bold;cursor:pointer;';
minus.onclick = function() { adjustNumberInput(inputId, -1); };
var plus = document.createElement('button');
plus.type = 'button';
plus.textContent = '+';
plus.style.cssText = minus.style.cssText;
plus.onclick = function() { adjustNumberInput(inputId, 1); };
input.parentNode.insertBefore(wrap, input);
wrap.appendChild(minus);
wrap.appendChild(input);
wrap.appendChild(plus);
}
function addEvacOtherRow(name, qty) {
var host = document.getElementById('evac_other_rows');
if (!host) return;
var row = document.createElement('div');
row.className = 'evac-other-row';
row.style.cssText = 'display:grid;grid-template-columns:1fr 76px 32px;gap:6px;align-items:center;';
row.innerHTML =
'<input class="evac-other-name" placeholder="อื่นๆ ระบุ" value="' + roleSafeText(name || '') + '" style="padding:7px;border:1px solid #ddd;border-radius:6px;font-size:12px;box-sizing:border-box;width:100%;">' +
'<input class="evac-other-qty" type="number" min="0" value="' + (parseInt(qty, 10) || 0) + '" style="padding:7px;border:1px solid #ddd;border-radius:6px;font-size:12px;box-sizing:border-box;width:100%;text-align:center;">' +
'<button type="button" title="ลบ" style="height:32px;border:1px solid #fecaca;background:#fff;color:#dc2626;border-radius:6px;cursor:pointer;"><i class="fas fa-times"></i></button>';
row.querySelector('button').onclick = function() { row.remove(); };
host.appendChild(row);
}
function collectEvacOtherResources() {
var parts = [];
var waterUnit = document.getElementById('evac_water_unit');
if (waterUnit && waterUnit.value.trim()) parts.push('หน่วยน้ำดื่ม: ' + waterUnit.value.trim());
document.querySelectorAll('#evac_other_rows .evac-other-row').forEach(function(row) {
var name = row.querySelector('.evac-other-name').value.trim();
var qty = parseInt(row.querySelector('.evac-other-qty').value, 10) || 0;
if (name || qty) parts.push((name || 'อื่นๆ') + (qty ? ' ' + qty : ''));
});
var hidden = document.getElementById('evac_other');
if (hidden) hidden.value = parts.join(' | ');
return parts.join(' | ');
}
function upgradeEvacPointLayout() {
if (evacLayoutReady) return;
evacLayoutReady = true;
['evac_staff_count','evac_people_count','evac_water','evac_food','evac_blanket','evac_bed'].forEach(makeEvacStepper);
var title = document.querySelector('#scene_EvacPoint .health-card > div');
var leader = document.getElementById('evac_leader');
if (title && leader && title !== leader.parentNode && !document.getElementById('evac_leader_inline_wrap')) {
var oldBox = leader.parentNode;
var wrap = document.createElement('span');
wrap.id = 'evac_leader_inline_wrap';
wrap.style.cssText = 'display:inline-flex;align-items:center;gap:6px;margin-left:8px;font-size:12px;color:#64748b;';
wrap.innerHTML = '<span>หัวหน้าจุด</span>';
leader.style.cssText = 'width:128px;padding:6px;border:1px solid #ddd;border-radius:6px;font-size:12px;box-sizing:border-box;';
wrap.appendChild(leader);
title.appendChild(wrap);
if (oldBox && oldBox.children.length === 1) oldBox.style.display = 'none';
}
var water = document.getElementById('evac_water');
if (water && !document.getElementById('evac_water_unit')) {
var unit = document.createElement('input');
unit.id = 'evac_water_unit';
unit.placeholder = 'ระบุหน่วย';
unit.style.cssText = 'margin-top:5px;width:100%;padding:6px;border:1px solid #ddd;border-radius:6px;font-size:12px;box-sizing:border-box;';
var waterWrap = water.closest('div');
(waterWrap && waterWrap.parentNode ? waterWrap.parentNode : water.parentNode).appendChild(unit);
}
var other = document.getElementById('evac_other');
if (other && !document.getElementById('evac_other_rows')) {
var box = other.parentNode;
other.type = 'hidden';
other.style.display = 'none';
var rows = document.createElement('div');
rows.id = 'evac_other_rows';
rows.style.cssText = 'display:flex;flex-direction:column;gap:6px;';
var addBtn = document.createElement('button');
addBtn.type = 'button';
addBtn.innerHTML = '<i class="fas fa-plus"></i> เพิ่มช่องอื่นๆ';
addBtn.style.cssText = 'margin-top:4px;background:#f8fafc;color:#2980b9;border:1px dashed #2980b9;border-radius:6px;padding:7px 10px;font-size:12px;font-weight:bold;cursor:pointer;width:100%;';
addBtn.onclick = function() { addEvacOtherRow(); };
box.appendChild(rows);
box.appendChild(addBtn);
addEvacOtherRow();
}
var noteEl = document.getElementById('evac_note');
if (noteEl) {
noteEl.placeholder = 'Note ถึง IC เช่น ปัญหาหน้างาน / ต้องการประสานเพิ่ม...';
var noteLabel = noteEl.parentNode ? noteEl.parentNode.querySelector('label') : null;
if (noteLabel) noteLabel.textContent = 'Note ถึง IC';
}
if (noteEl && !document.getElementById('evac_note_card')) {
var firstCard = document.querySelector('#scene_EvacPoint .health-card');
var noteHost = noteEl.parentNode;
var noteCard = document.createElement('div');
noteCard.id = 'evac_note_card';
noteCard.className = 'health-card';
noteCard.style.cssText = 'border-left:4px solid #16a34a;';
noteCard.innerHTML = '<div style="font-size:13px;font-weight:bold;color:#166534;margin-bottom:8px;"><i class="fas fa-sticky-note"></i> Note ส่งเข้า IC</div>';
noteCard.appendChild(noteHost);
var noteBtn = document.createElement('button');
noteBtn.id = 'evac_note_send_btn';
noteBtn.onclick = submitEvacNote;
noteBtn.innerHTML = '<i class="fas fa-paper-plane"></i> ส่ง Note เข้า IC';
noteBtn.style.cssText = 'margin-top:8px;background:#16a34a;color:white;border:none;border-radius:6px;padding:9px 14px;font-size:13px;cursor:pointer;font-weight:bold;width:100%;';
noteCard.appendChild(noteBtn);
if (firstCard && firstCard.parentNode) firstCard.parentNode.insertBefore(noteCard, firstCard.nextSibling);
}
var list = document.getElementById('evac_point_list');
if (list && !document.getElementById('evac_sitrep_box')) {
var sitBox = document.createElement('div');
sitBox.className = 'health-card';
sitBox.id = 'evac_sitrep_box';
sitBox.innerHTML = '<div style="font-size:13px;font-weight:bold;color:#2c3e50;margin-bottom:8px;"><i class="fas fa-bullhorn"></i> SITREP / สถานการณ์ล่าสุด</div><div id="evac_sitrep_content" style="text-align:center;color:#aaa;padding:12px;font-size:13px;">ยังไม่มีรายงาน</div>';
list.parentNode.parentNode.insertBefore(sitBox, list.parentNode);
list.parentNode.style.display = 'none';
}
}
function enterEvacPointScene(userName) {
evacCurrentUser = userName || currentUserName || 'EVAC';
document.getElementById('evac_username').textContent = evacCurrentUser;
document.getElementById('scene_OrgChart').style.display = 'none';
document.getElementById('scene_EvacPoint').style.display = 'flex';
if (typeof startRoleBroadcastPolling === 'function') startRoleBroadcastPolling('EVAC_POINT');
upgradeEvacPointLayout();
if (!document.getElementById('evac_leader').value) {
document.getElementById('evac_leader').value = evacCurrentUser;
}
refreshEvacEmergencyDirect();
startEvacTimer();
applyOpsSceneLock('EVAC_POINT', IS_LEAD);
refreshEvacPointData();
}
function exitEvacPointScene() {
if (typeof stopRoleBroadcastPolling === 'function') stopRoleBroadcastPolling();
if (evacTimerInterval) clearInterval(evacTimerInterval);
document.getElementById('scene_EvacPoint').style.display = 'none';
document.getElementById('scene_OrgChart').style.display = 'flex';
}
function startEvacTimer() {
if (evacTimerInterval) clearInterval(evacTimerInterval);
updateRoleTimerElement('evac_timer');
evacTimerInterval = setInterval(function() {
updateRoleTimerElement('evac_timer');
}, 1000);
}
function openEvacMapPicker() {
window._mapPickerContext = {
titleHtml: '<i class="fas fa-person-shelter"></i> เลือกจุดอพยพ',
searchPlaceholder: 'ค้นหาสถานที่สำหรับจุดอพยพ...',
coordPlaceholder: 'วาง Google Maps link หรือ lat,lon ของจุดอพยพ',
selectedText: 'ยังไม่ได้เลือกพิกัดจุดอพยพ'
};
window._zonePickerCallback = function(lat, lng) {
evacSelectedLat = lat;
evacSelectedLng = lng;
document.getElementById('evac_coords').value = lat + ', ' + lng;
};
tempLat = '';
tempLng = '';
var text = document.getElementById('selectedCoordText');
if (text) text.textContent = 'ยังไม่ได้เลือกพิกัด';
openMap();
}
function refreshEvacPointData() {
google.script.run
.withSuccessHandler(function(state) {
window._lastEvacState = state || {};
applyEvacEmergencyState((state && state.emergState) || {});
renderEvacSitrep((state && state.roleSitrep) || null);
if (!(state && state.roleSitrep)) refreshEvacSitrepDirect();
var points = (state && Array.isArray(state.points)) ? state.points : [];
renderEvacPointList(points);
if (!points.length) refreshEvacPointsDirect();
})
.withFailureHandler(function(err) {
refreshEvacEmergencyDirect();
renderEvacSitrep(null);
refreshEvacPointsDirect();
})
.getEvacuationState();
}
function refreshEvacPointsDirect() {
if (typeof google === 'undefined' || !google.script || !google.script.run) return;
google.script.run
.withSuccessHandler(function(points) { renderEvacPointList(Array.isArray(points) ? points : []); })
.withFailureHandler(function(err) { })
.getEvacuationPoints();
}
function refreshEvacEmergencyDirect() {
if (typeof google === 'undefined' || !google.script || !google.script.run) return;
google.script.run
.withSuccessHandler(function(es) {
if (es && typeof es === 'object') applyEvacEmergencyState(es);
else refreshEvacEmergencyLite();
})
.withFailureHandler(function(err) { refreshEvacEmergencyLite(); })
.getEmergencyStateForAgency(typeof APP_AGENCY_ID !== "undefined" ? APP_AGENCY_ID : "", typeof APP_AGENCY_SHEET_ID !== "undefined" ? APP_AGENCY_SHEET_ID : "", typeof getActiveJoinToken === "function" ? getActiveJoinToken() : "");
}
function refreshEvacEmergencyLite() {
if (typeof google === 'undefined' || !google.script || !google.script.run) return;
google.script.run
.withSuccessHandler(function(es) { applyEvacEmergencyState(es || {}); })
.withFailureHandler(function(err) { })
.getEmergencyStateLiteForAgency(typeof APP_AGENCY_ID !== "undefined" ? APP_AGENCY_ID : "", typeof APP_AGENCY_SHEET_ID !== "undefined" ? APP_AGENCY_SHEET_ID : "", typeof getActiveJoinToken === "function" ? getActiveJoinToken() : "");
}
function applyEvacEmergencyState(es) {
es = es || {};
window._lastEmergState = es;
updateRoleTimerElement('evac_timer');
var fallbackEvtName = document.getElementById('ban_name') ? document.getElementById('ban_name').textContent : '';
var fallbackEvtLoc = document.getElementById('ban_loc') ? document.getElementById('ban_loc').textContent : '';
var fallbackCommander = document.getElementById('org_ic_name') ? document.getElementById('org_ic_name').textContent : '';
var evtName = es.evtName || es.incidentName || es.IncidentName || fallbackEvtName || '-';
var evtLoc = es.evtLoc || es.incidentLocation || es.IncidentLocation || fallbackEvtLoc || '-';
var commander = (es.registeredICName || '').trim() || 'ยังไม่มี IC';
if (document.getElementById('evac_evtName')) document.getElementById('evac_evtName').textContent = evtName;
if (document.getElementById('evac_evtLoc')) document.getElementById('evac_evtLoc').textContent = evtLoc;
if (document.getElementById('evac_evtCommander')) document.getElementById('evac_evtCommander').textContent = (es.commanderPosition ? es.commanderPosition + ' ' : '') + commander;
}
function renderEvacSitrep(sit) {
var content = document.getElementById('evac_sitrep_content');
if (!content) return;
var text = sit && (sit.text || sit.Text) ? String(sit.text || sit.Text) : '';
if (!text.trim()) {
content.innerHTML = '<div style="text-align:center;color:#aaa;padding:12px;font-size:13px;">ยังไม่มีรายงาน</div>';
return;
}
var time = sit.time || '';
var situation = typeof extractRoleSitrepSection === 'function' ? extractRoleSitrepSection(text, 'S') : compactRoleSitrepText(text, 78);
var mission = typeof extractRoleSitrepSection === 'function' ? extractRoleSitrepSection(text, 'M') : '-';
var action = typeof extractRoleSitrepSection === 'function' ? extractRoleSitrepSection(text, 'E') : '-';
var full = encodeURIComponent(text);
var encodedTime = encodeURIComponent(time);
content.innerHTML =
'<div style="display:grid;grid-template-columns:repeat(3,1fr);gap:8px;text-align:left;">' +
'<div style="background:#fff7ed;border:1px solid #fed7aa;border-radius:8px;padding:8px;"><b style="display:block;color:#9a3412;font-size:12px;margin-bottom:4px;">สถานการณ์</b><span style="font-size:12px;color:#475569;">' + roleSafeText(situation) + '</span></div>' +
'<div style="background:#eff6ff;border:1px solid #bfdbfe;border-radius:8px;padding:8px;"><b style="display:block;color:#1d4ed8;font-size:12px;margin-bottom:4px;">ภารกิจ</b><span style="font-size:12px;color:#475569;">' + roleSafeText(mission) + '</span></div>' +
'<div style="background:#f0fdf4;border:1px solid #bbf7d0;border-radius:8px;padding:8px;"><b style="display:block;color:#166534;font-size:12px;margin-bottom:4px;">การปฏิบัติ</b><span style="font-size:12px;color:#475569;">' + roleSafeText(action) + '</span></div>' +
'</div>' +
'<button onclick="showRoleSitrepFull(\'' + full + '\', \'' + encodedTime + '\')" style="margin-top:8px;background:#34495e;color:white;border:none;border-radius:6px;padding:7px 12px;font-size:12px;font-weight:bold;cursor:pointer;width:100%;"><i class="fas fa-eye"></i> ดู SITREP เต็ม</button>';
}
function refreshEvacSitrepDirect() {
if (typeof google === 'undefined' || !google.script || !google.script.run) return;
google.script.run
.withSuccessHandler(function(sit) { renderEvacSitrep(sit || null); })
.withFailureHandler(function(err) { })
.getLatestRoleSitrep();
}
function renderEvacPointList(points) {
var el = document.getElementById('evac_point_list');
if (!points || !points.length) {
el.innerHTML = '<div style="text-align:center;color:#aaa;padding:16px;font-size:13px;">ยังไม่มีรายงานจุดอพยพ</div>';
return;
}
el.innerHTML = points.map(function(p) {
var loc = p.lat && p.lng ? '<a href="https://www.google.com/maps?q=' + p.lat + ',' + p.lng + '" target="_blank" style="color:#2980b9;text-decoration:none;">' + p.lat.toFixed(5) + ', ' + p.lng.toFixed(5) + '</a>' : '-';
return '<div class="oc-card">' +
'<div style="display:flex;align-items:flex-start;gap:10px;">' +
'<div style="width:34px;height:34px;border-radius:8px;background:#E6F1FB;color:#185FA5;display:flex;align-items:center;justify-content:center;flex-shrink:0;"><i class="fas fa-people-roof"></i></div>' +
'<div style="flex:1;">' +
'<div style="font-size:13px;font-weight:bold;color:#2c3e50;">' + p.pointName + '</div>' +
'<div style="font-size:11px;color:#666;">หัวหน้า: ' + p.leaderName + ' | พิกัด: ' + loc + '</div>' +
'</div>' +
'<div style="text-align:right;min-width:70px;"><div style="font-size:20px;font-weight:bold;color:#2980b9;">' + p.evacueeCount + '</div><div style="font-size:10px;color:#777;">ผู้อพยพ</div></div>' +
'</div>' +
'<div style="display:grid;grid-template-columns:repeat(5,1fr);gap:6px;margin-top:10px;font-size:11px;text-align:center;">' +
'<div style="background:#f6f8fa;border-radius:6px;padding:5px;">จนท.<br><b>' + p.staffCount + '</b></div>' +
'<div style="background:#f6f8fa;border-radius:6px;padding:5px;">น้ำ<br><b>' + p.water + '</b></div>' +
'<div style="background:#f6f8fa;border-radius:6px;padding:5px;">อาหาร<br><b>' + p.food + '</b></div>' +
'<div style="background:#f6f8fa;border-radius:6px;padding:5px;">ผ้าห่ม<br><b>' + p.blanket + '</b></div>' +
'<div style="background:#f6f8fa;border-radius:6px;padding:5px;">เตียง<br><b>' + p.bed + '</b></div>' +
'</div>' +
(p.otherResources || p.note ? '<div style="margin-top:8px;font-size:12px;color:#666;">' + (p.otherResources ? 'อื่นๆ: ' + p.otherResources + '<br>' : '') + (p.note ? 'หมายเหตุ: ' + p.note : '') + '</div>' : '') +
'</div>';
}).join('');
}
function submitEvacPointReport() {
collectEvacOtherResources();
var pointName = document.getElementById('evac_point_name').value.trim();
var leader = document.getElementById('evac_leader').value.trim();
if (!pointName) { Swal.fire('กรุณาระบุชื่อจุดอพยพ', '', 'warning'); return; }
if (!evacSelectedLat || !evacSelectedLng) { Swal.fire('กรุณาเลือกพิกัดจุดอพยพ', '', 'warning'); return; }
if (!leader) { Swal.fire('กรุณาระบุหัวหน้าจุด', '', 'warning'); return; }
Swal.fire({ title:'กำลังส่งรายงานจุดอพยพ...', text:'กำลังส่งข้อมูลจุดอพยพเข้า EOC', allowOutsideClick:false, allowEscapeKey:false, showConfirmButton:false, didOpen:function(){ Swal.showLoading(); } });
google.script.run
.withSuccessHandler(function() {
refreshEvacPointData();
Swal.fire({ icon:'success', title:'รายงานจุดอพยพแล้ว', timer:1400, showConfirmButton:false });
})
.withFailureHandler(function(err) {
Swal.fire('บันทึกไม่สำเร็จ', err && err.message ? err.message : String(err), 'error');
})
.saveEvacuationPoint(
pointName,
evacSelectedLat,
evacSelectedLng,
leader,
document.getElementById('evac_people_count').value,
document.getElementById('evac_staff_count').value,
document.getElementById('evac_water').value,
document.getElementById('evac_food').value,
document.getElementById('evac_blanket').value,
document.getElementById('evac_bed').value,
document.getElementById('evac_other').value.trim(),
'',
evacCurrentUser || 'EVAC'
);
}
function submitEvacNote() {
var noteEl = document.getElementById('evac_note');
var note = noteEl ? noteEl.value.trim() : '';
if (!note) return Swal.fire('กรุณาพิมพ์ Note ก่อนส่ง', '', 'warning');
if (noteEl) noteEl.value = '';
_optimisticRun_('addRoleNote',
['EVAC', 'จุดอพยพ', evacCurrentUser || USER_NAME || 'EVAC', window.currentUserPhone || '', note],
'ส่ง Note เข้า IC แล้ว ✓', 'ส่ง Note ไม่สำเร็จ');
}

function refreshOCData() {
if (window._ocStateLoading) return;
window._ocStateLoading = true;
google.script.run
.withFailureHandler(function(err) {
window._ocStateLoading = false;
refreshOCBannerOnly();
renderOCZones([]);
renderOCSitHistory([]);
renderOCReqHistory([]);
refreshOCSupportRequestsDirect('oc');
})
.withSuccessHandler(function(state) {
window._ocStateLoading = false;
state = state || {};
window._lastOCState = state;
var es = state.emergState;
if (es) {
renderOCBanner(es);
} else {
refreshOCBannerOnly();
}
window._lastERGState = state.ergState || window._lastERGState || {};
if (typeof renderPickerMapContext === 'function') {
try { renderPickerMapContext(true); } catch (e) { }
}
renderOCResources(state.resources || []);
if (!state.resources || !state.resources.length) {
refreshOCResourcesDirect();
}
renderOCZones(state.zoneMarkers || []);
var casualtyReports = state.fieldCasualtyReports || [];
if ((!casualtyReports || !casualtyReports.length) && state.emergState && state.emergState.fieldCasualty) {
casualtyReports = [state.emergState.fieldCasualty];
}
renderOCFieldCasualty(casualtyReports, state.emergState || {});
var ocSitReports = state.sitReports || [];
if (state.roleSitrep && state.roleSitrep.text) {
ocSitReports = [roleSitrepToOCReport(state.roleSitrep)].concat(ocSitReports);
}
renderOCSitHistory(ocSitReports);
if (ocSitReports && ocSitReports.length) {
window._lastOCSitReports = ocSitReports;
}
renderOCReqHistory(state.supportReqs || []);
if (!state.supportReqs || !state.supportReqs.length) {
refreshOCSupportRequestsDirect('oc');
}
})
.getOCState();
}
function refreshOCSupportRequestsDirect(context) {
if (typeof google === 'undefined' || !google.script || !google.script.run) return;
if (window._ocSupportReqLoading) return;
var now = Date.now();
if (window._lastOCSupportReqAt && now - window._lastOCSupportReqAt < 4500) return;
window._lastOCSupportReqAt = now;
window._ocSupportReqLoading = true;
google.script.run
.withSuccessHandler(function(list) {
window._ocSupportReqLoading = false;
list = Array.isArray(list) ? list : [];
if (!list.length && window._lastOCSupportReqs && getActiveOCSupportRequests(window._lastOCSupportReqs).length) {
list = window._lastOCSupportReqs;
}
if (list.length) {
window._lastOCSupportReqs = list;
window._icSupportReqs = list;
}
if (document.getElementById('oc_req_history')) {
renderOCReqHistory(list);
}
if (context === 'ic' || document.getElementById('scene_Dashboard')) {
var zones = (window._icZoneMarkers && window._icZoneMarkers.length) ? window._icZoneMarkers : (window._pendingICZoneMarkers || []);
if (!zones.length && window._lastOCState && window._lastOCState.zoneMarkers) {
zones = window._lastOCState.zoneMarkers;
}
if (zones.length) {
drawOCZoneMarkersOnICMap(zones, list);
drawOCSupportRequestAlertsOnMap(zones, list);
}
}
})
.withFailureHandler(function(err) {
window._ocSupportReqLoading = false;
})
.getSupportRequests();
}
function refreshOCSitReportsDirect(context) {
if (typeof google === 'undefined' || !google.script || !google.script.run) return;
if (window._ocSitReportsLoading) return;
var now = Date.now();
if (window._lastOCSitReportsAt && now - window._lastOCSitReportsAt < 4500) return;
window._lastOCSitReportsAt = now;
window._ocSitReportsLoading = true;
google.script.run
.withSuccessHandler(function(list) {
window._ocSitReportsLoading = false;
list = Array.isArray(list) ? list : [];
if (!list.length && window._lastOCSitReports && window._lastOCSitReports.length) {
list = window._lastOCSitReports;
}
if (list.length) {
window._lastOCSitReports = list;
window._icSitReports = list;
}
renderOCSitReportsInSitrepTab(list);
var sitEl = document.getElementById('ic_oc_sitrep_feed');
if (sitEl && list.length) {
sitEl.innerHTML = list.slice(0, 4).map(function(r) {
return '<div style="border-bottom:1px solid #e8edf3;padding:7px 0;">' +
'<b style="color:#2c3e50;">' + (r.tag || '-') + '</b> ' +
'<span style="color:#999;font-size:11px;">' + (r.time || '') + '</span><br>' +
'<span>' + (r.detail || '-') + '</span>' +
(r.attach ? '<div style="margin-top:4px;color:#2980b9;font-size:11px;"><i class="fas fa-paperclip"></i> ' + r.attach + '</div>' : '') +
'</div>';
}).join('');
}
})
.withFailureHandler(function(err) {
window._ocSitReportsLoading = false;
})
.getSitReports();
}
function refreshOCFieldCasualtyDirect(emergState) {
if (typeof google === 'undefined' || !google.script || !google.script.run) return;
if (window._ocFieldCasualtyLoading) return;
if (window._lastOCFieldCasualtyDirectAt && Date.now() - window._lastOCFieldCasualtyDirectAt < 5000) return;
window._lastOCFieldCasualtyDirectAt = Date.now();
window._ocFieldCasualtyLoading = true;
google.script.run
.withSuccessHandler(function(es) {
window._ocFieldCasualtyLoading = false;
es = es || emergState || window._lastEmergState || {};
window._lastEmergState = es;
renderOCFieldCasualty(es.fieldCasualty ? [es.fieldCasualty] : [], es);
})
.withFailureHandler(function(err) {
window._ocFieldCasualtyLoading = false;
})
.getEmergencyStateForAgency(typeof APP_AGENCY_ID !== "undefined" ? APP_AGENCY_ID : "", typeof APP_AGENCY_SHEET_ID !== "undefined" ? APP_AGENCY_SHEET_ID : "", typeof getActiveJoinToken === "function" ? getActiveJoinToken() : "");
}
function refreshOCResourcesDirect() {
if (typeof google === 'undefined' || !google.script || !google.script.run) return;
if (window._ocResourcesLoading) return;
if (window._lastOCResourcesDirectAt && Date.now() - window._lastOCResourcesDirectAt < 5000) return;
window._lastOCResourcesDirectAt = Date.now();
window._ocResourcesLoading = true;
google.script.run
.withSuccessHandler(function(list) {
window._ocResourcesLoading = false;
renderOCResources(list || []);
})
.withFailureHandler(function(err) {
window._ocResourcesLoading = false;
})
.getResourceIncoming();
}
function shouldApplyOCResourceList(list) {
list = list || [];
var hasRows = list.length > 0;
var hadRows = window._lastOCResources && window._lastOCResources.length > 0;
if (hasRows) {
window._ocResourceEmptyStreak = 0;
return true;
}
if (!hadRows) return true;
window._ocResourceEmptyStreak = (window._ocResourceEmptyStreak || 0) + 1;
if (window._ocResourceEmptyStreak < 3) {
return false;
}
return true;
}
function renderOCBanner(es) {
if (!es) return;
var nameEl = document.getElementById('oc_evtName');
var locEl = document.getElementById('oc_evtLoc');
var planEl = document.getElementById('oc_evtPlan');
var commanderEl = document.getElementById('oc_evtCommander');
var commanderName = (es.registeredICName || '').trim() || 'ยังไม่มี IC';
var commanderPosition = es.commanderPosition || '';
if (nameEl) nameEl.textContent = es.evtName || es.name || '-';
if (locEl) locEl.textContent = es.evtLoc || es.location || '-';
if (planEl) planEl.textContent = es.evtPlan || es.plan || '-';
if (commanderEl) commanderEl.textContent = commanderName && commanderName !== '' ? ((commanderPosition ? commanderPosition + ' ' : '') + commanderName) : '-';
window._lastEmergState = es;
}
function refreshOCBannerOnly() {
google.script.run
.withFailureHandler(function(err) { })
.withSuccessHandler(function(es) { renderOCBanner(es || {}); })
.getEmergencyStateForAgency(typeof APP_AGENCY_ID !== "undefined" ? APP_AGENCY_ID : "", typeof APP_AGENCY_SHEET_ID !== "undefined" ? APP_AGENCY_SHEET_ID : "", typeof getActiveJoinToken === "function" ? getActiveJoinToken() : "");
}
var OC_RESOURCE_TYPES = [
{ key:'ambulance', label:'รถพยาบาล', icon:'fa-ambulance', color:'#185FA5', bg:'#E6F1FB', match:['รถพยาบาล','ALS','BLS','Ambulance'] },
{ key:'fire', label:'รถดับเพลิง', icon:'fa-fire-extinguisher', color:'#A32D2D', bg:'#FCEBEB', match:['รถดับเพลิง','Fire'] },
{ key:'rescue', label:'กู้ชีพ/กู้ภัย', icon:'fa-people-carry', color:'#5B45A0', bg:'#F0ECFF', match:['กู้ชีพ','กู้ภัย','Rescue'] },
{ key:'police', label:'ตำรวจ', icon:'fa-shield-alt', color:'#25476A', bg:'#EAF0F6', match:['ตำรวจ','Police'] },
{ key:'other', label:'อื่นๆ', icon:'fa-plus', color:'#2c3e50', bg:'#F8F9FA', match:[] }
];
function normalizeOCResourceType(type) {
var text = String(type || '');
if (text.indexOf('HAZMAT') !== -1 || text.indexOf('ทีม HAZMAT') !== -1) return null;
for (var i = 0; i < OC_RESOURCE_TYPES.length; i++) {
var cfg = OC_RESOURCE_TYPES[i];
for (var j = 0; j < cfg.match.length; j++) {
if (text.indexOf(cfg.match[j]) !== -1) return cfg.key;
}
}
return 'other';
}
function getOCResourceConfig(key) {
return OC_RESOURCE_TYPES.find(function(c) { return c.key === key; }) || OC_RESOURCE_TYPES[OC_RESOURCE_TYPES.length - 1];
}
function buildOCResourceTotals(list) {
var totals = {};
OC_RESOURCE_TYPES.forEach(function(c) { totals[c.key] = { qty:0, personnel:0, rows:[] }; });
(list || []).forEach(function(r) {
var key = normalizeOCResourceType(r.type);
if (!key || !totals[key]) return;
totals[key].qty += parseInt(r.qty) || 0;
totals[key].personnel += parseInt(r.personnel) || 0;
totals[key].rows.push(r);
});
return totals;
}
function renderOCResources(list) {
if (!shouldApplyOCResourceList(list || [])) return;
window._lastOCResources = list || [];
renderOCResourceSummary(window._lastOCResources);
var el = document.getElementById('oc_resource_list');
if (el) el.innerHTML = '';
}
function renderICIncomingResources(list) {
var el = document.getElementById('ic_incoming_resource_list');
if (!el) return;
window._lastICResources = list || [];
var totals = buildOCResourceTotals(list || []);
var vehicleTotal = OC_RESOURCE_TYPES.reduce(function(sum, cfg) {
return sum + (parseInt((totals[cfg.key] || {}).qty, 10) || 0);
}, 0);
if (document.getElementById('hdr_vehicle_total')) document.getElementById('hdr_vehicle_total').innerText = vehicleTotal;
var totalPersonnel = Object.keys(totals).reduce(function(sum, key) {
return sum + (parseInt(totals[key].personnel, 10) || 0);
}, 0);
if (document.getElementById('hdr_staff')) document.getElementById('hdr_staff').innerText = totalPersonnel;
el.innerHTML = OC_RESOURCE_TYPES.map(function(cfg) {
var t = totals[cfg.key];
return '<button type="button" onclick="openICResourceDetails(\'' + cfg.key + '\')" style="background:#fff;border:1px solid #dbe3ec;border-radius:8px;padding:8px;text-align:left;cursor:pointer;min-height:78px;">' +
'<div style="display:flex;align-items:center;gap:7px;font-weight:bold;color:#2c3e50;"><span style="width:28px;height:28px;border-radius:8px;background:' + cfg.bg + ';display:flex;align-items:center;justify-content:center;flex-shrink:0;"><i class="fas ' + cfg.icon + '" style="color:' + cfg.color + ';"></i></span>' + cfg.label + '</div>' +
'<div style="margin-top:6px;color:#2c3e50;font-weight:900;"><span style="font-size:22px;color:' + cfg.color + ';">' + t.qty + '</span><span style="font-size:10px;color:#777;"> คัน</span> <span style="font-size:16px;">' + t.personnel + '</span><span style="font-size:10px;color:#777;"> คน</span></div>' +
'<div style="font-size:10px;color:#777;margin-top:2px;">กดดูรายละเอียด</div>' +
'</button>';
}).join('');
}
function openICResourceDetails(key) {
var cfg = getOCResourceConfig(key);
var rows = buildOCResourceTotals(window._lastICResources || [])[key].rows;
var html = rows.length ? rows.map(function(r) {
return '<div style="text-align:left;border-bottom:1px solid #eee;padding:7px 0;">' +
'<b>' + (r.type || cfg.label) + '</b> <span style="float:right;">' + (r.qty || 0) + ' คัน / ' + (r.personnel || 0) + ' คน</span><br>' +
'<span style="font-size:12px;color:#666;">จาก ' + (r.agency || '-') + (r.note ? ' | ' + r.note : '') + '</span>' +
'</div>';
}).join('') : '<div style="color:#999;padding:12px;">ยังไม่มีรายละเอียด</div>';
Swal.fire({ title: cfg.label + ' ภายในพื้นที่', html: html, confirmButtonText: 'ปิด' });
}
function renderOCZones(list) {
var el = document.getElementById('oc_zone_list');
var icpHint = document.getElementById('oc_icp_hint');
var quotaEl = document.getElementById('oc_zone_quota');
if (quotaEl) {
var totalCount = (list || []).length;
var maxZones = (typeof APP_TIER_CONFIG !== 'undefined' && APP_TIER_CONFIG && APP_TIER_CONFIG.maxZones > 0) ? APP_TIER_CONFIG.maxZones : null;
if (maxZones) {
var isFull = totalCount >= maxZones;
var isNear = !isFull && totalCount >= maxZones - 1;
var bg = isFull ? '#fee2e2' : (isNear ? '#fef3c7' : '#e0f2fe');
var fg = isFull ? '#991b1b' : (isNear ? '#92400e' : '#075985');
var msg = isFull ? '⚠️ ปักครบโควตาแล้ว — เพิ่มไม่ได้ (อัปเกรดแพ็กเกจเพื่อปักได้มากขึ้น)' : (isNear ? '🔶 ใกล้เต็มโควตาแล้ว' : '✅ ยังปักเพิ่มได้');
quotaEl.innerHTML = '<div style="display:flex;align-items:center;justify-content:space-between;gap:8px;background:' + bg + ';color:' + fg + ';border-radius:8px;padding:8px 12px;font-size:12px;font-weight:700;">' +
'<span>📍 ปักไปแล้ว ' + totalCount + ' / ' + maxZones + ' จุด (รวม Command Post)</span>' +
'<span style="font-weight:600;">' + msg + '</span>' +
'</div>';
} else {
quotaEl.innerHTML = '<div style="font-size:12px;color:#64748b;background:#f1f5f9;border-radius:8px;padding:8px 12px;">📍 ปักไปแล้ว ' + totalCount + ' จุด (ไม่จำกัดจำนวนสำหรับ Tier นี้)</div>';
}
}
var zoneColor = {
'ICP':'#e74c3c', 'Decon':'#3498db', 'Treatment':'#e74c3c',
'Staging':'#f1c40f', 'Parking':'#27ae60', 'Loading':'#9b59b6'
};
var icp = (list || []).find(function(z) { return z.type === 'ICP'; });
var others = (list || []).filter(function(z) { return z.type !== 'ICP'; });
if (icpHint) {
icpHint.innerHTML = icp && icp.lat
? '<span style="color:#27ae60;font-weight:bold;">ตั้ง ICP แล้ว</span><br>' + icp.label + '<br>' + icp.lat.toFixed(5) + ', ' + icp.lng.toFixed(5)
: 'ยังไม่ได้ตั้ง ICP';
}
if (!others.length) { el.innerHTML = '<div style="text-align:center;color:#aaa;padding:12px;font-size:13px;">ยังไม่มีจุดปฏิบัติการอื่น</div>'; return; }
el.innerHTML = others.map(function(z) {
var c = zoneColor[z.type] || '#888';
return '<div class="oc-card" style="display:flex;align-items:center;gap:10px;padding:10px 14px;">' +
'<div style="width:12px;height:12px;border-radius:50%;background:' + c + ';flex-shrink:0;"></div>' +
'<div style="flex:1;">' +
'<div style="font-size:13px;font-weight:bold;color:#2c3e50;">' + z.type + '</div>' +
'<div style="font-size:12px;color:#666;">' + z.label + '</div>' +
(z.lat ? '<div style="font-size:11px;color:#aaa;">' + z.lat.toFixed(5) + ', ' + z.lng.toFixed(5) + '</div>' : '') +
'</div>' +
'</div>';
}).join('');
}
function renderOCSitHistory(list) {
var el = document.getElementById('oc_sit_history');
var mobileEl = document.getElementById('oc_mobile_sitrep_feed');
var tagColor = { 'กำลังระงับ':'#e67e22', 'ควบคุมได้บางส่วน':'#f1c40f', 'ลุกลาม':'#e74c3c', 'ระงับได้แล้ว':'#27ae60' };
if (!list.length) {
var emptyHtml = '<div style="text-align:center;color:#aaa;padding:12px;font-size:13px;">ยังไม่มีรายงาน</div>';
if (el) el.innerHTML = emptyHtml;
if (mobileEl) mobileEl.innerHTML = emptyHtml;
return;
}
var html = list.map(function(r) {
var tc = tagColor[r.tag] || '#888';
return '<div class="oc-card">' +
'<div style="display:flex;align-items:center;gap:8px;margin-bottom:5px;">' +
'<span style="background:' + tc + ';color:white;border-radius:4px;padding:2px 8px;font-size:11px;font-weight:bold;">' + r.tag + '</span>' +
'<span style="font-size:11px;color:#aaa;">' + r.time + ' | ' + r.by + '</span>' +
'</div>' +
'<div style="font-size:13px;color:#2c3e50;">' + r.detail + '</div>' +
(r.attach ? '<div style="margin-top:5px;font-size:12px;color:#3498db;"><i class="fas fa-paperclip"></i> ' + r.attach + '</div>' : '') +
'</div>';
}).join('');
if (el) el.innerHTML = html;
if (mobileEl) mobileEl.innerHTML = html;
}
function getHealthTriageSnapshot() {
var state = window._lastHealthState || {};
var triage = (state.emergState && state.emergState.triage) ? state.emergState.triage : {};
return {
red: parseInt(triage.red !== undefined ? triage.red : document.getElementById('health_red').textContent, 10) || 0,
yellow: parseInt(triage.yellow !== undefined ? triage.yellow : document.getElementById('health_yellow').textContent, 10) || 0,
green: parseInt(triage.green !== undefined ? triage.green : document.getElementById('health_green').textContent, 10) || 0,
black: parseInt(triage.black !== undefined ? triage.black : document.getElementById('health_black').textContent, 10) || 0
};
}
function adjustMedColorInput(delta) {
var input = document.getElementById('med_color_count');
if (!input) return;
var next = (parseInt(input.value, 10) || 0) + delta;
input.value = Math.max(0, next);
}
var healthMedRowSeq = 0;
var healthHospitalOptionsHtml = '';
function adjustMedRowCount(rowId, delta) {
var input = document.getElementById('med_count_' + rowId);
if (!input) return;
var next = (parseInt(input.value, 10) || 0) + delta;
input.value = Math.max(0, next);
}
function addMedTriagePopupRow(count, hospital) {
var wrap = document.getElementById('med_triage_rows');
if (!wrap) return;
var rowId = ++healthMedRowSeq;
var row = document.createElement('div');
row.className = 'med-triage-row';
row.style.cssText = 'display:grid;grid-template-columns:130px 1fr 28px;gap:8px;align-items:center;';
row.innerHTML =
'<div style="display:flex;align-items:center;gap:5px;">' +
'<button type="button" onclick="adjustMedRowCount(' + rowId + ',-1)" style="width:28px;height:32px;border:1px solid #ddd;background:white;border-radius:6px;font-weight:900;cursor:pointer;">-</button>' +
'<input id="med_count_' + rowId + '" class="med-row-count" type="number" min="0" value="' + (count || '') + '" style="width:58px;height:32px;border:1px solid #ddd;border-radius:6px;text-align:center;font-weight:900;">' +
'<button type="button" onclick="adjustMedRowCount(' + rowId + ',1)" style="width:28px;height:32px;border:1px solid #ddd;background:white;border-radius:6px;font-weight:900;cursor:pointer;">+</button>' +
'</div>' +
'<input class="med-row-hospital" list="med_hospital_list" value="' + roleSafeText(hospital || '') + '" placeholder="รพ.ที่คนเจ็บอยู่" style="width:100%;box-sizing:border-box;height:32px;border:1px solid #ddd;border-radius:6px;padding:0 8px;">' +
'<button type="button" onclick="this.closest(&quot;.med-triage-row&quot;).remove()" style="width:28px;height:32px;border:1px solid #eee;background:#f8fafc;border-radius:6px;cursor:pointer;color:#777;">×</button>';
wrap.appendChild(row);
}
function openHealthTriageDetails(color) {
if (typeof requireFeature === 'function' && !requireFeature('mci', 'รายละเอียดผู้บาดเจ็บ / รพ. (ระดับ 3+)')) return;
var labelMap = { red:'แดง', yellow:'เหลือง', green:'เขียว', black:'ดำ' };
var rows = (window._healthTriageDetails || []).filter(function(r) {
return String(r.triage || r.color || '').toLowerCase() === color;
});
if (!rows.length) {
Swal.fire({ title:'ผู้บาดเจ็บสี' + (labelMap[color] || color), html:'<div style="color:#999;">ยังไม่มีรายละเอียดโรงพยาบาล</div>', confirmButtonText:'ปิด' });
return;
}
var byHosp = {};
rows.forEach(function(r) {
var hosp = r.hospital || 'ไม่ระบุ รพ.';
if (!byHosp[hosp]) byHosp[hosp] = { qty:0, rows:[] };
byHosp[hosp].qty += parseInt(r.qty, 10) || 1;
byHosp[hosp].rows.push(r);
});
var html = Object.keys(byHosp).map(function(hosp) {
return '<div style="text-align:left;border-bottom:1px solid #eee;padding:8px 0;">' +
'<b>' + roleSafeText(hosp) + '</b><span style="float:right;font-weight:900;">' + byHosp[hosp].qty + ' ราย</span>' +
'<div style="clear:both;font-size:11px;color:#777;margin-top:4px;">' +
byHosp[hosp].rows.map(function(r) { return (r.time || '-') + ' | ' + (r.loggedBy || 'MED') + ' | ' + (r.qty || 1) + ' ราย'; }).join('<br>') +
'</div>' +
'</div>';
}).join('');
Swal.fire({ title:'ผู้บาดเจ็บสี' + (labelMap[color] || color), html:html, confirmButtonText:'ปิด', width:560 });
}
function openMedicalTriageColorPopup(color) {
if (typeof requireFeature === 'function' && !requireFeature('triage', 'อัปเดตยอดผู้บาดเจ็บ / Triage 4 สี (ระดับ 2+)')) return;
if (!IS_LEAD && !IS_COORD) {
Swal.fire('ดูรายละเอียดได้ แต่แก้ยอดไม่ได้', 'การเพิ่มยอดให้หัวหน้าหน่วยหรือผู้ประสานสาธารณสุขเป็นผู้บันทึก', 'warning');
return;
}
var labels = {
red: { th:'แดง', en:'RED', icon:'🔴', css:'#A32D2D' },
yellow: { th:'เหลือง', en:'YELLOW', icon:'🟡', css:'#854F0B' },
green: { th:'เขียว', en:'GREEN', icon:'🟢', css:'#3B6D11' },
black: { th:'ดำ', en:'BLACK', icon:'⚫', css:'#333333' }
};
var meta = labels[color] || labels.red;
var hospitals = ((window._lastHealthState || {}).hospitals || []).map(function(h) { return h.name; }).filter(Boolean);
if (!hospitals.length) hospitals = HEALTH_HOSPITAL_NAMES.slice();
healthHospitalOptionsHtml = hospitals.map(function(h) {
return '<option value="' + roleSafeText(h) + '">' + roleSafeText(h) + '</option>';
}).join('');
healthMedRowSeq = 0;
Swal.fire({
title: 'อัปเดตผู้บาดเจ็บ ' + meta.icon + ' ' + meta.en,
html:
'<div style="display:grid;gap:10px;text-align:left;">' +
'<div style="display:grid;grid-template-columns:130px 1fr 28px;gap:8px;font-size:12px;font-weight:900;color:#475569;">' +
'<div>จำนวนคนเจ็บ</div><div>รพ.ที่คนเจ็บอยู่</div><div></div>' +
'</div>' +
'<div id="med_triage_rows" style="display:grid;gap:8px;"></div>' +
'<datalist id="med_hospital_list">' + healthHospitalOptionsHtml + '</datalist>' +
'<button type="button" onclick="addMedTriagePopupRow()" style="border:1px dashed #94a3b8;background:#f8fafc;color:#334155;border-radius:8px;padding:8px;font-weight:900;cursor:pointer;">เพิ่มแถว +</button>' +
'</div>',
confirmButtonText: 'บันทึกยอด',
confirmButtonColor: meta.css,
showCancelButton: true,
cancelButtonText: 'ยกเลิก',
didOpen: function() {
addMedTriagePopupRow();
addMedTriagePopupRow();
addMedTriagePopupRow();
},
preConfirm: function() {
var entries = [];
document.querySelectorAll('#med_triage_rows .med-triage-row').forEach(function(row) {
var count = parseInt(row.querySelector('.med-row-count').value, 10) || 0;
var hospital = row.querySelector('.med-row-hospital').value.trim();
if (count > 0 || hospital) entries.push({ count: count, hospital: hospital });
});
if (!entries.length) {
Swal.showValidationMessage('กรุณาใส่อย่างน้อย 1 แถว');
return false;
}
for (var i = 0; i < entries.length; i++) {
if (entries[i].count <= 0) {
Swal.showValidationMessage('จำนวนคนเจ็บต้องมากกว่า 0');
return false;
}
if (!entries[i].hospital) {
Swal.showValidationMessage('กรุณาใส่ รพ. ให้ครบทุกแถว');
return false;
}
}
return entries;
}
}).then(function(r) {
if (!r.isConfirmed) return;
Swal.fire({ title:'กำลังบันทึกยอด...', text:'กำลังส่งยอดแยกโรงพยาบาลเข้า EOC', allowOutsideClick:false, allowEscapeKey:false, showConfirmButton:false, didOpen:function(){ Swal.showLoading(); } });
google.script.run
.withSuccessHandler(function(es) {
applyHealthEmergencyState(es || {}, []);
refreshHealthData();
Swal.fire({ icon:'success', title:'บันทึกยอดแล้ว', timer:1200, showConfirmButton:false });
})
.withFailureHandler(function(err) {
Swal.fire('บันทึกไม่สำเร็จ', err && err.message ? err.message : String(err), 'error');
})
.addMedicalTriageRows(color, r.value, healthCurrentUser || 'MED');
});
}
function roleSitrepToOCReport(sit) {
var text = String((sit && (sit.text || sit.Text)) || '').trim();
var situation = typeof extractRoleSitrepSection === 'function' ? extractRoleSitrepSection(text, 'S') : '';
var mission = typeof extractRoleSitrepSection === 'function' ? extractRoleSitrepSection(text, 'M') : '';
var action = typeof extractRoleSitrepSection === 'function' ? extractRoleSitrepSection(text, 'E') : '';
var detailParts = [];
if (situation && situation !== '-') detailParts.push('S: ' + situation);
if (mission && mission !== '-') detailParts.push('M: ' + mission);
if (action && action !== '-') detailParts.push('E: ' + action);
return {
time: (sit && sit.time) || '',
tag: 'SITREP จาก IC',
detail: detailParts.length ? detailParts.join(' | ') : text,
attach: '',
by: (sit && sit.createdBy) || 'IC'
};
}
function showOCSending(title, text) {
Swal.fire({
title: title || 'กำลังส่งข้อมูล...',
text: text || 'ระบบกำลังส่งข้อมูลไปยัง EOC',
allowOutsideClick: false,
allowEscapeKey: false,
showConfirmButton: false,
didOpen: function() { Swal.showLoading(); }
});
}
function openAddResourceModal() {
Swal.fire('ใช้หน้าหน่วยสนับสนุนรายงานทรัพยากร', 'OC/ICP ใช้หน้านี้สำหรับติดตามยอดทรัพยากรเท่านั้น', 'info');
return;
var selectedType = arguments.length ? arguments[0] : 'อื่นๆ';
var typeEl = document.getElementById('res_type');
var labelEl = document.getElementById('res_type_label');
if (typeEl) {
var exists = Array.from(typeEl.options).some(function(opt) { return opt.value === selectedType || opt.text === selectedType; });
if (!exists) typeEl.add(new Option(selectedType, selectedType));
typeEl.value = selectedType;
}
if (labelEl) labelEl.textContent = selectedType;
document.getElementById('modal_AddResource').style.display = 'flex';
}
function normalizeOCFieldCasualty(report) {
report = report || {};
var total = report.totalEstimate;
if (total === undefined) total = report.total_estimate;
if (total === undefined) total = report.total;
if (total === undefined) total = report.totalEstimated;
var still = report.stillInArea;
if (still === undefined) still = report.still_in_area;
if (still === undefined) still = report.still;
if (still === undefined) still = report.onsite;
var evacuated = report.evacuatedOrSent;
if (evacuated === undefined) evacuated = report.evacuated_or_sent;
if (evacuated === undefined) evacuated = report.evacuated;
if (evacuated === undefined) evacuated = report.sentOut;
return {
totalEstimate: parseInt(total, 10) || 0,
stillInArea: parseInt(still, 10) || 0,
evacuatedOrSent: parseInt(evacuated, 10) || 0,
note: report.note || report.Note || '',
loggedBy: report.loggedBy || report.logged_by || report.by || report.reporter || '',
timestamp: report.timestamp || report.time || '',
time: report.time || report.timestamp || ''
};
}
function renderOCFieldCasualty(list, emergState) {
var latest = list && list.length ? list[0] : null;
if (!latest && emergState && emergState.fieldCasualty) {
latest = emergState.fieldCasualty;
}
latest = latest ? normalizeOCFieldCasualty(latest) : null;
if (latest && latest.totalEstimate > 0) {
window._lastOCFieldCasualty = latest;
window._ocFieldCasualtyZeroStreak = 0;
} else if ((!latest || latest.totalEstimate === 0) && window._lastOCFieldCasualty && window._lastOCFieldCasualty.totalEstimate > 0) {
window._ocFieldCasualtyZeroStreak = (window._ocFieldCasualtyZeroStreak || 0) + 1;
if (window._ocFieldCasualtyZeroStreak < 3) {
latest = window._lastOCFieldCasualty;
}
}
var total = document.getElementById('oc_field_total');
var still = document.getElementById('oc_field_still');
var evacuated = document.getElementById('oc_field_evacuated');
var note = document.getElementById('oc_field_note');
if (latest) {
if (total) total.value = latest.totalEstimate || 0;
if (still) still.value = latest.stillInArea || 0;
if (evacuated) evacuated.value = latest.evacuatedOrSent || 0;
if (note) note.value = latest.note || '';
}
renderOCCasualtyCompare(latest, emergState);
}
function renderOCCasualtyCompare(fieldLatest, emergState) {
var box = document.getElementById('oc_casualty_compare');
if (!box) return;
if (!fieldLatest) { box.style.display = 'none'; box.innerHTML = ''; return; }
box.style.display = 'block';
var t = fieldLatest.timestamp ? fieldLatest.timestamp.replace('T',' ').slice(0,16) : '';
box.innerHTML =
'<div style="background:#fff3e0;border:1px solid #f97316;border-radius:7px;padding:8px 10px;font-size:12px;">' +
'<div style="font-weight:900;color:#c2410c;margin-bottom:4px;">📤 ยอดที่ส่งล่าสุด' + (t ? ' (' + t + ')' : '') + '</div>' +
'<div style="display:flex;gap:12px;">' +
'<span>รวม: <b>' + (fieldLatest.totalEstimate || 0) + '</b></span>' +
'<span>อยู่ในพื้นที่: <b>' + (fieldLatest.stillInArea || 0) + '</b></span>' +
'<span>ออกแล้ว: <b>' + (fieldLatest.evacuatedOrSent || 0) + '</b></span>' +
'</div>' +
(fieldLatest.note ? '<div style="color:#555;margin-top:3px;">หมายเหตุ: ' + fieldLatest.note + '</div>' : '') +
'</div>';
}
function submitFieldCasualty() {
if (typeof requireFeature === 'function' && !requireFeature('casualty_report', 'ยอดผู้บาดเจ็บประมาณการ (ระดับ 2+)')) return;
var total = document.getElementById('oc_field_total').value;
var still = document.getElementById('oc_field_still').value;
var evacuated = document.getElementById('oc_field_evacuated').value;
var note = document.getElementById('oc_field_note').value.trim();
_optimisticRun_('submitFieldCasualtyReport',
[total, still, evacuated, note, ocCurrentUser || 'OC', (typeof APP_AGENCY_ID !== 'undefined' ? APP_AGENCY_ID : '')],
'บันทึกยอดและส่งขึ้น IC แล้ว ✓', 'บันทึกไม่สำเร็จ',
function() { refreshOCData(); });
}
function submitOCRequest() {
if (!_tier1SupportQuotaOk_()) return;
var type = document.getElementById('oc_req_type').value;
var detail = document.getElementById('oc_req_detail').value.trim();
if (!type) { Swal.fire('กรุณาเลือกประเภท', '', 'warning'); return; }
document.getElementById('oc_req_detail').value = '';
document.getElementById('oc_req_type').selectedIndex = 0;
document.querySelectorAll('#oc_req_presets .oc-preset-btn').forEach(function(b) { b.classList.remove('active'); });
_optimisticRun_('submitSupportRequest',
[type, detail || '-', ocCurrentUser, (typeof APP_AGENCY_ID !== 'undefined' ? APP_AGENCY_ID : '')],
'ส่งคำขอเข้า EOC แล้ว ✓', 'ส่งคำขอไม่สำเร็จ',
function() { refreshOCData(); });
}
function openOCZoneActionPopup() {
Swal.fire({
title: 'จุดปฏิบัติการ',
html:
'<div style="display:grid;gap:8px;text-align:left;">' +
'<button id="oc_pop_icp_gps" class="swal2-confirm swal2-styled" style="margin:0;background:#e74c3c;"><i class="fas fa-location-crosshairs"></i> ใช้ตำแหน่งปัจจุบันเป็น Command Post</button>' +
'<button id="oc_pop_icp_map" class="swal2-confirm swal2-styled" style="margin:0;background:#1d4ed8;"><i class="fas fa-map-location-dot"></i> เลือก Command Post บนแผนที่</button>' +
'<div style="height:1px;background:#e5e7eb;margin:4px 0;"></div>' +
'<select id="oc_pop_zone_type" class="swal2-input" style="margin:0;width:100%;box-sizing:border-box;"><option value="Decon">Decon Station</option><option value="Treatment">Treatment</option><option value="Staging">Staging</option><option value="Parking">Parking</option><option value="Loading">Loading/Unload</option></select>' +
'<input id="oc_pop_zone_label" class="swal2-input" style="margin:0;width:100%;box-sizing:border-box;" placeholder="ชื่อจุดสั้นๆ">' +
'<button id="oc_pop_zone_map" class="swal2-confirm swal2-styled" style="margin:0;background:#0f766e;"><i class="fas fa-map-pin"></i> เลือกจุดนี้บนแผนที่</button>' +
'</div>',
showConfirmButton: false,
showCloseButton: true,
width: 420,
didOpen: function() {
document.getElementById('oc_pop_icp_gps').onclick = function() { Swal.close(); useCurrentLocationForICP(); };
document.getElementById('oc_pop_icp_map').onclick = function() { Swal.close(); openICPMapPicker(); };
document.getElementById('oc_pop_zone_map').onclick = function() {
var typeEl = document.getElementById('oc_zone_type_sel');
var labelEl = document.getElementById('oc_zone_label');
if (typeEl) typeEl.value = document.getElementById('oc_pop_zone_type').value;
if (labelEl) labelEl.value = document.getElementById('oc_pop_zone_label').value || document.getElementById('oc_pop_zone_type').value;
Swal.close();
openZoneMapPicker();
};
}
});
}
function openOCSitrepPopup() {
Swal.fire({
title: 'รายงานสถานการณ์',
html:
'<div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-bottom:10px;">' +
'<button type="button" class="oc-pop-sit" data-tag="ลุกลาม" style="border:1px solid #fecaca;background:#fee2e2;color:#991b1b;border-radius:8px;padding:10px;font-weight:900;">ลุกลาม</button>' +
'<button type="button" class="oc-pop-sit" data-tag="กำลังระงับ" style="border:1px solid #fed7aa;background:#ffedd5;color:#9a3412;border-radius:8px;padding:10px;font-weight:900;">กำลังระงับ</button>' +
'<button type="button" class="oc-pop-sit" data-tag="ควบคุมได้บางส่วน" style="border:1px solid #bfdbfe;background:#dbeafe;color:#1d4ed8;border-radius:8px;padding:10px;font-weight:900;">คุมได้บางส่วน</button>' +
'<button type="button" class="oc-pop-sit" data-tag="ระงับได้แล้ว" style="border:1px solid #bbf7d0;background:#dcfce7;color:#166534;border-radius:8px;padding:10px;font-weight:900;">ระงับแล้ว</button>' +
'</div>' +
'<input id="oc_pop_sit_tag" type="hidden">' +
'<textarea id="oc_pop_sit_detail" class="swal2-textarea" style="margin:0;width:100%;box-sizing:border-box;min-height:95px;" placeholder="รายละเอียดสั้นๆ (ไม่บังคับ)"></textarea>',
confirmButtonText: 'ส่งรายงาน',
confirmButtonColor: '#e67e22',
showCancelButton: true,
cancelButtonText: 'ยกเลิก',
didOpen: function() {
document.querySelectorAll('.oc-pop-sit').forEach(function(btn) {
btn.onclick = function() {
document.querySelectorAll('.oc-pop-sit').forEach(function(b) { b.style.outline = 'none'; });
btn.style.outline = '3px solid #0f172a';
document.getElementById('oc_pop_sit_tag').value = btn.getAttribute('data-tag');
};
});
},
preConfirm: function() {
var tag = document.getElementById('oc_pop_sit_tag').value;
var detail = document.getElementById('oc_pop_sit_detail').value.trim() || '-';
if (!tag) {
Swal.showValidationMessage('กรุณาเลือกสถานะ');
return false;
}
return { tag: tag, detail: detail };
}
}).then(function(r) {
if (!r.isConfirmed) return;
Swal.fire({ icon:'success', title:'ส่ง SITREP แล้ว ✓', text:'ระบบกำลังบันทึกเข้า EOC', timer:1200, showConfirmButton:false });
google.script.run
.withSuccessHandler(function() {
refreshOCData();
Swal.fire({ icon:'success', title:'รายงานแล้ว', timer:1300, showConfirmButton:false });
})
.withFailureHandler(function(err) {
Swal.fire('ส่งรายงานไม่สำเร็จ', err && err.message ? err.message : String(err), 'error');
})
.submitSitReport(r.value.tag, r.value.detail, window._ocAttachURL || window._ocAttachName || '', ocCurrentUser);
});
}
function openOCCasualtyPopup() {
if (typeof requireFeature === 'function' && !requireFeature('casualty_report', 'ยอดผู้บาดเจ็บประมาณการ (ระดับ 2+)')) return;
var prev = window._lastOCFieldCasualty || {};
var prevTotal = prev.totalEstimate || 0;
var prevStill = prev.stillInArea || 0;
var prevEvac = prev.evacuatedOrSent || 0;
var prevNote = prev.note || '';
var prevTime = prev.timestamp ? prev.timestamp.replace('T',' ').slice(0,16) : '';
var prevBox = prevTotal || prevStill || prevEvac
  ? '<div style="background:#fff3e0;border:1px solid #f97316;border-radius:7px;padding:8px 10px;margin-bottom:10px;font-size:12px;text-align:left;">' +
    '<div style="font-weight:900;color:#c2410c;margin-bottom:4px;">📤 ยอดที่ส่งล่าสุด' + (prevTime ? ' (' + prevTime + ')' : '') + '</div>' +
    '<div style="display:flex;gap:12px;"><span>รวม: <b>' + prevTotal + '</b></span><span>อยู่ในพื้นที่: <b>' + prevStill + '</b></span><span>ออกแล้ว: <b>' + prevEvac + '</b></span></div>' +
    (prevNote ? '<div style="color:#555;margin-top:3px;">หมายเหตุ: ' + prevNote + '</div>' : '') +
    '</div>'
  : '';
Swal.fire({
title: 'ยอดผู้บาดเจ็บประมาณการ',
html:
prevBox +
'<div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:8px;">' +
'<div style="text-align:left;"><label style="display:block;font-size:12px;font-weight:800;color:#475569;margin-bottom:4px;">รวมทั้งหมด</label><input id="oc_pop_total" class="swal2-input" type="number" min="0" placeholder="รวม" value="' + prevTotal + '" style="margin:0;width:100%;box-sizing:border-box;"></div>' +
'<div style="text-align:left;"><label style="display:block;font-size:12px;font-weight:800;color:#475569;margin-bottom:4px;">อยู่ในพื้นที่</label><input id="oc_pop_still" class="swal2-input" type="number" min="0" placeholder="ยังอยู่" value="' + prevStill + '" style="margin:0;width:100%;box-sizing:border-box;"></div>' +
'<div style="text-align:left;"><label style="display:block;font-size:12px;font-weight:800;color:#475569;margin-bottom:4px;">ออกนอกพื้นที่</label><input id="oc_pop_evac" class="swal2-input" type="number" min="0" placeholder="ส่งออก" value="' + prevEvac + '" style="margin:0;width:100%;box-sizing:border-box;"></div>' +
'</div>' +
'<textarea id="oc_pop_note" class="swal2-textarea" style="margin:10px 0 0;width:100%;box-sizing:border-box;min-height:90px;" placeholder="หมายเหตุสั้นๆ">' + roleSafeText(prevNote) + '</textarea>',
confirmButtonText: 'ส่งยอดขึ้น IC',
confirmButtonColor: '#e67e22',
showCancelButton: true,
cancelButtonText: 'ยกเลิก',
preConfirm: function() {
return {
total: document.getElementById('oc_pop_total').value || 0,
still: document.getElementById('oc_pop_still').value || 0,
evac: document.getElementById('oc_pop_evac').value || 0,
note: document.getElementById('oc_pop_note').value.trim()
};
}
}).then(function(r) {
if (!r.isConfirmed) return;
Swal.fire({ icon:'success', title:'บันทึกยอดแล้ว ✓', text:'ระบบกำลังส่งขึ้น IC', timer:1200, showConfirmButton:false });
google.script.run
.withSuccessHandler(function() {
refreshOCData();
Swal.fire({ icon:'success', title:'ส่งยอดประมาณการแล้ว', timer:1300, showConfirmButton:false });
})
.withFailureHandler(function(err) {
Swal.fire('ส่งยอดไม่สำเร็จ', err && err.message ? err.message : String(err), 'error');
})
.submitFieldCasualtyReport(r.value.total, r.value.still, r.value.evac, r.value.note, ocCurrentUser || 'OC', (typeof APP_AGENCY_ID !== 'undefined' ? APP_AGENCY_ID : ''));
});
}
// 🎚️ Tier 1: OC/ICP ขอสนับสนุนได้สูงสุด 5 คำขอต่อ 1 เหตุการณ์ — ตัวเลขจริงบังคับที่ server
function _tier1SupportQuotaOk_() {
if (typeof hasFeature !== 'function' || hasFeature('support_request')) return true;
var list = (window._lastOCState && window._lastOCState.supportReqs) || [];
if (list.length >= 5) {
Swal.fire('เกินโควต้าขอสนับสนุน', 'Tier 1 ส่งคำขอสนับสนุนได้สูงสุด 5 คำขอต่อ 1 เหตุการณ์ (ส่งไปแล้ว ' + list.length + ' คำขอ)', 'warning');
return false;
}
return true;
}
function openOCSupportPopup() {
if (!_tier1SupportQuotaOk_()) return;
Swal.fire({
title: 'ขอสนับสนุน',
html:
'<input id="oc_pop_req_type" type="hidden" value="">' +
'<div class="oc-pop-support-grid">' +
'<button type="button" class="oc-pop-support-btn" data-type="ขอกำลังพลเพิ่ม"><i class="fas fa-users"></i> คนเพิ่ม</button>' +
'<button type="button" class="oc-pop-support-btn" data-type="ขออุปกรณ์เพิ่ม"><i class="fas fa-boxes-stacked"></i> อุปกรณ์</button>' +
'<button type="button" class="oc-pop-support-btn" data-type="ขอยกระดับแผน"><i class="fas fa-arrow-up"></i> ยกระดับ</button>' +
'<button type="button" class="oc-pop-support-btn" data-type="ขอผู้เชี่ยวชาญ"><i class="fas fa-user-tie"></i> ผู้เชี่ยวชาญ</button>' +
'<button type="button" class="oc-pop-support-btn" data-type="ขอรถพยาบาลเพิ่ม"><i class="fas fa-ambulance"></i> รถพยาบาล</button>' +
'<button type="button" class="oc-pop-support-btn" data-type="ขอ Antidote / ยา"><i class="fas fa-pills"></i> ยา/Antidote</button>' +
'<button type="button" class="oc-pop-support-btn" data-type="ขอทีม Decon"><i class="fas fa-shower"></i> Decon</button>' +
'<button type="button" class="oc-pop-support-btn" data-type="อื่นๆ"><i class="fas fa-plus"></i> อื่นๆ</button>' +
'</div>' +
'<textarea id="oc_pop_req_detail" class="swal2-textarea" style="margin:0;width:100%;box-sizing:border-box;min-height:95px;" placeholder="รายละเอียดสั้นๆ"></textarea>',
confirmButtonText: 'ส่งคำขอ',
confirmButtonColor: '#c0392b',
showCancelButton: true,
cancelButtonText: 'ยกเลิก',
didOpen: function() {
document.querySelectorAll('.oc-pop-support-btn').forEach(function(btn) {
btn.addEventListener('click', function() {
document.querySelectorAll('.oc-pop-support-btn').forEach(function(b) { b.classList.remove('active'); });
btn.classList.add('active');
document.getElementById('oc_pop_req_type').value = btn.getAttribute('data-type') || '';
});
});
},
preConfirm: function() {
var type = document.getElementById('oc_pop_req_type').value;
if (!type) {
Swal.showValidationMessage('กรุณาเลือกประเภทคำขอ');
return false;
}
return {
type: type,
detail: document.getElementById('oc_pop_req_detail').value.trim() || '-'
};
}
}).then(function(r) {
if (!r.isConfirmed) return;
showOCSending('กำลังส่งคำขอ...', 'กำลังส่งคำขอสนับสนุนไปยัง EOC');
google.script.run
.withSuccessHandler(function() {
refreshOCData();
Swal.fire({ icon:'success', title:'ส่งคำขอแล้ว', timer:1300, showConfirmButton:false });
})
.withFailureHandler(function(err) {
Swal.fire('ส่งคำขอไม่สำเร็จ', err && err.message ? err.message : String(err), 'error');
})
.submitSupportRequest(r.value.type, r.value.detail, ocCurrentUser, (typeof APP_AGENCY_ID !== 'undefined' ? APP_AGENCY_ID : ''));
});
}
function openOCWindInput() {
openWindInputModal();
}
function openOCMediaAttach() {
var input = document.getElementById('oc_attach_input');
if (input) input.click();
}
function openOCHistoryPopup() {
var sits = (window._lastOCSitReports || []).slice(0, 4);
var reqs = (window._lastOCSupportReqs || []).slice(0, 4);
var sitHtml = sits.length ? sits.map(function(r) {
return '<div style="border-bottom:1px solid #e5e7eb;padding:7px 0;text-align:left;"><b>' + (r.tag || '-') + '</b> <span style="color:#64748b;font-size:12px;">' + (r.time || '') + '</span><br>' + (r.detail || '-') + '</div>';
}).join('') : '<div style="color:#94a3b8;padding:8px;">ยังไม่มีรายงานสถานการณ์</div>';
var reqHtml = reqs.length ? reqs.map(function(r) {
return '<div style="border-bottom:1px solid #e5e7eb;padding:7px 0;text-align:left;"><b>' + (r.type || '-') + '</b> <span style="color:#64748b;font-size:12px;">' + (r.time || '') + '</span><br>' + (r.detail || '-') + '</div>';
}).join('') : '<div style="color:#94a3b8;padding:8px;">ยังไม่มีคำขอสนับสนุน</div>';
Swal.fire({
title: 'ประวัติการรายงาน',
html: '<div style="text-align:left;"><h4 style="margin:0 0 6px;">สถานการณ์</h4>' + sitHtml + '<h4 style="margin:12px 0 6px;">คำขอสนับสนุน</h4>' + reqHtml + '</div>',
confirmButtonText: 'ปิด',
confirmButtonColor: '#34495e',
width: 520
});
}
function selectOCRequestPreset(btn, type) {
document.querySelectorAll('#oc_req_presets .oc-preset-btn').forEach(function(b) { b.classList.remove('active'); });
btn.classList.add('active');
var sel = document.getElementById('oc_req_type');
if (!sel) return;
var exists = Array.from(sel.options).some(function(opt) { return opt.value === type || opt.text === type; });
if (!exists) sel.add(new Option(type, type));
sel.value = type;
}
function _saveIndoorZoneMarker_(zoneType, label, successTitle) {
Swal.fire({
title: '<i class="fas fa-building"></i> ระบุตำแหน่งในอาคาร',
html: '<div style="text-align:left;">' +
'<label style="font-size:13px;font-weight:700;color:#334155;display:block;margin-bottom:6px;">ชั้น / พื้นที่</label>' +
'<input id="swal-floor-label" class="swal2-input" placeholder="เช่น ชั้น 3 / ห้องผ่าตัด" style="margin:0;">' +
'</div>',
showCancelButton: true,
confirmButtonText: 'บันทึก',
cancelButtonText: 'ยกเลิก',
preConfirm: function() {
var v = document.getElementById('swal-floor-label').value.trim();
if (!v) return Swal.showValidationMessage('กรุณาระบุชั้น/พื้นที่');
return v;
}
}).then(function(result) {
if (!result.isConfirmed) return;
var floorLabel = result.value;
showOCSending('กำลังบันทึกจุด...', 'กำลังส่งตำแหน่งในอาคารไปยัง EOC');
google.script.run
.withSuccessHandler(function() {
refreshOCData();
Swal.fire({ icon:'success', title: successTitle || 'บันทึกจุดแล้ว', timer:1500, showConfirmButton:false });
})
.withFailureHandler(function(err) {
Swal.close();
Swal.fire('บันทึกจุดไม่สำเร็จ', err && err.message ? err.message : String(err), 'error');
})
.saveZoneMarker(zoneType, label, '', '', '', ocCurrentUser, window.currentUserPhone || '', (typeof APP_AGENCY_ID !== 'undefined' ? APP_AGENCY_ID : ''), 'indoor', floorLabel);
});
}
function openZoneIndoorPicker() {
var zType = document.getElementById('oc_zone_type_sel').value;
var zLabel = document.getElementById('oc_zone_label').value.trim() || zType;
_saveIndoorZoneMarker_(zType, zLabel, 'บันทึกจุดแล้ว');
}
function openICPIndoorPicker() {
var labelEl = document.getElementById('oc_icp_label');
var label = (labelEl && labelEl.value.trim()) ? labelEl.value.trim() : 'ICP / Command';
_saveIndoorZoneMarker_('ICP', label, 'บันทึก Command Post แล้ว');
}
function openZoneMapPicker() {
mapPickerMode = 'zone';
mapPickLockToCurrent = false;
tempLat = "";
tempLng = "";
window._mapPickerContext = {
titleHtml: '<i class="fas fa-map-location-dot"></i> เลือกจุดปฏิบัติการ',
searchPlaceholder: 'ค้นหาตำแหน่งจุดปฏิบัติการ...',
coordPlaceholder: 'วาง Google Maps link หรือ lat,lon ของจุดปฏิบัติการ',
selectedText: 'ยังไม่ได้เลือกพิกัดจุดปฏิบัติการ'
};
document.getElementById('selectedCoordText').innerText = 'พิกัด: ยังไม่ได้เลือก (กำลังตั้งจุดปฏิบัติการ)';
window._zonePickerCallback = function(lat, lng) {
var zType = document.getElementById('oc_zone_type_sel').value;
var zLabel = document.getElementById('oc_zone_label').value.trim() || zType;
showOCSending('กำลังบันทึกจุด...', 'กำลังส่งพิกัดจุดปฏิบัติการไปยัง EOC');
google.script.run
.withSuccessHandler(function() {
refreshOCData();
Swal.fire({ icon:'success', title:'บันทึกจุดแล้ว', timer:1500, showConfirmButton:false });
})
.withFailureHandler(function(err) {
Swal.close();
Swal.fire('บันทึกจุดไม่สำเร็จ', err && err.message ? err.message : String(err), 'error');
})
.saveZoneMarker(zType, zLabel, lat, lng, '', ocCurrentUser, window.currentUserPhone || '', (typeof APP_AGENCY_ID !== 'undefined' ? APP_AGENCY_ID : ''));
};
openMap();
}
function openICPMapPicker() {
mapPickerMode = 'zone';
mapPickLockToCurrent = false;
tempLat = "";
tempLng = "";
window._mapPickerContext = {
titleHtml: '<i class="fas fa-shield-alt"></i> เลือก Command Post',
searchPlaceholder: 'ค้นหาตำแหน่ง Command Post...',
coordPlaceholder: 'วาง Google Maps link หรือ lat,lon ของ Command Post',
selectedText: 'ยังไม่ได้เลือกพิกัด Command Post'
};
var text = document.getElementById('selectedCoordText');
if (text) text.innerText = 'เลือกจุด Command Post บนแผนที่';
window._zonePickerCallback = function(lat, lng) {
var labelEl = document.getElementById('oc_icp_label');
var label = (labelEl && labelEl.value.trim()) ? labelEl.value.trim() : 'ICP / Command';
showOCSending('กำลังบันทึก Command Post...', 'กำลังส่งพิกัด Command Post ไปยัง EOC');
google.script.run
.withSuccessHandler(function() {
refreshOCData();
Swal.fire({ icon:'success', title:'บันทึก Command Post แล้ว', timer:1500, showConfirmButton:false });
})
.withFailureHandler(function(err) {
Swal.close();
Swal.fire('บันทึก Command Post ไม่สำเร็จ', err && err.message ? err.message : String(err), 'error');
})
.saveZoneMarker('ICP', label, lat, lng, 'Manual map', ocCurrentUser, window.currentUserPhone || '', (typeof APP_AGENCY_ID !== 'undefined' ? APP_AGENCY_ID : ''));
};
openMap();
}
function useCurrentLocationForICP() {
if (!navigator.geolocation) {
Swal.fire('อุปกรณ์นี้ไม่รองรับ GPS', 'กรุณาเปิดในมือถือหรือเบราว์เซอร์ที่รองรับตำแหน่ง', 'warning');
return;
}
Swal.fire({ title:'กำลังอ่านตำแหน่งปัจจุบัน...', text:'ระบบจะใช้จุดที่คุณยืนอยู่เป็น ICP', didOpen:function(){ Swal.showLoading(); }, allowOutsideClick:false });
navigator.geolocation.getCurrentPosition(function(pos) {
Swal.close();
mapPickerMode = 'zone';
mapPickLockToCurrent = true;
window._mapPickerContext = {
titleHtml: '<i class="fas fa-shield-alt"></i> เลือก Command Post',
searchPlaceholder: 'ค้นหาตำแหน่ง Command Post...',
coordPlaceholder: 'วาง Google Maps link หรือ lat,lon ของ Command Post',
selectedText: 'ใช้ตำแหน่งปัจจุบันเป็น Command Post'
};
var lat = pos.coords.latitude.toFixed(6);
var lng = pos.coords.longitude.toFixed(6);
tempLat = lat;
tempLng = lng;
var labelEl = document.getElementById('oc_icp_label');
var label = (labelEl && labelEl.value.trim()) ? labelEl.value.trim() : 'ICP / Command';
window._zonePickerCallback = function(saveLat, saveLng) {
showOCSending('กำลังบันทึก ICP...', 'กำลังส่งพิกัดปัจจุบันไปยัง EOC');
google.script.run
.withSuccessHandler(function() {
refreshOCData();
Swal.fire({ icon:'success', title:'บันทึก ICP แล้ว', text:'ใช้ตำแหน่งปัจจุบันเป็นจุดบัญชาการ', timer:1800, showConfirmButton:false });
})
.withFailureHandler(function(err) {
Swal.close();
Swal.fire('บันทึก ICP ไม่สำเร็จ', err && err.message ? err.message : String(err), 'error');
})
.saveZoneMarker('ICP', label, saveLat, saveLng, 'Current GPS', ocCurrentUser, window.currentUserPhone || '', (typeof APP_AGENCY_ID !== 'undefined' ? APP_AGENCY_ID : ''));
};
openMap();
setTimeout(function() {
placeMarker({ lon: parseFloat(lng), lat: parseFloat(lat) });
showIncidentOnPickerMap();
framePickerSelectionWithIncident();
var text = document.getElementById('selectedCoordText');
if (text) text.innerText = 'ตำแหน่งปัจจุบัน: ' + lat + ', ' + lng + ' | ตรวจระยะจากจุดเกิดเหตุก่อนยืนยัน';
}, 160);
}, function(err) {
Swal.fire('อ่านตำแหน่งไม่ได้', err && err.message ? err.message : 'กรุณาอนุญาตการใช้ตำแหน่ง GPS', 'error');
}, { enableHighAccuracy:true, timeout:12000, maximumAge:0 });
}
function sendOCReport() {
Swal.fire({
title: 'รายงานขึ้น EOC',
text: 'ระบบจะส่ง SITREP พร้อมข้อมูลปัจจุบันขึ้น EOC และ Telegram',
icon: 'question',
showCancelButton: true,
confirmButtonText: 'ส่งเลย',
cancelButtonText: 'ยกเลิก'
}).then(function(r) {
if (r.isConfirmed) {
var state = window._lastOCState;
var sit = (state && state.sitReports && state.sitReports[0]) ? state.sitReports[0].detail : '-';
showOCSending('กำลังส่ง SITREP...', 'กำลังสร้างและส่งรายงานขึ้น EOC');
google.script.run
.withSuccessHandler(function(res) {
Swal.fire({ icon:'success', title:'ส่ง SITREP แล้ว', timer:2000, showConfirmButton:false });
})
.generateAndSendSitrep(sit, 'ควบคุมสถานการณ์', 'ปฏิบัติตามแผน HAZMAT', 'ตามทรัพยากรที่มี', true);
}
});
}
var IC_OC_WIDGET_VERSION = 'IC-OC-2026-05-19-1345';
function setICOCDebugStatus(message, color) {
var zoneEl = document.getElementById('ic_zone_marker_feed');
if (!zoneEl) return;
var old = document.getElementById('ic_oc_debug_status');
if (old) old.remove();
var badge = document.createElement('div');
badge.id = 'ic_oc_debug_status';
badge.style.cssText = 'font-size:10px;margin-bottom:5px;padding:3px 6px;border-radius:6px;background:' + (color || '#eef2f7') + ';color:#2c3e50;';
badge.textContent = IC_OC_WIDGET_VERSION + ' | ' + message;
zoneEl.prepend(badge);
}
function cleanOCResourceControls() {
document.querySelectorAll('#oc_resource_quick_grid button').forEach(function(btn) {
var text = btn.textContent || '';
if (text.indexOf('Decon') !== -1 || text.indexOf('Safety') !== -1) {
btn.style.display = 'none';
}
});
var resType = document.getElementById('res_type');
if (resType) {
Array.from(resType.options).forEach(function(opt) {
var text = opt.text || '';
if (text.indexOf('Decon') !== -1 || text.indexOf('Safety') !== -1) {
opt.remove();
}
});
}
}
cleanOCResourceControls();
var IC_OC_HARD_VERSION = 'IC-OC-HARD-2026-05-19-1410';
function normalizeICOCState(state) {
state = state || {};
var zones = Array.isArray(state.zoneMarkers) ? state.zoneMarkers.filter(function(z) {
var lat = parseFloat(z.lat !== undefined ? z.lat : z.Lat);
var lng = parseFloat(z.lng !== undefined ? z.lng : z.Lng);
return z && !isNaN(lat) && !isNaN(lng);
}) : [];
var sitReports = Array.isArray(state.sitReports) ? state.sitReports : [];
var supportReqs = Array.isArray(state.supportReqs) ? state.supportReqs : [];
var resources = Array.isArray(state.resources) ? state.resources : [];
var attendance = Array.isArray(state.attendance) ? state.attendance : [];
var attendanceSummary = state.attendanceSummary || null;
var roleUpdates = Array.isArray(state.roleUpdates) ? state.roleUpdates : [];
var evacuationPoints = Array.isArray(state.evacuationPoints) ? state.evacuationPoints : [];
if (!zones.length && window._icZoneMarkers && window._icZoneMarkers.length) zones = window._icZoneMarkers;
if (!supportReqs.length && window._icSupportReqs && getActiveOCSupportRequests(window._icSupportReqs).length) supportReqs = window._icSupportReqs;
return {
zoneMarkers: zones,
sitReports: sitReports,
supportReqs: supportReqs,
resources: resources,
attendance: attendance,
attendanceSummary: attendanceSummary,
roleUpdates: roleUpdates,
evacuationPoints: evacuationPoints
};
}
function activeOCSupportRequests() {
return getActiveOCSupportRequests(window._icSupportReqs || []);
}
function getOCSupportReqKey(req) {
return String((req && (req.rowIndex || req.type || req.detail)) || '');
}
function scheduleOCSupportedNoticeExpiry() {
if (window._ocSupportedNoticeTimer) return;
window._ocSupportedNoticeTimer = setTimeout(function() {
window._ocSupportedNoticeTimer = null;
if (window._icZoneMarkers && window._icZoneMarkers.length && dashMap) {
drawOCSupportRequestAlertsOnMap(window._icZoneMarkers, window._icSupportReqs || []);
}
}, 10500);
}
function reconcileOCSupportRequestStatus(list) {
list = Array.isArray(list) ? list : [];
var latest = {};
var rank = { pending: 1, acknowledged: 2, supported: 3, closed: 4, rejected: 4 };
function remember(source) {
(Array.isArray(source) ? source : []).forEach(function(r) {
var key = getOCSupportReqKey(r);
if (!key) return;
var status = String(r.status || 'pending').trim().toLowerCase();
if (!latest[key] || (rank[status] || 0) >= (rank[latest[key]] || 0)) latest[key] = status;
});
}
remember(window._lastOCSupportReqs);
remember(window._lastOCState && window._lastOCState.supportReqs);
remember(list);
return list.map(function(r) {
var key = getOCSupportReqKey(r);
var status = latest[key];
if (!status || String(r.status || '').trim().toLowerCase() === status) return r;
var copy = {};
Object.keys(r).forEach(function(k) { copy[k] = r[k]; });
copy.status = status;
return copy;
});
}
function getActiveOCSupportRequests(list) {
list = reconcileOCSupportRequestStatus(list);
window._ocSupportedNoticeAt = window._ocSupportedNoticeAt || {};
var now = Date.now();
return (list || []).filter(function(r) {
var status = String(r.status || 'pending').trim().toLowerCase();
if (status === 'pending' || status === 'acknowledged' || status.indexOf('รอ') !== -1) return true;
if (status === 'supported') {
var key = getOCSupportReqKey(r);
if (!window._ocSupportedNoticeAt[key]) window._ocSupportedNoticeAt[key] = now;
scheduleOCSupportedNoticeExpiry();
return now - window._ocSupportedNoticeAt[key] <= 10000;
}
return false;
});
}
function findCommandPostZone(zones) {
zones = normalizeICOCState({ zoneMarkers: zones }).zoneMarkers;
return zones.find(function(z) {
var type = String(z.type || z.ZoneType || '').toLowerCase();
var label = String(z.label || z.Label || '').toLowerCase();
return type === 'icp' || type.indexOf('command') !== -1 || label.indexOf('command') !== -1 || label.indexOf('icp') !== -1;
}) || null;
}
function buildOCSupportAlertDetail(reqs) {
return (reqs || []).map(function(r) {
var status = String(r.status || 'pending').trim().toLowerCase();
var rowIndex = parseInt(r.id, 10) || parseInt((r.id||r.rowIndex), 10) || 0;
var statusText = status === 'supported' ? 'การดำเนินการเสร็จสิ้น' :
status === 'acknowledged' ? 'รอการดำเนินการ' : 'รอ IC รับทราบ';
var statusColor = status === 'supported' ? '#16a34a' : status === 'acknowledged' ? '#d97706' : '#dc2626';
var btn = '';
if (rowIndex && status === 'pending') {
btn = '<button onclick="updateOCSupportFromIC(' + rowIndex + ',&quot;acknowledged&quot;)" style="margin-top:6px;background:#dc2626;color:white;border:none;border-radius:6px;padding:5px 10px;font-size:12px;font-weight:bold;cursor:pointer;">รับทราบ</button>';
}
var noteHtml = r.responseNote ? '<div style="margin-top:4px;color:#1d4ed8;font-size:12px;"><b>IC:</b> ' + roleSafeText(r.responseNote) + '</div>' : '';
return '<div style="padding:7px 0;border-bottom:1px solid #fee2e2;">' +
'<b style="color:#991b1b;">' + (r.type || '-') + '</b><br>' +
'<span>' + (r.detail || '-') + '</span><br>' +
'<span style="color:' + statusColor + ';font-weight:bold;">' + statusText + '</span>' + noteHtml + '<br>' + btn +
'</div>';
}).join('');
}
function drawOCSupportRequestAlertsOnMap(zones, supportReqs) {
if (!dashMap || typeof longdo === 'undefined') return;
ensureOCRequestAlertStyle();
zones = normalizeICOCState({ zoneMarkers: zones || window._icZoneMarkers || [] }).zoneMarkers;
var incomingReqs = Array.isArray(supportReqs) ? supportReqs : null;
if (incomingReqs && incomingReqs.length) {
window._icSupportReqs = reconcileOCSupportRequestStatus(incomingReqs);
} else if (incomingReqs && !incomingReqs.length && !(window._icSupportReqs && getActiveOCSupportRequests(window._icSupportReqs).length)) {
window._icSupportReqs = [];
}
var activeReqs = getActiveOCSupportRequests(window._icSupportReqs || incomingReqs || []);
window._icOCReqAlertOverlays = window._icOCReqAlertOverlays || [];
if (zones.length) {
window._icOCZoneEmptyCount = 0;
drawOCZoneMarkersOnICMap(zones, activeReqs);
} else {
window._icOCZoneEmptyCount = (window._icOCZoneEmptyCount || 0) + 1;
if ((window._icOCZoneOverlays && window._icOCZoneOverlays.length) && window._icOCZoneEmptyCount < 3) return;
clearLongdoOverlayList(dashMap, window._icOCZoneOverlays || []);
clearLongdoOverlayList(dashMap, window._icOCZoneCircles || []);
clearLongdoOverlayList(dashMap, window._icOCReqAlertOverlays || []);
window._icOCZoneOverlays = [];
window._icOCZoneCircles = [];
window._icOCReqAlertOverlays = [];
window._icOCZoneOverlayRecords = {};
window._icOCZoneDrawKey = '';
}
return;
if (!activeReqs.length) {
clearLongdoOverlayList(dashMap, window._icOCReqAlertOverlays);
window._icOCReqAlertOverlays = [];
return;
}
var cp = findCommandPostZone(zones);
if (!cp) return;
var lat = parseFloat(cp.lat || cp.Lat);
var lng = parseFloat(cp.lng || cp.Lng);
if (isNaN(lat) || isNaN(lng)) return;
var pendingCount = activeReqs.filter(function(r) {
return String(r.status || 'pending').trim().toLowerCase() === 'pending';
}).length;
var label = pendingCount ? ('ขอสนับสนุน ' + pendingCount) : 'รอการสนับสนุน';
var bg = pendingCount ? '#b91c1c' : '#d97706';
clearLongdoOverlayList(dashMap, window._icOCReqAlertOverlays);
window._icOCReqAlertOverlays = [];
var html = '<div style="display:flex;align-items:center;gap:8px;background:' + bg + ';color:white;border:3px solid #fff;border-radius:999px;padding:8px 13px;font-size:14px;font-weight:900;box-shadow:0 8px 24px rgba(0,0,0,.62);white-space:nowrap;pointer-events:auto;">' +
'<i class="fas fa-bell"></i><span>' + label + '</span>' +
'</div>';
var detail = '<b>คำขอสนับสนุนจาก OC/ICP</b><br>' + buildOCSupportAlertDetail(activeReqs);
var overlay = makeLongdoHtmlMarker({ lon: lng, lat: lat }, html, {
offset: { x: 0, y: 0 },
weight: longdo.OverlayWeight.Top,
title: 'คำขอสนับสนุนจาก OC/ICP',
scaleMode: 'label',
markerOptions: { detail: detail }
});
dashMap.Overlays.add(overlay);
window._icOCReqAlertOverlays.push(overlay);
}
function getOCZoneVisualOffset(type, zone, zones) {
return { x:0, y:0 };
}
function ensureOCRequestAlertStyle() {
if (document.getElementById('oc_request_alert_style')) return;
var style = document.createElement('style');
style.id = 'oc_request_alert_style';
style.textContent =
'@keyframes ocReqPulse{0%{box-shadow:0 0 0 0 rgba(239,68,68,.42)}80%{box-shadow:0 0 0 8px rgba(239,68,68,0)}100%{box-shadow:0 0 0 0 rgba(239,68,68,0)}}' +
'@keyframes ocReqBadge{0%,100%{opacity:1}50%{opacity:.78}}';
document.head.appendChild(style);
}
function windDirectionName(deg) {
const directions = ['เหนือ', 'ตะวันออกเฉียงเหนือ', 'ตะวันออก', 'ตะวันออกเฉียงใต้', 'ใต้', 'ตะวันตกเฉียงใต้', 'ตะวันตก', 'ตะวันตกเฉียงเหนือ'];
return directions[Math.round((Number(deg) || 0) / 45) % 8];
}
function clearDashWindOverlay() {
if (!dashMap || !window._dashWindOverlays) return;
window._dashWindOverlays.forEach(function(o) {
try { dashMap.Overlays.remove(o); } catch(e) {}
});
window._dashWindOverlays = [];
}
function drawWindArrowOnDashMap(destDeg, speed) {
if (!dashMap || !incidentCenter || incidentCenter.lat == null || incidentCenter.lng == null || typeof longdo === 'undefined') return;
clearDashWindOverlay();
var loc = { lon: parseFloat(incidentCenter.lng), lat: parseFloat(incidentCenter.lat) };
if (isNaN(loc.lon) || isNaN(loc.lat)) return;
var html = '<div style="display:flex;align-items:center;gap:7px;background:rgba(15,23,42,.92);color:white;border:2px solid #38bdf8;border-radius:999px;padding:5px 9px;box-shadow:0 4px 14px rgba(0,0,0,.45);font-weight:900;white-space:nowrap;font-size:13px;">' +
'<i class="fas fa-arrow-up" style="color:#7dd3fc;font-size:18px;transform:rotate(' + (Number(destDeg) || 0) + 'deg);"></i>' +
'<span>' + Number(speed || 0).toFixed(1) + ' m/s</span>' +
'</div>';
var marker = makeLongdoHtmlMarker(loc, html, {
offset: { x: 0, y: 0 },
weight: longdo.OverlayWeight.Top,
scaleMode: 'label'
});
dashMap.Overlays.add(marker);
window._dashWindOverlays = [marker];
}
function applyWindWaitingDisplay() {
var info = document.getElementById('weather_info');
var arrow = document.getElementById('wind_arrow');
if (info) info.innerText = 'รอข้อมูลลมจาก OC/ICP';
if (arrow) {
arrow.className = 'fas fa-minus';
arrow.style.transform = 'rotate(0deg)';
}
clearDashWindOverlay();
}
function applyWindDisplay(destDeg, speed, source, updatedBy) {
var info = document.getElementById('weather_info');
var arrow = document.getElementById('wind_arrow');
if (info) {
var src = source ? ' • ' + source : '';
info.innerText = windDirectionName(destDeg) + ' ' + Number(speed || 0).toFixed(1) + ' m/s' + src;
}
if (arrow) {
arrow.className = 'fas fa-arrow-up';
arrow.style.transform = 'rotate(' + (Number(destDeg) || 0) + 'deg)';
}
drawWindArrowOnDashMap(destDeg, speed);
}
function getPendingWindKey(pending) {
if (!pending) return '';
return [pending.directionDeg, pending.speed, pending.updatedAt, pending.updatedBy].join('|');
}
function checkPendingOCWind(wind) {
// ถ้า OC/ICP ส่งทิศทางลมมา (source=OC) และยังไม่เคยถามรอบนี้
if (!wind || wind.source !== 'OC' || !wind.directionDeg || wind.directionDeg === '') return;
var key = (wind.directionDeg || '') + '|' + (wind.speedMs || wind.speed || '') + '|' + (wind.updatedAt || '');
if (!key || window._lastPromptedOCWindKey === key) return;
// ถ้าเป็น IC/Admin dashboard เท่านั้นที่ถาม
if (!document.getElementById('scene_Dashboard') || document.getElementById('scene_Dashboard').style.display === 'none') return;
window._lastPromptedOCWindKey = key;
var speedVal = Number(wind.speedMs || wind.speed || 0).toFixed(1);
var msg = 'OC/ICP รายงานทิศทางลม: <b>' + windDirectionName(Number(wind.directionDeg)) + ' ' + speedVal + ' m/s</b>';
if (wind.updatedBy) msg += '<br><span style="color:#64748b;font-size:0.85em;">โดย ' + roleSafeText(wind.updatedBy) + '</span>';
Swal.fire({
icon: 'info',
title: '🌬️ มีทิศทางลมจาก OC/ICP',
html: msg + '<br><br>ต้องการใช้ข้อมูลนี้แสดงบน Dashboard หรือไม่',
showCancelButton: true,
confirmButtonText: 'ใช้เลย',
cancelButtonText: 'ใช้อัตโนมัติต่อไป',
confirmButtonColor: '#185fa5'
}).then(function(r) {
if (!r.isConfirmed) return;
applyWindDisplay(Number(wind.directionDeg), Number(wind.speedMs || wind.speed || 0), wind.source || 'OC', wind.updatedBy || '');
Swal.fire({ icon:'success', title:'ใช้ทิศทางลมจาก OC/ICP แล้ว', timer:1200, showConfirmButton:false });
});
}
function openWindInputModal() {
var canEdit = APP_ACCESS_ROLE === 'admin' || currentRole === 'ops' || TEMP_ROLE === 'ops' || isOCRole(currentRole) || isOCRole(TEMP_ROLE);
if (!canEdit) {
Swal.fire('ยังไม่มีข้อมูลลม', 'รอ OC/ICP รายงานทิศทางลมจากจุดเกิดเหตุ', 'info');
return;
}
var current = (window._lastEmergState && window._lastEmergState.wind) ? window._lastEmergState.wind : {};
var currentDeg = current.directionDeg != null && current.directionDeg !== '' ? Number(current.directionDeg) : null;
var dirs = [
{ deg:315, label:'ตะวันตกเฉียงเหนือ', pos:'1 / 1' },
{ deg:0, label:'เหนือ', pos:'1 / 2' },
{ deg:45, label:'ตะวันออกเฉียงเหนือ', pos:'1 / 3' },
{ deg:270, label:'ตะวันตก', pos:'2 / 1' },
{ deg:null, label:'เลือกทิศ', pos:'2 / 2', center:true },
{ deg:90, label:'ตะวันออก', pos:'2 / 3' },
{ deg:225, label:'ตะวันตกเฉียงใต้', pos:'3 / 1' },
{ deg:180, label:'ใต้', pos:'3 / 2' },
{ deg:135, label:'ตะวันออกเฉียงใต้', pos:'3 / 3' }
];
var dirButtons = dirs.map(function(d) {
if (d.center) {
return '<div style="grid-area:' + d.pos + ';display:flex;align-items:center;justify-content:center;color:#64748b;font-weight:bold;font-size:12px;">ทิศที่ลมพัดไป</div>';
}
var active = currentDeg !== null && Math.round(currentDeg / 45) * 45 === d.deg;
return '<button type="button" class="wind-dir-btn" data-deg="' + d.deg + '" onclick="selectWindDirection(' + d.deg + ', this)" style="grid-area:' + d.pos + ';border:1px solid ' + (active ? '#185fa5':'#cbd5e1') + ';background:' + (active ? '#dbeafe':'#fff') + ';border-radius:10px;padding:9px 6px;cursor:pointer;font-family:Prompt,sans-serif;font-weight:800;color:#123b63;min-height:54px;"><i class="fas fa-arrow-up" style="display:block;margin-bottom:4px;transform:rotate(' + d.deg + 'deg);color:#185fa5;"></i>' + d.label + '</button>';
}).join('');
Swal.fire({
title: 'บันทึกทิศทางลม',
html:
'<div style="text-align:left;font-size:13px;color:#475569;margin-bottom:10px;">กดทิศที่ลมพัดไป แล้วใส่ความเร็วลม</div>' +
'<input type="hidden" id="wind_deg_input" value="' + (currentDeg !== null ? currentDeg : '') + '">' +
'<div style="display:grid;grid-template-columns:repeat(3,1fr);grid-template-rows:repeat(3,auto);gap:7px;margin-bottom:12px;">' + dirButtons + '</div>' +
'<div style="text-align:left;font-size:13px;margin:8px 0 6px;">ความเร็วลม (m/s)</div>' +
'<input id="wind_speed_input" class="swal2-input" type="number" min="0" step="0.1" value="' + (current.speed != null ? current.speed : '') + '" placeholder="เช่น 3.8">',
showCancelButton: true,
confirmButtonText: 'บันทึก',
cancelButtonText: 'ยกเลิก',
preConfirm: function() {
var degRaw = document.getElementById('wind_deg_input').value;
var deg = Number(degRaw);
var speed = Number(document.getElementById('wind_speed_input').value);
if (degRaw === '' || isNaN(deg) || deg < 0 || deg >= 360) return Swal.showValidationMessage('กรุณาเลือกทิศทางลมจากแผนภาพ');
if (isNaN(speed) || speed < 0) return Swal.showValidationMessage('กรุณากรอกความเร็วลม');
return { deg: deg, speed: speed };
}
}).then(function(r) {
if (!r.isConfirmed) return;
showOCSending('กำลังบันทึกทิศทางลม...', 'กำลังส่งข้อมูลลมไปยัง EOC');
google.script.run
.withSuccessHandler(function(wind) {
window._lastEmergState = window._lastEmergState || {};
window._lastEmergState.wind = wind;
applyWindDisplay(wind.directionDeg, wind.speed, wind.source, wind.updatedBy);
Swal.fire({ icon:'success', title:'บันทึกทิศทางลมแล้ว', timer:1200, showConfirmButton:false });
})
.withFailureHandler(function(err) {
Swal.fire('บันทึกไม่สำเร็จ', err && err.message ? err.message : String(err), 'error');
})
.saveWindReport(r.value.deg, r.value.speed, isOCRole(currentRole) || isOCRole(TEMP_ROLE) || currentRole === 'ops' ? 'OC' : 'Admin', USER_NAME || currentUserName || 'User');
});
}
function selectWindDirection(deg, btn) {
var input = document.getElementById('wind_deg_input');
if (input) input.value = deg;
document.querySelectorAll('.wind-dir-btn').forEach(function(el) {
el.style.background = '#fff';
el.style.borderColor = '#cbd5e1';
});
if (btn) {
btn.style.background = '#dbeafe';
btn.style.borderColor = '#185fa5';
}
}
function refreshICOCFeedsDirect() {
if (typeof google === 'undefined' || !google.script || !google.script.run) return;
if (window._icOCFeedsLoading) return;
if (window._lastICOCFeedsAt && Date.now() - window._lastICOCFeedsAt < 3500) return;
window._lastICOCFeedsAt = Date.now();
window._icOCFeedsLoading = true;
setICOCDebugStatus(IC_OC_HARD_VERSION + ' loading', '#fff7ed');
google.script.run
.withFailureHandler(function(err) {
window._icOCFeedsLoading = false;
setICOCDebugStatus(IC_OC_HARD_VERSION + ' error: ' + (err && err.message ? err.message : String(err)), '#fee2e2');
refreshOCSupportRequestsDirect('ic');
})
.withSuccessHandler(function(state) {
window._icOCFeedsLoading = false;
window._lastERGState = (state && state.ergState) || window._lastERGState || {};
state = normalizeICOCState(state);
renderICOCFeeds(state);
if (!state.sitReports || !state.sitReports.length) {
refreshOCSitReportsDirect('ic');
}
if (!state.supportReqs || !state.supportReqs.length) {
refreshOCSupportRequestsDirect('ic');
}
if (state.zoneMarkers.length) {
drawOCZoneMarkersOnICMap(state.zoneMarkers, state.supportReqs);
drawOCSupportRequestAlertsOnMap(state.zoneMarkers, state.supportReqs);
}
if (!state.zoneMarkers.length) {
setICOCDebugStatus(IC_OC_HARD_VERSION + ' zone=0 from webapp, check code.gs deploy', '#fee2e2');
}
})
.getICDashboardOCData(
typeof APP_AGENCY_ID !== 'undefined' ? APP_AGENCY_ID : '',
typeof APP_AGENCY_SHEET_ID !== 'undefined' ? APP_AGENCY_SHEET_ID : '',
typeof getActiveJoinToken === 'function' ? getActiveJoinToken() : ''
);
}
function forceRefreshICOCData() {
refreshICOCFeedsDirect();
setTimeout(function() {
if (window._pendingICZoneMarkers && window._pendingICZoneMarkers.length && dashMap) {
drawOCZoneMarkersOnICMap(window._pendingICZoneMarkers, window._icSupportReqs || []);
drawOCSupportRequestAlertsOnMap(window._pendingICZoneMarkers, window._icSupportReqs || []);
window._pendingICZoneMarkers = [];
} else if (window._icZoneMarkers && window._icZoneMarkers.length && dashMap) {
drawOCZoneMarkersOnICMap(window._icZoneMarkers, window._icSupportReqs || []);
drawOCSupportRequestAlertsOnMap(window._icZoneMarkers, window._icSupportReqs || []);
}
}, 900);
}
function getOCSitReportStyle(tag) {
var text = String(tag || '');
if (text.indexOf('ลุกลาม') !== -1) return { bg:'#fee2e2', border:'#dc2626', color:'#991b1b' };
if (text.indexOf('กำลัง') !== -1 || text.indexOf('ระงับ') !== -1 && text.indexOf('แล้ว') === -1) return { bg:'#ffedd5', border:'#f97316', color:'#9a3412' };
if (text.indexOf('ควบคุม') !== -1) return { bg:'#dbeafe', border:'#2563eb', color:'#1e3a8a' };
if (text.indexOf('ได้แล้ว') !== -1 || text.indexOf('เรียบร้อย') !== -1) return { bg:'#dcfce7', border:'#16a34a', color:'#166534' };
return { bg:'#f1f5f9', border:'#64748b', color:'#334155' };
}
function renderOCSitReportsInSitrepTab(list) {
var topText = document.getElementById('hdr_oc_sitrep_text');
var topBox = document.getElementById('hdr_oc_sitrep_box');
var el = document.getElementById('sitrep_oc_feed');
list = Array.isArray(list) ? list : [];
if (!list.length && window._lastOCSitReports && window._lastOCSitReports.length) {
list = window._lastOCSitReports;
}
if (list.length) {
window._lastOCSitReports = list;
}
if (!list.length) {
if (topBox) topBox.classList.remove('oc-sitrep-active');
if (topText) topText.textContent = '— ยังไม่มีรายงาน —';
if (topBox) topBox.style.borderColor = '#64748b';
if (el) el.innerHTML = '<div style="color:#94a3b8;text-align:center;padding:6px 0;">ยังไม่มีรายงานสถานการณ์จาก OC/ICP</div>';
return;
}
var latest = list[0] || {};
var latestStyle = getOCSitReportStyle(latest.tag);
if (topText) topText.textContent = (latest.tag || '-') + ' | ' + (latest.detail || '-');
if (topBox) {
topBox.classList.add('oc-sitrep-active');
topBox.style.borderColor = latestStyle.border;
}
if (!el) return;
el.innerHTML = list.slice(0, 5).map(function(r) {
var st = getOCSitReportStyle(r.tag);
return '<div style="background:' + st.bg + ';border:1px solid ' + st.border + ';border-left:4px solid ' + st.border + ';border-radius:6px;padding:7px 8px;">' +
'<div style="display:flex;justify-content:space-between;gap:8px;align-items:center;margin-bottom:3px;">' +
'<b style="color:' + st.color + ';">' + (r.tag || '-') + '</b>' +
'<span style="font-size:0.66rem;color:#64748b;white-space:nowrap;">' + (r.time || '') + '</span>' +
'</div>' +
'<div style="color:#1f2937;">' + (r.detail || '-') + '</div>' +
(r.attach ? '<div style="margin-top:4px;color:#2563eb;"><i class="fas fa-paperclip"></i> ' + r.attach + '</div>' : '') +
'</div>';
}).join('');
}
function renderICOCFeeds(state) {
state = normalizeICOCState(state);
window._icZoneMarkers = state.zoneMarkers;
if (state.sitReports.length || !window._icSitReports) {
window._icSitReports = state.sitReports;
} else if (window._icSitReports && window._icSitReports.length) {
state.sitReports = window._icSitReports;
}
if (state.supportReqs.length || !window._icSupportReqs) {
window._icSupportReqs = state.supportReqs;
}
drawOCSupportRequestAlertsOnMap(state.zoneMarkers, state.supportReqs);
renderOCSitReportsInSitrepTab(state.sitReports);
if (state.resources && state.resources.length) {
renderICIncomingResources(state.resources);
}
if (state.evacuationPoints.length || !window._dashboardEvacPoints) {
renderDashboardEvacPoints(state.evacuationPoints);
}
if (state.attendanceSummary && state.attendanceSummary.counts) {
window._attendanceData = state.attendanceSummary.people || state.attendance || window._attendanceData || [];
window._attendanceSummaryLockedUntil = Date.now() + 15000;
applyAttendanceCounts(state.attendanceSummary.counts);
} else if (state.attendance && state.attendance.length) {
renderAttendanceCounts(state.attendance);
}
renderRoleUpdateBadgesForIC(state.roleUpdates || []);
var sitEl = document.getElementById('ic_oc_sitrep_feed');
var reqEl = document.getElementById('ic_oc_support_feed');
var zoneEl = document.getElementById('ic_zone_marker_feed');
if (sitEl) {
sitEl.innerHTML = state.sitReports.length ? state.sitReports.slice(0, 4).map(function(r) {
return '<div style="border-bottom:1px solid #e8edf3;padding:7px 0;">' +
'<b style="color:#2c3e50;">' + (r.tag || '-') + '</b> ' +
'<span style="color:#999;font-size:11px;">' + (r.time || '') + '</span><br>' +
'<span>' + (r.detail || '-') + '</span>' +
(r.attach ? '<div style="margin-top:4px;color:#2980b9;font-size:11px;"><i class="fas fa-paperclip"></i> ' + r.attach + '</div>' : '') +
'</div>';
}).join('') : '<span style="color:#999;">ยังไม่มีรายงานสถานการณ์จาก OC/ICP</span>';
}
if (reqEl) {
reqEl.innerHTML = state.supportReqs.length ? state.supportReqs.slice(0, 5).map(function(r) {
var status = String(r.status || 'pending').toLowerCase();
var rowIndex = parseInt(r.id, 10) || parseInt((r.id||r.rowIndex), 10) || 0;
var label = status === 'acknowledged' ? 'รอการสนับสนุน' :
status === 'supported' ? 'ได้รับการสนับสนุนแล้ว' :
status === 'rejected' ? 'ไม่อนุมัติ' :
status === 'closed' ? 'ปิดคำขอ' : 'รอ IC รับทราบ';
var color = status === 'pending' ? '#dc2626' : status === 'acknowledged' ? '#d97706' : status === 'supported' ? '#16a34a' : '#64748b';
var btn = '';
if (rowIndex && status === 'pending') {
btn = '<button onclick="updateOCSupportFromIC(' + rowIndex + ',&quot;acknowledged&quot;)" style="margin-top:5px;background:#dc2626;color:white;border:none;border-radius:5px;padding:4px 8px;font-size:11px;cursor:pointer;">รับทราบ</button>';
} else if (rowIndex && status === 'acknowledged') {
btn = '<button onclick="updateOCSupportFromIC(' + rowIndex + ',&quot;supported&quot;)" style="margin-top:5px;background:#16a34a;color:white;border:none;border-radius:5px;padding:4px 8px;font-size:11px;cursor:pointer;">ได้รับการสนับสนุนแล้ว</button>';
}
var noteHtml = r.responseNote ? '<div style="margin-top:4px;color:#1d4ed8;font-size:11px;"><b>IC:</b> ' + roleSafeText(r.responseNote) + '</div>' : '';
return '<div style="border-bottom:1px solid #f5c6cb;padding:7px 0;">' +
'<b style="color:#c0392b;">' + (r.type || '-') + '</b> <span style="float:right;background:' + color + '20;color:' + color + ';border-radius:10px;padding:1px 7px;font-size:10px;font-weight:bold;">' + label + '</span><br>' +
'<span>' + (r.detail || '-') + '</span>' + noteHtml + '<br>' + btn +
'</div>';
}).join('') : '<span style="color:#999;">ยังไม่มีคำขอสนับสนุนจาก OC</span>';
}
if (zoneEl) {
zoneEl.innerHTML = state.zoneMarkers.length ? state.zoneMarkers.slice(0, 6).map(function(z) {
var type = z.type || z.ZoneType || '-';
var label = z.label || z.Label || type;
var lat = parseFloat(z.lat || z.Lat);
var lng = parseFloat(z.lng || z.Lng);
return '<div style="border-bottom:1px solid #e8edf3;padding:5px 0;">' +
'<b style="color:' + (type === 'ICP' ? '#1D4ED8':'#2c3e50') + ';">' + (type === 'ICP' ? 'Command Post' : type) + '</b> ' +
'<span>' + label + '</span>' +
'<div style="font-size:10px;color:#999;">' + lat.toFixed(5) + ', ' + lng.toFixed(5) + '</div>' +
'</div>';
}).join('') : '<span style="color:#999;">ยังไม่มีจุดปฏิบัติการจาก OC</span>';
setICOCDebugStatus(IC_OC_HARD_VERSION + ' zone=' + state.zoneMarkers.length + ', req=' + activeOCSupportRequests().length, state.zoneMarkers.length ? '#dcfce7' : '#fee2e2');
}
}
function dedupeOCSupportRequests(reqs) {
var seen = {};
return (Array.isArray(reqs) ? reqs : []).filter(function(r) {
var key = String((r.id||r.rowIndex) || '').trim();
if (!key || key === '0') {
key = [r.time || '', r.type || '', r.detail || '', r.status || '', r.by || r.loggedBy || ''].join('|');
}
if (seen[key]) return false;
seen[key] = true;
return true;
});
}
// ============================================================
// 🏢 การ์ดโครงสร้างอาคาร (Building Structure Card) — Admin เท่านั้น
// ============================================================
var BLDG_FLOOR_TYPES = {
incident: 'จุดเกิดเหตุ',
blocked: 'ปิดกั้น/ห้ามเข้า',
icp: 'จุดบัญชาการ (ICP)',
safe: 'ปลอดภัย/ใช้งานได้ปกติ',
other: 'อื่นๆ'
};
var BLDG_FLOOR_COLORS = {
incident: '#dc2626',
blocked: '#d97706',
icp: '#1d4ed8',
safe: '#16a34a',
other: '#64748b'
};
function openAddBuildingStructure() {
if (APP_ACCESS_ROLE !== 'admin') { Swal.fire('ต้องใช้สิทธิ์ Admin', 'เฉพาะ Admin เท่านั้นที่สร้างโครงสร้างอาคารได้', 'warning'); return; }
Swal.fire({
title: '<i class="fas fa-building"></i> เพิ่มโครงสร้างอาคาร',
html: '<div style="text-align:left;">' +
'<label style="font-size:13px;font-weight:700;color:#334155;display:block;margin-bottom:6px;">ชื่ออาคาร</label>' +
'<input id="bldg-name" class="swal2-input" placeholder="เช่น ตึกผู้ป่วยใน A" style="margin:0 0 12px;">' +
'<label style="font-size:13px;font-weight:700;color:#334155;display:block;margin-bottom:6px;">จำนวนชั้น</label>' +
'<input id="bldg-floors" type="number" min="1" max="60" class="swal2-input" placeholder="เช่น 5" style="margin:0;">' +
'</div>',
showCancelButton: true,
confirmButtonText: 'ถัดไป',
cancelButtonText: 'ยกเลิก',
preConfirm: function() {
var name = document.getElementById('bldg-name').value.trim();
var count = parseInt(document.getElementById('bldg-floors').value, 10);
if (!name) return Swal.showValidationMessage('กรุณาระบุชื่ออาคาร');
if (!count || count < 1 || count > 60) return Swal.showValidationMessage('กรุณาระบุจำนวนชั้น (1-60)');
return { name: name, count: count };
}
}).then(function(result) {
if (!result.isConfirmed) return;
_openBuildingFloorTable_(result.value.name, result.value.count, null, null);
});
}
function _toggleBldgOtherInput_(floorNum) {
var sel = document.getElementById('bldg-floor-type-' + floorNum);
var note = document.getElementById('bldg-floor-note-' + floorNum);
if (!sel || !note) return;
note.style.display = sel.value === 'other' ? '' : 'none';
}
function _openBuildingFloorTable_(buildingName, floorCount, existingId, existingFloors) {
var floors = [];
for (var i = 1; i <= floorCount; i++) {
var ex = (existingFloors || []).filter(function(f) { return f.floor === i; })[0];
floors.push(ex || { floor: i, type: 'safe', note: '' });
}
var sorted = floors.slice().sort(function(a, b) { return b.floor - a.floor; });
var rowsHtml = sorted.map(function(f) {
var opts = Object.keys(BLDG_FLOOR_TYPES).map(function(k) {
return '<option value="' + k + '"' + (f.type === k ? ' selected' : '') + '>' + BLDG_FLOOR_TYPES[k] + '</option>';
}).join('');
return '<tr>' +
'<td style="padding:5px 8px;font-weight:800;color:#0f766e;font-size:13px;white-space:nowrap;">ชั้น ' + f.floor + '</td>' +
'<td style="padding:5px;"><select id="bldg-floor-type-' + f.floor + '" onchange="_toggleBldgOtherInput_(' + f.floor + ')" style="width:100%;padding:6px;border:1px solid #cbd5e1;border-radius:6px;font-size:13px;font-family:Prompt,sans-serif;">' + opts + '</select></td>' +
'<td style="padding:5px;"><input id="bldg-floor-note-' + f.floor + '" value="' + String(f.note || '').replace(/"/g, '&quot;') + '" placeholder="หมายเหตุ" style="width:100%;padding:6px;border:1px solid #cbd5e1;border-radius:6px;font-size:13px;' + (f.type === 'other' ? '' : 'display:none;') + '"></td>' +
'</tr>';
}).join('');
Swal.fire({
title: (existingId ? '✏️ แก้ไข: ' : '🏢 ') + buildingName,
html: '<div style="max-height:400px;overflow-y:auto;text-align:left;"><table style="width:100%;border-collapse:collapse;"><thead><tr><th style="text-align:left;font-size:12px;color:#64748b;padding:4px 8px;">ชั้น</th><th style="text-align:left;font-size:12px;color:#64748b;padding:4px;">ประเภท</th><th style="text-align:left;font-size:12px;color:#64748b;padding:4px;">หมายเหตุ</th></tr></thead><tbody>' + rowsHtml + '</tbody></table></div>',
width: 560,
showCancelButton: true,
confirmButtonText: existingId ? 'บันทึกการแก้ไข' : 'บันทึก',
cancelButtonText: 'ยกเลิก',
preConfirm: function() {
return floors.map(function(f) {
var sel = document.getElementById('bldg-floor-type-' + f.floor);
var noteEl = document.getElementById('bldg-floor-note-' + f.floor);
return { floor: f.floor, type: sel ? sel.value : 'safe', note: noteEl ? noteEl.value.trim() : '' };
});
}
}).then(function(result) {
if (!result.isConfirmed) return;
var finalFloors = result.value;
showOCSending('กำลังบันทึก...', 'กำลังบันทึกโครงสร้างอาคาร');
if (existingId) {
google.script.run
.withSuccessHandler(function() {
Swal.close();
var card = (window._buildingStructures || []).filter(function(c) { return c.id === existingId; })[0];
if (card) { card.buildingName = buildingName; card.floors = finalFloors; }
renderBuildingStructureCards(window._buildingStructures || []);
Swal.fire({ icon:'success', title:'บันทึกแล้ว', timer:1200, showConfirmButton:false });
})
.withFailureHandler(function(err) { Swal.close(); Swal.fire('บันทึกไม่สำเร็จ', err && err.message ? err.message : String(err), 'error'); })
.updateBuildingStructure(existingId, buildingName, finalFloors);
} else {
google.script.run
.withSuccessHandler(function(res) {
Swal.close();
var rec = (res && res.record) || { buildingName: buildingName, floors: finalFloors, posX: 20, posY: 20 };
window._buildingStructures = window._buildingStructures || [];
window._buildingStructures.push(rec);
renderBuildingStructureCards(window._buildingStructures);
Swal.fire({ icon:'success', title:'สร้างการ์ดแล้ว', timer:1200, showConfirmButton:false });
})
.withFailureHandler(function(err) { Swal.close(); Swal.fire('บันทึกไม่สำเร็จ', err && err.message ? err.message : String(err), 'error'); })
.saveBuildingStructure(buildingName, finalFloors, (typeof ocCurrentUser !== 'undefined' && ocCurrentUser) || (typeof USER_NAME !== 'undefined' && USER_NAME) || 'Admin');
}
});
}
function renderBuildingStructureCards(list) {
var layer = document.getElementById('dash_building_cards_layer');
if (!layer) return;
layer.innerHTML = '';
(list || []).forEach(function(card) {
var div = document.createElement('div');
div.className = 'bldg-structure-card';
div.style.cssText = 'position:absolute;left:' + (card.posX || 20) + 'px;top:' + (card.posY || 20) + 'px;width:220px;background:white;border-radius:8px;box-shadow:0 4px 14px rgba(15,23,42,0.28);pointer-events:auto;font-family:Prompt,sans-serif;border:1px solid #cbd5e1;';
var sortedFloors = (card.floors || []).slice().sort(function(a, b) { return b.floor - a.floor; });
var floorsHtml = sortedFloors.map(function(f) {
var color = BLDG_FLOOR_COLORS[f.type] || '#64748b';
var lbl = (f.type === 'other' && f.note) ? f.note : (BLDG_FLOOR_TYPES[f.type] || f.type);
return '<div style="display:flex;justify-content:space-between;align-items:center;padding:4px 8px;border-bottom:1px solid #f1f5f9;font-size:11px;">' +
'<span style="color:#475569;font-weight:700;">ชั้น ' + f.floor + '</span>' +
'<span style="background:' + color + ';color:white;padding:1px 7px;border-radius:999px;font-size:10px;font-weight:700;white-space:nowrap;">' + lbl + '</span>' +
'</div>';
}).join('');
div.innerHTML =
'<div class="bldg-card-header" style="background:#0f766e;color:white;padding:7px 9px;border-radius:8px 8px 0 0;font-size:12px;font-weight:800;display:flex;justify-content:space-between;align-items:center;cursor:move;">' +
'<span style="overflow:hidden;text-overflow:ellipsis;white-space:nowrap;"><i class="fas fa-building"></i> ' + card.buildingName + '</span>' +
'<span style="flex:0 0 auto;margin-left:6px;">' +
'<i class="fas fa-pen" style="cursor:pointer;margin-right:8px;" onclick="event.stopPropagation();_editBuildingStructure_(' + card.id + ')"></i>' +
'<i class="fas fa-times" style="cursor:pointer;" onclick="event.stopPropagation();_deleteBuildingStructure_(' + card.id + ')"></i>' +
'</span>' +
'</div>' +
'<div style="max-height:200px;overflow-y:auto;">' + floorsHtml + '</div>';
layer.appendChild(div);
_makeBldgCardDraggable_(div, card);
});
}
function _makeBldgCardDraggable_(el, card) {
var header = el.querySelector('.bldg-card-header');
var startX, startY, origX, origY, dragging = false;
function onDown(clientX, clientY) {
if (APP_ACCESS_ROLE !== 'admin') return;
dragging = true;
window._bldgDragInProgress = true;
startX = clientX; startY = clientY;
origX = parseFloat(el.style.left) || 0;
origY = parseFloat(el.style.top) || 0;
}
function onMove(clientX, clientY) {
if (!dragging) return;
el.style.left = (origX + (clientX - startX)) + 'px';
el.style.top = (origY + (clientY - startY)) + 'px';
}
function onUp() {
if (!dragging) return;
dragging = false;
window._bldgDragInProgress = false;
var x = parseFloat(el.style.left) || 0;
var y = parseFloat(el.style.top) || 0;
card.posX = x; card.posY = y;
google.script.run.withFailureHandler(function() {}).updateBuildingStructurePosition(card.id, x, y);
}
header.addEventListener('mousedown', function(e) { onDown(e.clientX, e.clientY); e.preventDefault(); });
document.addEventListener('mousemove', function(e) { onMove(e.clientX, e.clientY); });
document.addEventListener('mouseup', onUp);
header.addEventListener('touchstart', function(e) { var t = e.touches[0]; onDown(t.clientX, t.clientY); }, { passive: true });
document.addEventListener('touchmove', function(e) { if (!dragging) return; var t = e.touches[0]; onMove(t.clientX, t.clientY); }, { passive: true });
document.addEventListener('touchend', onUp);
}
function _editBuildingStructure_(id) {
if (APP_ACCESS_ROLE !== 'admin') { Swal.fire('ต้องใช้สิทธิ์ Admin', 'เฉพาะ Admin เท่านั้นที่แก้ไขได้', 'warning'); return; }
var card = (window._buildingStructures || []).filter(function(c) { return c.id === id; })[0];
if (!card) return;
_openBuildingFloorTable_(card.buildingName, (card.floors || []).length, id, card.floors);
}
function _deleteBuildingStructure_(id) {
if (APP_ACCESS_ROLE !== 'admin') { Swal.fire('ต้องใช้สิทธิ์ Admin', 'เฉพาะ Admin เท่านั้นที่ลบได้', 'warning'); return; }
Swal.fire({ title: 'ลบการ์ดนี้?', icon: 'warning', showCancelButton: true, confirmButtonText: 'ลบ', cancelButtonText: 'ยกเลิก', confirmButtonColor: '#dc2626' }).then(function(r) {
if (!r.isConfirmed) return;
google.script.run
.withSuccessHandler(function() {
window._buildingStructures = (window._buildingStructures || []).filter(function(c) { return c.id !== id; });
renderBuildingStructureCards(window._buildingStructures);
})
.withFailureHandler(function(err) { Swal.fire('ลบไม่สำเร็จ', err && err.message ? err.message : String(err), 'error'); })
.deleteBuildingStructure(id);
});
}
function renderIndoorFloors(zoneMarkers) {
var indoor = (zoneMarkers || []).filter(function(z) { return (z.locationKind || 'outdoor') === 'indoor' && (z.floorLabel || z.floor_label); });
var box = document.getElementById('dash_indoor_floors');
var body = document.getElementById('dash_indoor_floors_body');
if (!box || !body) return;
if (!indoor.length) { box.style.display = 'none'; return; }
var floors = {};
indoor.forEach(function(z) {
var f = String(z.floorLabel || z.floor_label || '').trim();
if (!floors[f]) floors[f] = [];
floors[f].push(z);
});
var floorNames = Object.keys(floors).sort(function(a, b) {
var na = parseFloat((a.match(/[\d.]+/) || [])[0]);
var nb = parseFloat((b.match(/[\d.]+/) || [])[0]);
if (!isNaN(na) && !isNaN(nb)) return nb - na;
if (!isNaN(na)) return -1;
if (!isNaN(nb)) return 1;
return a.localeCompare(b, 'th');
});
var typeIcon = { 'ICP':'🛡️', 'Decon':'🚿', 'Treatment':'🚑', 'Staging':'📦', 'Parking':'🅿️', 'Loading':'🚚' };
body.innerHTML = floorNames.map(function(f) {
var chips = floors[f].map(function(z) {
var icon = typeIcon[z.type || z.ZoneType || z.zone_type] || '📍';
var lbl = z.label || z.Label || z.type || z.zone_type || '-';
return '<span style="display:inline-block;background:#f1f5f9;border:1px solid #cbd5e1;border-radius:999px;padding:2px 8px;margin:2px;font-size:11px;color:#334155;">' + icon + ' ' + lbl + '</span>';
}).join('');
return '<div style="border-bottom:1px solid #e2e8f0;padding:6px 4px;">' +
'<div style="font-size:11px;font-weight:800;color:#0f766e;margin-bottom:3px;">' + f + '</div>' +
'<div>' + chips + '</div>' +
'</div>';
}).join('');
box.style.display = 'block';
}
function drawOCZoneMarkersOnICMap(zones, supportReqs) {
zones = (zones || []).filter(function(z) { return (z.locationKind || z.location_kind || 'outdoor') !== 'indoor'; });
zones = normalizeICOCState({ zoneMarkers: zones }).zoneMarkers;
supportReqs = dedupeOCSupportRequests(reconcileOCSupportRequestStatus(supportReqs || window._icSupportReqs || []));
if (supportReqs && supportReqs.length) {
window._icSupportReqs = supportReqs;
}
if (!dashMap) {
window._pendingICZoneMarkers = zones;
return;
}
var activeReqs = dedupeOCSupportRequests(getActiveOCSupportRequests(supportReqs || window._icSupportReqs || []));
var reqKey = activeReqs.map(function(r) {
return [(r.id||r.rowIndex) || '', r.type || '', r.status || 'pending', r.responseNote || ''].join(':');
}).join(',');
var drawKey = zones.map(function(z) {
return [z.type || z.ZoneType || '', z.label || z.Label || '', z.lat || z.Lat || '', z.lng || z.Lng || '', z.loggedBy || z.by || '', z.phone || z.tel || ''].join('|');
}).join('~') + '|marker-style-command-post-stable-v5-anchor-exact|' + reqKey;
if (window._icOCZoneDrawKey === drawKey && window._icOCZoneMapRef === dashMap && window._icOCZoneOverlays && window._icOCZoneOverlays.length) return;
window._icOCZoneDrawKey = drawKey;
window._icOCZoneMapRef = dashMap;
var oldRecords = window._icOCZoneOverlayRecords || {};
var nextRecords = {};
var nextOverlays = [];
var nextCircles = [];
var points = [];
if (incidentCenter && incidentCenter.lat && incidentCenter.lng) points.push({ lat: parseFloat(incidentCenter.lat), lng: parseFloat(incidentCenter.lng) });
ensureOCRequestAlertStyle();
zones.forEach(function(z) {
var lat = parseFloat(z.lat || z.Lat);
var lng = parseFloat(z.lng || z.Lng);
var type = z.type || z.ZoneType || '-';
var label = z.label || z.Label || type;
var isICP = type === 'ICP';
var displayType = isICP ? 'ICP' : type;
var ocName = z.loggedBy || z.by || z.ocName || '-';
var ocPhone = normalizeThaiPhone(z.phone || z.tel || findPhoneForStaffName(ocName) || '');
if (!ocPhone) ocPhone = '-';
var color = isICP ? '#1D4ED8' : '#0F766E';
var halo = isICP ? '#60A5FA' : '#5EEAD4';
var reqs = isICP ? activeReqs : [];
var pendingCount = reqs.filter(function(r) { return String(r.status || 'pending').toLowerCase() === 'pending'; }).length;
var ackCount = reqs.filter(function(r) { return String(r.status || '').toLowerCase() === 'acknowledged'; }).length;
var doneCount = reqs.filter(function(r) { return String(r.status || '').toLowerCase() === 'supported'; }).length;
var alertColor = pendingCount ? '#dc2626' : ackCount ? '#d97706' : '#16a34a';
var alertText = pendingCount ? ('ขอสนับสนุน ' + pendingCount) : (ackCount ? 'รอดำเนินการ' : (doneCount ? 'ดำเนินการเสร็จสิ้น' : ''));
var visual = getOCZoneVisualOffset(type, z, zones);
points.push({ lat: lat, lng: lng, type: type });
var zoneKey = [
type,
label,
lat.toFixed(6),
lng.toFixed(6),
ocName,
ocPhone
].join('|');
var zoneSignature = zoneKey + '|' + (isICP ? reqKey : '');
var existing = oldRecords[zoneKey];
var iconSize = isICP ? 34 : 36;
var labelTop = visual.y + (iconSize / 2) + 5;
var html = '<div style="position:relative;width:0;height:0;overflow:visible;pointer-events:auto;">' +
(reqs.length ? '<div style="position:absolute;left:' + (visual.x + 24) + 'px;top:' + (visual.y - 34) + 'px;transform:translateX(-50%) scale(var(--dash-marker-scale,1));transform-origin:bottom center;background:' + alertColor + ';color:white;border:3px solid white;border-radius:999px;padding:5px 11px;font-size:12px;font-weight:900;box-shadow:0 4px 14px rgba(0,0,0,.55);white-space:nowrap;z-index:3;">' + alertText + '</div>' : '') +
'<div style="position:absolute;left:' + visual.x + 'px;top:' + visual.y + 'px;width:' + iconSize + 'px;height:' + iconSize + 'px;transform:translate(-50%,-50%) scale(var(--dash-marker-scale,1));transform-origin:center center;transition:transform .12s ease-out;border-radius:50%;background:' + color + ';border:3px solid white;box-shadow:0 0 0 3px ' + halo + '88,0 4px 12px rgba(0,0,0,.68);display:flex;align-items:center;justify-content:center;color:white;font-size:' + (isICP ? 18:16) + 'px;z-index:2;"><i class="fas fa-shield-alt"></i></div>' +
'<div style="position:absolute;left:' + visual.x + 'px;top:' + labelTop + 'px;transform:translateX(-50%) scale(var(--dash-marker-scale,1));transform-origin:top center;transition:transform .12s ease-out;background:' + color + ';color:white;font-weight:bold;font-size:10px;padding:2px 7px;border-radius:5px;white-space:nowrap;box-shadow:0 2px 7px rgba(0,0,0,.58);border:1px solid rgba(255,255,255,.92);z-index:2;">' + displayType + '</div>' +
'</div>';
var reqHtml = reqs.length ? '<hr><b>คำขอสนับสนุนจาก OC</b><br>' + reqs.map(function(r) {
var status = String(r.status || 'pending').toLowerCase();
var statusText = status === 'supported' ? 'การดำเนินการเสร็จสิ้น' :
status === 'acknowledged' ? 'รอการดำเนินการ' : 'รอ IC รับทราบ';
var statusColor = status === 'supported' ? '#16a34a' : status === 'acknowledged' ? '#d97706' : '#dc2626';
var btn = status === 'pending'
? '<button onclick="updateOCSupportFromIC(' + parseInt(r.id||(r.id||r.rowIndex)) + ',&quot;acknowledged&quot;)" style="margin-top:4px;background:#dc2626;color:white;border:none;border-radius:5px;padding:3px 7px;font-size:11px;cursor:pointer;">รับทราบ</button>'
: '';
var noteHtml = r.responseNote ? '<br><span style="color:#1d4ed8;"><b>IC:</b> ' + roleSafeText(r.responseNote) + '</span>' : '';
return '<div style="margin-top:6px;padding-top:5px;border-top:1px solid #eee;"><b>' + (r.type || '-') + '</b><br><span>' + (r.detail || '-') + '</span><br><span style="color:' + statusColor + ';">' + statusText + '</span>' + noteHtml + '<br>' + btn + '</div>';
}).join('') : '';
var detailHtml = isICP
? '<b>Command Post</b><br>' +
'<span>ผู้รับผิดชอบ: ' + ocName + '</span><br>' +
'<span>หน้าที่: OC</span><br>' +
'<span>โทร: ' + ocPhone + '</span><br>' +
'<span style="color:#777;">' + label + '</span>' + reqHtml
: '<b>' + displayType + '</b><br>' + label;
if (existing && existing.marker && typeof updateLongdoHtmlMarker === 'function') {
if (updateLongdoHtmlMarker(existing.marker, { lon: lng, lat: lat }, html, detailHtml)) {
existing.signature = zoneSignature;
nextRecords[zoneKey] = existing;
nextOverlays.push(existing.marker);
if (existing.circle) nextCircles.push(existing.circle);
return;
}
}
if (existing) {
removeLongdoOverlay(dashMap, existing.marker);
removeLongdoOverlay(dashMap, existing.circle);
}
var marker = makeLongdoHtmlMarker({ lon: lng, lat: lat }, html, {
// 🔧 ใช้ offset {0,0} เหมือนหมุดจุดเกิดเหตุ/EOC — ทำให้ anchor เป็น 'center' ปักกึ่งกลาง element พอดีกับพิกัดจริง ไม่เลื่อน/ไม่ดริฟต์เวลาซูม
// เดิม offset {21,54}/{18,46} ทำให้ anchor กลายเป็น 'bottom' (ปักที่ขอบล่างของป้ายชื่อแทนที่จะเป็นกึ่งกลางไอคอน) จึงดูเหมือนหมุดเลื่อนตอนซูม
offset: { x: 0, y: 0 },
// 🔧 dashMap ปัจจุบันใช้ MapTiler ไม่ใช่ Longdo — ถ้าอ้าง longdo.OverlayWeight ตรงๆ จะ ReferenceError แล้วทำให้ลูปวาดหมุดทั้งหมดพังเงียบๆ (หมุดจุดปฏิบัติการเลยไม่โผล่หลังรีเฟรช)
weight: (typeof longdo !== 'undefined' && longdo.OverlayWeight) ? longdo.OverlayWeight.Top : 0,
// 🔧 ตัวจริงที่ทำให้หมุด "เลื่อน" ตอนซูม คือ CSS scale (--dash-marker-scale) ที่ใส่ให้อัตโนมัติถ้าไม่ระบุ scaleMode — ใส่ 'none' เหมือนหมุดจุดเกิดเหตุ/EOC เพื่อตัดการ scale ผ่าน CSS ออก จุดจะได้นิ่งสนิทกับพิกัดจริงทุกระดับซูม
scaleMode: 'none',
title: displayType,
markerOptions: { detail: detailHtml }
});
dashMap.Overlays.add(marker);
nextOverlays.push(marker);
nextRecords[zoneKey] = { marker: marker, circle: null, signature: zoneSignature };
});
Object.keys(oldRecords).forEach(function(key) {
if (nextRecords[key]) return;
removeLongdoOverlay(dashMap, oldRecords[key].marker);
removeLongdoOverlay(dashMap, oldRecords[key].circle);
});
window._icOCZoneOverlayRecords = nextRecords;
window._icOCZoneOverlays = nextOverlays;
window._icOCZoneCircles = nextCircles;
var icp = points.find(function(p) { return p.type === 'ICP'; });
if (icp && points.length > 1 && window._lastICPIcMapFitKey !== icp.lat + ',' + icp.lng) {
window._lastICPIcMapFitKey = icp.lat + ',' + icp.lng;
var minLat = Math.min.apply(null, points.map(function(p) { return p.lat; }));
var maxLat = Math.max.apply(null, points.map(function(p) { return p.lat; }));
var minLng = Math.min.apply(null, points.map(function(p) { return p.lng; }));
var maxLng = Math.max.apply(null, points.map(function(p) { return p.lng; }));
var padLat = Math.max((maxLat - minLat) * 0.3, 0.001);
var padLng = Math.max((maxLng - minLng) * 0.3, 0.001);
dashMap.bound({ minLon:minLng-padLng, minLat:minLat-padLat, maxLon:maxLng+padLng, maxLat:maxLat+padLat });
}
}
function renderOCReqHistory(list) {
var el = document.getElementById('oc_req_history');
var mobileEl = document.getElementById('oc_mobile_req_feed');
list = Array.isArray(list) ? list : [];
list = dedupeOCSupportRequests(list);
if (!list.length && window._lastOCSupportReqs && window._lastOCSupportReqs.length) {
list = dedupeOCSupportRequests(window._lastOCSupportReqs);
}
if (list.length) {
window._lastOCSupportReqs = list;
window._icSupportReqs = dedupeOCSupportRequests(reconcileOCSupportRequestStatus(window._icSupportReqs && window._icSupportReqs.length ? window._icSupportReqs.concat(list) : list));
}
var statusColor = {
pending: '#dc2626',
acknowledged: '#d97706',
supported: '#16a34a',
closed: '#64748b',
rejected: '#64748b'
};
var statusLabel = {
pending: 'รอ IC รับทราบ',
acknowledged: 'รอการสนับสนุน',
supported: 'ได้รับการสนับสนุนแล้ว',
closed: 'ปิดคำขอ',
rejected: 'ไม่อนุมัติ'
};
if (!list.length) {
var emptyReqHtml = '<div style="text-align:center;color:#aaa;padding:12px;font-size:13px;">ยังไม่มีคำขอ</div>';
if (el) el.innerHTML = emptyReqHtml;
if (mobileEl) mobileEl.innerHTML = emptyReqHtml;
return;
}
var html = list.map(function(r) {
var status = String(r.status || 'pending').toLowerCase();
var sc = statusColor[status] || '#64748b';
var sl = statusLabel[status] || status;
var rowIndex = parseInt((r.id||r.rowIndex), 10) || 0;
var btn = (status === 'acknowledged' && rowIndex)
? '<button onclick="markOCSupportReceived(' + rowIndex + ')" style="margin-top:6px;background:#16a34a;color:white;border:none;border-radius:6px;padding:5px 9px;font-size:11px;cursor:pointer;font-weight:bold;">ได้รับการสนับสนุนแล้ว</button>'
: '';
var noteHtml = r.responseNote ? '<div style="margin-top:5px;color:#1d4ed8;font-size:12px;"><b>ข้อความจาก IC:</b> ' + roleSafeText(r.responseNote) + '</div>' : '';
return '<div class="oc-card oc-req-row">' +
'<span style="background:' + sc + '20;color:' + sc + ';border-radius:4px;padding:2px 7px;font-size:11px;font-weight:bold;flex-shrink:0;">' + sl + '</span>' +
'<div style="flex:1;"><div style="font-size:12px;font-weight:bold;color:#2c3e50;">' + (r.type || '-') + '</div><div style="font-size:12px;color:#666;">' + (r.detail || '-') + '</div>' + noteHtml + btn + '</div>' +
'<span style="font-size:11px;color:#aaa;flex-shrink:0;">' + (r.time || '') + '</span>' +
'</div>';
}).join('');
if (el) el.innerHTML = html;
if (mobileEl) mobileEl.innerHTML = html;
}
function setCachedOCSupportStatus(rowIndex, status, responseNote) {
rowIndex = parseInt(rowIndex, 10) || 0;
status = String(status || '').toLowerCase();
responseNote = String(responseNote || '').trim();
if (status === 'supported') {
window._ocSupportedNoticeAt = window._ocSupportedNoticeAt || {};
window._ocSupportedNoticeAt[String(rowIndex)] = Date.now();
scheduleOCSupportedNoticeExpiry();
}
function updateList(list) {
if (!Array.isArray(list)) return list;
return list.map(function(r) {
if ((parseInt((r.id||r.rowIndex), 10) || 0) === rowIndex) {
var copy = {};
Object.keys(r).forEach(function(k) { copy[k] = r[k]; });
copy.status = status;
if (responseNote) copy.responseNote = responseNote;
copy.updatedBy = USER_NAME || 'IC';
return copy;
}
return r;
});
}
window._lastOCSupportReqs = updateList(window._lastOCSupportReqs || []);
window._icSupportReqs = updateList(window._icSupportReqs || window._lastOCSupportReqs || []);
if (window._lastOCState && Array.isArray(window._lastOCState.supportReqs)) {
window._lastOCState.supportReqs = updateList(window._lastOCState.supportReqs);
}
renderOCReqHistory(window._lastOCSupportReqs || window._icSupportReqs || []);
if (window._icZoneMarkers && window._icZoneMarkers.length && dashMap) {
drawOCZoneMarkersOnICMap(window._icZoneMarkers, window._icSupportReqs || []);
drawOCSupportRequestAlertsOnMap(window._icZoneMarkers, window._icSupportReqs || []);
}
}
function updateOCSupportFromIC(rowIndex, status) {
status = String(status || '').toLowerCase();
var promptTitle = status === 'acknowledged' ? 'ตอบกลับคำขอสนับสนุน' : 'บันทึกผลการสนับสนุน';
var promptText = status === 'acknowledged'
? 'ใส่ข้อความสั้น ๆ ให้หน้างาน เช่น อีก 10 นาทีถึง / ได้ 1 คัน / กำลังประสาน'
: 'ใส่ note เพิ่มเติมได้ เช่น ส่งถึงพื้นที่แล้ว / สนับสนุนครบแล้ว';
Swal.fire({
title: promptTitle,
text: promptText,
input: 'textarea',
inputPlaceholder: 'เช่น อีก 10 นาทีถึง / ได้แค่ 1 คัน / กำลังประสาน...',
inputValue: status === 'acknowledged' ? 'กำลังประสานการสนับสนุน' : '',
inputAttributes: { maxlength: 160 },
showCancelButton: true,
confirmButtonText: status === 'acknowledged' ? 'ส่งและรับทราบ' : 'บันทึก',
cancelButtonText: 'ยกเลิก',
preConfirm: function(value) {
return String(value || '').trim();
}
}).then(function(result) {
if (!result.isConfirmed) return;
var responseNote = String(result.value || '').trim();
Swal.fire({ title:'กำลังส่งข้อความกลับ...', text:'กำลังอัปเดตสถานะคำขอสนับสนุน', allowOutsideClick:false, allowEscapeKey:false, showConfirmButton:false, didOpen:function(){ Swal.showLoading(); } });
google.script.run
.withSuccessHandler(function() {
setCachedOCSupportStatus(rowIndex, status, responseNote);
Swal.fire({
icon: 'success',
title: status === 'acknowledged' ? 'ส่งข้อความกลับแล้ว' : 'บันทึกว่าสนับสนุนแล้ว',
timer: 1200,
showConfirmButton: false
});
refreshICOCFeedsDirect();
if (typeof refreshOCData === 'function') refreshOCData();
})
.withFailureHandler(function(err) {
Swal.fire('อัปเดตไม่สำเร็จ', err && err.message ? err.message : String(err), 'error');
})
.updateSupportRequestStatus(rowIndex, status, USER_NAME || 'IC', responseNote);
});
}
function markOCSupportReceived(rowIndex) {
updateOCSupportFromIC(rowIndex, 'supported');
}
function openAddOCResourceEntry(key) {
var cfg = getOCResourceConfig(key);
var qtyEl = document.getElementById('res_qty');
var personnelEl = document.getElementById('res_personnel');
var agencyEl = document.getElementById('res_agency');
var noteEl = document.getElementById('res_note');
if (qtyEl) qtyEl.value = 1;
if (personnelEl) personnelEl.value = 0;
if (agencyEl) agencyEl.value = '';
if (noteEl) noteEl.value = '';
openAddResourceModal(cfg.label);
}
function openAdjustOCResourceTotal(key) {
var cfg = getOCResourceConfig(key);
var totals = buildOCResourceTotals(window._lastOCResources || []);
var current = totals[key] || { qty:0, personnel:0 };
Swal.fire({
title: 'แก้ยอดรวม ' + cfg.label,
html:
'<div style="text-align:left;font-size:13px;color:#555;margin-bottom:8px;">ระบบจะบันทึกส่วนต่างเพื่อให้ยอดรวมเป็นค่าที่ระบุ</div>' +
'<label style="display:block;text-align:left;font-size:12px;color:#666;">ยอดหน่วย/คัน/ทีมปัจจุบัน ' + current.qty + '</label>' +
'<input id="adjust_res_qty" type="number" min="0" class="swal2-input" style="margin:4px 0 10px;width:100%;box-sizing:border-box;" value="' + current.qty + '">' +
'<label style="display:block;text-align:left;font-size:12px;color:#666;">ยอดคนปัจจุบัน ' + current.personnel + '</label>' +
'<input id="adjust_res_personnel" type="number" min="0" class="swal2-input" style="margin:4px 0;width:100%;box-sizing:border-box;" value="' + current.personnel + '">',
showCancelButton: true,
confirmButtonText: 'บันทึกยอดใหม่',
cancelButtonText: 'ยกเลิก',
preConfirm: function() {
var targetQty = parseInt(document.getElementById('adjust_res_qty').value, 10);
var targetPersonnel = parseInt(document.getElementById('adjust_res_personnel').value, 10);
if (isNaN(targetQty) || targetQty < 0 || isNaN(targetPersonnel) || targetPersonnel < 0) {
Swal.showValidationMessage('กรุณาใส่ตัวเลขตั้งแต่ 0 ขึ้นไป');
return false;
}
return {
targetQty: targetQty,
targetPersonnel: targetPersonnel,
deltaQty: targetQty - current.qty,
deltaPersonnel: targetPersonnel - current.personnel
};
}
}).then(function(result) {
if (!result.isConfirmed || !result.value) return;
var deltaQty = result.value.deltaQty;
var deltaPersonnel = result.value.deltaPersonnel;
if (deltaQty === 0 && deltaPersonnel === 0) {
Swal.fire({ icon:'info', title:'ยอดไม่เปลี่ยนแปลง', timer:1200, showConfirmButton:false });
return;
}
showOCSending('กำลังปรับยอดทรัพยากร...', 'กำลังบันทึกยอดใหม่ไปยัง EOC');
google.script.run
.withSuccessHandler(function() {
refreshOCData();
Swal.fire({ icon:'success', title:'ปรับยอดแล้ว', timer:1400, showConfirmButton:false });
})
.withFailureHandler(function(err) {
Swal.fire('ปรับยอดไม่สำเร็จ', err && err.message ? err.message : String(err), 'error');
})
.addResourceAdjustment(cfg.label, deltaQty, deltaPersonnel, 'ปรับยอดรวมเป็น ' + result.value.targetQty + ' หน่วย / ' + result.value.targetPersonnel + ' คน', ocCurrentUser);
});
}
function renderOCResourceSummary(list) {
var el = document.getElementById('oc_resource_summary');
if (!el) return;
var totals = buildOCResourceTotals(list || []);
var ambulance = totals.ambulance || { qty:0, personnel:0, rows:[] };
var fire = totals.fire || { qty:0, personnel:0, rows:[] };
var police = totals.police || { qty:0, personnel:0, rows:[] };
var rescue = totals.rescue || { qty:0, personnel:0, rows:[] };
var totalPeople = OC_RESOURCE_TYPES.reduce(function(sum, cfg) {
return sum + (parseInt((totals[cfg.key] || {}).personnel) || 0);
}, 0);
if (document.getElementById('hdr_vehicle_total')) {
var vehicleTotal = OC_RESOURCE_TYPES.reduce(function(sum, cfg) {
return sum + (parseInt((totals[cfg.key] || {}).qty, 10) || 0);
}, 0);
document.getElementById('hdr_vehicle_total').innerText = vehicleTotal;
}
if (document.getElementById('hdr_staff')) document.getElementById('hdr_staff').innerText = totalPeople || 0;
function mini(key, icon, label, num, sub, color, bg) {
return '<button type="button" class="oc-resource-mini" onclick="openOCResourceDetails(\'' + key + '\')" style="color:' + color + ';background:' + bg + ';">' +
'<i class="fas ' + icon + '"></i>' +
'<div class="oc-resource-mini-num">' + (num || 0) + '</div>' +
'<div class="oc-resource-mini-label">' + label + '</div>' +
'<div class="oc-resource-mini-sub">' + (sub || '\u0e2b\u0e19\u0e48\u0e27\u0e22') + '</div>' +
'</button>';
}
el.innerHTML =
mini('ambulance', 'fa-ambulance', '\u0e23\u0e16\u0e1e\u0e22\u0e32\u0e1a\u0e32\u0e25', ambulance.qty, '\u0e04\u0e31\u0e19', '#185FA5', '#eaf4ff') +
mini('fire', 'fa-fire-extinguisher', '\u0e14\u0e31\u0e1a\u0e40\u0e1e\u0e25\u0e34\u0e07', fire.qty, '\u0e04\u0e31\u0e19', '#A32D2D', '#fff1f1') +
mini('police', 'fa-shield-alt', '\u0e15\u0e33\u0e23\u0e27\u0e08', police.qty, '\u0e04\u0e31\u0e19', '#25476A', '#eef6ff') +
mini('rescue', 'fa-people-carry', '\u0e01\u0e39\u0e49\u0e0a\u0e35\u0e1e/\u0e01\u0e39\u0e49\u0e20\u0e31\u0e22', rescue.qty, '\u0e04\u0e31\u0e19', '#5B45A0', '#f3efff') +
'<div class="oc-resource-mini total" style="color:#166534;background:#f0fdf4;">' +
'<i class="fas fa-users"></i>' +
'<div class="oc-resource-mini-num">' + totalPeople + '</div>' +
'<div class="oc-resource-mini-label">\u0e40\u0e08\u0e49\u0e32\u0e2b\u0e19\u0e49\u0e32\u0e17\u0e35\u0e48</div>' +
'<div class="oc-resource-mini-sub">\u0e23\u0e27\u0e21\u0e04\u0e19</div>' +
'</div>';
}
function openOCResourceDetails(key) {
var cfg = getOCResourceConfig(key);
var rows = buildOCResourceTotals(window._lastOCResources || [])[key].rows;
var html = rows.length ? rows.map(function(r) {
return '<div style="text-align:left;border-bottom:1px solid #eee;padding:8px 0;">' +
'<b>' + (r.type || cfg.label) + '</b> <span style="float:right;">' + (r.qty || 0) + ' \u0e04\u0e31\u0e19 / ' + (r.personnel || 0) + ' \u0e04\u0e19</span><br>' +
'<span style="font-size:12px;color:#666;">\u0e08\u0e32\u0e01 ' + (r.agency || '-') + (r.note ? ' | ' + r.note : '') + '</span>' +
'</div>';
}).join('') : '<div style="color:#999;padding:12px;">\u0e22\u0e31\u0e07\u0e44\u0e21\u0e48\u0e21\u0e35\u0e23\u0e32\u0e22\u0e25\u0e30\u0e40\u0e2d\u0e35\u0e22\u0e14\u0e08\u0e32\u0e01\u0e2b\u0e19\u0e48\u0e27\u0e22\u0e2a\u0e19\u0e31\u0e1a\u0e2a\u0e19\u0e38\u0e19</div>';
Swal.fire({
title: cfg.label,
html: html,
confirmButtonText: '\u0e1b\u0e34\u0e14',
confirmButtonColor: '#34495e'
});
}
var FIELD_MEDIA_LIMITS = {
image: 10 * 1024 * 1024,
video: 50 * 1024 * 1024,
audio: 15 * 1024 * 1024,
other: 15 * 1024 * 1024
};
var IMAGE_COMPRESS_THRESHOLD = 2 * 1024 * 1024;
function formatFileSize(bytes) {
var mb = (bytes || 0) / (1024 * 1024);
return mb.toFixed(mb >= 10 ? 0 : 1) + ' MB';
}
function compressImageIfNeeded(file, callback) {
  if (!file || !/^image\//.test(file.type) || file.size <= IMAGE_COMPRESS_THRESHOLD) {
    callback(null, file);
    return;
  }
  var reader = new FileReader();
  reader.onload = function(e) {
    var img = new Image();
    img.onload = function() {
      var maxDim = 1920;
      var w = img.width, h = img.height;
      if (w > maxDim || h > maxDim) {
        if (w >= h) { h = Math.round(h * maxDim / w); w = maxDim; }
        else { w = Math.round(w * maxDim / h); h = maxDim; }
      }
      var canvas = document.createElement('canvas');
      canvas.width = w; canvas.height = h;
      var ctx = canvas.getContext('2d');
      ctx.drawImage(img, 0, 0, w, h);
      canvas.toBlob(function(blob) {
        if (!blob) { callback(null, file); return; }
        var compressed = new File([blob],
          file.name.replace(/\.[^.]+$/, '') + '.jpg',
          { type: 'image/jpeg', lastModified: Date.now() });
        callback(null, compressed);
      }, 'image/jpeg', 0.82);
    };
    img.onerror = function() { callback(null, file); };
    img.src = e.target.result;
  };
  reader.onerror = function() { callback(null, file); };
  reader.readAsDataURL(file);
}
function getFieldMediaLimit(file) {
var type = String(file && file.type || '');
if (type.indexOf('video/') === 0) return FIELD_MEDIA_LIMITS.video;
if (type.indexOf('audio/') === 0) return FIELD_MEDIA_LIMITS.audio;
if (type.indexOf('image/') === 0) return FIELD_MEDIA_LIMITS.image;
return FIELD_MEDIA_LIMITS.other;
}
function validateFieldMediaFile(file) {
if (!file) return { ok:false, message:'ไม่พบไฟล์' };
var limit = getFieldMediaLimit(file);
if (file.size > limit) {
return {
ok:false,
message:'ไฟล์ใหญ่เกินไป (' + formatFileSize(file.size) + ')',
detail:'เพื่อให้ใช้ได้ไวบนมือถือ แนะนำรูปไม่เกิน 10 MB และวิดีโอไม่เกิน 50 MB ต่อไฟล์'
};
}
return { ok:true };
}
function uploadSelectedFieldMedia(input, source, reporter, done, statusCallback) {
var originalFile = input && input.files ? input.files[0] : null;
if (!originalFile) return;
if (typeof statusCallback === 'function' && /^image\//.test(originalFile.type) && originalFile.size > IMAGE_COMPRESS_THRESHOLD) {
  statusCallback('กำลังบีบอัดรูปก่อนส่ง: ' + originalFile.name);
}
compressImageIfNeeded(originalFile, function(_err, file) {
var validation = validateFieldMediaFile(file);
if (!validation.ok) {
if (typeof done === 'function') done(new Error(validation.message + (validation.detail ? ' - ' + validation.detail : '')));
return;
}
var reader = new FileReader();
if (typeof statusCallback === 'function') statusCallback('กำลังอ่านไฟล์ในเครื่อง: ' + file.name);
reader.onload = function(e) {
var base64 = String(e.target.result || '').split(',')[1] || '';
if (typeof statusCallback === 'function') statusCallback('กำลังส่งเข้า Google Drive: ' + file.name + ' (' + formatFileSize(file.size) + ')');
google.script.run
.withSuccessHandler(function(media) {
window._lastUploadedFieldMedia = media;
refreshFieldMediaReports();
if (typeof done === 'function') done(null, media);
})
.withFailureHandler(function(err) {
if (typeof done === 'function') done(err);
})
.uploadFieldMedia(source || 'Field', reporter || USER_NAME || '-', file.name, file.type, base64, '', (typeof APP_AGENCY_ID !== 'undefined' ? APP_AGENCY_ID : ''));
};
reader.onerror = function() {
if (typeof done === 'function') done(new Error('อ่านไฟล์จากเครื่องไม่สำเร็จ'));
};
reader.readAsDataURL(file);
});
}
function submitSitReport() {
var detail = document.getElementById('oc_sit_detail').value.trim();
if (!_ocSelectedSitTag) { Swal.fire('กรุณาเลือกสถานะสถานการณ์', '', 'warning'); return; }
if (window._ocUploadInProgress) { Swal.fire('กำลังอัปโหลดไฟล์อยู่', 'รอให้อัปโหลดเสร็จก่อน แล้วค่อยกดรายงานสถานการณ์', 'info'); return; }
var attach = window._ocAttachURL || window._ocAttachName || '';
var tag = _ocSelectedSitTag;
document.getElementById('oc_sit_detail').value = '';
window._ocAttachName = '';
window._ocAttachURL = '';
var preview = document.getElementById('oc_attach_preview');
if (preview) preview.textContent = '';
_optimisticRun_('submitSitReport',
[tag, detail || '-', attach, ocCurrentUser],
'ส่ง SITREP เข้า EOC แล้ว ✓', 'ส่งรายงานไม่สำเร็จ',
function() { refreshOCData(); });
}
function uploadFieldMediaFile(originalFile, source, reporter, done, statusCallback) {
var LARGE_FILE_THRESHOLD = 8 * 1024 * 1024; // 8 MB — above this, use direct Drive resumable upload
if (typeof statusCallback === 'function' && originalFile && /^image\//.test(originalFile.type) && originalFile.size > IMAGE_COMPRESS_THRESHOLD) {
  statusCallback('Compressing: ' + originalFile.name);
}
compressImageIfNeeded(originalFile, function(_err, file) {
var validation = validateFieldMediaFile(file);
if (!validation.ok) {
if (typeof done === 'function') done(new Error(validation.message + (validation.detail ? ' - ' + validation.detail : '')));
return;
}
var agencyId = (typeof APP_AGENCY_ID !== 'undefined' ? APP_AGENCY_ID : '');
// --- Large file: upload directly to Drive (bypasses google.script.run payload limit) ---
if (file.size > LARGE_FILE_THRESHOLD) {
if (typeof statusCallback === 'function') statusCallback('เตรียมอัปโหลด: ' + file.name + ' (' + (typeof formatFileSize === 'function' ? formatFileSize(file.size) : Math.round(file.size/1048576)+'MB') + ')');
google.script.run
.withSuccessHandler(function(tok) {
if (!tok || !tok.token || !tok.folderId) {
if (typeof done === 'function') done(new Error('ไม่สามารถขอสิทธิ์อัปโหลดได้'));
return;
}
_uploadToDriveResumable_(file, tok.token, tok.folderId, source, reporter, agencyId, done, statusCallback);
})
.withFailureHandler(function(err) { if (typeof done === 'function') done(err); })
.getFieldMediaUploadToken(agencyId, source || 'Field', file.type || '');
return;
}
// --- Small file: use base64 via google.script.run ---
var reader = new FileReader();
if (typeof statusCallback === 'function') statusCallback('Reading: ' + file.name);
reader.onload = function(e) {
var base64 = String(e.target.result || '').split(',')[1] || '';
if (typeof statusCallback === 'function') statusCallback('Uploading to Drive: ' + file.name + ' (' + (typeof formatFileSize === 'function' ? formatFileSize(file.size) : Math.round(file.size/1048576)+'MB') + ')');
google.script.run
.withSuccessHandler(function(media) {
window._lastUploadedFieldMedia = media;
if (typeof done === 'function') done(null, media);
})
.withFailureHandler(function(err) {
if (typeof done === 'function') done(err);
})
.uploadFieldMedia(source || 'Field', reporter || USER_NAME || '-', file.name, file.type, base64, '', agencyId);
};
reader.onerror = function() {
if (typeof done === 'function') done(new Error('อ่านไฟล์จากเครื่องไม่สำเร็จ'));
};
reader.readAsDataURL(file);
});
}
// 📦 ส่งไฟล์เป็นก้อนละ 5 MB (ต้องเป็นพหุคูณของ 256KB ตามสเปค Drive resumable)
// เน็ตหลุดระหว่างทาง → retry ก้อนเดิมสูงสุด 3 ครั้ง แล้วต่อจากไบต์ที่ Drive รับไว้แล้ว ไม่ต้องเริ่มใหม่ทั้งไฟล์
var DRIVE_UPLOAD_CHUNK = 5 * 1024 * 1024;
function _putDriveChunk_(uploadUrl, file, start, statusCallback, attempt) {
var end = Math.min(start + DRIVE_UPLOAD_CHUNK, file.size);
return fetch(uploadUrl, {
method: 'PUT',
headers: { 'Content-Range': 'bytes ' + start + '-' + (end - 1) + '/' + file.size },
body: file.slice(start, end)
}).then(function(res) {
if (res.status === 308) {
// Drive รับก้อนนี้แล้ว ขอก้อนถัดไป — ถ้าอ่าน Range header ได้ ใช้ตำแหน่งจริงจาก Drive
var next = end;
var range = res.headers.get('Range');
if (range) { var m = /-(\d+)$/.exec(range); if (m) next = parseInt(m[1], 10) + 1; }
if (typeof statusCallback === 'function') statusCallback('กำลังอัปโหลด: ' + (file.name || '') + ' (' + Math.round(next * 100 / file.size) + '%)');
return _putDriveChunk_(uploadUrl, file, next, statusCallback, 0);
}
if (res.ok) return res.json();
return Promise.reject(new Error('อัปโหลดไฟล์ไม่สำเร็จ (HTTP ' + res.status + ')'));
}).catch(function(err) {
attempt = attempt || 0;
if (attempt >= 3) return Promise.reject(err instanceof Error ? err : new Error(String(err)));
if (typeof statusCallback === 'function') statusCallback('สัญญาณสะดุด กำลังลองส่งต่อ... (ครั้งที่ ' + (attempt + 1) + '/3)');
return new Promise(function(r) { setTimeout(r, 1500 * (attempt + 1)); }).then(function() {
return _putDriveChunk_(uploadUrl, file, start, statusCallback, attempt + 1);
});
});
}
function _uploadToDriveResumable_(file, token, folderId, source, reporter, agencyId, done, statusCallback) {
if (typeof statusCallback === 'function') statusCallback('กำลังสร้าง session อัปโหลด...');
var mimeType = file.type || 'application/octet-stream';
var metadata = JSON.stringify({ name: file.name, mimeType: mimeType, parents: [folderId] });
fetch('https://www.googleapis.com/upload/drive/v3/files?uploadType=resumable', {
method: 'POST',
headers: {
'Authorization': 'Bearer ' + token,
'Content-Type': 'application/json; charset=UTF-8',
'X-Upload-Content-Type': mimeType,
'X-Upload-Content-Length': String(file.size)
},
body: metadata
}).then(function(res) {
if (!res.ok) return Promise.reject(new Error('เริ่ม upload session ไม่ได้ (HTTP ' + res.status + ')'));
var uploadUrl = res.headers.get('Location');
if (!uploadUrl) return Promise.reject(new Error('ไม่ได้รับ upload URL จาก Drive'));
if (typeof statusCallback === 'function') statusCallback('กำลังอัปโหลด: ' + file.name + ' (' + (typeof formatFileSize === 'function' ? formatFileSize(file.size) : Math.round(file.size/1048576)+'MB') + ')');
return _putDriveChunk_(uploadUrl, file, 0, statusCallback, 0);
}).then(function(driveFile) {
if (!driveFile || !driveFile.id) return Promise.reject(new Error('ไม่ได้รับ file ID จาก Drive'));
if (typeof statusCallback === 'function') statusCallback('บันทึกข้อมูลไฟล์...');
google.script.run
.withSuccessHandler(function(media) {
window._lastUploadedFieldMedia = media;
if (typeof done === 'function') done(null, media);
})
.withFailureHandler(function(err) { if (typeof done === 'function') done(err); })
.registerFieldMediaFile(driveFile.id, source || 'Field', reporter || USER_NAME || '-', file.name, mimeType, '', agencyId || '');
}).catch(function(err) {
if (typeof done === 'function') done(err instanceof Error ? err : new Error(String(err)));
});
}
function validateFieldMediaFiles(files) {
files = Array.prototype.slice.call(files || []);
for (var i = 0; i < files.length; i++) {
var validation = validateFieldMediaFile(files[i]);
if (!validation.ok) {
return {
ok:false,
message:'ไฟล์ที่ ' + (i + 1) + ': ' + validation.message,
detail:(files[i].name || '') + (validation.detail ? '<br>' + validation.detail : '')
};
}
}
return { ok:true };
}
function uploadFieldMediaFiles(files, source, reporter, done, statusCallback) {
files = Array.prototype.slice.call(files || []);
var uploaded = [];
var validation = validateFieldMediaFiles(files);
if (!validation.ok) {
if (typeof done === 'function') done(new Error(validation.message + ' - ' + validation.detail));
return;
}
function next(index) {
if (index >= files.length) {
refreshFieldMediaReports();
if (typeof done === 'function') done(null, uploaded);
return;
}
var file = files[index];
uploadFieldMediaFile(file, source, reporter, function(err, media) {
if (err) {
if (typeof done === 'function') done(err, uploaded);
return;
}
uploaded.push(media);
next(index + 1);
}, function(status) {
if (typeof statusCallback === 'function') statusCallback('ไฟล์ ' + (index + 1) + '/' + files.length + ' - ' + status);
});
}
next(0);
}
// 🎚️ Tier 1: โควต้ารูปสะสมต่อ 1 เหตุการณ์ (บทบาทละ 5 รูป) — ตัวเลขจริงบังคับที่ server
function _tier1MediaBucket_(source) {
var raw = String(source || '');
var src = raw.toUpperCase();
if (src === 'OC' || src === 'OSC' || src.indexOf('OC/ICP') !== -1) return 'OC/ICP';
if (raw.indexOf('สาธารณสุข') !== -1 || src === 'MED') return 'MED';
if (raw.indexOf('จุดอพยพ') !== -1 || src === 'EVAC') return 'EVAC';
return '';
}
function _tier1MediaUsedCount_(bucket) {
var list = window._fieldMediaReports || [];
var n = 0;
list.forEach(function(item) {
if (_tier1MediaBucket_(item.source || item.roleCode) === bucket) n++;
});
return n;
}
// คืนค่า true = ผ่าน, false = บล็อกแล้ว (เด้งเตือนให้แล้ว)
function _tier1CheckMediaFiles_(input, files, source) {
if (typeof hasFeature !== 'function' || hasFeature('media_upload')) return true;
var bad = files.filter(function(f) { return !/^image\//.test(f.type || ''); });
if (bad.length) {
Swal.fire('ส่งได้เฉพาะรูปภาพ', 'Tier 1 ส่งได้เฉพาะรูปภาพ ไม่รองรับวิดีโอ/เสียง/ไฟล์อื่น', 'warning');
if (input) input.value = '';
return false;
}
var bucket = _tier1MediaBucket_(source);
var used = bucket ? _tier1MediaUsedCount_(bucket) : 0;
if (files.length + used > 5) {
Swal.fire('เกินโควต้ารูป Tier 1',
'ส่งรูปได้สูงสุด 5 รูปต่อ 1 เหตุการณ์' + (used ? ' — ส่งไปแล้ว ' + used + ' รูป เหลือส่งได้อีก ' + Math.max(0, 5 - used) + ' รูป' : ''),
'warning');
if (input) input.value = '';
return false;
}
return true;
}
function handleGenericFieldMedia(input, source, reporter) {
var files = input && input.files ? Array.prototype.slice.call(input.files) : [];
if (!files.length) return;
if (!_tier1CheckMediaFiles_(input, files, source)) return;
var validation = validateFieldMediaFiles(files);
if (!validation.ok) {
Swal.fire(validation.message, validation.detail || '', 'warning');
input.value = '';
return;
}
Swal.fire({ title:'กำลังอัปโหลด...', text:'เตรียมอัปโหลด ' + files.length + ' ไฟล์', allowOutsideClick:false, showConfirmButton:false, didOpen:function(){ Swal.showLoading(); } });
uploadFieldMediaFiles(files, source, reporter, function(err, mediaList) {
if (err) {
Swal.fire('อัปโหลดไฟล์ไม่สำเร็จ', err.message || String(err), 'error');
input.value = '';
return;
}
Swal.fire({ icon:'success', title:'อัปโหลดแล้ว ' + (mediaList || []).length + ' ไฟล์', timer:1600, showConfirmButton:false });
input.value = '';
}, function(status) {
if (Swal.isVisible()) Swal.update({ text: status });
});
}
function handleAttach(input) {
var files = input && input.files ? Array.prototype.slice.call(input.files) : [];
if (!files.length) return;

if (!_tier1CheckMediaFiles_(input, files, 'OC/ICP')) return;

var validation = validateFieldMediaFiles(files);
if (!validation.ok) {
Swal.fire(validation.message, validation.detail || '', 'warning');
input.value = '';
return;
}
window._ocUploadInProgress = true;
Swal.fire({ title:'กำลังอัปโหลดไฟล์...', text:'เตรียมอัปโหลด ' + files.length + ' ไฟล์', allowOutsideClick:false, allowEscapeKey:false, showConfirmButton:false, didOpen:function(){ Swal.showLoading(); } });
window._ocAttachName = files.map(function(f) { return f.name; }).join(', ');
var preview = document.getElementById('oc_attach_preview');
if (preview) preview.textContent = 'Preparing upload: ' + files.length + ' file(s)';
uploadFieldMediaFiles(files, 'OC/ICP', ocCurrentUser || USER_NAME || 'OC', function(err, mediaList) {
window._ocUploadInProgress = false;
if (err) {
if (preview) preview.textContent = 'Upload failed: ' + (err.message || err);
Swal.fire('อัปโหลดไฟล์ไม่สำเร็จ', err.message || String(err), 'error');
input.value = '';
return;
}
window._ocAttachURL = (mediaList && mediaList.length ? mediaList.map(function(m) { return m.previewUrl || m.url || ''; }).join(', ') : '');
if (preview) preview.textContent = 'Uploaded ' + (mediaList || []).length + ' file(s) | IC can view them in latest field media';
Swal.fire({ icon:'success', title:'อัปโหลดแล้ว ' + (mediaList || []).length + ' ไฟล์', timer:1600, showConfirmButton:false });
input.value = '';
}, function(status) {
if (preview) preview.textContent = status;
if (Swal.isVisible()) Swal.update({ text: status });
});
}
// 🎬 ถ้า <video> เล่นไฟล์ดิบจาก Drive ไม่ได้ (ไฟล์ใหญ่โดนหน้า virus-scan คั่น) → สลับเป็น Drive preview iframe ให้เอง
function _fieldVideoFallback_(el) {
if (!el || el.getAttribute('data-fb-done')) return;
el.setAttribute('data-fb-done', '1');
var preview = el.getAttribute('data-preview') || '';
var wrap = el.parentNode;
if (!preview || !wrap) return;
var iframe = document.createElement('iframe');
iframe.src = preview;
iframe.setAttribute('allowfullscreen', '');
iframe.setAttribute('allow', 'autoplay');
iframe.style.cssText = 'width:100%;height:60vh;border:0;border-radius:10px;background:#000;';
wrap.replaceChild(iframe, el);
}
function openFieldMediaItem(index) {
var item = (window._fieldMediaReports || [])[index];
if (!item) return;
var mime = String(item.mimeType || '');
// 🔧 วิดีโอ/เสียง: เล่นตรงผ่าน <video>/<audio> ด้วย directUrl (ไฟล์ดิบ) แทนการฝัง Drive preview iframe
// เพราะ iframe preview ของ Drive ต้องรอ Drive ประมวลผล/transcode ไฟล์ก่อนถึงจะเล่นได้ (ขึ้น "ยังอยู่ระหว่างประมวลผล...")
// ส่วน <video>/<audio> ให้เบราว์เซอร์เล่นไฟล์ดิบโดยตรง ไม่ต้องรอ
var media;
if (mime.indexOf('image/') === 0) {
media = '<img src="' + (item.thumbUrl || item.directUrl || item.previewUrl || item.url) + '" style="width:100%;max-height:72vh;object-fit:contain;border-radius:10px;background:#102a43;">';
} else if (mime.indexOf('video/') === 0) {
// 🔧 ไฟล์ใหญ่: directUrl อาจโดน Google คั่นหน้า virus-scan → <video> error → สลับไปใช้ Drive preview iframe อัตโนมัติ
media = '<video controls preload="metadata" playsinline style="width:100%;max-height:72vh;border-radius:10px;background:#000;" src="' + (item.directUrl || item.previewUrl || item.url) + '" data-preview="' + (item.previewUrl || '') + '" onerror="_fieldVideoFallback_(this)">'
+ '<a href="' + (item.directUrl || item.url) + '" target="_blank" style="color:#93c5fd;">ดาวน์โหลดวิดีโอ</a></video>';
} else if (mime.indexOf('audio/') === 0) {
media = '<audio controls style="width:100%;margin:20px 0;" src="' + (item.directUrl || item.previewUrl || item.url) + '"></audio>';
} else {
media = '<iframe src="' + (item.previewUrl || item.url) + '" style="width:100%;height:72vh;border:0;border-radius:10px;background:#102a43;" allowfullscreen></iframe>';
}
var html = media +
'<div style="text-align:left;margin-top:10px;font-size:14px;color:#475569;">' +
'<b>ลำดับ ' + (index + 1) + '</b><br>' +
'เวลา: ' + (item.time || '-') + '<br>' +
'จาก: ' + (item.source || '-') + ' / ' + (item.reporter || '-') + '<br>' +
'<span style="word-break:break-word;">' + (item.fileName || '-') + '</span>' +
'</div>';
Swal.fire({ title:'ภาพ/วิดีโอจากพื้นที่', html:html, width:'92vw', confirmButtonText:'ปิด' });
}
function th(codePoints) {
return codePoints.split(' ').map(function(hex) { return String.fromCharCode(parseInt(hex, 16)); }).join('');
}
var TH_NEW = th('0E43 0E2B 0E21 0E48');
var TH_LATEST = th('0E25 0E48 0E32 0E2A 0E38 0E14');
var TH_WAIT_MEDIA = th('0E23 0E2D 0E20 0E32 0E1E 002F 0E27 0E34 0E14 0E35 0E42 0E2D 0E08 0E32 0E01 0E1E 0E37 0E49 0E19 0E17 0E35 0E48 002E 002E 002E');
var TH_CLICK_ALL = th('0E04 0E25 0E34 0E01 0E40 0E1E 0E37 0E48 0E2D 0E14 0E39 0E17 0E31 0E49 0E07 0E2B 0E21 0E14');
var TH_NEW_MEDIA_TOAST = th('0E21 0E35 0E20 0E32 0E1E 002F 0E27 0E34 0E14 0E35 0E42 0E2D 0E08 0E32 0E01 0E1E 0E37 0E49 0E19 0E17 0E35 0E48 0E40 0E02 0E49 0E32 0E21 0E32 0E43 0E2B 0E21 0E48');
var TH_NO_MEDIA = th('0E22 0E31 0E07 0E44 0E21 0E48 0E21 0E35 0E20 0E32 0E1E 002F 0E27 0E34 0E14 0E35 0E42 0E2D 0E08 0E32 0E01 0E1E 0E37 0E49 0E19 0E17 0E35 0E48');
var TH_NO_MEDIA_DETAIL = th('0E40 0E21 0E37 0E48 0E2D 0020 004F 0043 002F 0049 0043 0050 0020 0E2B 0E23 0E37 0E2D 0E2B 0E19 0E48 0E27 0E22 0E2D 0E37 0E48 0E19 0E2D 0E31 0E1B 0E42 0E2B 0E25 0E14 0E41 0E25 0E49 0E27 0E08 0E30 0E41 0E2A 0E14 0E07 0E17 0E35 0E48 0E19 0E35 0E48');
var TH_SEQ = th('0E25 0E33 0E14 0E31 0E1A');
var TH_TIME = th('0E40 0E27 0E25 0E32');
var TH_FROM = th('0E08 0E32 0E01');
var TH_PREVIOUS = th('0E23 0E32 0E22 0E01 0E32 0E23 0E01 0E48 0E2D 0E19 0E2B 0E19 0E49 0E32');
var TH_NO_PREVIOUS = th('0E22 0E31 0E07 0E44 0E21 0E48 0E21 0E35 0E23 0E32 0E22 0E01 0E32 0E23 0E01 0E48 0E2D 0E19 0E2B 0E19 0E49 0E32');
var TH_LATEST_MEDIA = th('0E20 0E32 0E1E 002F 0E27 0E34 0E14 0E35 0E42 0E2D 0E25 0E48 0E32 0E2A 0E38 0E14');
var TH_MEDIA_FROM_FIELD = th('0E20 0E32 0E1E 002F 0E27 0E34 0E14 0E35 0E42 0E2D 0E08 0E32 0E01 0E1E 0E37 0E49 0E19 0E17 0E35 0E48');
var TH_CLOSE = th('0E1B 0E34 0E14');
function getFieldMediaId(item) {
if (!item) return '';
return String(item.fileId || item.rowIndex || item.url || item.fileName || '');
}
function setFieldMediaNotifyState(hasNew) {
window._hasNewFieldMedia = !!hasNew;
var box = document.getElementById('latest_field_media_box');
if (!box) return;
var badge = document.getElementById('field_media_new_badge');
if (hasNew) {
box.style.boxShadow = '0 0 0 2px #f59e0b, 0 0 18px rgba(245,158,11,0.95)';
box.style.border = '1px solid #f59e0b';
if (!badge) {
badge = document.createElement('div');
badge.id = 'field_media_new_badge';
badge.style.cssText = 'position:absolute;top:8px;right:8px;background:#ef4444;color:white;border-radius:999px;padding:4px 9px;font-size:12px;font-weight:900;z-index:2;box-shadow:0 0 12px rgba(239,68,68,.8);';
badge.textContent = TH_NEW;
box.appendChild(badge);
}
} else {
box.style.boxShadow = '';
box.style.border = '';
if (badge) badge.remove();
}
}
function markFieldMediaSeen() {
var latest = window._fieldMediaReports && window._fieldMediaReports[0];
var id = getFieldMediaId(latest);
if (id) {
window._lastSeenFieldMediaId = id;
try { sessionStorage.setItem('lastSeenFieldMediaId', id); } catch (e) {}
}
setFieldMediaNotifyState(false);
}
function normalizeFieldMediaReport(item) {
item = item || {};
var fileUrl = item.url || item.fileUrl || item.file_url || item.directUrl || item.previewUrl || '';
var fileId = item.fileId || item.file_id || '';
var fileName = item.fileName || item.file_name || '-';
var mimeType = item.mimeType || item.mime_type || '';
var timestamp = item.timestamp || item.created_at || item.time || '';
return Object.assign({}, item, {
rowIndex: item.rowIndex || item.id || '',
time: item.time || timestamp || '',
source: item.source || item.roleCode || '-',
reporter: item.reporter || '-',
fileName: fileName,
mimeType: mimeType,
url: fileUrl,
fileUrl: fileUrl,
fileId: fileId,
directUrl: item.directUrl || fileUrl,
thumbUrl: item.thumbUrl || fileUrl,
previewUrl: item.previewUrl || fileUrl
});
}
function applyFieldMediaReports(list) {
list = (list || []).map(normalizeFieldMediaReport);
list = list.filter(function(item) {
var src = String(item.source || item.roleCode || '').trim();
var srcUp = src.toUpperCase();
var isOC = srcUp === 'OC/ICP' || srcUp === 'OSC' || srcUp === 'OC';
var isMED = srcUp === 'MED' || src.indexOf('สาธารณสุข') !== -1 || src.indexOf('1669') !== -1 || src.indexOf('EMS') !== -1;
var isEVAC = srcUp === 'EVAC' || srcUp === 'EVAC_POINT' || src.indexOf('อพยพ') !== -1;
return isOC || isMED || isEVAC;
});
var latest = list[0] || null;
var latestId = getFieldMediaId(latest);
var seenId = window._lastSeenFieldMediaId;
if (!seenId) {
try { seenId = sessionStorage.getItem('lastSeenFieldMediaId') || ''; } catch (e) { seenId = ''; }
}
var hadPriorMedia = !!seenId;
window._fieldMediaReports = list;
renderLatestFieldMedia(window._fieldMediaReports);
if (latestId && hadPriorMedia && latestId !== seenId) {
setFieldMediaNotifyState(true);
if (window._lastNotifiedFieldMediaId !== latestId) {
window._lastNotifiedFieldMediaId = latestId;
if (typeof Swal !== 'undefined') {
Swal.mixin({ toast:true, position:'top-end', showConfirmButton:false, timer:2600, timerProgressBar:true })
.fire({ icon:'info', title:TH_NEW_MEDIA_TOAST });
}
}
} else {
if (latestId && !seenId) {
window._lastSeenFieldMediaId = latestId;
try { sessionStorage.setItem('lastSeenFieldMediaId', latestId); } catch (e) {}
}
setFieldMediaNotifyState(false);
}
}
function refreshFieldMediaReportsDirect() {
return fetch(WORKER_URL + '/?action=getFieldMediaReports', {
method:'POST',
headers:{'Content-Type':'application/json'},
body:'{}'
}).then(function(res) { return res.json(); }).then(function(list) {
if (Array.isArray(list)) applyFieldMediaReports(list);
return list;
}).catch(function(err) {
console.warn('[FieldMedia] direct refresh failed', err);
});
}
function refreshFieldMediaReports() {
if (typeof google === 'undefined' || !google.script || !google.script.run) {
refreshFieldMediaReportsDirect();
return;
}
google.script.run
.withSuccessHandler(function(list) {
if (Array.isArray(list)) applyFieldMediaReports(list);
else refreshFieldMediaReportsDirect();
})
.withFailureHandler(function(err) {
console.warn('[FieldMedia] bridge refresh failed', err);
refreshFieldMediaReportsDirect();
})
.getFieldMediaReports(30);
}
function renderLatestFieldMedia(list) {
var icon = document.getElementById('no_img_icon');
var img = document.getElementById('latest_field_img');
var caption = document.getElementById('latest_field_media_caption');
if (!icon || !img || !caption) return;
var latest = list && list.length ? list[0] : null;
if (!latest) {
icon.className = 'fas fa-image';
icon.style.display = 'block';
img.style.display = 'none';
caption.textContent = TH_WAIT_MEDIA;
return;
}
var mime = String(latest.mimeType || '');
if (mime.indexOf('image/') === 0) {
img.src = latest.thumbUrl || latest.directUrl || latest.previewUrl || latest.url || '';
img.style.display = 'block';
icon.style.display = 'none';
} else {
img.style.display = 'none';
icon.className = 'fas fa-video';
icon.style.display = 'block';
}
caption.textContent = '#' + (latest.rowIndex || 1) + ' ' + (latest.time || '') + ' | ' + (latest.source || '-') + ' | ' + TH_CLICK_ALL;
}
function buildFieldMediaCard(item, idx, isLatest) {
var mime = String(item.mimeType || '');
var media = mime.indexOf('image/') === 0
? '<img onclick="openFieldMediaItem(' + idx + ')" src="' + (item.thumbUrl || item.directUrl || item.previewUrl || item.url) + '" style="width:100%;height:' + (isLatest ? '300px':'230px') + ';object-fit:cover;border-radius:10px;background:#102a43;cursor:pointer;">'
: '<div onclick="openFieldMediaItem(' + idx + ')" style="height:' + (isLatest ? '300px':'230px') + ';border-radius:10px;background:#102a43;color:white;display:flex;align-items:center;justify-content:center;cursor:pointer;font-size:36px;"><i class="fas fa-play-circle"></i></div>';
var glow = isLatest ? 'border:2px solid #f59e0b;box-shadow:0 0 0 3px rgba(245,158,11,.18),0 0 26px rgba(245,158,11,.55);background:#fff7ed;' : 'border:1px solid #dbe4ea;background:#f8fafc;';
return '<div style="' + glow + 'border-radius:12px;padding:10px;position:relative;">' +
(isLatest ? '<div style="position:absolute;top:14px;left:14px;background:#ef4444;color:white;border-radius:999px;padding:4px 10px;font-size:12px;font-weight:900;z-index:2;">' + TH_LATEST + '</div>' : '') +
media +
'<div style="font-weight:900;color:#102a43;margin-top:8px;font-size:16px;">' + TH_SEQ + ' ' + (idx + 1) + '</div>' +
'<div style="font-size:14px;color:#475569;">' + TH_TIME + ': ' + (item.time || '-') + '</div>' +
'<div style="font-size:14px;color:#475569;">' + TH_FROM + ': ' + (item.source || '-') + ' / ' + (item.reporter || '-') + '</div>' +
'<div style="font-size:12px;color:#64748b;word-break:break-word;">' + (item.fileName || '-') + '</div>' +
'</div>';
}
function openFieldMediaGallery() {
var list = window._fieldMediaReports || [];
if (!list.length) {
Swal.fire(TH_NO_MEDIA, TH_NO_MEDIA_DETAIL, 'info');
return;
}
markFieldMediaSeen();
var latestHtml = buildFieldMediaCard(list[0], 0, true);
var older = list.slice(1);
var olderHtml = older.length
? '<div style="margin-top:16px;font-weight:900;color:#475569;font-size:16px;">' + TH_PREVIOUS + '</div>' +
'<div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(300px,1fr));gap:14px;text-align:left;margin-top:8px;">' +
older.map(function(item, offset) { return buildFieldMediaCard(item, offset + 1, false); }).join('') +
'</div>'
: '<div style="margin-top:12px;color:#94a3b8;text-align:center;">' + TH_NO_PREVIOUS + '</div>';
var html = '<div style="text-align:left;">' +
'<div style="font-weight:900;color:#b45309;font-size:16px;margin-bottom:8px;">' + TH_LATEST_MEDIA + '</div>' +
'<div style="display:grid;grid-template-columns:minmax(300px,1fr);gap:14px;">' + latestHtml + '</div>' +
olderHtml +
'</div>';
Swal.fire({ title:TH_MEDIA_FROM_FIELD, html:html, width:'92vw', confirmButtonText:TH_CLOSE });
}
function hideICDuplicateOCPanels() {
['ic_oc_support_feed', 'ic_zone_marker_feed', 'ic_oc_sitrep_feed'].forEach(function(id) {
var el = document.getElementById(id);
var card = el && el.closest ? el.closest('.ic-feed-card') : null;
if (card) card.style.display = 'none';
});
}
function renderResources(data) {
data = data || {};
var amb = document.getElementById('rt_ambulance');
var fire = document.getElementById('rt_fireTruck');
var staff = document.getElementById('rt_staff');
var decon = document.getElementById('rt_decon');
if (amb) amb.innerText = data.ambulance || 0;
if (fire) fire.innerText = data.fireTruck || 0;
if (staff) staff.innerText = data.staff || 0;
if (decon) decon.innerText = data.decon || 0;
}
function ensureAdminAccessForAction(done) {
if (APP_ACCESS_ROLE === 'admin') {
done();
return;
}
Swal.fire({
title: 'ยืนยันสิทธิ์ Admin',
text: 'ระบบต้องยืนยันรหัส Admin อีกครั้งก่อนจบภารกิจ',
input: 'password',
inputPlaceholder: 'รหัส Admin',
showCancelButton: true,
confirmButtonText: 'ยืนยัน',
cancelButtonText: 'ยกเลิก',
confirmButtonColor: '#c0392b',
preConfirm: function(pass) {
if (!pass) {
Swal.showValidationMessage('กรุณาใส่รหัส Admin');
return false;
}
return new Promise(function(resolve, reject) {
google.script.run
.withSuccessHandler(function(result) {
if (result && result.ok && result.role === 'admin') {
APP_ACCESS_ROLE = 'admin';
try { sessionStorage.setItem('EOC_ACCESS_ROLE', 'admin'); } catch (e) {}
resolve(true);
} else {
reject(new Error('รหัส Admin ไม่ถูกต้อง'));
}
})
.withFailureHandler(function(err) {
reject(new Error(err && err.message ? err.message : String(err)));
})
.checkAppLogin(pass, typeof getEOCDeviceId === 'function' ? getEOCDeviceId() : '');
}).catch(function(err) {
Swal.showValidationMessage(err.message || String(err));
return false;
});
}
}).then(function(result) {
if (result.isConfirmed) done();
});
}
function doEndMission() {
// 🔒 Tier 1: ซ่อนปุ่ม Export Log PDF (จบภารกิจได้ปกติ)
var canExportLog = (typeof hasFeature !== 'function') || hasFeature('triage');
Swal.fire({
title: 'ยืนยันจบภารกิจ?',
text: 'ระบบจะปิดศูนย์ EOC และล้างพิกัดเจ้าหน้าที่ทั้งหมด',
icon: 'warning',
showCancelButton: true,
showDenyButton: canExportLog,
confirmButtonColor: '#e74c3c',
confirmButtonText: 'ยืนยัน ปิดศูนย์',
denyButtonColor: '#2980b9',
denyButtonText: '<i class="fas fa-file-pdf"></i> Export Log PDF',
cancelButtonText: 'ยกเลิก'
}).then(function(result) {
if (result.isDenied) {
exportLogPDF();
return;
}
if (!result.isConfirmed) return;
Swal.fire({ title:'กำลังปิดระบบ...', didOpen:function(){ Swal.showLoading(); } });
google.script.run
.withSuccessHandler(function(closeResult) {
// 🔧 ไม่ต้องเรียก clearLiveLocations() ซ้ำ — deactivateEmergency ล้าง Live_Locations ให้แล้ว
Swal.close();
APP_ACCESS_ROLE = '';
try { sessionStorage.removeItem('EOC_ACCESS_ROLE'); } catch (e) {}
checkSystemStatus();
if (closeResult && closeResult.line && closeResult.line.ok === false) {
setTimeout(function() {
Swal.fire(
'ปิดเหตุแล้ว แต่ส่ง LINE ไม่สำเร็จ',
'LINE API status: ' + (closeResult.line.status || closeResult.line.reason || closeResult.line.error || '-') + (closeResult.line.body ? '<br>' + closeResult.line.body : ''),
'warning'
);
}, 700);
}
})
.withFailureHandler(function(err) {
Swal.close();
Swal.fire('ปิดศูนย์ไม่สำเร็จ', err && err.message ? err.message : String(err), 'error');
})
.deactivateEmergency(USER_NAME || currentUserName || 'IC', APP_ACCESS_ROLE, APP_AGENCY_ID || '');
});
}
function endMission() {
ensureAdminAccessForAction(doEndMission);
}
function openDeclareForm() {
if (APP_ACCESS_ROLE !== 'admin') {
Swal.fire('ต้องใช้สิทธิ์ Admin', 'ผู้ดูอย่างเดียวไม่สามารถเริ่มเหตุได้', 'warning');
return;
}
var loading = document.getElementById('scene_Loading');
if (loading) loading.style.display = 'none';
var html = [
'<sty' + 'le>.swal2-container{z-index:30000!important}.declare-grid{display:grid;grid-template-columns:1fr 1fr;gap:10px}.declare-label{text-align:left;font-size:13px;color:#334155;font-weight:800;margin:8px 0 5px}.declare-input{width:100%;box-sizing:border-box;padding:10px;border:1px solid #cbd5e1;border-radius:8px;font-family:Prompt,sans-serif;font-size:14px}.declare-note{text-align:left;font-size:12px;color:#64748b;margin-top:5px}@media(max-width:640px){.declare-grid{grid-template-columns:1fr}}</sty' + 'le>',
'<div style="text-align:left;">',
'<div class="declare-label">ชื่อเหตุการณ์</div>',
'<input id="swal-evt" class="declare-input" placeholder="เช่น สารเคมีรั่วไหล / ไฟไหม้โรงงาน">',
'<div class="declare-label">สถานที่เกิดเหตุ</div>',
(APP_LOCATION_MODE === 'both' ?
  '<div style="display:flex;gap:14px;margin-bottom:8px;flex-wrap:wrap;">' +
  '<label style="display:flex;align-items:center;gap:6px;font-size:13px;font-weight:800;color:#334155;cursor:pointer;"><input type="radio" name="swal-loc-mode" value="area" checked onchange="toggleDeclareLocMode()"> ใช้แผนที่ (ปักหมุด)</label>' +
  '<label style="display:flex;align-items:center;gap:6px;font-size:13px;font-weight:800;color:#334155;cursor:pointer;"><input type="radio" name="swal-loc-mode" value="building" onchange="toggleDeclareLocMode()"> ไม่ใช้แผนที่ (ระบุชื่อ/ชั้น/อาคาร)</label>' +
  '</div>' : ''),
'<div style="display:flex;gap:8px;">',
'<input id="swal-loc" class="declare-input" placeholder="' + (APP_LOCATION_MODE === 'building' ? 'เช่น ตึก A ชั้น 3 / ห้องผ่าตัด' : 'พิมพ์ชื่อสถานที่...') + '" style="flex:1;">',
(APP_LOCATION_MODE === 'building' ? '' :
  '<button type="button" id="swal-loc-map-btn" onclick="openDeclareMapPicker()" style="background:#ea4335;color:white;border:none;border-radius:8px;padding:0 14px;cursor:pointer;font-weight:900;"><i class="fas fa-map-marker-alt"></i> Maps</button>'),
'</div>',
'<div id="show-coords" class="declare-note"' + (APP_LOCATION_MODE === 'building' ? ' style="display:none;"' : '') + '>ยังไม่ระบุพิกัด</div>',
'<input type="hidden" id="hidden-lat"><input type="hidden" id="hidden-lng">',
'<div>',
'<div class="declare-label">ที่ตั้ง EOC</div>' +
'<input id="swal-eoc" class="declare-input" placeholder="เช่น ศูนย์บัญชาการ / ห้องประชุม">' +
((typeof hasFeature === 'function' && !hasFeature('share_link'))
  ? '<div style="margin-top:4px;background:#fef3c7;border:1px solid #fcd34d;border-radius:6px;padding:5px 8px;font-size:0.75rem;color:#92400e;"><i class="fas fa-lock"></i> การตั้งพิกัดที่ตั้ง EOC บนแผนที่ใช้ได้ใน Tier 2 ขึ้นไป</div>'
  : '<button type="button" onclick="openDeclareMapPicker(\'eoc\');" id="swal-eoc-map-btn" style="margin-top:4px;background:#1565c0;color:white;border:none;border-radius:6px;padding:5px 12px;cursor:pointer;font-size:0.8rem;font-weight:900;width:100%;"><i class="fas fa-map-marker-alt"></i> ปักหมุดที่ตั้ง EOC บนแผนที่ (ไม่บังคับ)</button>' +
  '<div id="swal-eoc-coords-show" style="font-size:0.72rem;color:#16a34a;min-height:16px;margin-top:2px;"></div>' +
  '<input type="hidden" id="swal-eoc-lat"><input type="hidden" id="swal-eoc-lng">'),
'</div>',
'<div class="declare-grid">',
'<div><div class="declare-label">ประเภทแผน</div><select id="emerPlanType" class="declare-input"><option>เตรียมรองรับสถานการณ์</option><option>แผนป้องกันและบรรเทาสาธารณภัย</option><option>แผนพิทักษ์ระยอง</option><option>แผนอัคคีภัย</option><option>แผนรับอุบัติภัยหมู่ (RESCUE-C)</option></select></div>',
'<div><div class="declare-label">ระดับ</div><select id="emerLevel" class="declare-input"><option value="-">-</option><option>ระดับ 1</option><option>ระดับ 2</option><option>ระดับ 3</option><option>ระดับ 4</option></select></div>',
'</div>',
'<div style="background:#eef7ff;border:1px solid #c7ddf6;border-radius:10px;padding:10px;margin-top:12px;">',
'<div class="declare-label" style="margin-top:0;color:#185fa5;"><i class="fas fa-wind"></i> ทิศทางลมเริ่มต้น</div>',
'<label style="display:flex;align-items:center;gap:8px;font-size:13px;font-weight:800;color:#123b63;margin:6px 0;"><input type="radio" name="swal-wind-mode" value="auto" checked onchange="toggleDeclareWindMode()"> ใช้ทิศทางลมอัตโนมัติ</label>',
'<label style="display:flex;align-items:center;gap:8px;font-size:13px;font-weight:800;color:#123b63;margin:6px 0;"><input type="radio" name="swal-wind-mode" value="manual" onchange="toggleDeclareWindMode()"> ระบุทิศทางลมหรือรอข้อมูลจาก OC</label>',
'<div class="declare-grid">',
'<select id="swal-wind-dir" class="declare-input" disabled><option value="">ยังไม่ทราบ / รอ OC รายงาน</option><option value="0">ไปทางเหนือ (0°)</option><option value="45">ไปทางตะวันออกเฉียงเหนือ (45°)</option><option value="90">ไปทางตะวันออก (90°)</option><option value="135">ไปทางตะวันออกเฉียงใต้ (135°)</option><option value="180">ไปทางใต้ (180°)</option><option value="225">ไปทางตะวันตกเฉียงใต้ (225°)</option><option value="270">ไปทางตะวันตก (270°)</option><option value="315">ไปทางตะวันตกเฉียงเหนือ (315°)</option></select>',
'<input id="swal-wind-speed" class="declare-input" type="number" min="0" step="0.1" placeholder="ความเร็วลม m/s" disabled>',
'</div>',
'<div class="declare-note">โหมดอัตโนมัติจะดึงข้อมูลลมจากพิกัดจุดเกิดเหตุเมื่อประกาศ Active</div>',
'</div>',
'</div>'
].join('');
Swal.fire({
title: 'ประกาศภาวะฉุกเฉิน',
width: '720px',
html: html,
focusConfirm: false,
showCancelButton: true,
confirmButtonText: 'ประกาศ ACTIVE',
cancelButtonText: 'ยกเลิก',
confirmButtonColor: '#e74c3c',
preConfirm: function() {
var lat = document.getElementById('hidden-lat').value;
var lng = document.getElementById('hidden-lng').value;
var evt = document.getElementById('swal-evt').value.trim();
var loc = document.getElementById('swal-loc').value.trim();
var eoc = document.getElementById('swal-eoc').value.trim();
var eocLat = (document.getElementById('swal-eoc-lat') || {}).value || '';
var eocLng = (document.getElementById('swal-eoc-lng') || {}).value || '';
var commander = '';
var pos = '';
var windModeEl = document.querySelector('input[name="swal-wind-mode"]:checked');
var windMode = windModeEl ? windModeEl.value : 'manual';
var windDir = document.getElementById('swal-wind-dir').value;
var windSpeed = document.getElementById('swal-wind-speed').value;
var locModeEl = document.querySelector('input[name="swal-loc-mode"]:checked');
var effectiveLocMode = APP_LOCATION_MODE === 'both' ? (locModeEl ? locModeEl.value : 'area') : APP_LOCATION_MODE;
if (!evt) return Swal.showValidationMessage('กรุณาใส่ชื่อเหตุการณ์');
if (effectiveLocMode === 'building') {
if (!loc) return Swal.showValidationMessage('กรุณาระบุชื่อสถานที่ (เช่น ตึก/ชั้น/ห้อง)');
} else {
if (!lat || !lng) return Swal.showValidationMessage('กรุณากด Maps เพื่อเลือกพิกัดจุดเกิดเหตุก่อน');
}
if (windMode === 'manual' && windDir && windSpeed === '') return Swal.showValidationMessage('ถ้าเลือกทิศทางลม กรุณาใส่ความเร็วลมด้วย');
return [
evt,
loc,
(lat && lng) ? (lat + ',' + lng) : '',
document.getElementById('emerPlanType').value,
document.getElementById('emerLevel').value,
eoc,
commander || USER_NAME || 'Admin',
pos,
windDir,
windSpeed,
windMode,
eocLat && eocLng ? eocLat + ',' + eocLng : ''
];
}
}).then(function(result) {
if (!result.isConfirmed) return;
var v = result.value;
Swal.fire({ title:'กำลังเปิดศูนย์ EOC...', didOpen:function(){ Swal.showLoading(); }, allowOutsideClick:false });
google.script.run
.withSuccessHandler(function(res) {
Swal.close();
document.getElementById('scene_Declare').style.display = 'none';
document.getElementById('scene_Loading').style.display = 'flex';
checkSystemStatus();
// ---- แสดง Join Link popup ก่อนเสมอ (ไม่ขึ้นกับ video room) ----
setTimeout(function() {
var joinUrl = (res && res.joinUrl) ? res.joinUrl : '';
if (joinUrl) window._currentJoinUrl = joinUrl; // ให้ปุ่มโหลด/แชร์ QR ใน popup ใช้ได้ทันที
var joinHtml = joinUrl
? '<div style="text-align:left;background:#eef2ff;border:1px solid #c7d2fe;border-radius:10px;padding:12px;margin-bottom:10px;">' +
  '<div style="font-weight:900;color:#1e3a8a;margin-bottom:6px;">🔗 Join Link สำหรับเจ้าหน้าที่</div>' +
  '<div style="font-size:0.8rem;color:#475569;margin-bottom:8px;">ส่ง link นี้ให้ จนท. ทุกคน — กดลิงก์หรือสแกน QR เข้าได้เลยไม่ต้อง login</div>' +
  '<div style="background:white;border-radius:7px;padding:8px;font-size:0.78rem;word-break:break-all;color:#334155;border:1px solid #e2e8f0;margin-bottom:8px;">' + joinUrl + '</div>' +
  '<div style="text-align:center;"><img src="' + _joinQrUrl_(joinUrl, 300) + '" style="width:160px;height:160px;border-radius:8px;border:1px solid #c7d2fe;background:white;padding:6px;" alt="QR Join Link"/></div>' +
  '<div style="text-align:center;margin-top:6px;">' +
  '<button type="button" onclick="(function(btn){var url='+JSON.stringify(joinUrl)+';if(navigator.clipboard&&window.isSecureContext){navigator.clipboard.writeText(url).then(function(){btn.innerText=\'คัดลอกแล้ว ✓\';}).catch(function(){prompt(\'คัดลอก link:\',url);});}else{prompt(\'คัดลอก link:\',url);}}).call(this,this)' +
  '" style="background:#2563eb;color:white;border:none;border-radius:7px;padding:7px 16px;cursor:pointer;font-weight:900;font-size:0.85rem;">📋 คัดลอก Join Link</button>' +
  _joinQrButtonsHtml_() +
  '</div>'
: '<div style="background:#fef3c7;border-radius:8px;padding:10px;color:#92400e;font-size:0.85rem;">ยังไม่สามารถสร้าง Join Link ได้ — ตรวจสอบว่า PUBLIC_APP_URL ตั้งค่าแล้ว</div>';
Swal.fire({
icon: 'success',
title: '🚨 เปิด EOC สำเร็จ',
html: joinHtml + (res && res.videoRoomName
  ? '<div style="margin-top:8px;font-size:0.85rem;color:#475569;">ห้องวิดีโอ: <b>' + res.videoRoomName + '</b></div>'
  : ''),
confirmButtonText: res && res.videoRoomName ? 'เปิดห้องวิดีโอด้วย' : 'ตกลง',
showCancelButton: !!(res && res.videoRoomName),
cancelButtonText: 'ปิด',
confirmButtonColor: '#16a34a'
}).then(function(r) {
if (r.isConfirmed && res && res.videoRoomName && typeof openJitsiModal === 'function') {
if (typeof hasFeature === 'function' && !hasFeature('eoc_video_call')) {
Swal.fire({ icon:'info', title:'🔒 ห้องวิดีโอใช้ได้ Tier 2 ขึ้นไป', text:'กรุณาติดต่อผู้ดูแลระบบเพื่ออัปเกรดแพ็กเกจ', confirmButtonText:'รับทราบ' });
return;
}
openJitsiModal(res.videoRoomName, 'ห้องวิดีโอ EOC');
}
// เก็บ join link ไว้แสดงใน dashboard ด้วย
if (joinUrl) {
try { sessionStorage.setItem('EOC_JOIN_URL', joinUrl); } catch(e) {}
window._currentJoinUrl = joinUrl;
setTimeout(function() { showJoinLinkInDashboard(joinUrl); }, 500);
}
});
}, 800);
})
.withFailureHandler(function(err) {
Swal.close();
Swal.fire('เปิดเหตุไม่สำเร็จ', err && err.message ? err.message : String(err), 'error');
})
.activateEmergency(v[0], v[1], v[2], v[3], v[4], v[5], v[6], APP_ACCESS_ROLE, v[7] || '', v[8] || '', v[9] || '', v[10] || 'manual', APP_AGENCY_ID || '', v[11] || '');
});
}
// ============================================================
// 🔳 QR Code ของ Join Link — ใช้ร่วมกันทั้ง popup เปิด EOC และปุ่มบนแดชบอร์ด
// ============================================================
function _joinQrUrl_(url, size) {
size = size || 300;
return 'https://api.qrserver.com/v1/create-qr-code/?size=' + size + 'x' + size + '&data=' + encodeURIComponent(url);
}
function _fetchJoinQrBlob_(url) {
return fetch(_joinQrUrl_(url, 500)).then(function(res) {
if (!res.ok) throw new Error('โหลด QR ไม่สำเร็จ');
return res.blob();
});
}
function downloadJoinQr() {
var url = window._currentJoinUrl || '';
if (!url) { Swal.fire({ icon:'warning', title:'ยังไม่มี Join Link', timer:1500, showConfirmButton:false }); return; }
_fetchJoinQrBlob_(url).then(function(blob) {
var a = document.createElement('a');
a.href = URL.createObjectURL(blob);
a.download = 'EOC-join-QR.png';
document.body.appendChild(a);
a.click();
document.body.removeChild(a);
setTimeout(function() { URL.revokeObjectURL(a.href); }, 5000);
}).catch(function() {
// fetch โดน CORS/เน็ตล่ม — เปิดรูปในแท็บใหม่ให้กดเซฟเอง
window.open(_joinQrUrl_(url, 500), '_blank');
});
}
function shareJoinQr() {
var url = window._currentJoinUrl || '';
if (!url) { Swal.fire({ icon:'warning', title:'ยังไม่มี Join Link', timer:1500, showConfirmButton:false }); return; }
_fetchJoinQrBlob_(url).then(function(blob) {
var file = new File([blob], 'EOC-join-QR.png', { type: 'image/png' });
if (navigator.canShare && navigator.canShare({ files: [file] })) {
return navigator.share({ files: [file], title: 'Join Link EOC', text: 'สแกน QR หรือกดลิงก์เพื่อเข้าระบบ EOC\n' + url });
}
if (navigator.share) return navigator.share({ title: 'Join Link EOC', text: 'เข้าระบบ EOC', url: url });
throw new Error('no-share-api');
}).catch(function(e) {
if (e && e.name === 'AbortError') return; // ผู้ใช้กดยกเลิกแชร์เอง — ไม่ใช่ error
// เครื่องไม่รองรับ Web Share (เช่น เดสก์ท็อป) → โหลด QR + คัดลอกลิงก์ให้แทน
downloadJoinQr();
if (typeof copyTextToClipboard === 'function') copyTextToClipboard(url, function() {});
Swal.fire({ icon:'info', title:'เครื่องนี้แชร์ตรงไม่ได้', text:'ดาวน์โหลด QR และคัดลอกลิงก์ไว้ให้แล้ว ส่งต่อได้เลย', timer:2400, showConfirmButton:false });
});
}
function _joinQrButtonsHtml_() {
return '<div style="display:flex;gap:8px;justify-content:center;margin-top:8px;">' +
'<button type="button" onclick="downloadJoinQr()" style="background:#0f172a;color:white;border:none;border-radius:7px;padding:7px 14px;cursor:pointer;font-weight:900;font-size:0.8rem;"><i class="fas fa-download"></i> โหลด QR</button>' +
'<button type="button" onclick="shareJoinQr()" style="background:#16a34a;color:white;border:none;border-radius:7px;padding:7px 14px;cursor:pointer;font-weight:900;font-size:0.8rem;"><i class="fas fa-share-nodes"></i> แชร์ QR</button>' +
'</div>';
}
function toggleDeclareLocMode() {
var modeEl = document.querySelector('input[name="swal-loc-mode"]:checked');
var useMap = !modeEl || modeEl.value === 'area';
var btn = document.getElementById('swal-loc-map-btn');
var coordsNote = document.getElementById('show-coords');
var input = document.getElementById('swal-loc');
if (btn) btn.style.display = useMap ? '' : 'none';
if (coordsNote) coordsNote.style.display = useMap ? '' : 'none';
if (input) input.placeholder = useMap ? 'พิมพ์ชื่อสถานที่...' : 'เช่น ตึก A ชั้น 3 / ห้องผ่าตัด';
if (!useMap) {
document.getElementById('hidden-lat').value = '';
document.getElementById('hidden-lng').value = '';
if (coordsNote) coordsNote.textContent = 'ยังไม่ระบุพิกัด';
}
}
function toggleDeclareWindMode() {
var modeEl = document.querySelector('input[name="swal-wind-mode"]:checked');
var manual = modeEl && modeEl.value === 'manual';
var dir = document.getElementById('swal-wind-dir');
var speed = document.getElementById('swal-wind-speed');
if (dir) dir.disabled = !manual;
if (speed) speed.disabled = !manual;
if (!manual) {
if (dir) dir.value = '';
if (speed) speed.value = '';
}
}
function normalizeAttendancePhone(phone) {
var raw = String(phone || '').trim();
if (!raw) return '';
raw = raw.replace(/[^\d+]/g, '');
if (/^\d{9}$/.test(raw)) return '0' + raw;
if (/^66\d{9}$/.test(raw)) return '0' + raw.slice(2);
if (/^\+66\d{9}$/.test(raw)) return '0' + raw.slice(3);
return raw;
}
function getAttendanceBucket(person) {
var code = String((person && (person.roleCode || person.RoleCode || person.code)) || '').trim();
if (['OSC','MED','EVAC_POINT','Operation','Operations','ops'].indexOf(code) !== -1) return 'ops';
if (code === 'Planning') return 'plan';
if (code === 'Logistics') return 'log';
if (code === 'JIC') return 'jic';
if (code === 'Specialist') return 'specialist';
if (code === 'Liaison') return 'liaison';
var text = [
person && person.role,
person && person.name,
person && person.location
].filter(Boolean).join(' ');
var low = text.toLowerCase();
if (low.indexOf('ประชาสัมพันธ์') !== -1) return 'jic';
if (low.indexOf('ผู้เชี่ยวชาญ') !== -1 || low.indexOf('ที่ปรึกษา') !== -1) return 'specialist';
if (low.indexOf('ประสาน') !== -1) return 'liaison';
if (low.indexOf('อำนวยการ') !== -1) return 'plan';
if (low.indexOf('สนับสนุน') !== -1) return 'log';
if (low.indexOf('oc/icp') !== -1 || low.indexOf('สาธารณสุข') !== -1 || low.indexOf('1669') !== -1 || low.indexOf('อพยพ') !== -1 || low.indexOf('ปฏิบัติการ') !== -1) return 'ops';
return 'ops';
}
function normalizeAttendancePerson(person) {
person = person || {};
return {
time: person.time || person.timestamp || person.Timestamp || '',
name: person.name || person.Name || '-',
role: person.role || person.Role || '-',
location: person.location || person.Location || person.agency || person.Agency || '-',
status: person.status || person.Status || '',
phone: normalizeAttendancePhone(person.phone || person.Phone || ''),
roleCode: person.roleCode || person.RoleCode || ''
};
}
function uniqueAttendancePeople(list) {
var seen = {};
(list || []).forEach(function(row) {
var p = normalizeAttendancePerson(row);
var key = [
String(p.name || '-').trim(),
String(p.phone || '').trim(),
String(p.roleCode || p.role || '-').trim()
].join('|');
seen[key] = p;
});
return Object.keys(seen).map(function(k) { return seen[k]; });
}
function summarizeAttendanceRows(list) {
var people = uniqueAttendancePeople(list);
var counts = { ops:0, plan:0, log:0, jic:0, specialist:0, liaison:0, all:people.length };
var peopleByRole = { ops:[], plan:[], log:[], jic:[], specialist:[], liaison:[] };
people.forEach(function(p) {
var bucket = getAttendanceBucket(p);
if (counts.hasOwnProperty(bucket)) {
counts[bucket]++;
peopleByRole[bucket].push(p);
}
});
return { counts: counts, people: people, peopleByRole: peopleByRole };
}
function applyAttendanceCounts(counts) {
counts = counts || {};
var hasAnyCount = ['ops','plan','log','jic','specialist','liaison'].some(function(roleType) {
return Number(counts[roleType] || 0) > 0;
});
var hadAnyCount = window._lastAttendanceCounts && ['ops','plan','log','jic','specialist','liaison'].some(function(roleType) {
return Number(window._lastAttendanceCounts[roleType] || 0) > 0;
});
if (!hasAnyCount && hadAnyCount) {
counts = window._lastAttendanceCounts;
}
window._lastAttendanceCounts = counts;
['ops','plan','log','jic','specialist','liaison'].forEach(function(roleType) {
var value = Number(counts[roleType] || 0);
var els = document.querySelectorAll('#count_' + roleType);
if (!els.length) {
var el = document.getElementById('count_' + roleType);
if (el) els = [el];
}
Array.prototype.forEach.call(els, function(el) {
el.textContent = value;
el.innerText = value;
});
});
}
function renderAttendanceCounts(list) {
var summary = summarizeAttendanceRows(list || []);
window._attendanceData = summary.people;
applyAttendanceCounts(summary.counts);
}
function applyStaffAttendanceDashboard(data) {
data = data || {};
var counts = data.counts || {};
var peopleByRole = data.peopleByRole || {};
var people = Array.isArray(data.people) ? data.people : [];
if (!people.length) {
['jic','specialist','liaison','ops','plan','log'].forEach(function(key) {
if (Array.isArray(peopleByRole[key])) people = people.concat(peopleByRole[key]);
});
}
if (people.length) window._attendanceData = people;
window._attendancePeopleByRole = peopleByRole;
applyAttendanceCounts(counts);
}
function applyAttendanceRowsFromSheet(list) {
var summary = summarizeAttendanceRows(Array.isArray(list) ? list : []);
window._attendanceData = summary.people;
window._attendancePeopleByRole = summary.peopleByRole;
applyAttendanceCounts(summary.counts);
}
function refreshAttendanceCounts() {
if (typeof google === 'undefined' || !google.script || !google.script.run) return;
google.script.run
.withSuccessHandler(function(counts) { applyAttendanceCounts(counts || {}); })
.withFailureHandler(function(err) { })
.getAttendanceCountsDirect();
}
function refreshAttendanceCountsFast() {
if (typeof google === 'undefined' || !google.script || !google.script.run) return;
if (window._attendanceCountsLoading) return;
if (window._lastAttendanceCountsAt && Date.now() - window._lastAttendanceCountsAt < 5000) return;
window._lastAttendanceCountsAt = Date.now();
window._attendanceCountsLoading = true;
google.script.run
.withSuccessHandler(function(counts) {
window._attendanceCountsLoading = false;
applyAttendanceCounts(counts || {});
})
.withFailureHandler(function(err) {
window._attendanceCountsLoading = false;
})
.getAttendanceCountsDirect();
}
function getAttendanceRoleTitle(roleType) {
return {
ops: 'หน่วยปฏิบัติการ',
plan: 'หน่วยอำนวยการ',
log: 'หน่วยสนับสนุน',
jic: 'ประชาสัมพันธ์',
specialist: 'ผู้เชี่ยวชาญ',
liaison: 'ประสานงาน',
all: 'กำลังพลทั้งหมด'
}[roleType] || 'กำลังพล';
}
function getRoleUpdateBucket(roleCode) {
var code = String(roleCode || '').trim().toUpperCase();
if (code === 'JIC') return 'jic';
if (code === 'SPECIALIST') return 'specialist';
if (code === 'LIAISON') return 'liaison';
if (code === 'PLANNING' || code === 'PLAN') return 'plan';
if (code === 'LOGISTICS' || code === 'LOG' || code === 'LOGISTIC') return 'log';
if (code === 'MED' || code === 'OSC' || code === 'EVAC_POINT' || code === 'OPERATION' || code === 'OPERATIONS' || code === 'OPS' || code === 'OC/ICP' || code === 'OC' || code === 'FIELD') return 'ops';
return '';
}
function renderRoleUpdateBadgesForIC(updates) {
updates = Array.isArray(updates) ? updates : [];
var hasIncomingAny = updates.length > 0;
var hasIncomingMedia = updates.some(function(u) { return u && (u.updateType === 'media' || !!u.fileName); });
var hasCachedAny = (window._roleUpdatesForIC || []).length > 0;
if (!hasIncomingAny && hasCachedAny) {
updates = window._roleUpdatesForIC;
}
window._roleUpdatesForIC = updates;
var counts = { jic:0, specialist:0, liaison:0, plan:0, log:0, ops:0 };
var latestByRole = {};
updates.forEach(function(u) {
var bucket = getRoleUpdateBucket(u.roleCode || u.source);
if (!bucket) return;
var isMedia = (u.updateType === 'media' || !!u.fileName);
var isNote = (u.updateType === 'note' || !!u.note);
// ops (OC/ICP, MED, EVAC) มีแจ้งเตือนไฟล์/รูปแยกที่ "ภาพหน้างานล่าสุด" อยู่แล้ว ไม่ต้องซ้ำที่นี่
// ส่วน role อื่น (JIC/ผู้เชี่ยวชาญ/ประสานงาน/อำนวยการ/สนับสนุน) ไม่มีช่องแจ้งเตือนไฟล์ที่อื่น ให้คงเดิม
var isNotifiable = bucket === 'ops' ? isNote : (isMedia || isNote);
if (!isNotifiable) return;
if (isRoleMediaRead(u)) return;
counts[bucket]++;
if (!latestByRole[bucket]) latestByRole[bucket] = u;
});
['jic','specialist','liaison','plan','log','ops'].forEach(function(bucket) {
var countEl = document.getElementById('count_' + bucket);
if (!countEl) return;
var card = countEl.closest('[onclick]');
if (!card) return;
var old = card.querySelector('.role-update-badge');
if (old) old.remove();
});
['jic','specialist','liaison','plan','log','ops'].forEach(function(bucket) {
var countEl = document.getElementById('count_' + bucket);
if (!countEl) return;
var card = countEl.closest('[onclick]');
if (!card) return;
card.style.position = 'relative';
var old = card.querySelector('.role-update-badge');
if (old) old.remove();
if (!counts[bucket]) return;
var latest = latestByRole[bucket] || {};
var sender = latest.reporter || '-';
var badge = document.createElement('div');
badge.className = 'role-update-badge';
badge.style.cssText = 'position:absolute;right:6px;top:6px;background:#ef4444;color:white;border:2px solid #fff;border-radius:999px;padding:3px 8px;font-size:10px;font-weight:900;box-shadow:0 0 0 0 rgba(239,68,68,.7);animation:roleUpdatePulse 1.2s infinite;white-space:nowrap;z-index:2;';
badge.textContent = 'ใหม่ ' + counts[bucket];
badge.title = 'มีข้อมูลส่งมาใหม่จาก: ' + sender;
card.appendChild(badge);
});
}
function ensureRoleUpdatePulseStyle() {
if (document.getElementById('role_update_pulse_style')) return;
var style = document.createElement('style');
style.id = 'role_update_pulse_style';
style.textContent = '@keyframes roleUpdatePulse{0%{transform:scale(1);box-shadow:0 0 0 0 rgba(239,68,68,.7)}70%{transform:scale(1.05);box-shadow:0 0 0 10px rgba(239,68,68,0)}100%{transform:scale(1);box-shadow:0 0 0 0 rgba(239,68,68,0)}}';
document.head.appendChild(style);
}
ensureRoleUpdatePulseStyle();
function getRoleMediaReadStore() {
try {
return JSON.parse(localStorage.getItem('ic_role_media_read') || '{}') || {};
} catch (e) {
return {};
}
}
function saveRoleMediaReadStore(store) {
try {
localStorage.setItem('ic_role_media_read', JSON.stringify(store || {}));
} catch (e) {}
}
function getRoleMediaKey(item) {
item = item || {};
if (item.readKey) return String(item.readKey);
return [
getRoleUpdateBucket(item.roleCode || item.source) || 'role',
item.fileId || item.rowIndex || item.url || item.fileName || '',
item.time || '',
item.reporter || ''
].join('|');
}
function isRoleMediaRead(item) {
if (item && item.read) return true;
var store = getRoleMediaReadStore();
return !!store[getRoleMediaKey(item)];
}
function markRoleMediaRead(roleType) {
var store = getRoleMediaReadStore();
var keys = [];
(window._roleUpdatesForIC || []).forEach(function(u) {
if (!u) return;
var bucket = getRoleUpdateBucket(u.roleCode || u.source);
var isMedia = (u.updateType === 'media' || !!u.fileName);
var isNote = (u.updateType === 'note' || !!u.note);
var isNotifiable = bucket === 'ops' ? isNote : (isMedia || isNote);
if (!isNotifiable) return;
if (roleType !== 'all' && bucket !== roleType) return;
var key = getRoleMediaKey(u);
store[key] = Date.now();
u.read = true;
if (key && keys.indexOf(key) === -1) keys.push(key);
});
saveRoleMediaReadStore(store);
renderRoleUpdateBadgesForIC(window._roleUpdatesForIC || []);
if (keys.length && typeof google !== 'undefined' && google.script && google.script.run) {
google.script.run
.withSuccessHandler(function() {
try { refreshRoleUpdatesForIC(); } catch (e) {}
})
.withFailureHandler(function(err) {
})
.markRoleMediaReadForIC(roleType, keys, USER_NAME || 'IC');
}
}
function refreshRoleUpdatesForIC() {
if (typeof google === 'undefined' || !google.script || !google.script.run) return;
google.script.run
.withSuccessHandler(function(updates) {
updates = Array.isArray(updates) ? updates : [];
renderRoleUpdateBadgesForIC(updates);
})
.withFailureHandler(function(err) {
})
.getRoleUpdatesForIC(80);
}
function buildRoleUpdateListHtml(roleType) {
var updates = (window._roleUpdatesForIC || []).filter(function(u) {
var isMedia = u.updateType === 'media' || !!u.fileName;
var isNote = u.updateType === 'note' || !!u.note;
return (isMedia || isNote) && (roleType === 'all' || getRoleUpdateBucket(u.roleCode || u.source) === roleType);
});
if (!updates.length) return '';
return '<div style="margin-top:14px;text-align:left;">' +
'<div style="font-weight:900;color:#991b1b;margin-bottom:8px;">ข้อมูลใหม่จากกลุ่มนี้</div>' +
updates.slice(0, 8).map(function(u) {
var isMedia = u.updateType === 'media' || u.fileName;
var label = isMedia ? ('ไฟล์: ' + (u.fileName || '-')) : ('Note: ' + (u.note || '-'));
var reporter = u.reporter || '-';
var action = isMedia && (u.previewUrl || u.url) ? ' onclick="window.open(&quot;' + (u.previewUrl || u.url) + '&quot;,&quot;_blank&quot;)"' : '';
return '<div' + action + ' style="border:1px solid #fecaca;border-left:5px solid #ef4444;background:#fff7f7;border-radius:10px;padding:10px 12px;margin-bottom:8px;cursor:' + (isMedia ? 'pointer':'default') + ';">' +
'<div style="font-weight:900;color:#0f172a;">' + label + '</div>' +
'<div style="font-size:12px;color:#64748b;">จาก: ' + reporter + ' | ' + (u.time || '') + '</div>' +
'</div>';
}).join('') +
'</div>';
}
function buildRolePersonNoteHtml(roleType, person) {
var personName = String((person && person.name) || '').trim();
if (!personName) return '';
var notes = (window._roleUpdatesForIC || []).filter(function(u) {
var isNote = u.updateType === 'note' || !!u.note;
if (!isNote) return false;
if (roleType !== 'all' && getRoleUpdateBucket(u.roleCode || u.source) !== roleType) return false;
return String(u.reporter || '').trim() === personName;
});
if (!notes.length) return '';
var latest = notes[0];
return '<div style="margin-top:10px;border-left:4px solid #16a34a;background:#ecfdf5;border-radius:8px;padding:8px 10px;color:#14532d;">' +
'<div style="display:flex;justify-content:space-between;gap:8px;align-items:center;font-size:12px;font-weight:900;">' +
'<span>Note ล่าสุด ' + (latest.time || '') + '</span>' +
(!isRoleMediaRead(latest) ? '<span style="background:#ef4444;color:#fff;border-radius:999px;padding:2px 7px;font-size:11px;">ใหม่</span>' : '') +
'</div>' +
'<div style="font-size:14px;white-space:pre-wrap;">' + (latest.note || '-') + '</div>' +
'</div>';
}
function buildRolePersonMediaHtml(roleType, person) {
var personName = String((person && person.name) || '').trim();
if (!personName) return '';
var media = (window._roleUpdatesForIC || []).filter(function(u) {
var isMedia = u.updateType === 'media' || !!u.fileName;
if (!isMedia) return false;
if (roleType !== 'all' && getRoleUpdateBucket(u.roleCode || u.source) !== roleType) return false;
return String(u.reporter || '').trim() === personName;
});
if (!media.length) return '';
return '<div style="margin-top:10px;">' +
'<div style="font-size:12px;font-weight:900;color:#991b1b;margin-bottom:6px;">ไฟล์ที่ส่งจากคนนี้</div>' +
'<div style="display:flex;gap:8px;align-items:stretch;overflow-x:auto;overflow-y:hidden;padding:2px 2px 8px;-webkit-overflow-scrolling:touch;">' +
media.slice(0, 8).map(function(m) {
var isUnread = !isRoleMediaRead(m);
var openUrl = m.previewUrl || m.url || '';
var action = openUrl ? ' onclick="window.open(&quot;' + openUrl + '&quot;,&quot;_blank&quot;)"' : '';
var mime = String(m.mimeType || '').toLowerCase();
var icon = mime.indexOf('video') === 0 ? 'fa-video' : (mime.indexOf('audio') === 0 ? 'fa-volume-high' : 'fa-image');
return '<div' + action + ' title="' + (m.fileName || '-') + '" style="position:relative;min-width:118px;max-width:132px;border:1px solid ' + (isUnread ? '#fca5a5':'#cbd5e1') + ';background:' + (isUnread ? '#fff7f7':'#f8fafc') + ';border-radius:10px;padding:8px;cursor:' + (openUrl ? 'pointer':'default') + ';box-shadow:' + (isUnread ? '0 0 0 2px rgba(239,68,68,.08)':'none') + ';">' +
(isUnread ? '<span style="position:absolute;right:5px;top:5px;background:#ef4444;color:#fff;border-radius:999px;padding:1px 6px;font-size:10px;font-weight:900;">ใหม่</span>' : '') +
'<div style="display:flex;align-items:center;gap:7px;">' +
'<div style="width:34px;height:34px;border-radius:9px;background:' + (isUnread ? '#fee2e2':'#e2e8f0') + ';display:flex;align-items:center;justify-content:center;color:' + (isUnread ? '#dc2626':'#334155') + ';font-size:16px;flex-shrink:0;"><i class="fas ' + icon + '"></i></div>' +
'<div style="min-width:0;flex:1;">' +
'<div style="font-size:12px;font-weight:900;color:#0f172a;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">' + (m.fileName || '-') + '</div>' +
'<div style="font-size:10px;color:#64748b;margin-top:1px;white-space:nowrap;">' + (m.time || '') + '</div>' +
'</div>' +
'</div>' +
'</div>';
}).join('') +
'</div>' +
'</div>';
}
function sendSitrep(sendTelegram) {
var s = document.getElementById('sitrep_s').value || '-';
var m = document.getElementById('sitrep_m').value || '-';
var e = document.getElementById('sitrep_e').value || '-';
var a = document.getElementById('sitrep_a').value || '-';
if (!s && !m) {
Swal.fire('ข้อมูลไม่ครบ', 'กรุณากรอกอย่างน้อยส่วน S และ M', 'warning');
return;
}
var now = new Date().toLocaleString('th-TH', { hour12:false });
var sep = '--------------------';
var sitrepText = 'SITREP - EOC\n' + now + '\n' + sep +
'\n[S] สถานการณ์:\n' + s +
'\n\n[M] ภารกิจ:\n' + m +
'\n\n[E] การปฏิบัติ:\n' + e +
'\n\n[A] การบริหาร:\n' + a +
'\n' + sep;
var preview = document.getElementById('sitrep_preview_text');
var box = document.getElementById('sitrep_preview_box');
if (preview) preview.innerText = sitrepText;
if (box) box.style.display = 'block';
if (navigator.clipboard) navigator.clipboard.writeText(sitrepText).catch(function(){});
if (typeof google !== 'undefined' && google.script) {
Swal.fire({ title:'กำลังบันทึก SITREP...', allowOutsideClick:false, showConfirmButton:false, didOpen:function(){ Swal.showLoading(); } });
google.script.run
.withSuccessHandler(function() {
var hdrSitrep = document.getElementById('hdr_sitrep_time');
if (hdrSitrep) hdrSitrep.innerText = new Date().toLocaleTimeString('th-TH', {hour12:false, hour:'2-digit', minute:'2-digit'});
Swal.fire({ icon:'success', title:'สร้าง SITREP แล้ว', text:'ส่งไปยังการ์ดงานของแต่ละโรลแล้ว', timer:1700, showConfirmButton:false });
})
.withFailureHandler(function(err) {
Swal.fire('บันทึก SITREP ไม่สำเร็จ', err && err.message ? err.message : String(err), 'error');
})
.saveRoleSitrep(sitrepText, USER_NAME || 'IC');
} else {
Swal.fire({ icon:'success', title:'สร้าง SITREP แล้ว (Copy แล้ว)', timer:1500, showConfirmButton:false });
}
}
function buildLeadBadgeHtml(person) {
var personName = String((person && person.name) || '').trim();
if (!personName || !ICS_LEADS) return '';
var badges = [];
Object.keys(ICS_LEADS).forEach(function(sec) {
var lead = ICS_LEADS[sec] || {};
if (String(lead.name || '').trim() === personName) {
var label = getLeadSectionLabel(sec) || sec;
badges.push('<span style="display:inline-block;background:#fee2e2;color:#991b1b;border-radius:999px;padding:3px 10px;font-size:12px;font-weight:700;margin-right:5px;">⭐ หัวหน้า: ' + roleSafeText(label) + '</span>');
}
});
if (!badges.length) return '';
return '<div style="margin-top:6px;">' + badges.join('') + '</div>';
}
function buildCoordBadgesHtml(roleType, person) {
var personName = String((person && person.name) || '').trim();
if (!personName || !ICS_COORDS) return '';
var allCoords = [];
Object.keys(ICS_COORDS).forEach(function(sec) {
(ICS_COORDS[sec] || []).forEach(function(c) {
if (String(c.name || '').trim() === personName) allCoords.push(c);
});
});
if (!allCoords.length) return '';
return '<div style="margin-top:4px;">' +
allCoords.map(function(c) {
return '<span style="display:inline-block;background:#dbeafe;color:#1e40af;border-radius:999px;padding:3px 10px;font-size:12px;font-weight:700;margin-right:5px;">🤝 ผู้ประสาน: ' + roleSafeText(c.sectionLabel || c.sectionCode) + '</span>';
}).join('') +
'</div>';
}
function getOpsSubunitMeta(code) {
code = String(code || '').trim().toUpperCase();
if (code === 'MED') return { code:'MED', title:'หน่วยจัดการด้านสาธารณสุข', icon:'fa-heartbeat', color:'#16a34a' };
if (code === 'EVAC_POINT') return { code:'EVAC_POINT', title:'หน่วยปฏิบัติการ ณ จุดอพยพ', icon:'fa-person-shelter', color:'#2980b9' };
return { code:'OSC', title:'หน่วยบัญชาการ ณ จุดเกิดเหตุ', icon:'fa-shield-alt', color:'#e74c3c' };
}
function getOpsSubunitForPerson(person) {
var code = String((person && person.roleCode) || '').trim().toUpperCase();
if (code === 'MED' || code === 'EVAC_POINT' || code === 'OSC') return code;
var text = String((person && (person.role || person.location || person.name)) || '').toLowerCase();
if (text.indexOf('สาธารณสุข') !== -1 || text.indexOf('1669') !== -1 || text.indexOf('ems') !== -1) return 'MED';
if (text.indexOf('อพยพ') !== -1) return 'EVAC_POINT';
return 'OSC';
}
function buildOpsSubunitHeader(meta) {
var lead = (ICS_LEADS || {})[meta.code] || {};
var coords = (ICS_COORDS || {})[meta.code] || [];
var coordHtml = coords.length
? coords.map(function(c) { return '<span style="display:inline-block;background:#dbeafe;color:#1e40af;border-radius:999px;padding:3px 9px;font-size:12px;font-weight:800;margin:3px 4px 0 0;">ผู้ประสาน: ' + roleSafeText(c.name || '-') + '</span>'; }).join('')
: '<span style="display:inline-block;background:#f1f5f9;color:#64748b;border-radius:999px;padding:3px 9px;font-size:12px;font-weight:700;margin-top:3px;">ยังไม่มีผู้ประสาน</span>';
return '<div style="border-left:5px solid ' + meta.color + ';background:#ffffff;border:1px solid #e2e8f0;border-radius:12px;padding:11px 13px;margin-top:4px;">' +
'<div style="font-weight:900;color:#0f172a;font-size:16px;"><i class="fas ' + meta.icon + '" style="color:' + meta.color + ';margin-right:7px;"></i>' + meta.title + '</div>' +
'<div style="margin-top:6px;"><span style="display:inline-block;background:#fee2e2;color:#991b1b;border-radius:999px;padding:3px 9px;font-size:12px;font-weight:800;">หัวหน้า: ' + roleSafeText(lead.name || 'ยังไม่แต่งตั้ง') + '</span></div>' +
'<div style="margin-top:3px;">' + coordHtml + '</div>' +
'</div>';
}
function buildStaffPersonCard(roleType, p) {
var noteHtml = buildRolePersonNoteHtml(roleType, p);
var mediaHtml = buildRolePersonMediaHtml(roleType, p);
var leadBadge = buildLeadBadgeHtml(p);
var coordBadges = buildCoordBadgesHtml(roleType, p);
return '<div style="border:1px solid #cbd5e1;border-radius:10px;padding:12px 14px;background:#f8fafc;">' +
'<div style="font-weight:900;color:#0f172a;font-size:18px;"><i class="fas fa-user" style="color:#2563eb;margin-right:8px;"></i>' + (p.name || '-') + '</div>' +
leadBadge +
coordBadges +
'<div style="font-size:15px;color:#334155;margin-top:6px;">จาก/หน่วยงาน: ' + (p.role || '-') + '</div>' +
'<div style="font-size:15px;color:#334155;">สถานะ: ' + (p.location === 'Logged In' ? '<span style="color:#16a34a;font-weight:700;">● พร้อมปฏิบัติงาน</span>' : (p.location || '-')) + '</div>' +
'<div style="font-size:15px;color:#334155;">เวลารายงานตัว: <b>' + (p.time ? p.time.replace('T',' ').substring(0,19).split('+')[0].split('.')[0].slice(-8) : '-') + '</b></div>' +
'<div style="font-size:15px;color:#334155;">โทร: ' + (p.phone || '-') + '</div>' +
noteHtml +
mediaHtml +
'</div>';
}
function buildOpsGroupedStaffHtml(people) {
var order = ['OSC','MED','EVAC_POINT'];
var grouped = { OSC:[], MED:[], EVAC_POINT:[] };
(people || []).forEach(function(p) {
grouped[getOpsSubunitForPerson(p)].push(p);
});
return '<div style="text-align:left;display:grid;gap:12px;">' + order.map(function(code) {
var meta = getOpsSubunitMeta(code);
var body = grouped[code].length
? grouped[code].map(function(p) { return buildStaffPersonCard('ops', p); }).join('')
: '<div style="border:1px dashed #cbd5e1;border-radius:10px;padding:12px;color:#94a3b8;text-align:center;">ยังไม่มีผู้รายงานตัวในหน่วยนี้</div>';
return '<div style="display:grid;gap:8px;">' + buildOpsSubunitHeader(meta) + body + '</div>';
}).join('') + '</div>';
}
function showStaffList(roleType) {
roleType = roleType || 'all';
Swal.fire({ title: 'กำลังโหลดรายชื่อ...', didOpen: function() { Swal.showLoading(); } });
try {
google.script.run.withSuccessHandler(function(leads) { ICS_LEADS = leads || {}; }).getICSLeads();
google.script.run.withSuccessHandler(function(coords) { ICS_COORDS = coords || {}; }).getICSCoords();
} catch(e) {}
google.script.run
.withSuccessHandler(function(list) {
list = list || [];
var people = list;
var html = '';
if (!people.length) {
html = '<div style="color:#64748b;text-align:center;padding:18px;font-size:16px;">ยังไม่มีผู้รายงานตัวในกลุ่มนี้</div>';
} else if (roleType === 'ops') {
html = buildOpsGroupedStaffHtml(people);
} else {
html = '<div style="text-align:left;display:grid;gap:10px;">' + people.map(function(p) { return buildStaffPersonCard(roleType, p); }).join('') + '</div>';
}
Swal.fire({
title: 'รายชื่อทีม ' + getAttendanceRoleTitle(roleType),
html: html,
width: 640,
confirmButtonText: 'ปิด',
confirmButtonColor: '#34495e',
didOpen: function() { markRoleMediaRead(roleType); }
}).then(function() {
markRoleMediaRead(roleType);
});
})
.withFailureHandler(function(err) {
Swal.fire('โหลดรายชื่อไม่ได้', err && err.message ? err.message : String(err), 'error');
})
.getAttendanceListByRole(roleType);
}
setInterval(function() {
var dash = document.getElementById('scene_Dashboard');
if (dash && dash.style.display !== 'none') {
try { hideICDuplicateOCPanels(); } catch (e) { }
try { refreshAttendanceCountsFast(); } catch (e) { }
try { refreshFieldMediaReports(); } catch (e) { }
try { refreshRoleUpdatesForIC(); } catch (e) { }
}
var oc = document.getElementById('scene_OC');
if (oc && oc.style.display !== 'none' && typeof refreshOCData === 'function') {
try { refreshOCData(); } catch (e) { }
}
}, 15000);
setTimeout(function() {
try { refreshAttendanceCountsFast(); } catch (e) { }
try { refreshOCResourcesDirect(); } catch (e) { }
try { refreshRoleUpdatesForIC(); } catch (e) { }
}, 1200);
