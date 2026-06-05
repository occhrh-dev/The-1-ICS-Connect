// ==========================================
// 🚨 EMERGENCY WAR ROOM (Standalone System)
// ==========================================

// 🔗 เชื่อมต่อกับ Google Sheet ฐานข้อมูล
var SSID = "1oYWeQnLhyu2N_2LgNmOMn7GKb-bCpyFHqZyLZyzfMd0"; 
var AGENCY_MASTER_SSID = "1mmiZSz62l45-BsUGchc1lFWLlUNrztORmslr78NwUaE";

var CACHE_TTL = 10;
var CACHE_TTL_CONFIG = 15;
function _cacheGet_(key) {
  try { var c = CacheService.getScriptCache(); var v = c.get(key); return v ? JSON.parse(v) : null; } catch(e) { return null; }
}
function _cachePut_(key, value, ttl) {
  try { CacheService.getScriptCache().put(key, JSON.stringify(value), ttl || CACHE_TTL); } catch(e) {}
}
function _cacheRemove_(key) {
  try { CacheService.getScriptCache().remove(key); } catch(e) {}
}
function _cacheRemoveAll_() {
  try { CacheService.getScriptCache().removeAll(['eoc_config','eoc_triage','eoc_ics_leads','eoc_ics_coords','eoc_evac_points']); } catch(e) {}
}
function _configCacheKey_() {
  return 'eoc_config_' + String(SSID || '').replace(/[^\w-]/g, '_');
}

var PUBLIC_APP_URL = "https://script.google.com/macros/s/AKfycby744ojH0mOoBNaVlc2wwdXerZQY6sbODFA3UQDzhJVVLutPt3SVl60hTE2BywHo7jQ/exec"; // TODO: เปลี่ยนกลับเป็น cloudflare เมื่อ setup redirect ?join= แล้ว

// ==========================================
// 🌐 Zone: WEB APP & HTML TEMPLATE
// ==========================================

function doGet(e) {
  var template = HtmlService.createTemplateFromFile('index');
  template.viewMode = e && e.parameter ? (e.parameter.view || e.parameter.mode || '') : '';
  template.joinToken = e && e.parameter ? (e.parameter.join || '') : '';
  return template
    .evaluate()
    .setTitle('The 1 ICS Connect')
    .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL)
    .addMetaTag('viewport', 'width=device-width, initial-scale=1');
}

function include(filename) {
  return HtmlService.createHtmlOutputFromFile(filename).getContent();
}

function getDashboardViewUrl() {
  var url = PUBLIC_APP_URL || ScriptApp.getService().getUrl();
  if (!url) return '';
  return url + (url.indexOf('?') === -1 ? '?' : '&') + 'view=dashboard';
}

function getEOCCallStatus() {
  var props = PropertiesService.getScriptProperties();
  var raw = props.getProperty('EOC_CALL_STATUS');
  var configuredRoom = _getCurrentVideoRoomName_();
  if (!raw) return { busy: false, callerName: '', callerRole: '', roomName: configuredRoom };
  try {
    var status = JSON.parse(raw);
    return {
      busy: !!status.busy,
      callerName: status.callerName || '',
      callerRole: status.callerRole || '',
      roomName: status.roomName || configuredRoom,
      startedAt: status.startedAt || ''
    };
  } catch (e) {
    props.deleteProperty('EOC_CALL_STATUS');
    return { busy: false, callerName: '', callerRole: '', roomName: configuredRoom };
  }
}

function _safeVideoRoomPart_(value) {
  return String(value || 'EOC')
    .replace(/[^\w\u0E00-\u0E7F]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 60) || 'EOC';
}

function _makeVideoRoomName_(evtName) {
  return 'EOC_' + Utilities.formatDate(new Date(), 'GMT+7', 'yyyyMMdd_HHmm') + '_' + _safeVideoRoomPart_(evtName);
}

function _getCurrentVideoRoomName_() {
  var config = _getConfigMap();
  return String(config['VideoRoomName'] || '').trim();
}

function setEOCCallBusy(callerName, callerRole) {
  var lock = LockService.getScriptLock();
  lock.waitLock(5000);
  try {
    var current = getEOCCallStatus();
    if (current.busy) return { ok: false, busy: true, roomName: current.roomName, callerName: current.callerName, callerRole: current.callerRole };
    var roomName = _getCurrentVideoRoomName_() || _makeVideoRoomName_('CALL');
    var status = {
      busy: true,
      callerName: callerName || 'ไม่ระบุ',
      callerRole: callerRole || '-',
      roomName: roomName,
      startedAt: new Date().toISOString()
    };
    PropertiesService.getScriptProperties().setProperty('EOC_CALL_STATUS', JSON.stringify(status));
    return { ok: true, busy: true, roomName: roomName, callerName: status.callerName, callerRole: status.callerRole };
  } finally {
    lock.releaseLock();
  }
}

function setEOCCallFree() {
  PropertiesService.getScriptProperties().deleteProperty('EOC_CALL_STATUS');
  return { ok: true, busy: false };
}

function ensureResourceIncomingSchema_() {
  var ss = SpreadsheetApp.openById(SSID);
  var sheet = ss.getSheetByName("Resource_Incoming");
  if (!sheet) sheet = ss.insertSheet("Resource_Incoming");
  var requiredHeaders = [
    "Timestamp","ResourceType","ResourceName","Quantity",
    "FromAgency","ETA","Status","Note","LoggedBy","PersonnelCount"
  ];
  var lastCol = Math.max(sheet.getLastColumn(), requiredHeaders.length);
  var current = sheet.getRange(1, 1, 1, lastCol).getValues()[0];
  requiredHeaders.forEach(function(header, index) {
    if (current[index] !== header) {
      sheet.getRange(1, index + 1).setValue(header);
    }
  });
  sheet.getRange(1, 1, 1, requiredHeaders.length)
    .setFontWeight('bold')
    .setBackground('#c0392b')
    .setFontColor('#ffffff');
}

function ensureMediaReportsSchema_() {
  var ss = SpreadsheetApp.openById(SSID);
  var sheet = ss.getSheetByName("Media_Reports");
  if (!sheet) {
    sheet = ss.insertSheet("Media_Reports");
    sheet.appendRow(["Timestamp","Source","Reporter","FileName","MimeType","FileURL","FileID","Note"]);
  }
  var requiredHeaders = ["Timestamp","Source","Reporter","FileName","MimeType","FileURL","FileID","Note"];
  var lastCol = Math.max(sheet.getLastColumn(), requiredHeaders.length);
  var current = sheet.getRange(1, 1, 1, lastCol).getValues()[0];
  requiredHeaders.forEach(function(header, index) {
    if (current[index] !== header) {
      sheet.getRange(1, index + 1).setValue(header);
    }
  });
  sheet.getRange(1, 1, 1, requiredHeaders.length)
    .setFontWeight('bold')
    .setBackground('#c0392b')
    .setFontColor('#ffffff');
  return sheet;
}

function ensureRoleNotesSchema_() {
  var ss = SpreadsheetApp.openById(SSID);
  var sheet = ss.getSheetByName("Role_Notes");
  if (!sheet) {
    sheet = ss.insertSheet("Role_Notes");
    sheet.appendRow(["Timestamp","RoleCode","RoleLabel","Reporter","Phone","Note","Status"]);
  }
  var requiredHeaders = ["Timestamp","RoleCode","RoleLabel","Reporter","Phone","Note","Status"];
  var lastCol = Math.max(sheet.getLastColumn(), requiredHeaders.length);
  var current = sheet.getRange(1, 1, 1, lastCol).getValues()[0];
  requiredHeaders.forEach(function(header, index) {
    if (current[index] !== header) {
      sheet.getRange(1, index + 1).setValue(header);
    }
  });
  sheet.getRange(1, 1, 1, requiredHeaders.length)
    .setFontWeight('bold')
    .setBackground('#c0392b')
    .setFontColor('#ffffff');
  return sheet;
}

function ensureRoleSitrepSchema_() {
  var ss = SpreadsheetApp.openById(SSID);
  var sheet = ss.getSheetByName("Role_SITREP");
  if (!sheet) {
    sheet = ss.insertSheet("Role_SITREP");
    sheet.appendRow(["Timestamp","Text","CreatedBy"]);
  }
  var requiredHeaders = ["Timestamp","Text","CreatedBy"];
  var lastCol = Math.max(sheet.getLastColumn(), requiredHeaders.length);
  var current = sheet.getRange(1, 1, 1, lastCol).getValues()[0];
  requiredHeaders.forEach(function(header, index) {
    if (current[index] !== header) sheet.getRange(1, index + 1).setValue(header);
  });
  sheet.getRange(1, 1, 1, requiredHeaders.length)
    .setFontWeight('bold')
    .setBackground('#c0392b')
    .setFontColor('#ffffff');
  return sheet;
}

function ensureRoleMediaReadsSchema_() {
  var ss = SpreadsheetApp.openById(SSID);
  var sheet = ss.getSheetByName("Role_Media_Reads");
  if (!sheet) {
    sheet = ss.insertSheet("Role_Media_Reads");
    sheet.appendRow(["Timestamp","RoleCode","ReadKey","ReadBy"]);
  }
  var requiredHeaders = ["Timestamp","RoleCode","ReadKey","ReadBy"];
  var lastCol = Math.max(sheet.getLastColumn(), requiredHeaders.length);
  var current = sheet.getRange(1, 1, 1, lastCol).getValues()[0];
  requiredHeaders.forEach(function(header, index) {
    if (current[index] !== header) sheet.getRange(1, index + 1).setValue(header);
  });
  sheet.getRange(1, 1, 1, requiredHeaders.length)
    .setFontWeight('bold')
    .setBackground('#c0392b')
    .setFontColor('#ffffff');
  return sheet;
}

function ensureICSLeadsSchema_() {
  var ss = SpreadsheetApp.openById(SSID);
  var sheet = ss.getSheetByName("ICS_Leads");
  if (!sheet) {
    sheet = ss.insertSheet("ICS_Leads");
    sheet.appendRow(["Timestamp","RoleCode","RoleLabel","LeadName","Agency","Phone","AssignedBy"]);
  }
  var requiredHeaders = ["Timestamp","RoleCode","RoleLabel","LeadName","Agency","Phone","AssignedBy"];
  var lastCol = Math.max(sheet.getLastColumn(), requiredHeaders.length);
  if (sheet.getLastRow() < 1) sheet.appendRow(requiredHeaders);
  var current = sheet.getRange(1, 1, 1, lastCol).getValues()[0];
  requiredHeaders.forEach(function(header, index) {
    if (current[index] !== header) sheet.getRange(1, index + 1).setValue(header);
  });
  sheet.getRange(1, 1, 1, requiredHeaders.length)
    .setFontWeight('bold')
    .setBackground('#c0392b')
    .setFontColor('#ffffff');
  return sheet;
}
function ensureICSCoordsSchema_() {
  var ss = SpreadsheetApp.openById(SSID);
  var sheet = ss.getSheetByName("ICS_Coords");
  if (!sheet) {
    sheet = ss.insertSheet("ICS_Coords");
    sheet.appendRow(["Timestamp","SectionCode","SectionLabel","SlotNo","CoordName","Agency","Phone","AssignedBy"]);
  }
  var requiredHeaders = ["Timestamp","SectionCode","SectionLabel","SlotNo","CoordName","Agency","Phone","AssignedBy"];
  var lastCol = Math.max(sheet.getLastColumn(), requiredHeaders.length);
  var current = sheet.getRange(1, 1, 1, lastCol).getValues()[0];
  requiredHeaders.forEach(function(header, index) {
    if (current[index] !== header) sheet.getRange(1, index + 1).setValue(header);
  });
  sheet.getRange(1, 1, 1, requiredHeaders.length)
    .setFontWeight('bold').setBackground('#c0392b').setFontColor('#ffffff');
  return sheet;
}
function ensureStaffAttendanceSchema_() {
  var ss = SpreadsheetApp.openById(SSID);
  var sheet = ss.getSheetByName("Staff_Attendance");
  if (!sheet) return null;
  var requiredHeaders = ["Timestamp","Name","Role","Location","Status","Phone","RoleCode"];
  var lastCol = Math.max(sheet.getLastColumn(), requiredHeaders.length);
  if (sheet.getLastRow() < 1) sheet.appendRow(requiredHeaders);
  var current = sheet.getRange(1, 1, 1, lastCol).getValues()[0];
  requiredHeaders.forEach(function(header, index) {
    if (current[index] !== header) {
      sheet.getRange(1, index + 1).setValue(header);
    }
  });
  sheet.getRange(1, 1, 1, requiredHeaders.length)
    .setFontWeight('bold')
    .setBackground('#c0392b')
    .setFontColor('#ffffff');
  if (sheet.getMaxRows() > 1) {
    sheet.getRange(2, 6, sheet.getMaxRows() - 1, 1).setNumberFormat('@');
  }
  return sheet;
}

function ensureZoneMarkersSchema_() {
  var ss = SpreadsheetApp.openById(SSID);
  var sheet = ss.getSheetByName("Zone_Markers");
  if (!sheet) return null;
  var requiredHeaders = ["Timestamp","ZoneType","Label","Lat","Lng","Note","LoggedBy","Phone"];
  var lastCol = Math.max(sheet.getLastColumn(), requiredHeaders.length);
  if (sheet.getLastRow() < 1) sheet.appendRow(requiredHeaders);
  var current = sheet.getRange(1, 1, 1, lastCol).getValues()[0];
  requiredHeaders.forEach(function(header, index) {
    if (current[index] !== header) {
      sheet.getRange(1, index + 1).setValue(header);
    }
  });
  sheet.getRange(1, 1, 1, requiredHeaders.length)
    .setFontWeight('bold')
    .setBackground('#c0392b')
    .setFontColor('#ffffff');
  if (sheet.getMaxRows() > 1) {
    sheet.getRange(2, 8, sheet.getMaxRows() - 1, 1).setNumberFormat('@');
  }
  return sheet;
}

