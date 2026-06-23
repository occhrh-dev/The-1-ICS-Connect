// ============================================================
// GAS Bridge — แทน google.script.run ด้วย Cloudflare Worker
// วิธีใช้: ใส่ <script> นี้ไว้ใน index.html
//          ก่อน </style> หรือก่อน script อื่นๆ โหลด
// ============================================================

const WORKER_URL = 'https://the-1-ics-connect.occ-hrh.workers.dev';

// map ชื่อ function → action ที่ Worker รู้จัก
const ACTION_MAP = {
  checkAppLogin:                'checkAppLogin',
  getEmergencyState:            'getEmergencyState',
  getEmergencyStateLite:        'getEmergencyStateLite',
  activateEmergency:            'activateEmergency',
  deactivateEmergency:          'deactivateEmergency',
  getResources:                 'getResources',
  updateResource:               'updateResource',
  updateEmerCount:              'updateResource',
  submitEmergencyAttendance:    'submitEmergencyAttendance',
  getAttendanceData:            'getAttendanceData',
  getAttendanceSummary:         'getAttendanceSummary',
  getICSLeads:                  'getICSLeads',
  setICSLead:                   'claimICSLead',
  claimICSLead:                 'claimICSLead',
  releaseICSLead:               'releaseICSLead',
  getICSCoords:                 'getICSCoords',
  claimICSCoord:                'claimICSCoord',
  releaseICSCoord:              'releaseICSCoord',
  updateMedicalTriage:          'updateMedicalTriage',
  getMedicalTriageDetails:      'getMedicalTriageDetails',
  saveZoneMarker:               'saveZoneMarker',
  getZoneMarkers:               'getZoneMarkers',
  saveZoneConfig:               'saveZoneConfig',
  getZoneConfig:                'getZoneConfig',
  addTask:                      'addTask',
  updateTaskStatus:             'updateTaskStatus',
  getTasks:                     'getTasks',
  getHospitalCapacity:          'getHospitalCapacity',
  updateHospitalCapacity:       'updateHospitalCapacity',
  addPatientTransfer:           'addPatientTransfer',
  getPatientTransfers:          'getPatientTransfers',
  saveWindReport:               'saveWindReport',
  saveERGSelection:             'saveERGSelection',
  getERGState:                  'getERGState',
  checkInLocation:              'checkInLocation',
  getAllLiveLocations:           'getAllLiveLocations',
  addCommanderLog:              'addCommanderLog',
  logAccess:                    'addCommanderLog',
  getLogData:                   'getLogData',
  submitSitReport:              'submitSitReport',
  getSitReports:                'getSitReports',
  addRoleNote:                  'addRoleNote',
  getRoleNotes:                 'getRoleNotes',
  getOCState:                   'getOCState',
  getICDashboardOCData:         'getOCState',
  getBroadcastEventsSince:      'getBroadcastEvents',
  // Agency variants — map ไปหา function เดียวกัน
  getEmergencyStateForAgency:      'getEmergencyState',
  getEmergencyStateLiteForAgency:  'getEmergencyStateLite',
  getICDashboardOCDataForAgency:   'getOCState',
  // Role / Sitrep
  getLatestRoleSitrep:          'getLatestRoleSitrep',
  saveRoleSitrep:               'saveRoleSitrep',
  getRoleWorkState:             'getRoleWorkState',
  getRoleUpdatesForIC:          'getRoleUpdatesForIC',
  markRoleMediaReadForIC:       'markRoleMediaReadForIC',
  getRoleMediaReadKeys:         'getRoleMediaReadKeys',
  // Evacuation
  getEvacuationPoints:          'getEvacuationPoints',
  saveEvacuationPoint:          'saveEvacuationPoint',
  getEvacuationState:           'getEvacuationState',
  // Casualty
  submitFieldCasualtyReport:    'submitFieldCasualtyReport',
  getFieldCasualtyReports:      'getFieldCasualtyReports',
  getLatestFieldCasualtyReport: 'getLatestFieldCasualtyReport',
  // Support Request
  submitSupportRequest:         'submitSupportRequest',
  getSupportRequests:           'getSupportRequests',
  updateSupportRequestStatus:   'updateSupportRequestStatus',
  // Resource Incoming
  addResourceIncoming:          'addResourceIncoming',
  saveResourceIncoming:         'addResourceIncoming',
  getResourceIncoming:          'getResourceIncoming',
  addResourceAdjustment:        'addResourceAdjustment',
  updateResourceStatus:         'updateResourceStatus',
  // Health
  getHealthState:               'getHealthState',
  addHealthUnit:                'addHealthUnit',
  getHealthUnits:               'getHealthUnits',
  // Attendance
  getAttendanceCountsDirect:    'getAttendanceCountsDirect',
  getAttendanceListByRole:      'getAttendanceListByRole',
  getStaffAttendanceDashboard:  'getAttendanceData',
  // Hospital Directory
  getHospitalDirectory:         'getHospitalCapacity',
  // Exposure
  logExposure:                  'logExposure',
  getExposureLog:               'getExposureLog',
  // Media / Upload
  getFieldMediaReports:         '__noop__',
  getFieldMediaUploadToken:     '__noop__',
  registerFieldMediaFile:       '__noop__',
  uploadFieldMedia:             '__noop__',
  // Sitrep generate
  generateAndSendSitrep:        '__noop__',
  // IC Role
  claimICRole:                  'claimICRole',
  releaseICRole:                 'releaseICRole',
  getRegisteredIC:              'getRegisteredIC',
  // EOC Call — noop
  setEOCCallBusy:               '__noop__',
  setEOCCallFree:               '__noop__',
  clearEOCCallByRoom:           '__noop__',
  getEOCCallStatus:             '__noop__',
  // Misc noop
  getDashboardViewUrl:          '__noop__',
  validateJoinToken:            '__noop__',
  createDashboardViewToken:     '__noop__',
  validateDashboardViewToken:   '__noop__',
  setEOCCoords:                 '__noop__',
  updateIncidentLevel:          '__noop__',
  acceptPendingWindReport:      '__noop__',
};

