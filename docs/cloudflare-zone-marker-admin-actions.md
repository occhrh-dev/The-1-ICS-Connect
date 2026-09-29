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