function _normalizePhone_(phone) {
  var value = String(phone || '').trim().replace(/^'/, '');
  if (!value) return '';
  value = value.replace(/[^\d+]/g, '');
  if (/^\d{9}$/.test(value)) return '0' + value;
  return value;
}

function _findLatestStaffPhone_(name) {
  var target = String(name || '').trim();
  if (!target) return '';
  var sheet = ensureStaffAttendanceSchema_();
  if (!sheet || sheet.getLastRow() < 2) return '';
  var data = sheet.getRange(2, 1, sheet.getLastRow() - 1, Math.max(sheet.getLastColumn(), 7)).getValues();
  for (var i = data.length - 1; i >= 0; i--) {
    if (String(data[i][1] || '').trim() === target) {
      return _normalizePhone_(data[i][5]);
    }
  }
  return '';
}

function _clearDataRows_(sheetName) {
  var ss = SpreadsheetApp.openById(SSID);
  var sheet = ss.getSheetByName(sheetName);
  if (!sheet) return;
  var lastRow = sheet.getLastRow();
  if (lastRow > 1) sheet.deleteRows(2, lastRow - 1);
}

function _resetIncidentOperationalData_() {
  [
    "Triage_Data",
    "Incident_Logs",
    "Live_Locations",
    "Staff_Attendance",
    "Exposure_Log",
    "Resource_Incoming",
    "Task_List",
    "OC_SitReport",
    "Field_Casualty_Report",
    "Support_Request",
    "Media_Reports",
    "Zone_Markers",
    "ICS_Leads",
    "ICS_Coords", 
    "Role_Notes",
    "Role_SITREP",
    "Role_Media_Reads",
    "Patient_Transfer",
    "Health_Units",
    "Evacuation_Points"
  ].forEach(_clearDataRows_);
  ensureResourceIncomingSchema_();
  ensureMediaReportsSchema_();
  ensureICSLeadsSchema_();
  ensureStaffAttendanceSchema_();
  ensureZoneMarkersSchema_();
  ensureICSCoordsSchema_();
  ensureRoleNotesSchema_();
  ensureRoleSitrepSchema_();
  ensureRoleMediaReadsSchema_();
}

function _formatDateSafe_(value, pattern) {
  if (!value) return '';
  if (Object.prototype.toString.call(value) === '[object Date]' && !isNaN(value.getTime())) {
    return Utilities.formatDate(value, "GMT+7", pattern);
  }
  var parsed = new Date(value);
  if (!isNaN(parsed.getTime())) {
    return Utilities.formatDate(parsed, "GMT+7", pattern);
  }
  return String(value);
}

// ==========================================
// 🛠️ Zone: จัดการ Config & สถานะระบบ
// ==========================================

function getEmergencyState() {
  ensureResourceIncomingSchema_();
  var config = _getConfigMap();

  var triageSummary = getMedicalTriageSummary_();
  var triageData = triageSummary.totals;

  var fieldCasualty = getLatestFieldCasualtyReport();

  var startTimeStr = null;
  if (config['StartTime']) {
    var tDate = new Date(config['StartTime']);
    if (!isNaN(tDate.getTime())) startTimeStr = tDate.toISOString(); 
  }

  return {
    status:    config['CurrentStatus']    || 'Normal',
    evtName:   config['IncidentName']     || config['BroadcastMsg'] || '-',
    evtLoc:    config['IncidentLocation'] || '-',
    evtCoords: config['IncidentCoords']   || '', 
    evtPlan:   config['PlanInfo']         || '-',
    evtEOC:    config['EOCLocation']      || '-',
    evtEOCCoords: String(config['EOCCoords'] || '').trim(),
    commanderName: config['CommanderName'] || config['IncidentCommander'] || config['Incident_Commander'] || config['Commander'] || config['IC_Name'] || '-',
    commanderPosition: config['CommanderPosition'] || '',
    registeredICName: String(config['RegisteredICName'] || '').trim(),
    registeredICPosition: String(config['RegisteredICPosition'] || '').trim(),
    joinToken: String(config['JoinToken'] || '').trim(),
    joinUrl: String(config['JoinToken'] || '').trim() ? _buildJoinUrl_(String(config['JoinToken'] || '').trim()) : '',
    icsLeads: _safeOCData_(getICSLeads, {}),
    icsCoords: _safeOCData_(getICSCoords, {}), 
    triage:    triageData,
    triageDetails: triageSummary.details,
    fieldCasualty: fieldCasualty,
    evacuationPoints: _safeOCData_(getEvacuationPoints, []),
    wind: {
      mode: config['Wind_Mode'] || 'manual',
      directionDeg: config['Wind_Direction_Deg'] === '' || config['Wind_Direction_Deg'] == null ? null : Number(config['Wind_Direction_Deg']),
      speed: config['Wind_Speed_MS'] === '' || config['Wind_Speed_MS'] == null ? null : Number(config['Wind_Speed_MS']),
      source: config['Wind_Source'] || '',
      updatedBy: config['Wind_UpdatedBy'] || '',
      updatedAt: config['Wind_UpdatedAt'] ? _formatDateSafe_(config['Wind_UpdatedAt'], "dd/MM HH:mm") : '',
      pending: config['Wind_Pending_Direction_Deg'] === '' || config['Wind_Pending_Direction_Deg'] == null ? null : {
        directionDeg: Number(config['Wind_Pending_Direction_Deg']),
        speed: Number(config['Wind_Pending_Speed_MS']) || 0,
        source: config['Wind_Pending_Source'] || 'OC',
        updatedBy: config['Wind_Pending_UpdatedBy'] || '',
        updatedAt: config['Wind_Pending_UpdatedAt'] ? _formatDateSafe_(config['Wind_Pending_UpdatedAt'], "dd/MM HH:mm") : ''
      }
    },
    timestamp: startTimeStr 
  };
}

function getEmergencyStateLite() {
  var config = _getConfigMap();
  var startTimeStr = null;
  if (config['StartTime']) {
    var tDate = new Date(config['StartTime']);
    if (!isNaN(tDate.getTime())) startTimeStr = tDate.toISOString();
  }
  return {
    status:    config['CurrentStatus']    || 'Normal',
    evtName:   config['IncidentName']     || config['BroadcastMsg'] || '-',
    evtLoc:    config['IncidentLocation'] || '-',
    evtCoords: config['IncidentCoords']   || '',
    evtPlan:   config['PlanInfo']         || '-',
    evtEOC:    config['EOCLocation']      || '-',
    evtEOCCoords: String(config['EOCCoords'] || '').trim(),
    commanderName: config['CommanderName'] || config['IncidentCommander'] || config['Incident_Commander'] || config['Commander'] || config['IC_Name'] || '-',
    commanderPosition: config['CommanderPosition'] || '',
    registeredICName: String(config['RegisteredICName'] || '').trim(),
    registeredICPosition: String(config['RegisteredICPosition'] || '').trim(),
    joinToken: String(config['JoinToken'] || '').trim(),
    joinUrl: String(config['JoinToken'] || '').trim() ? _buildJoinUrl_(String(config['JoinToken'] || '').trim()) : '',
    icsLeads: _safeOCData_(getICSLeads, {}),
    icsCoords: _safeOCData_(getICSCoords, {}),
    triage: { red:0, yellow:0, green:0, black:0, onsite:0 },
    triageDetails: [],
    fieldCasualty: { totalEstimate:0, stillInArea:0, evacuatedOrSent:0, note:'', loggedBy:'', time:'' },
    evacuationPoints: _safeOCData_(getEvacuationPoints, []),
    wind: {
      mode: config['Wind_Mode'] || 'manual',
      directionDeg: null,
      speed: null,
      source: '',
      updatedBy: '',
      updatedAt: '',
      pending: null
    },
    timestamp: startTimeStr
  };
}

function _getConfigMap() {
  var cached = _cacheGet_(_configCacheKey_());
  if (cached) return cached;
  var ss = SpreadsheetApp.openById(SSID);
  var sheet = ss.getSheetByName("Config");
  if (!sheet) return {};
  var data = sheet.getDataRange().getValues();
  var config = {};
  for (var i = 1; i < data.length; i++) {
    var key = String(data[i][0] || '').trim();
    if (key) config[key] = data[i][1];
  }
  _cachePut_(_configCacheKey_(), config, CACHE_TTL_CONFIG);
  return config;
}

function ensureBroadcastEventsSchema_() {
  var ss = SpreadsheetApp.openById(SSID);
  var sheet = ss.getSheetByName("Broadcast_Events");
  if (!sheet) {
    sheet = ss.insertSheet("Broadcast_Events");
    sheet.appendRow(["Timestamp","Type","Title","Message","Plan","IncidentName","IncidentLocation","CreatedBy"]);
  }
  var requiredHeaders = ["Timestamp","Type","Title","Message","Plan","IncidentName","IncidentLocation","CreatedBy"];
  var lastCol = Math.max(sheet.getLastColumn(), requiredHeaders.length);
  var current = sheet.getRange(1, 1, 1, lastCol).getValues()[0];
  requiredHeaders.forEach(function(header, index) {
    if (current[index] !== header) sheet.getRange(1, index + 1).setValue(header);
  });
  sheet.getRange(1, 1, 1, requiredHeaders.length)
    .setFontWeight('bold')
    .setBackground('#1f2937')
    .setFontColor('#ffffff');
  return sheet;
}

function ensureAgenciesSchema_() {
  var ss = SpreadsheetApp.openById(AGENCY_MASTER_SSID || SSID);
  var sheet = ss.getSheetByName("Agencies");
  var requiredHeaders = ["AgencyId","AgencyName","Password","Role","DeviceId","Status","ExpiresAt","DeviceBoundAt","LastLogin","LineGroupId","SheetId","Tier","TrialLimit","LoginCount","JoinToken","CurrentSheetId"];
  if (!sheet) {
    sheet = ss.insertSheet("Agencies");
    sheet.appendRow(requiredHeaders);
  }
  var lastCol = Math.max(sheet.getLastColumn(), requiredHeaders.length);
  var current = sheet.getRange(1, 1, 1, lastCol).getValues()[0];
  requiredHeaders.forEach(function(header, index) {
    if (current[index] !== header) sheet.getRange(1, index + 1).setValue(header);
  });
  sheet.getRange(1, 1, 1, requiredHeaders.length)
    .setFontWeight('bold')
    .setBackground('#0f172a')
    .setFontColor('#ffffff');
  return sheet;
}

// ============================================================
// 🎚️ Tier System (3 ระดับสิทธิ์)
// ============================================================
var TIER_CONFIG = {
  '1': {
    name: 'ตอบสนองพื้นฐาน',
    description: 'อบต. / อปพร. / บุคลากร <50 คน',
    maxTasks: 20,
    maxZones: 3,
    maxAccounts: 3,
    features: {
      // 🟢 บทบาท ICS — Tier 1 เข้าได้ครบทุกกล่อง (ทุกคน ไม่จำกัดจำนวน)
      role_ic: true, role_oc: true, role_field: true,
      role_jic: true, role_liaison: true, role_specialist: true,
      role_logistics: true, role_planning: true, role_finance: true,
      role_med: true, role_evac_point: true,
      // 🟢 งานพื้นฐานที่ทุกระดับต้องมี
      ic_dashboard: true, attendance: true, evacuation_point: true,
      // 🔒 เครื่องมือขั้นสูงในแต่ละ scene — ปลดล็อคที่ Tier 2
      dashboard_realtime: false,
      erg: false, broadcast: false, support_request: false,
      live_location: false, media_upload: false, casualty_report: false,
      triage: false, hospital_capacity: false, line_notify: false, share_link: false,
      // 🔒 ความสามารถระดับบัญชาการ — ปลดล็อคที่ Tier 3
      multi_incident: false, unified_command: false,
      eoc_video_call: false, multi_agency_zones: false,
      multi_hospital: false, decon_tracking: false, ambulance_tracking: false,
      mci: false, agency_master_sheet: false, line_multi_groups: false,
      device_binding: false, custom_expiry: false, api_integration: false
    }
  },
  '2': {
    name: 'ตอบสนองขั้นสูง',
    description: 'เทศบาล / อำเภอ / จังหวัด / บุคลากร 50-200 คน',
    maxTasks: -1,
    maxZones: 10,
    maxAccounts: 20,
    features: {
      role_ic: true, role_oc: true, role_field: true,
      role_jic: true, role_liaison: true, role_specialist: true,
      role_logistics: true, role_planning: true, role_finance: true,
      role_med: true, role_evac_point: true,
      dashboard_realtime: true, ic_dashboard: true,
      erg: true, broadcast: true, support_request: true,
      evacuation_point: true, attendance: true,
      live_location: true, media_upload: true, casualty_report: true,
      triage: true, hospital_capacity: true, line_notify: true, share_link: true,
      multi_incident: false, unified_command: false,
      eoc_video_call: false, multi_agency_zones: false,
      multi_hospital: false, decon_tracking: false, ambulance_tracking: false,
      mci: false, agency_master_sheet: false, line_multi_groups: false,
      device_binding: false, custom_expiry: false, api_integration: false
    }
  },
  '3': {
    name: 'บัญชาการระดับสูง',
    description: 'กรม / กระทรวง / ศูนย์ ปภ. / บุคลากร 200+ คน',
    maxTasks: -1,
    maxZones: -1,
    maxAccounts: -1,
    features: {
      role_ic: true, role_oc: true, role_field: true,
      role_jic: true, role_liaison: true, role_specialist: true,
      role_logistics: true, role_planning: true, role_finance: true,
      role_med: true, role_evac_point: true,
      dashboard_realtime: true, ic_dashboard: true,
      erg: true, broadcast: true, support_request: true,
      evacuation_point: true, attendance: true,
      live_location: true, media_upload: true, casualty_report: true,
      triage: true, hospital_capacity: true, line_notify: true, share_link: true,
      multi_incident: true, unified_command: true,
      eoc_video_call: true, multi_agency_zones: true,
      multi_hospital: true, decon_tracking: true, ambulance_tracking: true,
      mci: true, agency_master_sheet: true, line_multi_groups: true,
      device_binding: true, custom_expiry: true, api_integration: true
    }
  }
};

function _normalizeTier_(tier) {
  var t = String(tier == null ? '' : tier).trim();
  if (t === '1' || t === '2' || t === '3') return t;
  return '2'; // backward compatible default
}

function getTierConfig(tier) {
  var t = _normalizeTier_(tier);
  return TIER_CONFIG[t];
}

/**
 * 🔒 ดึง tier ของ agency จาก AGENCY_MASTER_SSID โดยตรง
 * Architecture: tier ผูกกับ agencyId ซึ่ง lookup จาก master sheet ที่คุณควบคุมคนเดียว
 * Agency ไม่มีสิทธิ์แก้ master sheet → ไม่สามารถเปลี่ยน tier ตัวเองได้
 */
function _getIncidentAgencyIdSecure_() { return ''; } // ไม่ใช้แล้ว — tier ดึงจาก agencyId ตรง ๆ

function getTierConfigForAgency(agencyId) {
  var tier = getAgencyTier_(agencyId);
  var cfg = TIER_CONFIG[tier] || null;
  return { tier: tier, tierName: cfg ? cfg.name : '', tierConfig: cfg };
}

function getAllTiersInfo() {
  return ['1','2','3'].map(function(t) {
    var c = TIER_CONFIG[t];
    return {
      tier: t,
      name: c.name,
      description: c.description,
      maxTasks: c.maxTasks,
      maxZones: c.maxZones,
      maxAccounts: c.maxAccounts
    };
  });
}

function getAgencyTier_(agencyId) {
  agencyId = String(agencyId || '').trim();
  if (!agencyId) return '2';
  var sheet = ensureAgenciesSchema_();
  var lastRow = sheet.getLastRow();
  if (lastRow < 2) return '2';
  var values = sheet.getRange(2, 1, lastRow - 1, 12).getValues();
  for (var i = 0; i < values.length; i++) {
    if (String(values[i][0] || '').trim() === agencyId) {
      return _normalizeTier_(values[i][11]);
    }
  }
  return '2';
}

/**
 * 🔒 Resolve agencyId สำหรับ tier check
 * Architecture นี้: แต่ละ agency มี sheet ของตัวเอง → ใช้ agencyId ที่ส่งมากับ request
 * Tier lookup จาก AGENCY_MASTER_SSID (คุณควบคุมคนเดียว — agency แก้ไม่ได้)
 */
function _resolveTierAgencyId_(agencyId) {
  return String(agencyId || '').trim();
}

function checkTierFeature(agencyId, featureName) {
  var effectiveAgencyId = _resolveTierAgencyId_(agencyId);
  var tier = getAgencyTier_(effectiveAgencyId);
  var cfg = getTierConfig(tier);
  if (!cfg || !cfg.features) return false;
  return !!cfg.features[featureName];
}

function _requireTierFeature_(agencyId, featureName, featureLabel) {
  if (!checkTierFeature(agencyId, featureName)) {
    var tier = getAgencyTier_(agencyId);
    throw new Error('ฟีเจอร์ "' + (featureLabel || featureName) + '" ไม่รองรับใน Tier ' + tier + ' กรุณาอัปเกรดแพ็กเกจ');
  }
}

function _countTasksForAgency_(agencyId) {
  var ss = SpreadsheetApp.openById(SSID);
  var sheet = ss.getSheetByName("Task_List");
  if (!sheet) return 0;
  var lastRow = sheet.getLastRow();
  if (lastRow < 2) return 0;
  return lastRow - 1;
}

function _countZonesForAgency_(agencyId) {
  var ss = SpreadsheetApp.openById(SSID);
  var sheet = ss.getSheetByName("Zone_Markers");
  if (!sheet) return 0;
  var lastRow = sheet.getLastRow();
  if (lastRow < 2) return 0;
  return lastRow - 1;
}

function updateAgencyTier(agencyId, newTier, accessRole) {
  _requireAdmin(accessRole);
  var safeTier = _normalizeTier_(newTier);
  var safeId = String(agencyId || '').trim();
  if (!safeId) throw new Error('ไม่พบรหัสหน่วยงาน');
  var sheet = ensureAgenciesSchema_();
  var lastRow = sheet.getLastRow();
  if (lastRow < 2) throw new Error('ไม่มีข้อมูลหน่วยงาน');
  var values = sheet.getRange(2, 1, lastRow - 1, 12).getValues();
  for (var i = 0; i < values.length; i++) {
    if (String(values[i][0] || '').trim() === safeId) {
      sheet.getRange(i + 2, 12).setValue(safeTier);
      _cacheRemoveAll_();
      return { ok: true, agencyId: safeId, tier: safeTier };
    }
  }
  throw new Error('ไม่พบหน่วยงานนี้: ' + safeId);
}

/**
 * 🧪 Debug helper — ทดสอบสิทธิ์ของหน่วยงานโดยไม่ต้องไปสร้าง task/zone จริง
 * วิธีใช้ใน Apps Script editor:
 *   1. Run testAgencyTier('AGENCY_ID_HERE')
 *   2. ดู Execution log
 */
function testAgencyTier(agencyId) {
  var id = String(agencyId || '').trim();
  if (!id) {
    Logger.log('❌ กรุณาระบุ agencyId เช่น testAgencyTier("ABC001")');
    return null;
  }
  var tier = getAgencyTier_(id);
  var cfg = getTierConfig(tier);
  var currentTasks = _countTasksForAgency_(id);
  var currentZones = _countZonesForAgency_(id);
  var report = {
    agencyId: id,
    tier: tier,
    tierName: cfg.name,
    description: cfg.description,
    limits: {
      tasks: cfg.maxTasks === -1 ? '∞' : (currentTasks + ' / ' + cfg.maxTasks),
      zones: cfg.maxZones === -1 ? '∞' : (currentZones + ' / ' + cfg.maxZones),
      accounts: cfg.maxAccounts === -1 ? '∞' : cfg.maxAccounts
    },
    canAddTask: cfg.maxTasks === -1 || currentTasks < cfg.maxTasks,
    canAddZone: cfg.maxZones === -1 || currentZones < cfg.maxZones,
    features: cfg.features
  };
  Logger.log('═══════════════════════════════════════');
  Logger.log('🎚️  Tier Report: ' + id);
  Logger.log('═══════════════════════════════════════');
  Logger.log('Tier: ' + tier + ' (' + cfg.name + ')');
  Logger.log('คำอธิบาย: ' + cfg.description);
  Logger.log('');
  Logger.log('📊 ขีดจำกัด / ใช้ไปแล้ว:');
  Logger.log('  • Tasks: ' + report.limits.tasks + (report.canAddTask ? ' ✅' : ' 🔒 เต็มแล้ว'));
  Logger.log('  • Zones: ' + report.limits.zones + (report.canAddZone ? ' ✅' : ' 🔒 เต็มแล้ว'));
  Logger.log('  • Accounts: ' + report.limits.accounts);
  Logger.log('');
  Logger.log('🎯 ฟีเจอร์ที่เปิด:');
  var on = [], off = [];
  Object.keys(cfg.features).forEach(function(k) {
    (cfg.features[k] ? on : off).push(k);
  });
  Logger.log('  ✅ เปิด (' + on.length + '): ' + on.join(', '));
  Logger.log('  ❌ ปิด (' + off.length + '): ' + off.join(', '));
  Logger.log('═══════════════════════════════════════');
  return report;
}

/**
 * 🧪 ทดสอบเปรียบเทียบทั้ง 3 tier ในครั้งเดียว
 * Run: testAllTiers()
 */
function testAllTiers() {
  Logger.log('═══════════════════════════════════════');
  Logger.log('🎚️  เปรียบเทียบทั้ง 3 Tier');
  Logger.log('═══════════════════════════════════════');
  ['1','2','3'].forEach(function(t) {
    var c = TIER_CONFIG[t];
    Logger.log('');
    Logger.log('▶ Tier ' + t + ': ' + c.name);
    Logger.log('  ' + c.description);
    Logger.log('  Task: ' + (c.maxTasks === -1 ? '∞' : c.maxTasks) +
               ' | Zone: ' + (c.maxZones === -1 ? '∞' : c.maxZones) +
               ' | Account: ' + (c.maxAccounts === -1 ? '∞' : c.maxAccounts));
    var on = [];
    Object.keys(c.features).forEach(function(k) { if (c.features[k]) on.push(k); });
    Logger.log('  ฟีเจอร์เปิด ' + on.length + ' รายการ: ' + on.slice(0,5).join(', ') + (on.length > 5 ? ', ...' : ''));
  });
  Logger.log('═══════════════════════════════════════');
  return getAllTiersInfo();
}

/**
 * 🧪 ทดสอบ feature ตัวเดียวบนทุก agency
 * Run: testFeatureAcrossAgencies('line_notify')
 */
function testFeatureAcrossAgencies(featureName) {
  if (!featureName) {
    Logger.log('❌ ระบุ featureName เช่น testFeatureAcrossAgencies("line_notify")');
    return null;
  }
  var sheet = ensureAgenciesSchema_();
  var lastRow = sheet.getLastRow();
  if (lastRow < 2) { Logger.log('ไม่มีหน่วยงานในระบบ'); return []; }
  var values = sheet.getRange(2, 1, lastRow - 1, 12).getValues();
  var rows = values.map(function(r) {
    var id = String(r[0] || '').trim();
    if (!id) return null;
    var tier = _normalizeTier_(r[11]);
    var has = !!(TIER_CONFIG[tier].features[featureName]);
    return { agencyId: id, agencyName: r[1] || '', tier: tier, hasFeature: has };
  }).filter(Boolean);
  Logger.log('═══════════════════════════════════════');
  Logger.log('🎯 Feature: ' + featureName);
  Logger.log('═══════════════════════════════════════');
  rows.forEach(function(r) {
    Logger.log((r.hasFeature ? '✅' : '🔒') + '  [Tier ' + r.tier + '] ' + r.agencyId + ' — ' + r.agencyName);
  });
  Logger.log('═══════════════════════════════════════');
  return rows;
}

function listAgenciesForAdmin(accessRole) {
  _requireAdmin(accessRole);
  var sheet = ensureAgenciesSchema_();
  var lastRow = sheet.getLastRow();
  if (lastRow < 2) return [];
  var values = sheet.getRange(2, 1, lastRow - 1, 12).getValues();
  return values.map(function(row) {
    return {
      agencyId: String(row[0] || '').trim(),
      agencyName: String(row[1] || '').trim(),
      role: _normalizeAccessRole_(row[3]),
      status: String(row[5] || 'ACTIVE').trim().toUpperCase(),
      expiresAt: row[6] ? _formatDateSafe_(row[6], 'dd/MM/yyyy') : '',
      lastLogin: row[8] ? _formatDateSafe_(row[8], 'dd/MM HH:mm') : '',
      tier: _normalizeTier_(row[11])
    };
  }).filter(function(a) { return a.agencyId; });
}

function setupMasterAgencies() {
  ensureAgenciesSchema_();
  return { ok: true, masterSheetId: AGENCY_MASTER_SSID };
}

function publishBroadcastEvent_(type, title, message, plan, incidentName, incidentLocation, createdBy) {
  var sheet = ensureBroadcastEventsSchema_();
  sheet.appendRow([
    new Date(),
    type || 'info',
    title || '',
    message || '',
    plan || '',
    incidentName || '',
    incidentLocation || '',
    createdBy || 'System'
  ]);
}

function getBroadcastEventsSince(lastRow, targetRole) {
  var sheet = ensureBroadcastEventsSchema_();
  var last = sheet.getLastRow();
  var parsedLastRow = parseInt(lastRow, 10) || 0;
  if (parsedLastRow < 1) return { lastRow: last, events: [] };
  var startRow = Math.max(2, parsedLastRow + 1);
  if (startRow > last) return { lastRow: last, events: [] };
  var data = sheet.getRange(startRow, 1, last - startRow + 1, 8).getValues();
  var events = data.map(function(row, index) {
    return {
      row: startRow + index,
      time: _formatDateSafe_(row[0], "dd/MM HH:mm"),
      type: row[1] || 'info',
      title: row[2] || '',
      message: row[3] || '',
      plan: row[4] || '',
      incidentName: row[5] || '',
      incidentLocation: row[6] || '',
      createdBy: row[7] || ''
    };
  });
  return { lastRow: last, events: events };
}

function _splitLineGroupIds_(value) {
  return String(value || '')
    .split(',')
    .map(function(v) { return String(v || '').trim(); })
    .filter(Boolean);
}

function getAgencyLineGroupIds_(agencyId) {
  agencyId = String(agencyId || '').trim();
  if (!agencyId) return [];
  var sheet = ensureAgenciesSchema_();
  var lastRow = sheet.getLastRow();
  if (lastRow < 2) return [];
  var values = sheet.getRange(2, 1, lastRow - 1, 11).getValues();
  for (var i = 0; i < values.length; i++) {
    if (String(values[i][0] || '').trim() === agencyId) {
      return _splitLineGroupIds_(values[i][9]);
    }
  }
  return [];
}

function notifyLineGroup_(title, lines, targetGroupIds) {
  var config = _getConfigMap();
  var fallbackToken = 'ljoLYqc5bOxvprbUoOTxB+0ZTvPmqG86JUGvQGxdVrcRUAuyiwbYYNFsWkXOsuU5kzcHezlClvLYXeKXkH7V6Vhpg+jtEWQtV86tBcB9gZoh8HeFjDyAq4PJnWgou7seeZGKoYeuSOs0UOHSyXUikAdB04t89/1O/w1cDnyilFU=';
  var fallbackGroupId = 'Cea8a3a432cff213e7a2797803115b643';
  var token = String(config['LINE_CHANNEL_ACCESS_TOKEN'] || config['Line_Channel_Access_Token'] || fallbackToken).trim();
  var targetGroupText = Array.isArray(targetGroupIds) ? targetGroupIds.join(',') : targetGroupIds;
  var groupIds = _splitLineGroupIds_(targetGroupText);
  if (!groupIds.length) groupIds = _splitLineGroupIds_(config['LINE_GROUP_ID'] || config['Line_Group_Id'] || fallbackGroupId);
  if (!token || !groupIds.length) return { ok: false, skipped: true, reason: 'Missing LINE config' };
  var text = [title || 'EOC Alert'].concat(lines || []).filter(Boolean).join('\n');
  var results = [];
  try {
    groupIds.forEach(function(groupId) {
      var res = UrlFetchApp.fetch('https://api.line.me/v2/bot/message/push', {
        method: 'post',
        contentType: 'application/json',
        headers: { Authorization: 'Bearer ' + token },
        payload: JSON.stringify({
          to: groupId,
          messages: [{ type: 'text', text: text }]
        }),
        muteHttpExceptions: true
      });
      var code = res.getResponseCode();
      if (code < 200 || code >= 300) {
        var body = res.getContentText();
        Logger.log('LINE notify failed ' + code + ': ' + body);
        results.push({ groupId: groupId, ok: false, status: code, body: body });
      } else {
        results.push({ groupId: groupId, ok: true });
      }
    });
    var failed = results.filter(function(r) { return !r.ok; });
    return failed.length ? { ok: false, results: results, status: failed[0].status, body: failed[0].body } : { ok: true, results: results };
  } catch (e) {
    Logger.log('LINE notify error: ' + e.message);
    return { ok: false, error: e.message };
  }
}

function notifyLineForAgency_(agencyId, title, lines) {
  // 🎚️ Tier guard — Tier 1 ไม่มี LINE notify
  if (agencyId && !checkTierFeature(agencyId, 'line_notify')) {
    Logger.log('LINE notify blocked for ' + agencyId + ' (Tier ' + getAgencyTier_(agencyId) + ' ไม่รองรับ)');
    return { skipped: true, reason: 'tier_not_supported' };
  }
  return notifyLineGroup_(title, lines, getAgencyLineGroupIds_(agencyId));
}

function _getWebAppUrlSafe_() {
  if (PUBLIC_APP_URL) return PUBLIC_APP_URL;
  try {
    return ScriptApp.getService().getUrl() || '';
  } catch (e) {
    Logger.log('get web app url failed: ' + e.message);
    return '';
  }
}

function _getAgenciesHeaderMap_(sheet) {
  var lastCol = Math.max(sheet.getLastColumn(), 16);
  var headers = sheet.getRange(1, 1, 1, lastCol).getValues()[0];
  var map = {};
  headers.forEach(function(header, index) {
    var key = String(header || '').trim();
    if (key) map[key] = index;
  });
  return map;
}

function _getAgencyRecordBy_(fieldName, value) {
  value = String(value || '').trim();
  if (!value) return null;
  var sheet = ensureAgenciesSchema_();
  var lastRow = sheet.getLastRow();
  if (lastRow < 2) return null;
  var headerMap = _getAgenciesHeaderMap_(sheet);
  var fieldIndex = headerMap[fieldName];
  if (fieldIndex == null) return null;
  var numCols = Math.max(sheet.getLastColumn(), 16);
  var values = sheet.getRange(2, 1, lastRow - 1, numCols).getValues();
  for (var i = 0; i < values.length; i++) {
    if (String(values[i][fieldIndex] || '').trim() !== value) continue;
    var row = values[i];
    var tier = _normalizeTier_(row[headerMap.Tier]);
    var sheetId = String(row[headerMap.CurrentSheetId] || row[headerMap.SheetId] || '').trim();
    return {
      rowIndex: i + 2,
      agencyId: String(row[headerMap.AgencyId] || '').trim(),
      agencyName: String(row[headerMap.AgencyName] || '').trim(),
      role: _normalizeAccessRole_(row[headerMap.Role]),
      status: String(row[headerMap.Status] || 'ACTIVE').trim().toUpperCase(),
      expiresAt: row[headerMap.ExpiresAt],
      lineGroupId: String(row[headerMap.LineGroupId] || '').trim(),
      sheetId: String(row[headerMap.SheetId] || '').trim(),
      currentSheetId: sheetId,
      tier: tier,
      tierConfig: TIER_CONFIG[tier] || null,
      joinToken: String(row[headerMap.JoinToken] || '').trim()
    };
  }
  return null;
}

function _setAgencyMasterValue_(agencyId, fieldName, value) {
  var sheet = ensureAgenciesSchema_();
  var record = _getAgencyRecordBy_('AgencyId', agencyId);
  if (!record) return false;
  var headerMap = _getAgenciesHeaderMap_(sheet);
  var colIndex = headerMap[fieldName];
  if (colIndex == null) return false;
  sheet.getRange(record.rowIndex, colIndex + 1).setValue(value);
  return true;
}

function _makeJoinToken_(agencyId) {
  var prefix = String(agencyId || 'JOIN').replace(/[^\w-]/g, '').slice(0, 16) || 'JOIN';
  var random = Utilities.getUuid().replace(/-/g, '').slice(0, 18);
  return prefix + '-' + random;
}

function _buildJoinUrl_(token) {
  var url = _getWebAppUrlSafe_();
  if (!url || !token) return '';
  return url + (url.indexOf('?') === -1 ? '?' : '&') + 'join=' + encodeURIComponent(token);
}

function _resolveAgencySheetId_(agencyId, explicitSheetId) {
  agencyId = String(agencyId || '').trim();
  explicitSheetId = String(explicitSheetId || '').trim();
  if (agencyId) {
    var record = _getAgencyRecordBy_('AgencyId', agencyId);
    if (record && record.currentSheetId) return record.currentSheetId;
    if (record && record.sheetId) return record.sheetId;
  }
  return explicitSheetId || SSID;
}

function _useAgencySpreadsheetForRequest_(agencyId, explicitSheetId) {
  var sheetId = _resolveAgencySheetId_(agencyId, explicitSheetId);
  if (sheetId && sheetId !== SSID) {
    SSID = sheetId;
    _cacheRemoveAll_();
    _cacheRemove_(_configCacheKey_());
  }
  return sheetId;
}

/**
 * 🔑 Resolve session from joinToken (ใช้แทนการส่ง agencyId ทุก call)
 * ถ้า joinToken valid → switch SSID ไปยัง sheet ของ agency นั้นอัตโนมัติ
 * Return { agencyId, sheetId, tier } หรือ null
 */
function _resolveSessionFromToken_(joinToken) {
  if (!joinToken) return null;
  joinToken = String(joinToken).trim();
  if (!joinToken) return null;
  var record = _getAgencyRecordBy_('JoinToken', joinToken);
  if (!record) return null;
  if (record.status !== 'ACTIVE') return null;
  if (_isAgencyExpired_(record.expiresAt)) return null;
  _useAgencySpreadsheetForRequest_(record.agencyId, record.currentSheetId || record.sheetId);
  return { agencyId: record.agencyId, sheetId: record.currentSheetId || record.sheetId, tier: record.tier };
}

/**
 * 🔒 Guard ที่ใช้ต้นทุก public function ที่ staff (join via token) เรียกได้
 * ถ้ามี joinToken → route ถูก sheet, ถ้ามี agencyId → route ถูก sheet, ถ้าไม่มีอะไร → ใช้ SSID เดิม
 */
function _routeRequest_(agencyId, sheetId, joinToken) {
  if (joinToken) {
    var sess = _resolveSessionFromToken_(joinToken);
    if (sess) return sess;
  }
  if (agencyId || sheetId) {
    _useAgencySpreadsheetForRequest_(agencyId, sheetId);
    return { agencyId: agencyId, sheetId: sheetId || SSID };
  }
  return { agencyId: '', sheetId: SSID };
}

function _createEmergencyJoinLink_(agencyId, currentSheetId, configSheet, configData) {
  agencyId = String(agencyId || '').trim();
  currentSheetId = String(currentSheetId || SSID || '').trim();
  if (!agencyId) return { token: '', url: '', sheetId: currentSheetId };
  var token = _makeJoinToken_(agencyId);
  _setAgencyMasterValue_(agencyId, 'JoinToken', token);
  _setAgencyMasterValue_(agencyId, 'CurrentSheetId', currentSheetId);
  if (configSheet && configData) {
    _setConfig(configSheet, configData, 'JoinToken', token);
    _setConfig(configSheet, configData, 'CurrentSheetId', currentSheetId);
    _setConfig(configSheet, configData, 'JoinCreatedAt', new Date());
  }
  return { token: token, url: _buildJoinUrl_(token), sheetId: currentSheetId };
}

function _clearEmergencyJoinLink_(agencyId, configSheet, configData) {
  agencyId = String(agencyId || '').trim();
  if (agencyId) _setAgencyMasterValue_(agencyId, 'JoinToken', '');
  if (configSheet && configData) {
    _setConfig(configSheet, configData, 'JoinToken', '');
    _setConfig(configSheet, configData, 'JoinCreatedAt', '');
  }
}

function validateJoinToken(joinToken) {
  joinToken = String(joinToken || '').trim();
  if (!joinToken) return { ok: false, reason: 'missing_token' };
  var record = _getAgencyRecordBy_('JoinToken', joinToken);
  if (!record) return { ok: false, reason: 'invalid_token' };
  if (record.status !== 'ACTIVE') return { ok: false, reason: 'disabled' };
  if (_isAgencyExpired_(record.expiresAt)) return { ok: false, reason: 'expired' };
  return {
    ok: true,
    role: 'viewer',
    label: record.agencyName || record.agencyId || 'Join Link',
    agencyId: record.agencyId,
    agencyName: record.agencyName,
    sheetId: record.currentSheetId || record.sheetId,
    tier: record.tier,
    tierName: TIER_CONFIG[record.tier] ? TIER_CONFIG[record.tier].name : '',
    tierConfig: record.tierConfig,
    joinToken: joinToken
  };
}

function getEmergencyStateForAgency(agencyId, sheetId, joinToken) {
  var sess = _routeRequest_(agencyId, sheetId, joinToken);
  var state = getEmergencyState();
  state.agencyId = sess.agencyId || String(agencyId || '').trim();
  state.agencySheetId = sess.sheetId || SSID;
  return state;
}

function getEmergencyStateLiteForAgency(agencyId, sheetId, joinToken) {
  var sess = _routeRequest_(agencyId, sheetId, joinToken);
  var state = getEmergencyStateLite();
  state.agencyId = sess.agencyId || String(agencyId || '').trim();
  state.agencySheetId = sess.sheetId || SSID;
  return state;
}

// ==========================================
// 🔎 Server-side Place Search (proxy ผ่าน UrlFetchApp เพื่อข้าม CSP/CORS)
// ==========================================
var THAI_PLACE_PREFIXES_ = [
  'อบต. ', 'อบต ', 'องค์การบริหารส่วนตำบล', 'ที่ทำการองค์การบริหารส่วนตำบล',
  'สำนักงานองค์การบริหารส่วนตำบล', 'เทศบาลตำบล', 'สำนักงานเทศบาลตำบล', 'เทศบาลเมือง',
  'สำนักงานเทศบาลเมือง', 'เทศบาลนคร', 'สำนักงานเทศบาลนคร',
  'รพ.สต. ', 'โรงพยาบาล',
  'โรงเรียน', 'โรงเรียนบ้าน', 'โรงเรียนวัด', 'โรงเรียนอนุบาล',
  'โรงเรียนอนุบาลองค์การบริหารส่วนตำบล', 'ศูนย์พัฒนาเด็กเล็ก',
  'วัด', 'สำนักสงฆ์', 'มัสยิด',
  'สภ.', 'สถานีตำรวจ', 'สถานีดับเพลิง',
  'ที่ทำการกำนัน', 'ที่ทำการผู้ใหญ่บ้าน', 'ศาลาประชาคม',
  'ตำบล', 'หมู่บ้าน', 'ชุมชน'
];

function _looksLikeThaiPlaceName_(keyword) {
  return keyword.length <= 18 && /^[\u0E00-\u0E7F\s]+$/.test(keyword);
}

function _expandPlaceQueries_(keyword) {
  var seen = {};
  var queries = [];
  function addQuery(q) {
    q = String(q || '').replace(/\s+/g, ' ').trim();
    if (!q || seen[q]) return;
    seen[q] = true;
    queries.push(q);
  }
  addQuery(keyword);
  if (!/rayong|ระยอง/i.test(keyword)) {
    addQuery(keyword + ' ระยอง');
    addQuery(keyword + ' จังหวัดระยอง');
    addQuery(keyword + ' อำเภอนิคมพัฒนา ระยอง');
  }
  if (_looksLikeThaiPlaceName_(keyword)) {
    THAI_PLACE_PREFIXES_.forEach(function(prefix) {
      addQuery(prefix + keyword);
      addQuery(prefix + keyword + ' ระยอง');
    });
    [
      'องค์การบริหารส่วนตำบล', 'เทศบาลตำบล', 'สำนักงานเทศบาลตำบล',
      'โรงเรียนอนุบาล', 'โรงเรียนอนุบาลองค์การบริหารส่วนตำบล',
      'โรงเรียน', 'วัด', 'รพ.สต. '
    ].forEach(function(prefix) {
      addQuery(prefix + keyword + ' อำเภอนิคมพัฒนา ระยอง');
    });
  }
  return queries.slice(0, 60);
}

function _longdoSearchServer_(query) {
  var url = 'https://search.longdo.com/mapsearch/json/search' +
    '?keyword=' + encodeURIComponent(query) +
    '&lon=101.10194568975817&lat=12.917039750870146&span=80km&limit=50&locale=th' +
    '&area=21' +
    '&forcesmartsearch=1&forcelimit=50&extendedsearch=2&extendedlimit=20&extendedtype=textsearch&cache=1' +
    '&key=' + encodeURIComponent('a9974f7cfd12005a30da1344408d8c01');
  return { url: url, muteHttpExceptions: true };
}

function _longdoSuggestServer_(query) {
  var url = 'https://search.longdo.com/mapsearch/json/suggest' +
    '?keyword=' + encodeURIComponent(query) +
    '&area=21&limit=20&key=' + encodeURIComponent('a9974f7cfd12005a30da1344408d8c01');
  return { url: url, muteHttpExceptions: true };
}

function _parseLongdoSuggests_(data) {
  var list = (data && Array.isArray(data.data)) ? data.data : [];
  return list.map(function(r) {
    return String((r && (r.w || r.name || r.keyword)) || '').trim();
  }).filter(Boolean);
}

function _parseLongdoResults_(data) {
  var list = [];
  ['data', 'result', 'results'].forEach(function(key) {
    if (Array.isArray(data && data[key])) list = list.concat(data[key]);
  });
  if (data && data.result && Array.isArray(data.result.data)) list = list.concat(data.result.data);
  return list.map(function(r) {
    var loc = r.location || r.loc || {};
    var lon = r.lon != null ? r.lon : (r.longitude != null ? r.longitude : loc.lon);
    var lat = r.lat != null ? r.lat : (r.latitude != null ? r.latitude : loc.lat);
    return {
      id: r.id || r.objectid || r.object_id || r.poiid || r.poi_id || r.uid,
      name: r.name || r.w || r.title || r.keyword || '',
      place_name: r.address || r.addr || r.description || r.detail || '',
      type: r.type || r.tag || r.category || '',
      lon: parseFloat(lon),
      lat: parseFloat(lat),
      source: 'Longdo'
    };
  });
}

function _googleGeocodeResults_(query) {
  try {
    var res = Maps.newGeocoder()
      .setRegion('th')
      .setLanguage('th')
      .geocode(query);
    var list = res && res.results ? res.results : [];
    return list.map(function(r) {
      var loc = r.geometry && r.geometry.location ? r.geometry.location : {};
      var name = '';
      var comps = r.address_components || [];
      for (var i = 0; i < comps.length; i++) {
        if (comps[i] && comps[i].long_name) {
          name = comps[i].long_name;
          break;
        }
      }
      return {
        name: name || r.formatted_address || query,
        place_name: r.formatted_address || '',
        type: (r.types || []).join(', ') || 'geocode',
        lon: parseFloat(loc.lng),
        lat: parseFloat(loc.lat),
        source: 'Google Geocoder'
      };
    });
  } catch (e) {
    Logger.log('Google geocode failed: ' + e.message);
    return [];
  }
}

function _normalizeMapText_(value) {
  return String(value || '').toLowerCase().replace(/\s+/g, ' ').trim();
}

function _placeResultLabel_(item) {
  return item && (item.name || item.title || item.label || item.display_name || item.place_name || item.text || item.address || item.keyword || '');
}

function _placeResultDetail_(item) {
  return item && (item.address || item.place_name || item.subdistrict || item.district || item.province || item.type || '');
}

function _placeDistanceMeters_(item) {
  var lon = parseFloat(item && item.lon);
  var lat = parseFloat(item && item.lat);
  if (isNaN(lon) || isNaN(lat)) return 999999;
  var baseLat = 12.917039750870146;
  var baseLon = 101.10194568975817;
  var dx = (lon - baseLon) * 111320 * Math.cos(baseLat * Math.PI / 180);
  var dy = (lat - baseLat) * 111320;
  return Math.sqrt(dx * dx + dy * dy);
}

function _placeDedupeKeys_(item) {
  var label = _normalizeMapText_(_placeResultLabel_(item));
  var detail = _normalizeMapText_(_placeResultDetail_(item));
  var lon = parseFloat(item.lon);
  var lat = parseFloat(item.lat);
  var keys = [];
  var id = item.id || item.objectid || item.object_id || item.poiid || item.poi_id || item.uid || item._id;
  if (id) keys.push('id:' + id);
  if (label && detail) keys.push('text:' + label + '|' + detail);
  if (!isNaN(lon) && !isNaN(lat)) keys.push('near:' + Math.round(lon * 10000) + ',' + Math.round(lat * 10000) + '|' + label);
  return keys;
}

function _mergePlaceResults_(lists, keyword) {
  var seen = {};
  var out = [];
  lists.forEach(function(list) {
    (list || []).forEach(function(item) {
      if (!item || isNaN(item.lon) || isNaN(item.lat)) return;
      var keys = _placeDedupeKeys_(item);
      for (var i = 0; i < keys.length; i++) {
        if (seen[keys[i]]) return;
      }
      keys.forEach(function(key) { seen[key] = true; });
      out.push(item);
    });
  });
  var q = _normalizeMapText_(keyword);
  out.sort(function(a, b) {
    var an = _normalizeMapText_(_placeResultLabel_(a));
    var bn = _normalizeMapText_(_placeResultLabel_(b));
    var ad = _normalizeMapText_(_placeResultDetail_(a));
    var bd = _normalizeMapText_(_placeResultDetail_(b));
    var aDist = _placeDistanceMeters_(a);
    var bDist = _placeDistanceMeters_(b);
    var ar = (a.source === 'Longdo' && an === q && aDist < 3000) ? 0 : (an === q ? 1 : (an.indexOf(q) !== -1 ? 2 : (ad.indexOf(q) !== -1 ? 3 : 5)));
    var br = (b.source === 'Longdo' && bn === q && bDist < 3000) ? 0 : (bn === q ? 1 : (bn.indexOf(q) !== -1 ? 2 : (bd.indexOf(q) !== -1 ? 3 : 5)));
    if (ar !== br) return ar - br;
    var ap = a.source === 'Longdo' ? 0 : (a.source === 'Google Geocoder' ? 1 : 2);
    var bp = b.source === 'Longdo' ? 0 : (b.source === 'Google Geocoder' ? 1 : 2);
    if (ap !== bp) return ap - bp;
    if (Math.abs(aDist - bDist) > 50) return aDist - bDist;
    return _placeResultLabel_(a).localeCompare(_placeResultLabel_(b), 'th');
  });
  return out;
}

function searchPlaces(query) {
  query = String(query || '').trim();
  if (!query) return [];
  var cacheKey = 'eoc_place_v5_' + Utilities.base64EncodeWebSafe(query).slice(0, 60);
  var cached = _cacheGet_(cacheKey);
  if (cached) return cached;

  var queries = _expandPlaceQueries_(query);
  var suggestRequests = [
    _longdoSuggestServer_(query),
    _longdoSuggestServer_(query + ' ระยอง')
  ];
  try {
    UrlFetchApp.fetchAll(suggestRequests).forEach(function(res) {
      if (res.getResponseCode() < 200 || res.getResponseCode() >= 300) return;
      _parseLongdoSuggests_(JSON.parse(res.getContentText())).forEach(function(s) {
        if (queries.indexOf(s) === -1) queries.push(s);
      });
    });
  } catch (e) {
    Logger.log('Longdo suggest failed: ' + e.message);
  }
  queries = queries.slice(0, 80);
  var requests = [];
  var googleQueries = queries.slice(0, 10);
  var googleLists = [];
  googleQueries.forEach(function(q) {
    googleLists.push(_googleGeocodeResults_(q));
  });
  queries.forEach(function(q) {
    requests.push(_longdoSearchServer_(q));
  });

  var responses;
  try {
    responses = UrlFetchApp.fetchAll(requests);
  } catch (e) {
    Logger.log('fetchAll failed: ' + e.message);
    return [];
  }

  var lists = googleLists.slice();
  responses.forEach(function(res, i) {
    try {
      if (res.getResponseCode() < 200 || res.getResponseCode() >= 300) return;
      var body = res.getContentText();
      var data = JSON.parse(body);
      lists.push(_parseLongdoResults_(data));
    } catch (e) {
      Logger.log('parse failed: ' + e.message);
    }
  });

  var merged = _mergePlaceResults_(lists, query).slice(0, 50);
  _cachePut_(cacheKey, merged, 300);
  return merged;
}

function _parseMedicalTriageHospital_(location, color) {
  var text = String(location || '').trim();
  var prefix = String(color || '').toUpperCase() + ':';
  if (text.toUpperCase().indexOf(prefix) === 0) return text.substring(prefix.length).trim() || '-';
  return text || '-';
}

function getMedicalTriageSummary_() {
  var cached = _cacheGet_('eoc_triage');
  if (cached) return cached;
  var _result = _getMedicalTriageSummaryRaw_();
  _cachePut_('eoc_triage', _result, CACHE_TTL);
  return _result;
}
function _getMedicalTriageSummaryRaw_() {
  var ss = SpreadsheetApp.openById(SSID);
  var sheet = ss.getSheetByName("Triage_Data");
  var totals = { red:0, yellow:0, green:0, black:0, onsite:0 };
  var details = [];
  if (!sheet || sheet.getLastRow() < 2) return { totals: totals, details: details };
  var data = sheet.getRange(2, 1, sheet.getLastRow() - 1, 8).getValues();
  var colors = [
    { key:'red', col:1 },
    { key:'yellow', col:2 },
    { key:'green', col:3 },
    { key:'black', col:4 }
  ];
  data.forEach(function(row, i) {
    totals.onsite += Math.max(0, parseInt(row[5]) || 0);
    colors.forEach(function(c) {
      var qty = Math.max(0, parseInt(row[c.col]) || 0);
      totals[c.key] += qty;
      if (!qty) return;
      details.push({
        rowIndex: i + 2,
        time: _formatDateSafe_(row[0], "dd/MM HH:mm"),
        triage: c.key,
        color: c.key,
        qty: qty,
        hospital: _parseMedicalTriageHospital_(row[6], c.key),
        location: row[6] || '',
        patientID: c.key.toUpperCase() + '-' + (i + 2),
        ambulance: '-',
        eta: '-',
        deconStatus: '-',
        status: 'confirmed',
        loggedBy: row[7] || 'MED'
      });
    });
  });
  details.reverse();
  return { totals: totals, details: details };
}

function getMedicalTriageDetails() {
  return getMedicalTriageSummary_().details;
}

function _requireAdmin(accessRole) {
  if (accessRole !== 'admin') {
    throw new Error('Admin permission required');
  }
}

/**
 * 🔐 Login ก่อนเริ่มเหตุ: admin เริ่ม/แก้เหตุได้, viewer ดูได้อย่างเดียว
 * ตั้งรหัสใน Config: Admin_Password / Viewer_Password
 */
function _isAgencyExpired_(expiresAt) {
  if (!expiresAt) return false;
  var d = new Date(expiresAt);
  if (isNaN(d.getTime())) return false;
  d.setHours(23, 59, 59, 999);
  return d.getTime() < Date.now();
}

function _normalizeAccessRole_(role) {
  role = String(role || '').trim().toLowerCase();
  return role === 'admin' ? 'admin' : 'viewer';
}

function checkAgencyLogin_(inputPass, deviceId) {
  var pass = String(inputPass || '');
  if (!pass) return null;
  var sheet = ensureAgenciesSchema_();
  var lastRow = sheet.getLastRow();
  if (lastRow < 2) return null;
  // อ่าน 14 col: A-N (เพิ่ม TrialLimit col M, LoginCount col N)
  var numCols = Math.max(sheet.getLastColumn(), 14);
  var values = sheet.getRange(2, 1, lastRow - 1, numCols).getValues();
  var safeDeviceId = String(deviceId || '').trim();
  for (var i = 0; i < values.length; i++) {
    var row = values[i];
    if (String(row[2] || '') !== pass) continue;
    var rowIndex = i + 2;
    var status = String(row[5] || 'ACTIVE').trim().toUpperCase();
    if (status !== 'ACTIVE') {
      return { ok: false, role: 'none', label: 'Agency disabled', reason: 'disabled' };
    }
    if (_isAgencyExpired_(row[6])) {
      return { ok: false, role: 'none', label: 'Agency expired', reason: 'expired' };
    }
    var boundDeviceId = String(row[4] || '').trim();
    if (boundDeviceId && safeDeviceId && boundDeviceId !== safeDeviceId) {
      return { ok: false, role: 'none', label: 'This password is already linked to another device', reason: 'device_locked' };
    }
    if (boundDeviceId && !safeDeviceId) {
      return { ok: false, role: 'none', label: 'Device ID required', reason: 'device_required' };
    }
    // 🎚️ Trial limit check — col M (index 12) = TrialLimit, col N (index 13) = LoginCount
    var trialLimit = parseInt(row[12] || '', 10);
    var loginCount = parseInt(row[13] || '0', 10) || 0;
    if (!isNaN(trialLimit) && trialLimit > 0) {
      if (loginCount >= trialLimit) {
        return {
          ok: false,
          role: 'none',
          label: 'Trial expired',
          reason: 'trial_expired',
          trialLimit: trialLimit,
          loginCount: loginCount,
          agencyName: String(row[1] || '')
        };
      }
      // นับ login ขึ้น
      sheet.getRange(rowIndex, 14).setValue(loginCount + 1);
    }
    if (!boundDeviceId && safeDeviceId) {
      sheet.getRange(rowIndex, 5).setValue(safeDeviceId);
      sheet.getRange(rowIndex, 8).setValue(new Date());
    }
    sheet.getRange(rowIndex, 9).setValue(new Date());
    var tier = _normalizeTier_(row[11]);
    return {
      ok: true,
      role: _normalizeAccessRole_(row[3]),
      label: row[1] || row[0] || 'Agency',
      agencyId: row[0] || '',
      agencyName: row[1] || '',
      sheetId: row[10] || '',
      tier: tier,
      tierName: TIER_CONFIG[tier] ? TIER_CONFIG[tier].name : '',
      tierConfig: TIER_CONFIG[tier] || null,
      deviceBound: !!(boundDeviceId || safeDeviceId),
      trialLimit: !isNaN(trialLimit) && trialLimit > 0 ? trialLimit : null,
      loginCount: !isNaN(trialLimit) && trialLimit > 0 ? loginCount + 1 : null,
      trialRemaining: !isNaN(trialLimit) && trialLimit > 0 ? trialLimit - loginCount - 1 : null
    };
  }
  return null;
}

function hasAgencyAccounts_() {
  var sheet = ensureAgenciesSchema_();
  var lastRow = sheet.getLastRow();
  if (lastRow < 2) return false;
  var values = sheet.getRange(2, 1, lastRow - 1, 6).getValues();
  return values.some(function(row) {
    var agencyId = String(row[0] || '').trim();
    var password = String(row[2] || '').trim();
    var status = String(row[5] || 'ACTIVE').trim().toUpperCase();
    return agencyId && password && status === 'ACTIVE';
  });
}

function checkAppLogin(inputPass, deviceId) {
  var agencyResult = checkAgencyLogin_(inputPass, deviceId);
  if (agencyResult) return agencyResult;
  if (hasAgencyAccounts_()) {
    return { ok: false, role: 'none', label: 'Invalid agency password', reason: 'agency_only' };
  }
  var config = _getConfigMap();
  var adminPass = String(config['Admin_Password'] || 'admin123');
  var viewerPass = String(config['Viewer_Password'] || 'viewonly');
  var pass = String(inputPass || '');

  if (pass === adminPass) {
    return { ok: true, role: 'admin', label: 'Admin' };
  }
  if (pass === viewerPass) {
    return { ok: true, role: 'viewer', label: 'View only' };
  }
  return { ok: false, role: 'none', label: 'Invalid password' };
}

function checkAdminPass(inputPass) {
  var result = checkAppLogin(inputPass);
  return result.ok && result.role === 'admin';
}

/**
 * 📝 บันทึกว่าใคร Role ไหนเข้าสู่ระบบ
 */
function logAccess(role, name) {
  addCommanderLog("🔓 เข้าสู่ระบบในบทบาท: " + role, name || "User");
}

// ==========================================
// 🔧 Helper: setConfig — ใช้ร่วมกันทั้งไฟล์
// ==========================================

/**
 * อัปเดต key ใน Config sheet โดย loop หา key จริง
 * ถ้าไม่เจอค่อย appendRow เพิ่มแถวใหม่
 * NOTE: รับ data ที่ getDataRange().getValues() ไว้แล้วจากข้างนอก
 *       เพื่อไม่ต้อง read Sheet ซ้ำในทุก setConfig call
 */
function _setConfig(sheet, data, key, value) {
  _cacheRemove_('eoc_config');
  _cacheRemove_(_configCacheKey_());
  for (var i = 1; i < data.length; i++) {
    if (data[i][0] == key) {
      sheet.getRange(i + 1, 2).setValue(value);
      return;
    }
  }
  sheet.appendRow([key, value]);
}

// ==========================================

function _getAutoWindForCoords_(evtCoords) {
  var parts = String(evtCoords || '').split(',');
  if (parts.length < 2) return null;
  var lat = parseFloat(parts[0]);
  var lng = parseFloat(parts[1]);
  if (isNaN(lat) || isNaN(lng)) return null;
  try {
    var url = 'https://api.open-meteo.com/v1/forecast?latitude=' + encodeURIComponent(lat) +
      '&longitude=' + encodeURIComponent(lng) +
      '&current=wind_speed_10m,wind_direction_10m&wind_speed_unit=ms';
    var res = UrlFetchApp.fetch(url, { muteHttpExceptions: true });
    var data = JSON.parse(res.getContentText() || '{}');
    if (!data.current) return null;
    var meteoDeg = Number(data.current.wind_direction_10m);
    var speed = Number(data.current.wind_speed_10m);
    if (isNaN(meteoDeg) || isNaN(speed)) return null;
    return { directionDeg: (meteoDeg + 180) % 360, speed: speed };
  } catch (e) {
    Logger.log('Auto wind fetch failed: ' + e.message);
    return null;
  }
}


function activateEmergency(evtName, evtLoc, evtCoords, evtPlan, evtLevel, evtEOC, commanderName, accessRole, commanderPosition, windDirectionDeg, windSpeedMs, windMode, agencyId) {
  _cacheRemoveAll_();
  _requireAdmin(accessRole);
  _useAgencySpreadsheetForRequest_(agencyId, '');
  _resetIncidentOperationalData_();
  var ss    = SpreadsheetApp.openById(SSID);
  var sheet = ss.getSheetByName("Config");
  var data  = sheet.getDataRange().getValues();

  _setConfig(sheet, data, 'CurrentStatus',    'Active');
  _setConfig(sheet, data, 'IncidentName',     evtName);
  _setConfig(sheet, data, 'IncidentLocation', evtLoc);
  _setConfig(sheet, data, 'IncidentCoords',   evtCoords);
  _setConfig(sheet, data, 'EOCLocation',      evtEOC);
  _setConfig(sheet, data, 'EOCCoords',        '');
  _setConfig(sheet, data, 'CommanderName',    commanderName || '');
  _setConfig(sheet, data, 'IncidentCommander', commanderName || '');
  _setConfig(sheet, data, 'CommanderPosition', commanderPosition || '');
  _setConfig(sheet, data, 'RegisteredICName',     '');
  _setConfig(sheet, data, 'RegisteredICPosition', '');
  _setConfig(sheet, data, 'RegisteredICPhone',    '');
  _setConfig(sheet, data, 'RegisteredICTime',     '');
  _setConfig(sheet, data, 'StartTime',        new Date());
  _setConfig(sheet, data, 'Res_Ambulance',    0);
  _setConfig(sheet, data, 'Res_FireTruck',    0);
  _setConfig(sheet, data, 'Res_Staff',        0);
  _setConfig(sheet, data, 'Res_Decon',        0);
  _setConfig(sheet, data, 'ERG_Name',         '');
  _setConfig(sheet, data, 'ERG_UN',           '');
  _setConfig(sheet, data, 'ERG_Iso_M',        0);
  _setConfig(sheet, data, 'ERG_Prot_Day_M',   0);
  _setConfig(sheet, data, 'ERG_Prot_Night_M', 0);
  _setConfig(sheet, data, 'ERG_UpdatedAt',    '');

  windMode = windMode || 'manual';
  _setConfig(sheet, data, 'Wind_Mode', windMode);
  var autoWind = windMode === 'auto' ? _getAutoWindForCoords_(evtCoords) : null;
  var windDeg = autoWind ? autoWind.directionDeg : (windDirectionDeg === '' || windDirectionDeg == null ? '' : Number(windDirectionDeg));
  var windSpeed = autoWind ? autoWind.speed : (windSpeedMs === '' || windSpeedMs == null ? '' : Number(windSpeedMs));
  if (windDeg !== '' && !isNaN(windDeg) && windDeg >= 0 && windDeg < 360 && windSpeed !== '' && !isNaN(windSpeed) && windSpeed >= 0) {
    _setConfig(sheet, data, 'Wind_Direction_Deg', windDeg);
    _setConfig(sheet, data, 'Wind_Speed_MS', windSpeed);
    _setConfig(sheet, data, 'Wind_Source', autoWind ? 'Auto' : 'Admin');
    _setConfig(sheet, data, 'Wind_UpdatedBy', commanderName || 'Admin');
    _setConfig(sheet, data, 'Wind_UpdatedAt', new Date());
  } else {
    _setConfig(sheet, data, 'Wind_Direction_Deg', '');
    _setConfig(sheet, data, 'Wind_Speed_MS', '');
    _setConfig(sheet, data, 'Wind_Source', '');
    _setConfig(sheet, data, 'Wind_UpdatedBy', '');
    _setConfig(sheet, data, 'Wind_UpdatedAt', '');
  }
  _setConfig(sheet, data, 'Wind_Pending_Direction_Deg', '');
  _setConfig(sheet, data, 'Wind_Pending_Speed_MS', '');
  _setConfig(sheet, data, 'Wind_Pending_Source', '');
  _setConfig(sheet, data, 'Wind_Pending_UpdatedBy', '');
  _setConfig(sheet, data, 'Wind_Pending_UpdatedAt', '');

  var fullPlan = evtPlan;
  if (evtLevel && evtLevel !== '-') fullPlan += " (" + evtLevel + ")";
  _setConfig(sheet, data, 'PlanInfo', fullPlan);
  var videoRoomName = _makeVideoRoomName_(evtName);
  _setConfig(sheet, data, 'VideoRoomName', videoRoomName);
  var joinInfo = _createEmergencyJoinLink_(agencyId, ss.getId(), sheet, data);

  var logMsg = "🚨 ประกาศภาวะฉุกเฉิน: " + evtName + " | สถานที่: " + evtLoc + " | EOC: " + evtEOC;
  addCommanderLog(logMsg, commanderName || "IC");
  publishBroadcastEvent_('active', 'ประกาศ ACTIVE เหตุ', 'เปิดศูนย์ EOC แล้ว: ' + (evtName || '-'), fullPlan, evtName, evtLoc, commanderName || 'IC');
  var appUrl = _getWebAppUrlSafe_();
  var commanderLine = (commanderName || '-');
  if (commanderPosition) commanderLine += ' (' + commanderPosition + ')';
  notifyLineForAgency_(agencyId, 'ประกาศสถานการณ์ฉุกเฉิน', [
    (fullPlan || '-') + ' ' + (evtName || '-'),
    'สถานที่: ' + (evtLoc || '-'),
    'ผู้บัญชาการเหตุการณ์: ' + commanderLine,
    'ห้อง EOC: ' + (evtEOC || '-'),
    '',
    'กรุณาเข้าสู่ระบบเพื่อปฏิบัติงาน',
    joinInfo.url || appUrl || 'กรุณาเปิดลิงก์ Web App ของระบบ EOC'
  ]);
  return { ok: true, videoRoomName: videoRoomName, joinToken: joinInfo.token, joinUrl: joinInfo.url, agencySheetId: joinInfo.sheetId };
}
function setEOCCoords(lat, lng, accessRole, agencyId) {
  _requireAdmin(accessRole);
  if (agencyId) _useAgencySpreadsheetForRequest_(agencyId, '');
  var ss = SpreadsheetApp.openById(SSID);
  var sheet = ss.getSheetByName('Config');
  var data = sheet.getDataRange().getValues();
  var coords = (lat && lng) ? (String(lat) + ',' + String(lng)) : '';
  _setConfig(sheet, data, 'EOCCoords', coords);
  _cacheRemoveAll_();
  return { ok: true, coords: coords };
}

function updateIncidentLevel(newLevel, accessRole, agencyId) {
  _requireAdmin(accessRole);
  _useAgencySpreadsheetForRequest_(agencyId, '');
  var ss    = SpreadsheetApp.openById(SSID);
  var sheet = ss.getSheetByName("Config");
  var data  = sheet.getDataRange().getValues();
  var config = {};
  for (var i = 1; i < data.length; i++) {
    var key = String(data[i][0] || '').trim();
    if (key) config[key] = data[i][1];
  }
  _setConfig(sheet, data, 'PlanInfo', newLevel);
  notifyLineForAgency_(agencyId, 'ยกระดับแผน', [
    'เหตุการณ์: ' + (config['IncidentName'] || '-'),
    'สถานที่: ' + (config['IncidentLocation'] || '-'),
    'แผนใหม่: ' + (newLevel || '-')
  ]);
  addCommanderLog('⚠️ ยกระดับแผนเป็น: ' + newLevel, 'IC');
}

// Final override: closing an incident must leave the workbook ready for the next incident.
function deactivateEmergency(commanderName, accessRole, agencyId) {
  _cacheRemoveAll_();
  _requireAdmin(accessRole);
  _useAgencySpreadsheetForRequest_(agencyId, '');
  var ss    = SpreadsheetApp.openById(SSID);
  var sheet = ss.getSheetByName("Config");
  var data  = sheet.getDataRange().getValues();
  var config = {};
  for (var i = 1; i < data.length; i++) {
    var key = String(data[i][0] || '').trim();
    if (key) config[key] = data[i][1];
  }

  publishBroadcastEvent_('deactivate', 'ยกเลิกแผน / ปิดเหตุ', 'ผู้บัญชาการยกเลิกแผนและปิดศูนย์ EOC แล้ว', config['PlanInfo'] || '', config['IncidentName'] || '', config['IncidentLocation'] || '', commanderName || 'IC');
  var closeLineResult = notifyLineForAgency_(agencyId, 'ประกาศยกเลิกแผน', [
    'ขณะนี้สถานการณ์ได้ยุติลงแล้ว',
    'จึงขอประกาศยกเลิก ' + (config['PlanInfo'] || 'แผนปฏิบัติการ'),
    '',
    'เหตุการณ์: ' + (config['IncidentName'] || '-'),
    'สถานที่: ' + (config['IncidentLocation'] || '-'),
    '',
    'ขอขอบคุณเจ้าหน้าที่ทุกท่านที่ปฏิบัติหน้าที่อย่างเต็มกำลัง',
    'สั่งการโดย: ' + (commanderName || 'IC')
  ]);

  _setConfig(sheet, data, 'CurrentStatus', 'Normal');
  _setConfig(sheet, data, 'IncidentName', '');
  _setConfig(sheet, data, 'IncidentLocation', '');
  _setConfig(sheet, data, 'IncidentCoords', '');
  _setConfig(sheet, data, 'EOCLocation', '');
  _setConfig(sheet, data, 'EOCCoords', '');
  _setConfig(sheet, data, 'CommanderName', '');
  _setConfig(sheet, data, 'IncidentCommander', '');
  _setConfig(sheet, data, 'CommanderPosition', '');
  _setConfig(sheet, data, 'RegisteredICName', '');
  _setConfig(sheet, data, 'RegisteredICPosition', '');
  _setConfig(sheet, data, 'RegisteredICPhone', '');
  _setConfig(sheet, data, 'RegisteredICTime', '');
  _setConfig(sheet, data, 'VideoRoomName', '');
  _setConfig(sheet, data, 'StartTime', '');
  _setConfig(sheet, data, 'PlanInfo', '');
  _setConfig(sheet, data, 'Wind_Direction_Deg', '');
  _setConfig(sheet, data, 'Wind_Mode', '');
  _setConfig(sheet, data, 'Wind_Speed_MS', '');
  _setConfig(sheet, data, 'Wind_Source', '');
  _setConfig(sheet, data, 'Wind_UpdatedBy', '');
  _setConfig(sheet, data, 'Wind_UpdatedAt', '');
  _setConfig(sheet, data, 'Wind_Pending_Direction_Deg', '');
  _setConfig(sheet, data, 'Wind_Pending_Speed_MS', '');
  _setConfig(sheet, data, 'Wind_Pending_Source', '');
  _setConfig(sheet, data, 'Wind_Pending_UpdatedBy', '');
  _setConfig(sheet, data, 'Wind_Pending_UpdatedAt', '');
  _setConfig(sheet, data, 'Res_Ambulance', 0);
  _setConfig(sheet, data, 'Res_FireTruck', 0);
  _setConfig(sheet, data, 'Res_Staff', 0);
  _setConfig(sheet, data, 'Res_Decon', 0);
  _clearEmergencyJoinLink_(agencyId, sheet, data);

  setEOCCallFree();
  _resetIncidentOperationalData_();
  addCommanderLog("ปิดศูนย์ EOC / ยกเลิกแผน", commanderName || "IC");
  return { ok: true, line: closeLineResult };
}

// ==========================================
// 🚑 Zone: อัปเดตข้อมูล (Triage / Logs)
// ==========================================

/**
 * [BUG FIX #2] updateEmerCount
 * เดิม: current[mapIndex[type]] = parseInt(val)
 *       → รับค่าติดลบได้ เช่น val = -5 จะทำให้ยอด Triage ติดลบ
 * แก้:  Math.max(0, parseInt(val) || 0)
 */
function updateEmerCount(type, val, location, reporter, agencyId) {
  // 🎚️ Tier guard
  if (agencyId) _requireTierFeature_(agencyId, 'triage', 'Triage 4 สี');
  var ss    = SpreadsheetApp.openById(SSID);
  var sheet = ss.getSheetByName("Triage_Data");
  
  var lastRow = sheet.getLastRow();
  var current = [0, 0, 0, 0, 0]; 
  var lastLoc = location || "-";

  if (lastRow > 1) {
    var lastData = sheet.getRange(lastRow, 2, 1, 5).getValues()[0];
    current = lastData.slice(0, 5);
  }

  var mapIndex = { 'red':0, 'yellow':1, 'green':2, 'black':3, 'onsite':4 };
  if (mapIndex.hasOwnProperty(type)) {
    current[mapIndex[type]] = Math.max(0, parseInt(val) || 0); // ✅ FIX: ป้องกันค่าติดลบ
  }

  var timestamp = Utilities.formatDate(new Date(), "GMT+7", "dd/MM/yyyy HH:mm:ss");
  sheet.appendRow([timestamp, current[0], current[1], current[2], current[3], current[4], lastLoc, reporter || 'Staff']);
  
  return getEmergencyState();
}

function saveWindReport(directionDeg, speedMs, source, loggedBy) {
  var ss = SpreadsheetApp.openById(SSID);
  var sheet = ss.getSheetByName("Config");
  var data = sheet.getDataRange().getValues();
  var deg = Number(directionDeg);
  var speed = Number(speedMs);
  if (isNaN(deg) || deg < 0 || deg >= 360) throw new Error('Invalid wind direction');
  if (isNaN(speed) || speed < 0) throw new Error('Invalid wind speed');
  if (String(source || '').toUpperCase() === 'OC') {
    _setConfig(sheet, data, 'Wind_Pending_Direction_Deg', deg);
    _setConfig(sheet, data, 'Wind_Pending_Speed_MS', speed);
    _setConfig(sheet, data, 'Wind_Pending_Source', 'OC');
    _setConfig(sheet, data, 'Wind_Pending_UpdatedBy', loggedBy || 'OC');
    _setConfig(sheet, data, 'Wind_Pending_UpdatedAt', new Date());
    addCommanderLog('ทิศทางลมจาก OC รอเลือกใช้: ' + deg + '° | ' + speed + ' m/s | โดย ' + (loggedBy || 'OC'), loggedBy || 'OC');
    return getEmergencyState().wind;
  }
  _setConfig(sheet, data, 'Wind_Direction_Deg', deg);
  _setConfig(sheet, data, 'Wind_Speed_MS', speed);
  _setConfig(sheet, data, 'Wind_Source', source || 'manual');
  _setConfig(sheet, data, 'Wind_UpdatedBy', loggedBy || 'OC');
  _setConfig(sheet, data, 'Wind_UpdatedAt', new Date());
  addCommanderLog('ทิศทางลม: ' + deg + '° | ' + speed + ' m/s | โดย ' + (loggedBy || 'OC'), loggedBy || 'OC');
  return getEmergencyState().wind;
}

function acceptPendingWindReport(acceptedBy) {
  var ss = SpreadsheetApp.openById(SSID);
  var sheet = ss.getSheetByName("Config");
  var data = sheet.getDataRange().getValues();
  var config = _getConfigMap();
  var deg = config['Wind_Pending_Direction_Deg'];
  if (deg === '' || deg == null) throw new Error('ไม่มีข้อมูลลมจาก OC ที่รอเลือกใช้');
  _setConfig(sheet, data, 'Wind_Direction_Deg', Number(deg));
  _setConfig(sheet, data, 'Wind_Speed_MS', Number(config['Wind_Pending_Speed_MS']) || 0);
  _setConfig(sheet, data, 'Wind_Source', config['Wind_Pending_Source'] || 'OC');
  _setConfig(sheet, data, 'Wind_UpdatedBy', config['Wind_Pending_UpdatedBy'] || acceptedBy || 'OC');
  _setConfig(sheet, data, 'Wind_UpdatedAt', new Date());
  _setConfig(sheet, data, 'Wind_Pending_Direction_Deg', '');
  _setConfig(sheet, data, 'Wind_Pending_Speed_MS', '');
  _setConfig(sheet, data, 'Wind_Pending_Source', '');
  _setConfig(sheet, data, 'Wind_Pending_UpdatedBy', '');
  _setConfig(sheet, data, 'Wind_Pending_UpdatedAt', '');
  addCommanderLog('เลือกใช้ทิศทางลมจาก OC แล้ว', acceptedBy || 'IC');
  return getEmergencyState().wind;
}

function saveERGSelection(data) {
  data = data || {};
  var ss = SpreadsheetApp.openById(SSID);
  var sheet = ss.getSheetByName("Config");
  var rows = sheet.getDataRange().getValues();
  _setConfig(sheet, rows, 'ERG_Name', data.name || '');
  _setConfig(sheet, rows, 'ERG_UN', data.un || data.mtl_id || '');
  _setConfig(sheet, rows, 'ERG_Iso_M', Number(data.isoM || data.sm_iso || data.isolation_m || 0) || 0);
  _setConfig(sheet, rows, 'ERG_Prot_Day_M', Number(data.dayM || data.day_prot_m || 0) || 0);
  _setConfig(sheet, rows, 'ERG_Prot_Night_M', Number(data.nightM || data.night_prot_m || 0) || 0);
  _setConfig(sheet, rows, 'ERG_UpdatedAt', new Date());
  return getERGState();
}

function getERGState() {
  var config = _getConfigMap();
  return {
    name: String(config.ERG_Name || ''),
    un: String(config.ERG_UN || ''),
    isoM: Number(config.ERG_Iso_M || 0) || 0,
    dayM: Number(config.ERG_Prot_Day_M || 0) || 0,
    nightM: Number(config.ERG_Prot_Night_M || 0) || 0,
    updatedAt: config.ERG_UpdatedAt || ''
  };
}

function updateMedicalTriage(red, yellow, green, black, onsite, location, reporter) {
  var ss    = SpreadsheetApp.openById(SSID);
  var sheet = ss.getSheetByName("Triage_Data");
  var timestamp = Utilities.formatDate(new Date(), "GMT+7", "dd/MM/yyyy HH:mm:ss");
  var safeRed = Math.max(0, parseInt(red) || 0);
  var safeYellow = Math.max(0, parseInt(yellow) || 0);
  var safeGreen = Math.max(0, parseInt(green) || 0);
  var safeBlack = Math.max(0, parseInt(black) || 0);
  var safeOnsite = Math.max(0, parseInt(onsite) || 0);
  sheet.appendRow([timestamp, safeRed, safeYellow, safeGreen, safeBlack, safeOnsite, location || 'Health/1669', reporter || 'MED']);
  addCommanderLog(
    '🩺 ยอดผู้บาดเจ็บยืนยันทางการแพทย์: RED=' + safeRed +
    ', YELLOW=' + safeYellow + ', GREEN=' + safeGreen + ', BLACK=' + safeBlack,
    reporter || 'MED'
  );
  return getEmergencyState();
}

function addMedicalTriageRows(color, entries, reporter) {
  var ss = SpreadsheetApp.openById(SSID);
  var sheet = ss.getSheetByName("Triage_Data");
  var safeColor = String(color || '').toLowerCase();
  if (['red','yellow','green','black'].indexOf(safeColor) === -1) throw new Error('Invalid triage color');
  entries = Array.isArray(entries) ? entries : [];
  var timestamp = Utilities.formatDate(new Date(), "GMT+7", "dd/MM/yyyy HH:mm:ss");
  var rows = [];
  var total = 0;
  entries.forEach(function(entry) {
    var count = Math.max(0, parseInt(entry && entry.count) || 0);
    var hospital = String((entry && entry.hospital) || '').trim();
    if (!count) return;
    if (!hospital) hospital = '-';
    var red = safeColor === 'red' ? count : 0;
    var yellow = safeColor === 'yellow' ? count : 0;
    var green = safeColor === 'green' ? count : 0;
    var black = safeColor === 'black' ? count : 0;
    total += count;
    rows.push([timestamp, red, yellow, green, black, 0, safeColor.toUpperCase() + ': ' + hospital, reporter || 'MED']);
  });
  if (!rows.length) throw new Error('กรุณาใส่จำนวนผู้บาดเจ็บอย่างน้อย 1 แถว');
  sheet.getRange(sheet.getLastRow() + 1, 1, rows.length, 8).setValues(rows);
  addCommanderLog('เพิ่มยอดผู้บาดเจ็บ ' + safeColor.toUpperCase() + ' รวม ' + total + ' ราย', reporter || 'MED');
  return getEmergencyState();
}

function addCommanderLog(msg, reporter) {
  var ss        = SpreadsheetApp.openById(SSID);
  var sheet     = ss.getSheetByName("Incident_Logs");
  var timestamp = Utilities.formatDate(new Date(), "GMT+7", "dd/MM/yyyy HH:mm:ss");
  sheet.appendRow([timestamp, reporter || 'System', msg, 'Report', 'Active']);
  SpreadsheetApp.flush(); // ← เพิ่มบรรทัดนี้
  return getLogData();
}

/**
 * [BUG FIX #3] getLogData
 * เดิม: getRange(..., 3) — ดึงแค่ 3 column (timestamp, reporter, msg)
 *       แต่ addCommanderLog append 5 column (+ type, status)
 *       → type และ status หายไปเงียบๆ ไม่ error แต่ข้อมูลไม่ครบ
 * แก้:  เปลี่ยนเป็น 5 column และ map คืน type กับ status ด้วย
 */
function getLogData() {
  var ss      = SpreadsheetApp.openById(SSID);
  var sheet   = ss.getSheetByName("Incident_Logs");
  var lastRow = sheet.getLastRow();
  if (lastRow < 2) return [];
  var startRow = Math.max(2, lastRow - 49);
  var data = sheet.getRange(startRow, 1, lastRow - startRow + 1, 5).getValues(); // ✅ FIX: 5 columns
  return data.map(function(row) {
    return { 
        time: Utilities.formatDate(new Date(row[0]), "GMT+7", "dd/MM/yyyy HH:mm:ss"),
        reporter: row[1], 
        msg: row[2], 
        type: row[3], 
        status: row[4] 
    };
}).reverse();
}

// ==========================================
// 👮 Zone: บุคลากร & พิกัด
// ==========================================

function getRegisteredIC() {
  var ss = SpreadsheetApp.openById(SSID);
  var sheet = ss.getSheetByName("Config");
  var data = sheet.getDataRange().getValues();
  var name = '', position = '', phone = '';
  for (var i = 1; i < data.length; i++) {
    var k = String(data[i][0] || '').trim();
    if (k === 'RegisteredICName') name = String(data[i][1] || '').trim();
    else if (k === 'RegisteredICPosition') position = String(data[i][1] || '').trim();
    else if (k === 'RegisteredICPhone') phone = String(data[i][1] || '').trim();
  }
  return { name: name, position: position, phone: phone };
}

function claimICRole(name, position, phone, accessRole) {
  var safeName = String(name || '').trim();
  if (!safeName) return { ok: false, reason: 'no_name' };
  if (String(accessRole || '').toLowerCase() === 'admin') {
    return { ok: true, isAdmin: true };
  }
  var lock = LockService.getScriptLock();
  try { lock.waitLock(5000); } catch(e) { return { ok: false, reason: 'busy' }; }
  try {
    var ss = SpreadsheetApp.openById(SSID);
    var sheet = ss.getSheetByName("Config");
    var data = sheet.getDataRange().getValues();
    var current = '', currentPos = '';
    for (var i = 1; i < data.length; i++) {
      var k = String(data[i][0] || '').trim();
      if (k === 'RegisteredICName') current = String(data[i][1] || '').trim();
      else if (k === 'RegisteredICPosition') currentPos = String(data[i][1] || '').trim();
    }
    if (current && current !== safeName) {
      return { ok: false, reason: 'taken', currentName: current, currentPosition: currentPos };
    }
    var safePos = String(position || '').trim();
    _setConfig(sheet, data, 'RegisteredICName', safeName);
    _setConfig(sheet, data, 'RegisteredICPosition', safePos);
    _setConfig(sheet, data, 'RegisteredICPhone', _normalizePhone_(phone));
    _setConfig(sheet, data, 'RegisteredICTime', new Date());
    _cacheRemoveAll_();
    return { ok: true, currentName: safeName, currentPosition: safePos };
  } finally {
    try { lock.releaseLock(); } catch(e) {}
  }
}

function releaseICRole(name, accessRole) {
  var ss = SpreadsheetApp.openById(SSID);
  var sheet = ss.getSheetByName("Config");
  var data = sheet.getDataRange().getValues();
  var current = '';
  for (var i = 1; i < data.length; i++) {
    if (String(data[i][0] || '').trim() === 'RegisteredICName') {
      current = String(data[i][1] || '').trim();
      break;
    }
  }
  var safeName = String(name || '').trim();
  var isAdmin = String(accessRole || '').toLowerCase() === 'admin';
  if (current && current !== safeName && !isAdmin) {
    return { ok: false, currentName: current };
  }
  _setConfig(sheet, data, 'RegisteredICName', '');
  _setConfig(sheet, data, 'RegisteredICPosition', '');
  _setConfig(sheet, data, 'RegisteredICPhone', '');
  _setConfig(sheet, data, 'RegisteredICTime', '');
  _cacheRemoveAll_();
  return { ok: true };
}

function submitEmergencyAttendance(name, role, location, phone, roleCode, agencyId) {
  // 🎚️ Tier guard บทบาท
  if (agencyId && roleCode) {
    var roleFeatureMap = {
      'IC':'role_ic','OSC':'role_oc','OC':'role_oc','Field':'role_field',
      'JIC':'role_jic','Liaison':'role_liaison','Specialist':'role_specialist',
      'Logistics':'role_logistics','Planning':'role_planning','Finance':'role_finance',
      'MED':'role_med','EVAC_POINT':'role_evac_point'
    };
    var feat = roleFeatureMap[roleCode];
    if (feat && !checkTierFeature(agencyId, feat)) {
      throw new Error('บทบาท ' + roleCode + ' ไม่รองรับใน Tier ปัจจุบัน กรุณาอัปเกรดแพ็กเกจ');
    }
  }
  var ss        = SpreadsheetApp.openById(SSID);
  var sheet     = ensureStaffAttendanceSchema_() || ss.getSheetByName("Staff_Attendance");
  var timestamp = Utilities.formatDate(new Date(), "GMT+7", "dd/MM/yyyy HH:mm:ss");
  var safePhone = _normalizePhone_(phone);
  var safeName = String(name || '').trim();
  var safeRoleCode = String(roleCode || role || '').trim();
  var targetKey = [safeName, safeRoleCode].join('|');
  var lastRow = sheet.getLastRow();

  if (lastRow >= 2) {
    var data = sheet.getRange(2, 1, lastRow - 1, Math.max(sheet.getLastColumn(), 7)).getValues();
    for (var i = 0; i < data.length; i++) {
      var rowName = String(data[i][1] || '').trim();
      var rowPhone = _normalizePhone_(data[i][5]);
      var rowRoleCode = String(data[i][6] || data[i][2] || '').trim();
      var rowKey = [rowName, rowRoleCode].join('|');
      if (rowKey === targetKey) {
        var targetRow = i + 2;
        sheet.getRange(targetRow, 1, 1, 7).setValues([[timestamp, safeName, role, location, 'Online', safePhone, safeRoleCode]]);
        sheet.getRange(targetRow, 6).setNumberFormat('@').setValue(safePhone);
        return "รายงานตัวไว้แล้ว อัปเดตเวลาล่าสุด";
      }
    }
  }

  sheet.appendRow([timestamp, safeName, role, location, 'Online', safePhone, safeRoleCode]);
  sheet.getRange(sheet.getLastRow(), 6).setNumberFormat('@').setValue(safePhone);
  addCommanderLog("🏃 เจ้าหน้าที่รายงานตัว: " + safeName + " (" + role + ")", safeName);
  return "ลงชื่อเรียบร้อย";
}

function getICSLeads() {
  var cached = _cacheGet_('eoc_ics_leads');
  if (cached) return cached;
  var _result = _getICSLeadsRaw_();
  _cachePut_('eoc_ics_leads', _result, CACHE_TTL);
  return _result;
}
function _getICSLeadsRaw_() {
  var sheet = ensureICSLeadsSchema_();
  var lastRow = sheet.getLastRow();
  if (lastRow < 2) return {};
  var data = sheet.getRange(2, 1, lastRow - 1, 7).getValues();
  var leads = {};
  data.forEach(function(row) {
    var code = String(row[1] || '').trim();
    if (!code) return;
    leads[code] = {
      time: _formatDateSafe_(row[0], "dd/MM HH:mm"),
      roleCode: code,
      roleLabel: row[2] || '',
      name: row[3] || '',
      agency: row[4] || '',
      phone: _normalizePhone_(row[5]),
      assignedBy: row[6] || ''
    };
  });
  return leads;
}

function setICSLead(roleCode, roleLabel, leadName, agency, phone, assignedBy, accessRole, agencyId) {
  _requireAdmin(accessRole);
  // 🎚️ Tier guard บทบาท
  if (agencyId && roleCode) {
    var roleFeatureMap = {
      'IC':'role_ic','OSC':'role_oc','OC':'role_oc','Field':'role_field',
      'JIC':'role_jic','Liaison':'role_liaison','Specialist':'role_specialist',
      'Logistics':'role_logistics','Planning':'role_planning','Finance':'role_finance',
      'MED':'role_med','EVAC_POINT':'role_evac_point'
    };
    var feat = roleFeatureMap[roleCode];
    if (feat && !checkTierFeature(agencyId, feat)) {
      throw new Error('บทบาท ' + (roleLabel || roleCode) + ' ไม่รองรับใน Tier ปัจจุบัน กรุณาอัปเกรดแพ็กเกจ');
    }
  }
  var sheet = ensureICSLeadsSchema_();
  var code = String(roleCode || '').trim();
  var name = String(leadName || '').trim();
  if (!code) throw new Error('Missing role code');
  if (!name) throw new Error('Missing lead name');
  var safePhone = _normalizePhone_(phone || '');
  var lastRow = sheet.getLastRow();
  if (lastRow >= 2) {
    var data = sheet.getRange(2, 1, lastRow - 1, 7).getValues();
    for (var i = 0; i < data.length; i++) {
      if (String(data[i][1] || '').trim() === code) {
        var targetRow = i + 2;
        sheet.getRange(targetRow, 1, 1, 7).setValues([[new Date(), code, roleLabel || code, name, agency || '', safePhone, assignedBy || 'Admin']]);
        sheet.getRange(targetRow, 6).setNumberFormat('@').setValue(safePhone);
        addCommanderLog('แต่งตั้งหัวหน้า ' + (roleLabel || code) + ': ' + name, assignedBy || 'Admin');
        return getICSLeads();
      }
    }
  }
  sheet.appendRow([new Date(), code, roleLabel || code, name, agency || '', safePhone, assignedBy || 'Admin']);
  sheet.getRange(sheet.getLastRow(), 6).setNumberFormat('@').setValue(safePhone);
  addCommanderLog('แต่งตั้งหัวหน้า ' + (roleLabel || code) + ': ' + name, assignedBy || 'Admin');
  return getICSLeads();
}

function _isSameICSLeadPerson_(rowName, rowPhone, name, phone) {
  var aName = String(rowName || '').trim();
  var bName = String(name || '').trim();
  if (!aName || !bName || aName !== bName) return false;
  var aPhone = _normalizePhone_(rowPhone);
  var bPhone = _normalizePhone_(phone);
  return !aPhone || !bPhone || aPhone === bPhone;
}

function claimICSLead(roleCode, roleLabel, leadName, agency, phone, assignedBy, agencyId) {
  // 🎚️ Tier guard บทบาท
  if (agencyId && roleCode) {
    var roleFeatureMap = {
      'IC':'role_ic','OSC':'role_oc','OC':'role_oc','Field':'role_field',
      'JIC':'role_jic','Liaison':'role_liaison','Specialist':'role_specialist',
      'Logistics':'role_logistics','Planning':'role_planning','Finance':'role_finance',
      'MED':'role_med','EVAC_POINT':'role_evac_point'
    };
    var feat = roleFeatureMap[roleCode];
    if (feat && !checkTierFeature(agencyId, feat)) {
      throw new Error('บทบาท ' + (roleLabel || roleCode) + ' ไม่รองรับใน Tier ปัจจุบัน กรุณาอัปเกรดแพ็กเกจ');
    }
  }
  var sheet = ensureICSLeadsSchema_();
  var code = String(roleCode || '').trim();
  var name = String(leadName || '').trim();
  if (!code) throw new Error('Missing role code');
  if (!name) throw new Error('Missing lead name');

  var safePhone = _normalizePhone_(phone || '');
  var lastRow = sheet.getLastRow();
  if (lastRow >= 2) {
    var data = sheet.getRange(2, 1, lastRow - 1, 7).getValues();
    for (var i = 0; i < data.length; i++) {
      if (String(data[i][1] || '').trim() !== code) continue;

      var currentName = String(data[i][3] || '').trim();
      var currentPhone = _normalizePhone_(data[i][5]);
      if (!_isSameICSLeadPerson_(currentName, currentPhone, name, safePhone)) {
        throw new Error('ส่วนนี้มีหัวหน้าแล้ว: ' + currentName);
      }

      var targetRow = i + 2;
      sheet.getRange(targetRow, 1, 1, 7).setValues([[new Date(), code, roleLabel || code, name, agency || '', safePhone, assignedBy || name]]);
      sheet.getRange(targetRow, 6).setNumberFormat('@').setValue(safePhone);
      return getICSLeads();
    }
  }

  sheet.appendRow([new Date(), code, roleLabel || code, name, agency || '', safePhone, assignedBy || name]);
  sheet.getRange(sheet.getLastRow(), 6).setNumberFormat('@').setValue(safePhone);
  addCommanderLog('รับบทหัวหน้า ' + (roleLabel || code) + ': ' + name, name);
  return getICSLeads();
}

function releaseICSLead(roleCode, leadName, phone) {
  var sheet = ensureICSLeadsSchema_();
  var code = String(roleCode || '').trim();
  var name = String(leadName || '').trim();
  if (!code) throw new Error('Missing role code');
  if (!name) throw new Error('Missing lead name');

  var lastRow = sheet.getLastRow();
  if (lastRow < 2) return getICSLeads();
  var data = sheet.getRange(2, 1, lastRow - 1, 7).getValues();
  var canRelease = false;
  for (var i = 0; i < data.length; i++) {
    if (String(data[i][1] || '').trim() !== code) continue;
    if (!_isSameICSLeadPerson_(data[i][3], data[i][5], name, phone)) {
      throw new Error('ปลดหัวหน้าไม่ได้ เพราะหัวหน้าปัจจุบันคือ ' + String(data[i][3] || '').trim());
    }
    canRelease = true;
  }
  if (canRelease) {
    for (var r = data.length - 1; r >= 0; r--) {
      if (String(data[r][1] || '').trim() === code) sheet.deleteRow(r + 2);
    }
    addCommanderLog('ปลดบทหัวหน้า ' + code + ': ' + name, name);
  }
  return getICSLeads();
}
// ==========================================
// 🤝 ICS Coordinator (ผู้ประสาน) — สูงสุดหน่วยละ 2 คน
// Sections ที่รองรับ: JIC, Liaison, Planning, OSC, MED, EVAC_POINT
// ==========================================

function getICSCoords() {
  var cached = _cacheGet_('eoc_ics_coords');
  if (cached) return cached;
  var _result = _getICSCoordsRaw_();
  _cachePut_('eoc_ics_coords', _result, CACHE_TTL);
  return _result;
}
function _getICSCoordsRaw_() {
  var sheet = ensureICSCoordsSchema_();
  var lastRow = sheet.getLastRow();
  if (lastRow < 2) return {};
  var data = sheet.getRange(2, 1, lastRow - 1, 8).getValues();
  var coords = {};
  data.forEach(function(row) {
    var sec = String(row[1] || '').trim();
    if (!sec) return;
    if (!coords[sec]) coords[sec] = [];
    coords[sec].push({
      time: _formatDateSafe_(row[0], "dd/MM HH:mm"),
      sectionCode: sec,
      sectionLabel: row[2] || '',
      slotNo: Number(row[3]) || 1,
      name: String(row[4] || '').trim(),
      agency: String(row[5] || '').trim(),
      phone: _normalizePhone_(row[6]),
      assignedBy: String(row[7] || '').trim()
    });
  });
  // เรียง slot
  Object.keys(coords).forEach(function(sec) {
    coords[sec].sort(function(a, b) { return a.slotNo - b.slotNo; });
  });
  return coords;
}

function claimICSCoord(sectionCode, sectionLabel, coordName, agency, phone, assignedBy) {
  var sheet = ensureICSCoordsSchema_();
  var code = String(sectionCode || '').trim();
  var name = String(coordName || '').trim();
  if (!code) throw new Error('Missing section code');
  if (!name) throw new Error('Missing coord name');
  var safePhone = _normalizePhone_(phone || '');
  var lastRow = sheet.getLastRow();
  var slots = [];
  if (lastRow >= 2) {
    var data = sheet.getRange(2, 1, lastRow - 1, 8).getValues();
    data.forEach(function(row) {
      if (String(row[1] || '').trim() === code) {
        slots.push({ rowIndex: slots.length + 2, name: String(row[4] || '').trim(), phone: _normalizePhone_(row[6]), slotNo: Number(row[3]) });
      }
    });
  }
  // ตรวจว่าชื่อนี้อยู่แล้วหรือไม่
  for (var i = 0; i < slots.length; i++) {
    if (slots[i].name === name) {
      throw new Error('คุณเป็นผู้ประสานส่วนนี้อยู่แล้ว');
    }
  }
  if (slots.length >= 2) throw new Error('ผู้ประสานส่วนนี้เต็มแล้ว (2/2)');
  var slotNo = slots.length + 1;
  sheet.appendRow([new Date(), code, sectionLabel || code, slotNo, name, agency || '', safePhone, assignedBy || name]);
  sheet.getRange(sheet.getLastRow(), 7).setNumberFormat('@').setValue(safePhone);
  addCommanderLog('รับบทผู้ประสาน ' + (sectionLabel || code) + ' slot ' + slotNo + ': ' + name, name);
  return getICSCoords();
}

function releaseICSCoord(sectionCode, coordName, phone) {
  var sheet = ensureICSCoordsSchema_();
  var code = String(sectionCode || '').trim();
  var name = String(coordName || '').trim();
  if (!code || !name) throw new Error('Missing params');
  var lastRow = sheet.getLastRow();
  if (lastRow < 2) return getICSCoords();
  var data = sheet.getRange(2, 1, lastRow - 1, 8).getValues();
  var toDelete = [];
  for (var i = 0; i < data.length; i++) {
    if (String(data[i][1] || '').trim() === code && String(data[i][4] || '').trim() === name) {
      toDelete.push(i + 2);
    }
  }
  for (var r = toDelete.length - 1; r >= 0; r--) {
    sheet.deleteRow(toDelete[r]);
  }
  addCommanderLog('ปลดบทผู้ประสาน ' + code + ': ' + name, name);
  return getICSCoords();
}

function checkInLocation(name, role, type, lat, lng, agencyId) {
  // 🎚️ Tier guard
  if (agencyId) _requireTierFeature_(agencyId, 'live_location', 'รายงานตำแหน่งสด');
  var ss    = SpreadsheetApp.openById(SSID);
  var sheet = ss.getSheetByName("Live_Locations");
  var data  = sheet.getDataRange().getValues();
  for (var i = data.length - 1; i >= 1; i--) {
    if (data[i][1] === name && data[i][3] === type) { sheet.deleteRow(i + 1); }
  }
  sheet.appendRow([new Date(), name, role, type, lat, lng]);
  addCommanderLog('📍 เช็คอิน: ' + name + ' (' + type + ') ที่ ' + lat + ',' + lng, name); // ✅ ย้ายมาก่อน return
  return "อัปเดตพิกัดสำเร็จ"; // ✅ return ที่ท้ายสุด
}

function getAllLiveLocations() {
  var ss    = SpreadsheetApp.openById(SSID);
  var sheet = ss.getSheetByName("Live_Locations");
  var data  = sheet.getDataRange().getValues();
  var locations = [];
  for (var i = 1; i < data.length; i++) {
    locations.push({ name: data[i][1], role: data[i][2], type: data[i][3], lat: data[i][4], lng: data[i][5] });
  }
  return locations;
}

// 🧹 ล้างพิกัดเจ้าหน้าที่และจุดปฏิบัติงานทั้งหมด
function clearLiveLocations() {
  var ss    = SpreadsheetApp.openById(SSID);
  var sheet = ss.getSheetByName("Live_Locations");
  if (sheet.getLastRow() > 1) {
    sheet.deleteRows(2, sheet.getLastRow() - 1);
  }
  return "ล้างข้อมูลพิกัดเรียบร้อยแล้ว";
}

// [เพิ่มใหม่] getAttendanceData — สำหรับ showStaffList ใน Frontend
// คืนรายชื่อทุกคนที่รายงานตัวใน Staff_Attendance
function getAttendanceData() {
  var ss      = SpreadsheetApp.openById(SSID);
  var sheet   = ss.getSheetByName("Staff_Attendance");
  if (!sheet) return [];
  var lastRow = sheet.getLastRow();
  if (lastRow < 2) return [];
  var data = sheet.getRange(2, 1, lastRow - 1, Math.max(sheet.getLastColumn(), 7)).getValues();
  return data.map(function(row) {
    return { time: row[0], name: row[1], role: row[2], location: row[3], status: row[4], phone: _normalizePhone_(row[5]), roleCode: row[6] || '' };
  });
}

function getAttendanceSummary() {
  var list = getAttendanceData();
  var unique = {};
  list.forEach(function(p) {
    var key = [p.name || '-', p.phone || '', p.roleCode || p.role || '-'].join('|');
    unique[key] = p;
  });
  var people = Object.keys(unique).map(function(k) { return unique[k]; });
  var summary = { ops:0, plan:0, log:0, jic:0, specialist:0, liaison:0, all:people.length };
  people.forEach(function(p) {
    var bucket = getAttendanceRoleBucket_(p);
    if (summary.hasOwnProperty(bucket)) summary[bucket]++;
  });
  return { counts: summary, people: people };
}

function getAttendanceCountsForDashboard() {
  return getAttendanceSummary().counts;
}

function getStaffAttendanceDashboard() {
  var list = getAttendanceData();
  var buckets = {
    jic: [],
    specialist: [],
    liaison: [],
    ops: [],
    plan: [],
    log: []
  };
  var seen = {};

  list.forEach(function(p) {
    var code = String(p.roleCode || p.role || '').trim().toUpperCase();
    var bucket = 'ops';
    if (code === 'JIC') bucket = 'jic';
    else if (code === 'SPECIALIST') bucket = 'specialist';
    else if (code === 'LIAISON') bucket = 'liaison';
    else if (code === 'PLANNING' || code === 'PLAN') bucket = 'plan';
    else if (code === 'LOGISTICS' || code === 'LOG') bucket = 'log';
    else if (['OSC', 'MED', 'EVAC_POINT', 'OPERATION', 'OPERATIONS', 'OPS'].indexOf(code) !== -1) bucket = 'ops';

    var key = [bucket, String(p.name || '').trim(), String(p.roleCode || p.role || '').trim()].join('|');
    if (seen[key]) return;
    seen[key] = true;
    buckets[bucket].push({
      time: p.time,
      name: p.name || '-',
      role: p.role || '-',
      location: p.location || '-',
      phone: p.phone || '',
      roleCode: p.roleCode || ''
    });
  });

  var counts = {
    jic: buckets.jic.length,
    specialist: buckets.specialist.length,
    liaison: buckets.liaison.length,
    ops: buckets.ops.length,
    plan: buckets.plan.length,
    log: buckets.log.length,
    all: Object.keys(buckets).reduce(function(sum, key) { return sum + buckets[key].length; }, 0)
  };

  return {
    counts: counts,
    peopleByRole: buckets,
    people: [].concat(buckets.jic, buckets.specialist, buckets.liaison, buckets.ops, buckets.plan, buckets.log)
  };
}

function getAttendanceRoleBucket_(p) {
  var code = String((p && p.roleCode) || '').trim();
  if (['OSC', 'MED', 'EVAC_POINT', 'Operation', 'Operations', 'ops'].indexOf(code) !== -1) return 'ops';
  if (code === 'Planning') return 'plan';
  if (code === 'Logistics') return 'log';
  if (code === 'JIC') return 'jic';
  if (code === 'Specialist') return 'specialist';
  if (code === 'Liaison') return 'liaison';

  var text = [p && p.role, p && p.location, p && p.name].filter(Boolean).join(' ');
  if (text.indexOf('ประชาสัมพันธ์') !== -1) return 'jic';
  if (text.indexOf('ผู้เชี่ยวชาญ') !== -1 || text.indexOf('ที่ปรึกษา') !== -1) return 'specialist';
  if (text.indexOf('ประสาน') !== -1) return 'liaison';
  if (text.indexOf('อำนวยการ') !== -1) return 'plan';
  if (text.indexOf('สนับสนุน') !== -1) return 'log';
  if (text.indexOf('OC/ICP') !== -1 || text.indexOf('สาธารณสุข') !== -1 || text.indexOf('1669') !== -1 || text.indexOf('อพยพ') !== -1 || text.indexOf('ปฏิบัติการ') !== -1) return 'ops';
  return 'ops';
}

// ==========================================
// ☣️ Zone: ERG Lookup (Proxy — เลี่ยง CORS)
// ==========================================
// Browser เรียก external API ตรงไม่ได้เพราะ CORS
// GAS ไม่มีข้อจำกัดนี้ จึงทำ proxy ผ่าน Backend แทน
//
// API ที่ใช้: api.chem.guru (ERG 2024 — ฟรี ไม่ต้อง key)
// Response มี: guide_no, name_th, name_en, initial_isolation_m,
//              pag_day_m, pag_night_m, fire_explosion, health, reactivity
//
// ถ้า API ล่ม → fallback คืน null ให้ Frontend แสดง "ไม่พบข้อมูล"

function lookupERG(unNumber) {
  if (!unNumber || unNumber.toString().trim() === '') return null;

  try {
    var url = 'https://api.chem.guru/erg?un=' + unNumber.toString().trim();
    var response = UrlFetchApp.fetch(url, {
      method: 'GET',
      muteHttpExceptions: true,
      headers: { 'Accept': 'application/json' }
    });

    if (response.getResponseCode() !== 200) return null;

    var data = JSON.parse(response.getContentText());
    if (!data || data.error) return null;

    return {
      un:            data.un_number   || unNumber,
      name_th:       data.name_th     || data.name || '-',
      name_en:       data.name_en     || '-',
      guide_no:      data.guide_no    || '-',
      // Initial Isolation Distance (เมตร) — ระยะห่างขั้นต่ำทุกทิศ
      iso_m:         parseInt(data.initial_isolation_m)  || 0,
      // Protective Action Distance (เมตร) — แยกกลางวัน/กลางคืน
      pag_day_m:     parseInt(data.pag_day_m)            || 0,
      pag_night_m:   parseInt(data.pag_night_m)          || 0,
      // ความเสี่ยง (ระดับ 0-4)
      fire:          data.fire_explosion || 0,
      health:        data.health         || 0,
      reactivity:    data.reactivity     || 0,
      // ERG Guide text (ย่อ)
      guide_text:    data.guide_text     || '',
      // สถานะพิเศษ (TIH = Toxic Inhalation Hazard)
      is_tih:        data.is_tih         || false,
      is_water_react:data.is_water_react || false
    };

  } catch (e) {
    Logger.log('ERG lookup error: ' + e.message);
    return null;
  }
}

// ==========================================
// 🟠 Zone: Hot/Warm/Cold Zone Config
// ==========================================
// เก็บค่า zone ปัจจุบันใน Config sheet
// Frontend อ่านกลับไปวาดบนแผนที่
// radii unit: เมตร

function saveZoneConfig(hotM, warmM, coldM, deconLat, deconLng) {
  var ss    = SpreadsheetApp.openById(SSID);
  var sheet = ss.getSheetByName("Config");
  var data  = sheet.getDataRange().getValues();

  _setConfig(sheet, data, 'Zone_Hot_M',    hotM  || 100);
  _setConfig(sheet, data, 'Zone_Warm_M',   warmM || 300);
  _setConfig(sheet, data, 'Zone_Cold_M',   coldM || 500);
  // พิกัด Decon Station (คำนวณจาก Upwind แล้วส่งมา)
  _setConfig(sheet, data, 'Decon_Lat',     deconLat  || '');
  _setConfig(sheet, data, 'Decon_Lng',     deconLng  || '');

  addCommanderLog(
    '🟠 อัปเดต Zone: Hot=' + hotM + 'm / Warm=' + warmM + 'm / Cold=' + coldM + 'm',
    'IC'
  );
  return "OK";
}

function getZoneConfig() {
  var ss         = SpreadsheetApp.openById(SSID);
  var configSheet = ss.getSheetByName("Config");
  var configData  = configSheet.getDataRange().getValues();
  var config = {};
  for (var i = 1; i < configData.length; i++) {
    config[configData[i][0]] = configData[i][1];
  }
  return {
    hot_m:     parseInt(config['Zone_Hot_M'])  || 100,
    warm_m:    parseInt(config['Zone_Warm_M']) || 300,
    cold_m:    parseInt(config['Zone_Cold_M']) || 500,
    decon_lat: parseFloat(config['Decon_Lat']) || null,
    decon_lng: parseFloat(config['Decon_Lng']) || null
  };
}

// ==========================================
// 🚒 Zone: Resource Tracking
// ==========================================
// เก็บใน Config sheet เหมือน prep data เดิม
// key เช่น Res_Ambulance, Res_FireTruck, Res_Staff, Res_Decon

function updateResource(type, val) {
  var validTypes = ['Ambulance', 'FireTruck', 'Staff', 'Decon'];
  if (validTypes.indexOf(type) === -1) return 'Invalid type';

  var ss    = SpreadsheetApp.openById(SSID);
  var sheet = ss.getSheetByName("Config");
  var data  = sheet.getDataRange().getValues();

  var safeVal = Math.max(0, parseInt(val) || 0);
  _setConfig(sheet, data, 'Res_' + type, safeVal);
  addCommanderLog('🚒 อัปเดตทรัพยากร: ' + type + ' = ' + safeVal, 'System'); // ✅ ย้ายมาก่อน return
  return "OK"; // ✅ return ที่ท้ายสุด
}

function getResources() {
  var ss          = SpreadsheetApp.openById(SSID);
  var configSheet = ss.getSheetByName("Config");
  var configData  = configSheet.getDataRange().getValues();
  var config = {};
  for (var i = 1; i < configData.length; i++) {
    config[configData[i][0]] = configData[i][1];
  }
  return {
    ambulance:   parseInt(config['Res_Ambulance'])   || 0,
    fireTruck:   parseInt(config['Res_FireTruck'])   || 0,
    staff:       parseInt(config['Res_Staff'])       || 0,
    decon:       parseInt(config['Res_Decon'])       || 0
  };
}

// ==========================================
// ☢️ Zone: Exposure Log
// ==========================================
// Sheet: Exposure_Log
// Columns: Timestamp | Name | Role | Chemical | UN | Duration_min | PPE | Note | LoggedBy

function logExposure(name, role, chemical, unNo, durationMin, ppe, note, loggedBy) {
  var ss        = SpreadsheetApp.openById(SSID);
  var sheet     = ss.getSheetByName("Exposure_Log");
  var timestamp = Utilities.formatDate(new Date(), "GMT+7", "dd/MM/yyyy HH:mm:ss");

  sheet.appendRow([
    timestamp,
    name        || '-',
    role        || '-',
    chemical    || '-',
    unNo        || '-',
    parseInt(durationMin) || 0,
    ppe         || '-',
    note        || '',
    loggedBy    || 'Staff'
  ]);

  addCommanderLog(
    '☢️ Exposure Log: ' + name + ' | สาร: ' + chemical + ' (UN ' + unNo + ') | ' + durationMin + ' นาที | PPE: ' + ppe,
    loggedBy || 'Staff'
  );
  return "บันทึกแล้ว";
}

function getExposureLog() {
  var ss      = SpreadsheetApp.openById(SSID);
  var sheet   = ss.getSheetByName("Exposure_Log");
  var lastRow = sheet.getLastRow();
  if (lastRow < 2) return [];
  var data = sheet.getRange(2, 1, lastRow - 1, 9).getValues();
  return data.map(function(row) {
    return {
      time:     row[0], name:     row[1], role:     row[2],
      chemical: row[3], un:       row[4], duration: row[5],
      ppe:      row[6], note:     row[7], loggedBy: row[8]
    };
  }).reverse();
}

// ==========================================
// 📡 Zone: SITREP Generator & Telegram
// ==========================================
// SITREP format: S-M-E-A (Situation/Mission/Execution/Admin)
// ส่งออก 2 ทาง: Telegram Bot + return text ให้ copy
//
// Config Sheet ที่ต้องมี:
//   Telegram_Bot_Token  → token ของ Bot (ขอจาก @BotFather)
//   Telegram_Chat_ID    → Chat ID ของห้องที่ต้องการส่ง

function generateAndSendSitrep(situation, mission, execution, admin, sendTelegram) {
  // 1. ดึงข้อมูล state ปัจจุบัน
  var state     = getEmergencyState();
  var resources = getResources();
  var timestamp = Utilities.formatDate(new Date(), "GMT+7", "dd/MM/yyyy HH:mm");

  // 2. Build SITREP text
  var triage = state.triage;
  var totalCasualty = (triage.red||0) + (triage.yellow||0) + (triage.green||0) + (triage.black||0);

  var sitrepText =
    '🚨 *SITREP — ' + (state.evtName || '-') + '*\n' +
    '📅 ' + timestamp + ' | EOC: ' + (state.evtEOC || '-') + '\n' +
    '━━━━━━━━━━━━━━━━━━━━\n' +
    '*[S] สถานการณ์:*\n' + (situation || '-') + '\n\n' +
    '*[M] ภารกิจ:*\n' + (mission || '-') + '\n\n' +
    '*[E] การปฏิบัติ:*\n' + (execution || '-') + '\n\n' +
    '*[A] การบริหาร/ส่งกำลัง:*\n' + (admin || '-') + '\n' +
    '━━━━━━━━━━━━━━━━━━━━\n' +
    '🚑 *Triage Summary:*\n' +
    '🔴 ' + triage.red + '  🟡 ' + triage.yellow + '  🟢 ' + triage.green + '  ⚫ ' + triage.black + '  (รวม ' + totalCasualty + ' ราย)\n' +
    '🔥 จุดเกิดเหตุ: ' + triage.onsite + ' ราย\n' +
    '━━━━━━━━━━━━━━━━━━━━\n' +
    '🚒 *ทรัพยากร:*\n' +
    '  🚑 รพ.: ' + resources.ambulance + ' | 🚒 ดับเพลิง: ' + resources.fireTruck +
    ' | 👷 จนท.: ' + resources.staff + ' | Decon: ' + resources.decon + '\n' +
    '━━━━━━━━━━━━━━━━━━━━\n' +
    '#EOC #SITREP #' + (state.evtName || 'HAZMAT').replace(/\s/g, '');

  // 3. บันทึกลง Log
  addCommanderLog('📡 ออก SITREP', 'IC');

  // 4. ส่ง Telegram (ถ้าขอ)
  var telegramResult = null;
  if (sendTelegram) {
    telegramResult = _sendTelegram(sitrepText);
  }

  return {
    text:     sitrepText,
    telegram: telegramResult  // "OK" หรือ error message
  };
}

// Helper: ส่งข้อความไป Telegram
function _sendTelegram(text) {
  try {
    var ss          = SpreadsheetApp.openById(SSID);
    var configSheet = ss.getSheetByName("Config");
    var configData  = configSheet.getDataRange().getValues();
    var config = {};
    for (var i = 1; i < configData.length; i++) {
      config[configData[i][0]] = configData[i][1];
    }

    var token  = config['Telegram_Bot_Token'];
    var chatId = config['Telegram_Chat_ID'];

    if (!token || !chatId) return 'ไม่พบ Bot Token หรือ Chat ID ใน Config Sheet';

    var url = 'https://api.telegram.org/bot' + token + '/sendMessage';
    var payload = {
      chat_id:    chatId.toString(),
      text:       text,
      parse_mode: 'Markdown'
    };

    var response = UrlFetchApp.fetch(url, {
      method:             'POST',
      contentType:        'application/json',
      payload:            JSON.stringify(payload),
      muteHttpExceptions: true
    });

    var result = JSON.parse(response.getContentText());
    return result.ok ? 'OK' : ('Telegram error: ' + result.description);

  } catch (e) {
    return 'Error: ' + e.message;
  }
}

// ส่ง Telegram แบบ freeform (สำหรับ quick alert จาก IC)
function sendTelegramAlert(text) {
  return _sendTelegram('⚠️ *EOC ALERT*\n' + text);
}

// ==========================================
// 🔧 Zone: Setup Sheets (รันครั้งแรก)
// ==========================================
// รันฟังก์ชันนี้ใน Apps Script Editor ครั้งเดียว
// เพื่อสร้าง Sheet ใหม่ที่ยังไม่มี (ไม่ทับของเดิม)

function getDefaultHospitalNames_() {
  return [
    'รพ.ระยอง',
    'รพ.เฉลิมพระเกียรติฯ ระยอง',
    'รพ.นิคมพัฒนา',
    'รพ.ปลวกแดง',
    'รพ.บ้านฉาง',
    'รพ.แกลง',
    'รพ.บ้านค่าย',
    'รพ.วังจันทร์',
    'รพ.เขาชะเมา',
    'รพ.กรุงเทพระยอง',
    'รพ.ศรีระยอง',
    'รพ.จุฬารัตน์'
  ];
}

function resetHospitalCapacityList() {
  var ss = SpreadsheetApp.openById(SSID);
  var sheet = ss.getSheetByName("Hospital_Capacity") || ss.insertSheet("Hospital_Capacity");
  var headers = [
    "HospitalName","RedCapacity","YellowCapacity","GreenCapacity","BlackCapacity",
    "Status","Contact","LastUpdated","UpdatedBy"
  ];
  var existing = {};
  if (sheet.getLastRow() > 1) {
    var data = sheet.getRange(2, 1, sheet.getLastRow() - 1, Math.min(sheet.getLastColumn(), headers.length)).getValues();
    data.forEach(function(row) {
      var name = String(row[0] || '').trim();
      if (name) existing[name] = row;
    });
  }

  var now = Utilities.formatDate(new Date(), "GMT+7", "dd/MM/yyyy HH:mm:ss");
  sheet.clearContents();
  sheet.getRange(1, 1, 1, headers.length).setValues([headers]);
  getDefaultHospitalNames_().forEach(function(name) {
    var old = existing[name] || [];
    sheet.appendRow([
      name,
      Number(old[1] || 0),
      Number(old[2] || 0),
      Number(old[3] || 0),
      Number(old[4] || 0),
      old[5] || 'normal',
      old[6] || '',
      now,
      'Reset'
    ]);
  });
  return "OK";
}

function setupNewSheets() {
  var ss = SpreadsheetApp.openById(SSID);

  var newSheets = {
    "Exposure_Log": [
      "Timestamp","Name","Role","Chemical","UN_Number",
      "Duration_min","PPE_Level","Note","LoggedBy"
    ],
    // ✅ เพิ่มใหม่
    "Resource_Incoming": [
      "Timestamp","ResourceType","ResourceName","Quantity",
      "FromAgency","ETA","Status","Note","LoggedBy","PersonnelCount"
    ],
    "Task_List": [
      "Timestamp","TaskID","TaskName","Type","Priority",
      "AssignedTo","Location","Status","Note","LoggedBy"
    ],
    "OC_SitReport": [
      "Timestamp","SituationTag","Detail","AttachmentURL","LoggedBy"
    ],
    "Field_Casualty_Report": [
      "Timestamp","TotalEstimate","StillInArea","EvacuatedOrSent","Note","LoggedBy"
    ],
    "Support_Request": [
      "Timestamp","RequestType","Detail","Status","LoggedBy","ResponseNote","UpdatedBy","UpdatedAt"
    ],
    "Media_Reports": [
      "Timestamp","Source","Reporter","FileName","MimeType","FileURL","FileID","Note"
    ],
    "Zone_Markers": [
      "Timestamp","ZoneType","Label","Lat","Lng","Note","LoggedBy","Phone"
    ],
    "Hospital_Capacity": [
      "HospitalName","RedCapacity","YellowCapacity","GreenCapacity","BlackCapacity",
      "Status","Contact","UpdatedAt","UpdatedBy"
    ],
    "Patient_Transfer": [
      "Timestamp","PatientID","TriageColor","DestinationHospital","Ambulance",
      "ETA","DeconStatus","Status","Note","LoggedBy"
    ],
    "Health_Units": [
      "Timestamp","UnitType","UnitName","Agency","Quantity","Status","ETA","Note","LoggedBy"
    ],
    "Evacuation_Points": [
      "Timestamp","PointName","Lat","Lng","LeaderName","EvacueeCount","StaffCount",
      "Water","Food","Blanket","Bed","OtherResources","Note","LoggedBy"
    ],
    "ICS_Leads": [
      "Timestamp","RoleCode","RoleLabel","LeadName","Agency","Phone","AssignedBy"
    ]
  };

  Object.keys(newSheets).forEach(function(name) {
    if (!ss.getSheetByName(name)) {
      var sheet = ss.insertSheet(name);
      var headers = newSheets[name];
      sheet.appendRow(headers);
      sheet.getRange(1, 1, 1, headers.length)
        .setFontWeight('bold')
        .setBackground('#c0392b')
        .setFontColor('#ffffff');
      Logger.log('สร้าง Sheet: ' + name);
    } else {
      Logger.log('Sheet มีอยู่แล้ว (ข้าม): ' + name);
    }
  });

  // Config keys ที่จำเป็น
  var configSheet = ss.getSheetByName("Config");
  var configData  = configSheet.getDataRange().getValues();
  var existingKeys = configData.map(function(r) { return r[0]; });

  var newConfigKeys = [
    ['Telegram_Bot_Token', ''],
    ['Telegram_Chat_ID',   ''],
    ['Zone_Hot_M',         100],
    ['Zone_Warm_M',        300],
    ['Zone_Cold_M',        500],
    ['Decon_Lat',          ''],
    ['Decon_Lng',          ''],
    ['Res_Ambulance',      0],
    ['Res_FireTruck',      0],
    ['Res_Staff',          0],
    ['Res_Decon',          0],
    ['Admin_Password',     'admin123'],
    ['Viewer_Password',    'viewonly'],
    ['CommanderPosition',  ''],
    ['VideoRoomName',      ''],
    ['Wind_Direction_Deg', ''],
    ['Wind_Mode',          ''],
    ['Wind_Speed_MS',      ''],
    ['Wind_Source',        ''],
    ['Wind_UpdatedBy',     ''],
    ['Wind_UpdatedAt',     ''],
    ['Wind_Pending_Direction_Deg', ''],
    ['Wind_Pending_Speed_MS',      ''],
    ['Wind_Pending_Source',        ''],
    ['Wind_Pending_UpdatedBy',     ''],
    ['Wind_Pending_UpdatedAt',     ''],
    ['ERG_Name',           ''],
    ['ERG_UN',             ''],
    ['ERG_Iso_M',          0],
    ['ERG_Prot_Day_M',     0],
    ['ERG_Prot_Night_M',   0],
    ['ERG_UpdatedAt',      ''],
    ['Task_Counter',       0]   // ✅ ใหม่: auto-increment TaskID
  ];

  newConfigKeys.forEach(function(pair) {
    if (existingKeys.indexOf(pair[0]) === -1) {
      configSheet.appendRow(pair);
    }
  });

  var hospSheet = ss.getSheetByName("Hospital_Capacity");
  if (hospSheet && hospSheet.getLastRow() < 2) {
    var now = Utilities.formatDate(new Date(), "GMT+7", "dd/MM/yyyy HH:mm:ss");
    getDefaultHospitalNames_().forEach(function(name) {
      hospSheet.appendRow([name, 0, 0, 0, 0, 'normal', '', now, 'Setup']);
    });
  }

  return "✅ Setup เรียบร้อย";
}


// ==========================================
// 🚒 Zone: OC/ICP — Resource Incoming
// ==========================================

function addResourceIncoming(type, name, qty, agency, eta, note, loggedBy, personnelCount) {
  var ss        = SpreadsheetApp.openById(SSID);
  var sheet     = ss.getSheetByName("Resource_Incoming");
  ensureResourceIncomingSchema_();
  sheet = ss.getSheetByName("Resource_Incoming");
  var timestamp = Utilities.formatDate(new Date(), "GMT+7", "dd/MM/yyyy HH:mm:ss");
  var safeQty = Math.max(0, parseInt(qty) || 0);
  var safePersonnel = Math.max(0, parseInt(personnelCount) || 0);

  sheet.appendRow([
    timestamp,
    type     || '-',
    name     || '-',
    safeQty,
    agency   || '-',
    eta      || '-',
    'incoming',
    note     || '',
    loggedBy || 'OC',
    safePersonnel
  ]);

  addCommanderLog(
    '🚒 ทรัพยากรเข้าพื้นที่: ' + (type || '-') + ' ' + safeQty +
    ' หน่วย | กำลังพล ' + safePersonnel + ' คน | จาก ' + (agency || '-'),
    loggedBy || 'OC'
  );
  return "OK";
}

function saveResourceIncoming(type, qty, personnelCount, agency, phone) {
  var note = phone ? ('Phone: ' + phone) : '';
  return addResourceIncoming(
    type || '-',
    type || '-',
    qty,
    agency || '-',
    '-',
    note,
    agency || 'Logistics',
    personnelCount
  );
}

function addResourceAdjustment(type, deltaQty, deltaPersonnel, note, loggedBy) {
  var ss        = SpreadsheetApp.openById(SSID);
  var sheet     = ss.getSheetByName("Resource_Incoming");
  ensureResourceIncomingSchema_();
  sheet = ss.getSheetByName("Resource_Incoming");
  var timestamp = Utilities.formatDate(new Date(), "GMT+7", "dd/MM/yyyy HH:mm:ss");
  var safeQty = parseInt(deltaQty, 10) || 0;
  var safePersonnel = parseInt(deltaPersonnel, 10) || 0;

  sheet.appendRow([
    timestamp,
    type || '-',
    type || '-',
    safeQty,
    'OC ปรับยอด',
    '-',
    'adjustment',
    note || 'ปรับยอดรวม',
    loggedBy || 'OC',
    safePersonnel
  ]);

  addCommanderLog(
    'ปรับยอดทรัพยากร: ' + (type || '-') + ' ' + safeQty +
    ' หน่วย | กำลังพล ' + safePersonnel + ' คน',
    loggedBy || 'OC'
  );
  return "OK";
}

function updateResourceStatus(rowIndex, newStatus, loggedBy) {
  var ss    = SpreadsheetApp.openById(SSID);
  var sheet = ss.getSheetByName("Resource_Incoming");
  // rowIndex เป็น 1-based รวม header → +1
  if (rowIndex < 2) return "Invalid row";
  sheet.getRange(rowIndex, 7).setValue(newStatus);
  addCommanderLog('🔄 อัปเดตสถานะทรัพยากร แถว ' + rowIndex + ' → ' + newStatus, loggedBy || 'OC');
  return "OK";
}

function getResourceIncoming() {
  var ss      = SpreadsheetApp.openById(SSID);
  var sheet   = ss.getSheetByName("Resource_Incoming");
  if (!sheet) return [];
  ensureResourceIncomingSchema_();
  var lastRow = sheet.getLastRow();
  if (lastRow < 2) return [];
  var lastCol = Math.max(sheet.getLastColumn(), 10);
  var data = sheet.getRange(2, 1, lastRow - 1, lastCol).getValues();
  return data.map(function(row, i) {
    return {
      rowIndex:  i + 2,
      time:      _formatDateSafe_(row[0], "dd/MM HH:mm"),
      type:      row[1],
      name:      row[2],
      qty:       row[3],
      agency:    row[4],
      eta:       row[5],
      status:    row[6],
      note:      row[7],
      loggedBy:  row[8],
      personnel: parseInt(row[9]) || 0
    };
  }).reverse();
}

// ==========================================
// 📋 Zone: OC/ICP — Task Management
// ==========================================

function _nextTaskID() {
  var ss          = SpreadsheetApp.openById(SSID);
  var configSheet = ss.getSheetByName("Config");
  var configData  = configSheet.getDataRange().getValues();
  for (var i = 1; i < configData.length; i++) {
    if (configData[i][0] === 'Task_Counter') {
      var next = (parseInt(configData[i][1]) || 0) + 1;
      configSheet.getRange(i + 1, 2).setValue(next);
      _cacheRemove_('eoc_config');
      return 'TASK-' + String(next).padStart(3, '0');
    }
  }
  configSheet.appendRow(['Task_Counter', 1]);
  return 'TASK-001';
}

function addTask(taskName, type, priority, assignedTo, location, note, loggedBy, agencyId) {
  var ss        = SpreadsheetApp.openById(SSID);
  var sheet     = ss.getSheetByName("Task_List");
  // 🎚️ Tier guard — ใช้ incident tier ถ้ามีเหตุเปิด ไม่งั้นใช้ user agency tier
  {
    var effId = _resolveTierAgencyId_(agencyId);
    if (effId) {
      var cfg = getTierConfig(getAgencyTier_(effId));
      if (cfg && cfg.maxTasks > 0) {
        var current = _countTasksForAgency_(effId);
        if (current >= cfg.maxTasks) {
          throw new Error('สร้าง Task ได้สูงสุด ' + cfg.maxTasks + ' รายการสำหรับ Tier ปัจจุบัน กรุณาอัปเกรดแพ็กเกจ');
        }
      }
    }
  }
  var timestamp = Utilities.formatDate(new Date(), "GMT+7", "dd/MM/yyyy HH:mm:ss");
  var taskID    = _nextTaskID();

  sheet.appendRow([
    timestamp,
    taskID,
    taskName    || '-',
    type        || 'General',
    priority    || 'normal',
    assignedTo  || '-',
    location    || '-',
    'pending',
    note        || '',
    loggedBy    || 'OC'
  ]);

  addCommanderLog(
    '📋 Task ใหม่ [' + taskID + ']: ' + taskName + ' → ' + assignedTo + ' (' + priority + ')',
    loggedBy || 'OC'
  );
  return taskID;
}

function updateTaskStatus(taskID, newStatus, loggedBy) {
  var ss    = SpreadsheetApp.openById(SSID);
  var sheet = ss.getSheetByName("Task_List");
  var data  = sheet.getDataRange().getValues();
  for (var i = 1; i < data.length; i++) {
    if (data[i][1] === taskID) {
      sheet.getRange(i + 1, 8).setValue(newStatus);
      addCommanderLog('✅ Task [' + taskID + '] → ' + newStatus, loggedBy || 'OC');
      return "OK";
    }
  }
  return "Task not found";
}

function getTasks() {
  var ss      = SpreadsheetApp.openById(SSID);
  var sheet   = ss.getSheetByName("Task_List");
  if (!sheet) return [];
  var lastRow = sheet.getLastRow();
  if (lastRow < 2) return [];
  var data = sheet.getRange(2, 1, lastRow - 1, 10).getValues();
  return data.map(function(row) {
    return {
      time:       _formatDateSafe_(row[0], "dd/MM HH:mm"),
      taskID:     row[1],
      taskName:   row[2],
      type:       row[3],
      priority:   row[4],
      assignedTo: row[5],
      location:   row[6],
      status:     row[7],
      note:       row[8],
      loggedBy:   row[9]
    };
  }).reverse();
}

// ==========================================
// 📍 Zone: OC/ICP — Zone Markers
// ==========================================

function saveZoneMarker(zoneType, label, lat, lng, note, loggedBy, phone, agencyId) {
  var ss        = SpreadsheetApp.openById(SSID);
  var sheet     = ensureZoneMarkersSchema_() || ss.getSheetByName("Zone_Markers");
  // 🎚️ Tier guard — ใช้ incident tier ถ้ามีเหตุเปิด
  {
    var effId = _resolveTierAgencyId_(agencyId);
    if (effId) {
      var cfg = getTierConfig(getAgencyTier_(effId));
      if (cfg && cfg.maxZones > 0) {
        var current = _countZonesForAgency_(effId);
        if (current >= cfg.maxZones) {
          var zoneDesc = cfg.maxZones === 3 ? '3 จุด (Command Post 1 + จุดปฏิบัติการ 2)' : cfg.maxZones === 10 ? '10 จุด (Command Post 1 + จุดปฏิบัติการ 9)' : cfg.maxZones + ' จุด';
        throw new Error('ปักหมุด Zone ได้สูงสุด ' + zoneDesc + ' สำหรับ Tier ปัจจุบัน กรุณาอัปเกรดแพ็กเกจ');
        }
      }
    }
  }
  var timestamp = Utilities.formatDate(new Date(), "GMT+7", "dd/MM/yyyy HH:mm:ss");
  var safePhone = _normalizePhone_(phone) || _findLatestStaffPhone_(loggedBy);

  // ลบ marker เดิมของ zoneType เดียวกัน (ถ้า zoneType ไม่ใช่ staff)
  var singletonTypes = ['ICP','Decon','Treatment','Staging','Parking','Loading'];
  if (singletonTypes.indexOf(zoneType) !== -1) {
    var data = sheet.getDataRange().getValues();
    for (var i = data.length - 1; i >= 1; i--) {
      if (data[i][1] === zoneType) sheet.deleteRow(i + 1);
    }
  }

  sheet.appendRow([timestamp, zoneType, label, lat, lng, note || '', loggedBy || 'OC', safePhone]);
  sheet.getRange(sheet.getLastRow(), 8).setNumberFormat('@').setValue(safePhone);
  addCommanderLog('📍 ปักหมุด ' + zoneType + ': ' + label + ' ที่ ' + lat + ',' + lng, loggedBy || 'OC');
  return "OK";
}

function getZoneMarkers() {
  var ss      = SpreadsheetApp.openById(SSID);
  var sheet   = ensureZoneMarkersSchema_() || ss.getSheetByName("Zone_Markers");
  if (!sheet) return [];
  var lastRow = sheet.getLastRow();
  if (lastRow < 2) return [];
  var data = sheet.getRange(2, 1, lastRow - 1, Math.max(sheet.getLastColumn(), 8)).getValues();
  return data.map(function(row) {
    var loggedBy = String(row[6] || '');
    var phone = _normalizePhone_(row[7]) || _findLatestStaffPhone_(loggedBy);
    return {
      time:     _formatDateSafe_(row[0], "dd/MM HH:mm"),
      type:     String(row[1] || ''),
      label:    String(row[2] || ''),
      lat:      Number(row[3]) || null,
      lng:      Number(row[4]) || null,
      note:     String(row[5] || ''),
      loggedBy: loggedBy,
      phone:    phone
    };
  }).filter(function(z) {
    return z.type && z.lat !== null && z.lng !== null;
  });
}

// ==========================================
// 📰 Zone: OC/ICP — Situation Report
// ==========================================

function submitSitReport(situationTag, detail, attachmentURL, loggedBy) {
  var ss        = SpreadsheetApp.openById(SSID);
  var sheet     = ss.getSheetByName("OC_SitReport");
  var timestamp = Utilities.formatDate(new Date(), "GMT+7", "dd/MM/yyyy HH:mm:ss");

  sheet.appendRow([timestamp, situationTag, detail, attachmentURL || '', loggedBy || 'OC']);
  addCommanderLog('📰 SitRep: [' + situationTag + '] ' + detail.substring(0, 60), loggedBy || 'OC');
  return "OK";
}

function getSitReports() {
  var ss      = SpreadsheetApp.openById(SSID);
  var sheet   = ss.getSheetByName("OC_SitReport");
  if (!sheet) return [];
  var lastRow = sheet.getLastRow();
  if (lastRow < 2) return [];
  var data = sheet.getRange(2, 1, lastRow - 1, 5).getValues();
  return data.map(function(row) {
    return {
      time:   _formatDateSafe_(row[0], "dd/MM HH:mm"),
      tag:    row[1],
      detail: row[2],
      attach: row[3],
      by:     row[4]
    };
  }).reverse();
}

// ==========================================
// 🚑 Zone: OC/ICP — Field Casualty Estimate
// ==========================================

// ==========================================
// Field media reports: images / videos from field units
// ==========================================

function getOrCreateFieldMediaFolder_() {
  var ss = SpreadsheetApp.openById(SSID);
  var configSheet = ss.getSheetByName("Config");
  var configData = configSheet.getDataRange().getValues();
  var folderId = '';
  for (var i = 1; i < configData.length; i++) {
    if (configData[i][0] === 'Media_Folder_ID') {
      folderId = configData[i][1];
      break;
    }
  }
  if (folderId) {
    try {
      return DriveApp.getFolderById(folderId);
    } catch (e) {
      Logger.log('Media folder lookup failed, creating a new folder: ' + e.message);
    }
  }
  var folder = DriveApp.createFolder('WarRoom_Field_Media');
  _setConfig(configSheet, configData, 'Media_Folder_ID', folder.getId());
  return folder;
}

function uploadFieldMedia(source, reporter, fileName, mimeType, base64Data, note, agencyId) {
  // 🎚️ Tier guard
  if (agencyId && !checkTierFeature(agencyId, 'media_upload')) {
    throw new Error('การอัปโหลดรูป/วิดีโอไม่รองรับใน Tier ปัจจุบัน กรุณาอัปเกรดแพ็กเกจ');
  }
  if (!base64Data) throw new Error('No media data');
  var sheet = ensureMediaReportsSchema_();
  var folder = getOrCreateFieldMediaFolder_();
  var cleanBase64 = String(base64Data).replace(/^data:[^,]+,/, '');
  var bytes = Utilities.base64Decode(cleanBase64);
  var safeName = fileName || ('field-media-' + new Date().getTime());
  var blob = Utilities.newBlob(bytes, mimeType || 'application/octet-stream', safeName);
  var file = folder.createFile(blob);
  file.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);

  var timestamp = new Date();
  sheet.appendRow([
    timestamp,
    source || '-',
    reporter || '-',
    safeName,
    mimeType || '',
    file.getUrl(),
    file.getId(),
    note || ''
  ]);

  addCommanderLog('แนบสื่อจากพื้นที่: ' + (source || '-') + ' / ' + safeName, reporter || source || 'Field');
  return {
    time: _formatDateSafe_(timestamp, "dd/MM HH:mm"),
    source: source || '-',
    reporter: reporter || '-',
    fileName: safeName,
    mimeType: mimeType || '',
    url: file.getUrl(),
    fileId: file.getId(),
    directUrl: 'https://drive.google.com/uc?export=view&id=' + file.getId(),
    thumbUrl: 'https://drive.google.com/thumbnail?id=' + file.getId() + '&sz=w1000',
    previewUrl: 'https://drive.google.com/file/d/' + file.getId() + '/preview',
    note: note || ''
  };
}

