# Cloudflare Worker actions for Admin flood-point management

Add these switch cases immediately after `getZoneMarkers`. The existing `Supabase` helper already scopes `query`, `patchWhere`, and `deleteWhere` by `agency_id`.

```js
case "updateZoneMarker": {
  const {
    markerId,
    zoneType,
    label,
    lat,
    lng,
    note,
    loggedBy,
    accessRole,
    roleLabel: zoneUpdateRoleLabel
  } = body;
  if (String(accessRole || "").trim() !== "admin") {
    throw new Error("Admin permission required");
  }
  if (!markerId) throw new Error("Missing markerId");
  const zoneIdFilter = `id=eq.${encodeURIComponent(markerId)}`;
  const oldRows = await sb.query("zone_markers", "GET", null, `${zoneIdFilter}&limit=1`);
  if (!oldRows || !oldRows.length) throw new Error("Zone marker not found");
  const safeLat = Number(lat);
  const safeLng = Number(lng);
  if (!Number.isFinite(safeLat) || !Number.isFinite(safeLng)) {
    throw new Error("Invalid coordinates");
  }
  await sb.patchWhere("zone_markers", zoneIdFilter, {
    zone_type: zoneType || oldRows[0].zone_type || "",
    label: label || oldRows[0].label || "",
    lat: safeLat,
    lng: safeLng,
    note: note || "",
    logged_by: loggedBy || "Admin",
    timestamp: new Date().toISOString()
  });
  await sb.addIncidentLog(
    `แก้ไขจุด ${zoneType || oldRows[0].zone_type || "-"}: ${label || oldRows[0].label || "-"}`,
    loggedBy || "Admin",
    "zone",
    "Active",
    zoneUpdateRoleLabel || "Admin"
  );
  result = { ok: true, id: markerId };
  break;
}

case "deleteZoneMarker": {
  const {
    markerId,
    loggedBy,
    accessRole,
    roleLabel: zoneDeleteRoleLabel
  } = body;
  if (String(accessRole || "").trim() !== "admin") {
    throw new Error("Admin permission required");
  }
  if (!markerId) throw new Error("Missing markerId");
  const zoneIdFilter = `id=eq.${encodeURIComponent(markerId)}`;
  const oldRows = await sb.query("zone_markers", "GET", null, `${zoneIdFilter}&limit=1`);
  if (!oldRows || !oldRows.length) throw new Error("Zone marker not found");
  await sb.deleteWhere("zone_markers", zoneIdFilter);
  await sb.addIncidentLog(
    `ลบจุด ${oldRows[0].zone_type || "-"}: ${oldRows[0].label || "-"}`,
    loggedBy || "Admin",
    "zone",
    "Active",
    zoneDeleteRoleLabel || "Admin"
  );
  result = { ok: true, id: markerId };
  break;
}
```

Deploy the Worker action before deploying the frontend that calls it. Verify with a non-production agency or an empty test incident first.

## Multi-point incidents and flood polygons during `activateEmergency`

The frontend now sends two additional fields with `activateEmergency`:

- `incidentPoints`: `[{ label, lat, lng, isPrimary }]`
- `floodAreas`: `[{ name, depthCm, severity, points, lat, lng }]`, where every polygon point is `[lng, lat]`

After the existing Worker has cleared the previous incident rows and created the new incident, insert these records into `zone_markers`. Keep the normal agency scope used by the existing `saveZoneMarker` action.

```js
const incidentPoints = Array.isArray(body.incidentPoints) ? body.incidentPoints : [];
const floodAreas = Array.isArray(body.floodAreas) ? body.floodAreas : [];

for (let index = 0; index < incidentPoints.length; index += 1) {
  const point = incidentPoints[index] || {};
  const lat = Number(point.lat);
  const lng = Number(point.lng);
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) continue;
  await sb.insert("zone_markers", {
    zone_type: "IncidentPoint",
    label: point.label || `จุดเกิดเหตุ ${index + 1}`,
    lat,
    lng,
    note: JSON.stringify({ kind: "incidentPoint", version: 1, primary: index === 0 }),
    logged_by: body.commanderName || "Admin",
    timestamp: new Date().toISOString()
  });
}

for (let index = 0; index < floodAreas.length; index += 1) {
  const area = floodAreas[index] || {};
  const points = Array.isArray(area.points)
    ? area.points.map(p => [Number(p?.[0]), Number(p?.[1])])
      .filter(p => Number.isFinite(p[0]) && Number.isFinite(p[1]))
    : [];
  if (points.length < 3) continue;
  const center = points.reduce((sum, p) => ({ lng: sum.lng + p[0], lat: sum.lat + p[1] }), { lng: 0, lat: 0 });
  const lat = Number.isFinite(Number(area.lat)) ? Number(area.lat) : center.lat / points.length;
  const lng = Number.isFinite(Number(area.lng)) ? Number(area.lng) : center.lng / points.length;
  const name = area.name || `พื้นที่น้ำท่วม ${index + 1}`;
  await sb.insert("zone_markers", {
    zone_type: "FloodArea",
    label: name,
    lat,
    lng,
    note: JSON.stringify({
      kind: "floodArea",
      version: 1,
      name,
      depthCm: area.depthCm === "" ? "" : Number(area.depthCm),
      severity: ["monitor", "moderate", "severe"].includes(area.severity) ? area.severity : "moderate",
      points
    }),
    logged_by: body.commanderName || "Admin",
    timestamp: new Date().toISOString()
  });
}
```

The first valid `incidentPoints` item must also become the incident's primary `evtCoords`, preserving weather, navigation, and all older single-point behavior. `IncidentPoint` and `FloodArea` are system map layers and should not count against the operational-zone tier limit.