// แปลง arguments array → body object ตาม function
function argsToBody(fnName, args) {
  const a = args || [];
  switch (fnName) {
    case 'checkAppLogin':
      return { inputPass: a[0], deviceId: a[1] };
    case 'activateEmergency':
      return { evtName: a[0], evtLoc: a[1], evtCoords: a[2], evtPlan: a[3],
               evtLevel: a[4], evtEOC: a[5], commanderName: a[6],
               accessRole: a[7], commanderPosition: a[8],
               windDirectionDeg: a[9], windSpeedMs: a[10],
               windMode: a[11], agencyId: a[12], eocCoords: a[13] };
    case 'deactivateEmergency':
      return { commanderName: a[0], accessRole: a[1], agencyId: a[2] };
    case 'updateResource':
    case 'updateEmerCount':
      return { type: a[0], val: a[1] };
    case 'submitEmergencyAttendance':
      return { name: a[0], role: a[1], location: a[2], phone: a[3], roleCode: a[4] };
    case 'setICSLead':
    case 'claimICSLead':
      return { roleCode: a[0], roleLabel: a[1], leadName: a[2], agency: a[3],
               phone: a[4], assignedBy: a[5] };
    case 'releaseICSLead':
      return { roleCode: a[0] };
    case 'claimICSCoord':
      return { sectionCode: a[0], sectionLabel: a[1], coordName: a[2],
               agency: a[3], phone: a[4], assignedBy: a[5] };
    case 'releaseICSCoord':
      return { sectionCode: a[0], coordName: a[1] };
    case 'updateMedicalTriage':
      return { red: a[0], yellow: a[1], green: a[2], black: a[3],
               onsite: a[4], location: a[5], reporter: a[6] };
    case 'saveZoneMarker':
      return { zoneType: a[0], label: a[1], lat: a[2], lng: a[3],
               note: a[4], loggedBy: a[5], phone: a[6] };
    case 'saveZoneConfig':
      return { hotM: a[0], warmM: a[1], coldM: a[2], deconLat: a[3], deconLng: a[4] };
    case 'addTask':
      return { taskName: a[0], type: a[1], priority: a[2], assignedTo: a[3],
               location: a[4], note: a[5], loggedBy: a[6] };
    case 'updateTaskStatus':
      return { taskID: a[0], newStatus: a[1], loggedBy: a[2] };
    case 'updateHospitalCapacity':
      return { hospitalName: a[0], redCap: a[1], yellowCap: a[2],
               greenCap: a[3], blackCap: a[4], status: a[5],
               contact: a[6], loggedBy: a[7] };
    case 'addPatientTransfer':
      return { patientID: a[0], triageColor: a[1], destinationHospital: a[2],
               ambulance: a[3], eta: a[4], deconStatus: a[5],
               note: a[6], loggedBy: a[7] };
    case 'saveWindReport':
      return { directionDeg: a[0], speedMs: a[1], source: a[2], loggedBy: a[3] };
    case 'saveERGSelection':
      return a[0] || {};
    case 'checkInLocation':
      return { name: a[0], role: a[1], type: a[2], lat: a[3], lng: a[4] };
    case 'addCommanderLog':
    case 'logAccess':
      return { msg: a[0], reporter: a[1] };
    case 'addRoleNote':
      return { roleCode: a[0], roleLabel: a[1], reporter: a[2], phone: a[3], note: a[4] };
    case 'getRoleNotes':
      return { limit: a[0] || 50 };
    case 'submitSitReport':
      return { situationTag: a[0], detail: a[1], attachmentURL: a[2], loggedBy: a[3] };
    case 'getBroadcastEventsSince':
      return { since: a[0], agencyId: a[2] || getBridgeAgencyId() || '' };
    case 'clearEOCCallByRoom':
      return { room: a[0] };
    case 'getEmergencyStateForAgency':
    case 'getEmergencyStateLiteForAgency':
      return { agencyId: a[0], sheetId: a[1], joinToken: a[2] };
    case 'saveRoleSitrep':
      return { text: a[0], createdBy: a[1] };
    case 'markRoleMediaReadForIC':
      return { roleType: a[0], keys: a[1], readBy: a[2] };
    case 'saveEvacuationPoint':
      return { pointName: a[0], lat: a[1], lng: a[2], leaderName: a[3],
               evacueeCount: a[4], staffCount: a[5], water: a[6],
               food: a[7], blanket: a[8], bed: a[9],
               otherResources: a[10], note: a[11], loggedBy: a[12] };
    case 'submitFieldCasualtyReport':
      return { totalEstimate: a[0], stillInArea: a[1], evacuatedOrSent: a[2],
               note: a[3], loggedBy: a[4] };
    case 'submitSupportRequest':
      return { requestType: a[0], detail: a[1], loggedBy: a[2] };
    case 'updateSupportRequestStatus':
      return { id: a[0], status: a[1], responseNote: a[2], updatedBy: a[3] };
    case 'addResourceIncoming':
    case 'saveResourceIncoming':
      return { resourceType: a[0], resourceName: a[1], quantity: a[2],
               fromAgency: a[3], eta: a[4], status: a[5],
               note: a[6], loggedBy: a[7], personnelCount: a[8] };
    case 'updateResourceStatus':
      return { id: a[0], status: a[1], loggedBy: a[2] };
    case 'addHealthUnit':
      return { unitType: a[0], unitName: a[1], agency: a[2],
               quantity: a[3], status: a[4], eta: a[5],
               note: a[6], loggedBy: a[7] };
    case 'logExposure':
      return { name: a[0], role: a[1], chemical: a[2], unNumber: a[3],
               durationMin: a[4], ppeLevel: a[5], note: a[6], loggedBy: a[7] };
    case 'claimICRole':
      return { name: a[0], position: a[1], phone: a[2] };
    case 'releaseICRole':
      return { name: a[0], accessRole: a[1] };
    case 'getAttendanceListByRole':
      return { roleCode: a[0] };
    default:
      return {};
  }
}
function getBridgeAgencyId() {
  try {
    if (typeof APP_AGENCY_ID !== 'undefined' && APP_AGENCY_ID) return APP_AGENCY_ID;
    if (globalThis.APP_AGENCY_ID) return globalThis.APP_AGENCY_ID;
    return sessionStorage.getItem('EOC_AGENCY_ID') || '';
  } catch(e) {
    return '';
  }
}