function getFieldMediaReports(limit) {
  var sheet = ensureMediaReportsSchema_();
  var lastRow = sheet.getLastRow();
  if (lastRow < 2) return [];
  var max = Math.max(1, parseInt(limit) || 30);
  var startRow = Math.max(2, lastRow - max + 1);
  var data = sheet.getRange(startRow, 1, lastRow - startRow + 1, 8).getValues();
  return data.map(function(row, i) {
    var fileId = row[6] || '';
    return {
      rowIndex: startRow + i,
      time: _formatDateSafe_(row[0], "dd/MM HH:mm"),
      source: row[1] || '-',
      reporter: row[2] || '-',
      fileName: row[3] || '-',
      mimeType: row[4] || '',
      url: row[5] || '',
      fileId: fileId,
      directUrl: fileId ? ('https://drive.google.com/uc?export=view&id=' + fileId) : (row[5] || ''),
      thumbUrl: fileId ? ('https://drive.google.com/thumbnail?id=' + fileId + '&sz=w1000') : (row[5] || ''),
      previewUrl: fileId ? ('https://drive.google.com/file/d/' + fileId + '/preview') : (row[5] || ''),
      note: row[7] || ''
    };
  }).reverse();
}

function _normalizeRoleWorkCode_(roleCode) {
  var code = String(roleCode || '').trim().toUpperCase();
  if (code === 'PLAN' || code === 'PLANNING') return 'Planning';
  if (code === 'JIC') return 'JIC';
  if (code === 'SPECIALIST') return 'Specialist';
  if (code === 'LIAISON') return 'Liaison';
  return String(roleCode || '').trim();
}

function _roleMediaReadKey_(item) {
  item = item || {};
  return [
    _normalizeRoleWorkCode_(item.roleCode || item.source || ''),
    item.fileId || item.rowIndex || item.url || item.fileName || '',
    item.time || '',
    item.reporter || ''
  ].join('|');
}

function _roleNoteReadKey_(item) {
  item = item || {};
  return [
    'note',
    _normalizeRoleWorkCode_(item.roleCode || item.source || ''),
    item.rowIndex || '',
    item.time || '',
    item.reporter || '',
    String(item.note || '').substring(0, 80)
  ].join('|');
}

function getRoleMediaReadKeys() {
  var sheet = ensureRoleMediaReadsSchema_();
  var lastRow = sheet.getLastRow();
  if (lastRow < 2) return {};
  var data = sheet.getRange(2, 1, lastRow - 1, 4).getValues();
  var map = {};
  data.forEach(function(row) {
    var key = String(row[2] || '').trim();
    if (key) map[key] = true;
  });
  return map;
}

function markRoleMediaReadForIC(roleType, readKeys, readBy) {
  var sheet = ensureRoleMediaReadsSchema_();
  var existing = getRoleMediaReadKeys();
  var roleCode = _normalizeRoleWorkCode_(roleType || '');
  var now = new Date();
  var rows = [];
  (readKeys || []).forEach(function(key) {
    key = String(key || '').trim();
    if (!key || existing[key]) return;
    existing[key] = true;
    rows.push([now, roleCode, key, readBy || 'IC']);
  });
  if (rows.length) {
    sheet.getRange(sheet.getLastRow() + 1, 1, rows.length, 4).setValues(rows);
  }
  return { ok: true, saved: rows.length };
}