// ============================================================
// google.script.run — Bridge Object
// ใช้แทนของจริงได้เลย โค้ดเดิมไม่ต้องแก้
// ============================================================
window.google = window.google || {};
window.google.script = window.google.script || {};
window.google.script.run = new Proxy({}, {
  get(_, fnName) {
    // สร้าง runner object ที่มี withSuccessHandler / withFailureHandler
    return function(...args) {
      const runner = createRunner(fnName, args);
      return runner;
    };
  }
});

function createRunner(fnName, args) {
  let successCb = null;
  let failureCb = null;

  const runner = {
    withSuccessHandler(cb) { successCb = cb; return runner; },
    withFailureHandler(cb) { failureCb = cb; return runner; },
  };

  // Proxy ให้ทุก property เป็น function ที่ trigger call
  return new Proxy(runner, {
    get(target, prop) {
      if (prop in target) return target[prop];
      // ถูกเรียกชื่อ function จริง เช่น .getEmergencyState()
      return function(...callArgs) {
        const actualFn = prop;
        const actualArgs = callArgs.length > 0 ? callArgs : args;
        callWorker(actualFn, actualArgs, successCb, failureCb);
      };
    }
  });
}

async function callWorker(fnName, args, successCb, failureCb) {
  const action = ACTION_MAP[fnName];

  // noop — ฟังก์ชันที่ยังไม่ implement
  if (action === '__noop__') {
    if (typeof successCb === 'function') successCb(null);
    return;
  }

  if (!action) {
    console.warn('[Bridge] Unknown function:', fnName);
    if (typeof failureCb === 'function') failureCb({ message: 'Unknown function: ' + fnName });
    return;
  }

  const body = argsToBody(fnName, args);

  try {
    const res = await fetch(`${WORKER_URL}/?action=${action}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    const data = await res.json();
    if (data && data.error) {
      console.error('[Bridge] Worker error:', data.error);
      if (typeof failureCb === 'function') failureCb({ message: data.error });
    } else {
      if (typeof successCb === 'function') successCb(data);
    }
  } catch (err) {
    console.error('[Bridge] Fetch error:', err);
    if (typeof failureCb === 'function') failureCb({ message: err.message });
  }
}