function addRoleNote(roleCode, roleLabel, reporter, phone, note) {
  var cleanNote = String(note || '').trim();
  if (!cleanNote) throw new Error('กรุณากรอก note ก่อนส่ง');
  var sheet = ensureRoleNotesSchema_();
  var timestamp = new Date();
  var safeRoleCode = _normalizeRoleWorkCode_(roleCode);
  sheet.appendRow([
    timestamp,
    safeRoleCode,
    roleLabel || safeRoleCode || '-',
    reporter || '-',
    _normalizePhone_(phone || ''),
    cleanNote,
    'new'
  ]);
  addCommanderLog('📝 Note จาก ' + (roleLabel || safeRoleCode || '-') + ': ' + cleanNote.substring(0, 80), reporter || safeRoleCode || 'Role');
  return {
    rowIndex: sheet.getLastRow(),
    time: _formatDateSafe_(timestamp, "dd/MM HH:mm"),
    roleCode: safeRoleCode,
    roleLabel: roleLabel || safeRoleCode || '-',
    reporter: reporter || '-',
    phone: _normalizePhone_(phone || ''),
    note: cleanNote,
    status: 'new'
  };
}

function getRoleNotes(limit) {
  var sheet = ensureRoleNotesSchema_();
  var lastRow = sheet.getLastRow();
  if (lastRow < 2) return [];
  var max = Math.max(1, parseInt(limit) || 50);
  var startRow = Math.max(2, lastRow - max + 1);
  var data = sheet.getRange(startRow, 1, lastRow - startRow + 1, 7).getValues();
  return data.map(function(row, i) {
    return {
      rowIndex: startRow + i,
      time: _formatDateSafe_(row[0], "dd/MM HH:mm"),
      roleCode: _normalizeRoleWorkCode_(row[1]),
      roleLabel: row[2] || row[1] || '-',
      reporter: row[3] || '-',
      phone: _normalizePhone_(row[4] || ''),
      note: row[5] || '',
      status: row[6] || 'new'
    };
  }).reverse();
}

function saveRoleSitrep(text, createdBy) {
  var cleanText = String(text || '').trim();
  if (!cleanText) throw new Error('ไม่มีข้อความ SITREP');
  var sheet = ensureRoleSitrepSchema_();
  var timestamp = new Date();
  sheet.appendRow([timestamp, cleanText, createdBy || 'IC']);
  return {
    rowIndex: sheet.getLastRow(),
    time: _formatDateSafe_(timestamp, "dd/MM HH:mm"),
    text: cleanText,
    createdBy: createdBy || 'IC'
  };
}

function getLatestRoleSitrep() {
  var sheet = ensureRoleSitrepSchema_();
  var lastRow = sheet.getLastRow();
  if (lastRow < 2) return null;
  var row = sheet.getRange(lastRow, 1, 1, 3).getValues()[0];
  return {
    rowIndex: lastRow,
    time: _formatDateSafe_(row[0], "dd/MM HH:mm"),
    text: row[1] || '',
    createdBy: row[2] || 'IC'
  };
}

function getRoleWorkState(roleCode) {
  var safeRoleCode = _normalizeRoleWorkCode_(roleCode);
  var media = getFieldMediaReports(50).filter(function(m) {
    return _normalizeRoleWorkCode_(m.source) === safeRoleCode;
  });
  var notes = getRoleNotes(50).filter(function(n) {
    return _normalizeRoleWorkCode_(n.roleCode) === safeRoleCode;
  });
  return {
    emergState: _safeOCData_(getEmergencyState, {}),
    ergState: _safeOCData_(getERGState, {}),
    sitReports: _safeOCData_(getSitReports, []),
    roleSitrep: _safeOCData_(getLatestRoleSitrep, null),
    mediaReports: media,
    notes: notes
  };
}

function getRoleUpdatesForIC(limit) {
  var roleCodes = { JIC:true, Liaison:true, Specialist:true, Planning:true, Logistics:true, LOGISTICS:true, OSC:true, MED:true, EVAC_POINT:true };
  var readKeys = _safeOCData_(getRoleMediaReadKeys, {});
  var media = getFieldMediaReports(limit || 60).filter(function(m) {
    return !!roleCodes[_normalizeRoleWorkCode_(m.source)];
  }).map(function(m) {
    m.updateType = 'media';
    m.roleCode = _normalizeRoleWorkCode_(m.source);
    m.readKey = _roleMediaReadKey_(m);
    m.read = !!readKeys[m.readKey];
    return m;
  });
  var notes = getRoleNotes(limit || 60).filter(function(n) {
    return !!roleCodes[_normalizeRoleWorkCode_(n.roleCode)];
  }).map(function(n) {
    n.updateType = 'note';
    n.readKey = _roleNoteReadKey_(n);
    n.read = !!readKeys[n.readKey];
    return n;
  });
  return media.concat(notes).sort(function(a, b) {
    return Number(b.rowIndex || 0) - Number(a.rowIndex || 0);
  });
}

function submitFieldCasualtyReport(totalEstimate, stillInArea, evacuatedOrSent, note, loggedBy, agencyId) {
  // 🎚️ Tier guard
  if (agencyId) _requireTierFeature_(agencyId, 'casualty_report', 'รายงานผู้บาดเจ็บ');
  var ss = SpreadsheetApp.openById(SSID);
  var sheet = ss.getSheetByName("Field_Casualty_Report");
  var timestamp = Utilities.formatDate(new Date(), "GMT+7", "dd/MM/yyyy HH:mm:ss");
  var total = Math.max(0, parseInt(totalEstimate) || 0);
  var still = Math.max(0, parseInt(stillInArea) || 0);
  var evacuated = Math.max(0, parseInt(evacuatedOrSent) || 0);

  sheet.appendRow([timestamp, total, still, evacuated, note || '', loggedBy || 'OC']);
  addCommanderLog(
    '🚑 ยอดประมาณการหน้างานจาก ICP: รวม ' + total +
    ' ราย | ยังอยู่ในพื้นที่ ' + still + ' | อพยพ/ส่งออกแล้ว ' + evacuated,
    loggedBy || 'OC'
  );
  return "OK";
}

function getFieldCasualtyReports() {
  var ss = SpreadsheetApp.openById(SSID);
  var sheet = ss.getSheetByName("Field_Casualty_Report");
  if (!sheet || sheet.getLastRow() < 2) return [];
  var data = sheet.getRange(2, 1, sheet.getLastRow() - 1, 6).getValues();
  return data.map(function(row) {
    return {
      time: _formatDateSafe_(row[0], "dd/MM HH:mm"),
      totalEstimate: parseInt(row[1]) || 0,
      stillInArea: parseInt(row[2]) || 0,
      evacuatedOrSent: parseInt(row[3]) || 0,
      note: row[4],
      loggedBy: row[5]
    };
  }).reverse();
}

function getLatestFieldCasualtyReport() {
  var list = getFieldCasualtyReports();
  return list.length ? list[0] : {
    totalEstimate: 0,
    stillInArea: 0,
    evacuatedOrSent: 0,
    note: '',
    loggedBy: '',
    time: ''
  };
}

// ==========================================
// 🆘 Zone: OC/ICP — Support Request
// ==========================================

function ensureSupportRequestSchema_() {
  var ss = SpreadsheetApp.openById(SSID);
  var sheet = ss.getSheetByName("Support_Request") || ss.insertSheet("Support_Request");
  var headers = ["Timestamp","RequestType","Detail","Status","LoggedBy","ResponseNote","UpdatedBy","UpdatedAt"];
  if (sheet.getLastRow() < 1) {
    sheet.getRange(1, 1, 1, headers.length).setValues([headers]);
    return sheet;
  }
  var current = sheet.getRange(1, 1, 1, Math.max(sheet.getLastColumn(), headers.length)).getValues()[0];
  headers.forEach(function(header, i) {
    if (String(current[i] || '').trim() !== header) sheet.getRange(1, i + 1).setValue(header);
  });
  return sheet;
}

function submitSupportRequest(requestType, detail, loggedBy, agencyId) {
  // 🎚️ Tier guard
  if (agencyId) _requireTierFeature_(agencyId, 'support_request', 'ระบบขอสนับสนุน');
  var sheet     = ensureSupportRequestSchema_();
  var timestamp = Utilities.formatDate(new Date(), "GMT+7", "dd/MM/yyyy HH:mm:ss");

  sheet.appendRow([timestamp, requestType, detail, 'pending', loggedBy || 'OC', '', '', '']);
  addCommanderLog('🆘 ขอสนับสนุน [' + requestType + ']: ' + detail, loggedBy || 'OC');
  return "OK";
}

function getSupportRequests() {
  var sheet   = ensureSupportRequestSchema_();
  if (!sheet) return [];
  var lastRow = sheet.getLastRow();
  if (lastRow < 2) return [];
  var data = sheet.getRange(2, 1, lastRow - 1, 8).getValues();
  return data.map(function(row, i) {
    return {
      rowIndex: i + 2,
      time:   _formatDateSafe_(row[0], "dd/MM HH:mm"),
      type:   row[1],
      detail: row[2],
      status: row[3],
      by:     row[4],
      responseNote: row[5] || '',
      updatedBy: row[6] || '',
      updatedAt: _formatDateSafe_(row[7], "dd/MM HH:mm")
    };
  }).reverse();
}

function updateSupportRequestStatus(rowIndex, newStatus, loggedBy, responseNote) {
  var sheet = ensureSupportRequestSchema_();
  if (!sheet) return "Support_Request sheet not found";
  rowIndex = parseInt(rowIndex, 10);
  if (!rowIndex || rowIndex < 2 || rowIndex > sheet.getLastRow()) return "Invalid row";

  var allowed = ['pending', 'acknowledged', 'supported', 'closed', 'rejected'];
  var status = String(newStatus || '').toLowerCase();
  if (allowed.indexOf(status) === -1) status = 'pending';

  sheet.getRange(rowIndex, 4).setValue(status);
  var cleanNote = String(responseNote || '').trim();
  var now = Utilities.formatDate(new Date(), "GMT+7", "dd/MM/yyyy HH:mm:ss");
  sheet.getRange(rowIndex, 6, 1, 3).setValues([[cleanNote, loggedBy || 'IC', now]]);
  var row = sheet.getRange(rowIndex, 1, 1, 8).getValues()[0];
  var labelMap = {
    pending: 'รอพิจารณา',
    acknowledged: 'IC รับทราบแล้ว',
    supported: 'ได้รับการสนับสนุนแล้ว',
    closed: 'ปิดคำขอ',
    rejected: 'ไม่อนุมัติ'
  };
  addCommanderLog('🆘 อัปเดตคำขอสนับสนุน [' + (row[1] || '-') + '] → ' + labelMap[status] + (cleanNote ? ' | ' + cleanNote : ''), loggedBy || 'IC');
  return "OK";
}

// ==========================================
// 📦 Zone: OC/ICP — getOCState (load ทีเดียว)
// ==========================================
// Frontend เรียก 1 ครั้ง ได้ข้อมูลทุกอย่างที่ OC ต้องการ

function getOCState() {
  var emergState = getEmergencyState();
  return {
    resources:   _safeOCData_(getResourceIncoming, []),
    tasks:       _safeOCData_(getTasks, []),
    zoneMarkers: _safeOCData_(getZoneMarkers, []),
    sitReports:  _safeOCData_(getSitReports, []),
    roleSitrep:  _safeOCData_(getLatestRoleSitrep, null),
    mediaReports: _safeOCData_(function() { return getFieldMediaReports(30); }, []),
    roleUpdates: _safeOCData_(function() { return getRoleUpdatesForIC(60); }, []),
    fieldCasualtyReports: _safeOCData_(getFieldCasualtyReports, []),
    supportReqs: _safeOCData_(getSupportRequests, []),
    liveLocations: _safeOCData_(getAllLiveLocations, []),
    evacuationPoints: _safeOCData_(getEvacuationPoints, []),
    zoneConfig:  _safeOCData_(getZoneConfig, {}),
    ergState:    _safeOCData_(getERGState, {}),
    emergState:  emergState
  };
}

function getICDashboardOCData(agencyId, sheetId, joinToken) {
  _routeRequest_(agencyId, sheetId, joinToken);
  var zones = _safeOCData_(getZoneMarkers, []);
  var attendanceSummary = _safeOCData_(getAttendanceSummary, { counts: {}, people: [] });
  return {
    zoneMarkers: zones,
    zoneCount: zones.length,
    resources: _safeOCData_(getResourceIncoming, []),
    attendance: attendanceSummary.people || [],
    attendanceSummary: attendanceSummary,
    sitReports: _safeOCData_(getSitReports, []),
    mediaReports: _safeOCData_(function() { return getFieldMediaReports(30); }, []),
    roleUpdates: _safeOCData_(function() { return getRoleUpdatesForIC(60); }, []),
    supportReqs: _safeOCData_(getSupportRequests, []),
    evacuationPoints: _safeOCData_(getEvacuationPoints, []),
    ergState: _safeOCData_(getERGState, {}),
    fieldCasualtyReports: _safeOCData_(getFieldCasualtyReports, []),  // ✅ เพิ่ม
    emergState: _safeOCData_(getEmergencyState, {})                   // ✅ เพิ่ม
  };
}

function _safeOCData_(fn, fallback) {
  try {
    return fn();
  } catch (e) {
    Logger.log('OC state partial load error [' + fn.name + ']: ' + e.message + ' | stack: ' + e.stack);
    return fallback;
  }
}

// ==========================================
// 🏥 Zone: Health / EMS / 1669
// ==========================================

function getHospitalCapacity() {
  var ss = SpreadsheetApp.openById(SSID);
  var sheet = ss.getSheetByName("Hospital_Capacity");
  if (!sheet || sheet.getLastRow() < 2) return [];
  var data = sheet.getRange(2, 1, sheet.getLastRow() - 1, 9).getValues();
  return data.map(function(row, i) {
    return {
      rowIndex: i + 2,
      name: row[0],
      redCap: parseInt(row[1]) || 0,
      yellowCap: parseInt(row[2]) || 0,
      greenCap: parseInt(row[3]) || 0,
      blackCap: parseInt(row[4]) || 0,
      status: row[5] || 'normal',
      contact: row[6] || '',
      updatedAt: row[7] || '',
      updatedBy: row[8] || ''
    };
  });
}

function updateHospitalCapacity(rowIndex, redCap, yellowCap, greenCap, blackCap, status, contact, loggedBy) {
  var ss = SpreadsheetApp.openById(SSID);
  var sheet = ss.getSheetByName("Hospital_Capacity");
  if (!sheet || rowIndex < 2) return "Invalid row";
  var timestamp = Utilities.formatDate(new Date(), "GMT+7", "dd/MM/yyyy HH:mm:ss");
  sheet.getRange(rowIndex, 2, 1, 8).setValues([[
    Math.max(0, parseInt(redCap) || 0),
    Math.max(0, parseInt(yellowCap) || 0),
    Math.max(0, parseInt(greenCap) || 0),
    Math.max(0, parseInt(blackCap) || 0),
    status || 'normal',
    contact || '',
    timestamp,
    loggedBy || 'MED'
  ]]);
  addCommanderLog('🏥 อัปเดต Hospital Capacity แถว ' + rowIndex + ' → ' + (status || 'normal'), loggedBy || 'MED');
  return "OK";
}

function addPatientTransfer(patientID, triageColor, destinationHospital, ambulance, eta, deconStatus, note, loggedBy) {
  var ss = SpreadsheetApp.openById(SSID);
  var sheet = ss.getSheetByName("Patient_Transfer");
  var timestamp = Utilities.formatDate(new Date(), "GMT+7", "dd/MM/yyyy HH:mm:ss");
  sheet.appendRow([
    timestamp,
    patientID || '-',
    triageColor || '-',
    destinationHospital || '-',
    ambulance || '-',
    eta || '-',
    deconStatus || 'unknown',
    'enroute',
    note || '',
    loggedBy || 'MED'
  ]);
  addCommanderLog('🚑 ส่งต่อผู้ป่วย [' + (triageColor || '-') + '] ไป ' + (destinationHospital || '-') + ' ETA: ' + (eta || '-'), loggedBy || 'MED');
  return "OK";
}

function updatePatientTransferStatus(rowIndex, status, loggedBy) {
  var ss = SpreadsheetApp.openById(SSID);
  var sheet = ss.getSheetByName("Patient_Transfer");
  if (!sheet || rowIndex < 2) return "Invalid row";
  sheet.getRange(rowIndex, 8).setValue(status || 'arrived');
  addCommanderLog('🚑 อัปเดตสถานะส่งต่อผู้ป่วย แถว ' + rowIndex + ' → ' + status, loggedBy || 'MED');
  return "OK";
}

function getPatientTransfers() {
  var ss = SpreadsheetApp.openById(SSID);
  var sheet = ss.getSheetByName("Patient_Transfer");
  var triageDetails = getMedicalTriageDetails();
  if (!sheet || sheet.getLastRow() < 2) return triageDetails;
  var data = sheet.getRange(2, 1, sheet.getLastRow() - 1, 10).getValues();
  var transfers = data.map(function(row, i) {
    return {
      rowIndex: i + 2,
      time: _formatDateSafe_(row[0], "dd/MM HH:mm"),
      patientID: row[1],
      triage: row[2],
      qty: 1,
      hospital: row[3],
      ambulance: row[4],
      eta: row[5],
      deconStatus: row[6],
      status: row[7],
      note: row[8],
      loggedBy: row[9]
    };
  }).reverse();
  return triageDetails.concat(transfers);
}

function addHealthUnit(unitType, unitName, agency, qty, status, eta, note, loggedBy) {
  var ss = SpreadsheetApp.openById(SSID);
  var sheet = ss.getSheetByName("Health_Units");
  var timestamp = Utilities.formatDate(new Date(), "GMT+7", "dd/MM/yyyy HH:mm:ss");
  sheet.appendRow([
    timestamp,
    unitType || 'EMS',
    unitName || '-',
    agency || '-',
    Math.max(0, parseInt(qty) || 0),
    status || 'incoming',
    eta || '-',
    note || '',
    loggedBy || 'MED'
  ]);
  addCommanderLog('🏥 หน่วยสาธารณสุขเข้าร่วม: ' + (unitName || '-') + ' จาก ' + (agency || '-'), loggedBy || 'MED');
  return "OK";
}

function getHealthUnits() {
  var ss = SpreadsheetApp.openById(SSID);
  var sheet = ss.getSheetByName("Health_Units");
  if (!sheet || sheet.getLastRow() < 2) return [];
  var data = sheet.getRange(2, 1, sheet.getLastRow() - 1, 9).getValues();
  return data.map(function(row, i) {
    return {
      rowIndex: i + 2,
      time: row[0],
      type: row[1],
      name: row[2],
      agency: row[3],
      qty: row[4],
      status: row[5],
      eta: row[6],
      note: row[7],
      loggedBy: row[8]
    };
  }).reverse();
}

function getHealthState() {
  var emergState = getEmergencyState();
  return {
    emergState: emergState,
    triageDetails: emergState.triageDetails || getMedicalTriageDetails(),
    roleSitrep: _safeOCData_(getLatestRoleSitrep, null),
    hospitals: getHospitalCapacity(),
    transfers: getPatientTransfers(),
    healthUnits: getHealthUnits(),
    supportReqs: getSupportRequests(),
    resources: getResourceIncoming()
  };
}

// ==========================================
// 🏕️ Zone: Evacuation Point Operations
// ==========================================

function saveEvacuationPoint(pointName, lat, lng, leaderName, evacueeCount, staffCount, water, food, blanket, bed, otherResources, note, loggedBy) {
  var ss = SpreadsheetApp.openById(SSID);
  var sheet = ss.getSheetByName("Evacuation_Points");
  var timestamp = Utilities.formatDate(new Date(), "GMT+7", "dd/MM/yyyy HH:mm:ss");

  pointName = pointName || '-';
  leaderName = leaderName || '-';
  var safeEvacuees = Math.max(0, parseInt(evacueeCount) || 0);
  var safeStaff = Math.max(0, parseInt(staffCount) || 0);

  sheet.appendRow([
    timestamp,
    pointName,
    lat || '',
    lng || '',
    leaderName,
    safeEvacuees,
    safeStaff,
    Math.max(0, parseInt(water) || 0),
    Math.max(0, parseInt(food) || 0),
    Math.max(0, parseInt(blanket) || 0),
    Math.max(0, parseInt(bed) || 0),
    otherResources || '',
    note || '',
    loggedBy || 'Evac'
  ]);

  if (lat && lng) {
    checkInLocation(pointName, 'Evacuation Point', 'evacuation', lat, lng);
  }

  addCommanderLog(
    '🏕️ จุดอพยพ: ' + pointName + ' | หัวหน้า: ' + leaderName +
    ' | ผู้อพยพ ' + safeEvacuees + ' คน | เจ้าหน้าที่ ' + safeStaff + ' คน',
    loggedBy || 'Evac'
  );
  return "OK";
}

function getEvacuationPoints() {
  var cached = _cacheGet_('eoc_evac_points');
  if (cached) return cached;
  var _result = _getEvacuationPointsRaw_();
  _cachePut_('eoc_evac_points', _result, CACHE_TTL);
  return _result;
}
function _getEvacuationPointsRaw_() {
  var ss = SpreadsheetApp.openById(SSID);
  var sheet = ss.getSheetByName("Evacuation_Points");
  if (!sheet || sheet.getLastRow() < 2) return [];
  var data = sheet.getRange(2, 1, sheet.getLastRow() - 1, 14).getValues();
  return data.map(function(row, i) {
    return {
      rowIndex: i + 2,
      time: _formatDateSafe_(row[0], "dd/MM/yyyy HH:mm"),
      pointName: row[1],
      lat: parseFloat(row[2]) || null,
      lng: parseFloat(row[3]) || null,
      leaderName: row[4],
      evacueeCount: parseInt(row[5]) || 0,
      staffCount: parseInt(row[6]) || 0,
      water: parseInt(row[7]) || 0,
      food: parseInt(row[8]) || 0,
      blanket: parseInt(row[9]) || 0,
      bed: parseInt(row[10]) || 0,
      otherResources: row[11],
      note: row[12],
      loggedBy: row[13]
    };
  }).reverse();
}

function getEvacuationState() {
  var emergState = _safeOCData_(getEmergencyState, null);
  if (!emergState) emergState = _safeOCData_(getEmergencyStateLite, {});
  return {
    emergState: emergState,
    roleSitrep: _safeOCData_(getLatestRoleSitrep, null),
    points: _safeOCData_(getEvacuationPoints, [])
  };
}
function getAttendanceCountsDirect() {
  var ss = SpreadsheetApp.openById(SSID);
  var sheet = ss.getSheetByName("Staff_Attendance");
  if (!sheet || sheet.getLastRow() < 2) {
    return { jic:0, ops:0, plan:0, log:0, specialist:0, liaison:0, all:0 };
  }
  var data = sheet.getRange(2, 1, sheet.getLastRow() - 1, 7).getValues();
  var counts = { jic:0, ops:0, plan:0, log:0, specialist:0, liaison:0, all:0 };
  var OPS_CODES = ['OSC','MED','EVAC_POINT','OPERATION','OPERATIONS','OPS'];
  data.forEach(function(row) {
    var code = String(row[6] || '').trim().toUpperCase();
    counts.all++;
    if (code === 'JIC') counts.jic++;
    else if (code === 'PLANNING' || code === 'PLAN') counts.plan++;
    else if (code === 'LOGISTICS' || code === 'LOG') counts.log++;
    else if (code === 'SPECIALIST') counts.specialist++;
    else if (code === 'LIAISON') counts.liaison++;
    else if (OPS_CODES.indexOf(code) !== -1) counts.ops++;
    else counts.ops++;
  });
  return counts;
}

function getAttendanceListByRole(roleType) {
  var ss = SpreadsheetApp.openById(SSID);
  var sheet = ss.getSheetByName("Staff_Attendance");
  if (!sheet || sheet.getLastRow() < 2) return [];
  var data = sheet.getRange(2, 1, sheet.getLastRow() - 1, 7).getValues();
  var OPS_CODES = ['OSC','MED','EVAC_POINT','OPERATION','OPERATIONS','OPS'];
  var result = [];
  data.forEach(function(row) {
    var code = String(row[6] || '').trim().toUpperCase();
    var bucket;
    if (code === 'JIC') bucket = 'jic';
    else if (code === 'PLANNING' || code === 'PLAN') bucket = 'plan';
    else if (code === 'LOGISTICS' || code === 'LOG') bucket = 'log';
    else if (code === 'SPECIALIST') bucket = 'specialist';
    else if (code === 'LIAISON') bucket = 'liaison';
    else bucket = 'ops';
    if (roleType === 'all' || bucket === roleType) {
      result.push({
        time: _formatDateSafe_(row[0], "dd/MM HH:mm"),
        name: row[1],
        role: row[2],
        location: row[3],
        status: row[4] || '',
        phone: String(row[5] || ''),
        roleCode: row[6] || ''
      });
    }
  });
  return result;
}
//=== //เพิ่มต่อท้าย code.gs// ===//

function createDashboardViewToken() {
  var token = Utilities.getUuid().replace(/-/g,'').substring(0,24);
  var props = PropertiesService.getScriptProperties();
  var data = {
    token: token,
    createdAt: Date.now(),
    used: false,
    usedAt: null
  };
  props.setProperty('DASH_VIEW_TOKEN_' + token, JSON.stringify(data));
  var url = (PUBLIC_APP_URL || ScriptApp.getService().getUrl());
  return url + (url.indexOf('?') === -1 ? '?' : '&') + 'vtoken=' + token;
}

function validateDashboardViewToken(token) {
  if (!token) return { valid: false, reason: 'no_token' };
  var props = PropertiesService.getScriptProperties();
  var raw = props.getProperty('DASH_VIEW_TOKEN_' + token);
  if (!raw) return { valid: false, reason: 'not_found' };
  try {
    var data = JSON.parse(raw);
    // หมดอายุใน 8 ชั่วโมง
    if (Date.now() - data.createdAt > 8 * 60 * 60 * 1000) {
      props.deleteProperty('DASH_VIEW_TOKEN_' + token);
      return { valid: false, reason: 'expired' };
    }
    if (data.used) return { valid: false, reason: 'already_used' };
    // mark used
    data.used = true;
    data.usedAt = Date.now();
    props.setProperty('DASH_VIEW_TOKEN_' + token, JSON.stringify(data));
    return { valid: true };
  } catch(e) {
    return { valid: false, reason: 'error' };
  }
}
