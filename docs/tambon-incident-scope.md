# Tambon boundaries limited to incident provinces — 2026-10-05

Supersedes the nationwide viewport-loading behavior in `tambon-national.md`.

- Enabling tambon boundaries resolves only IncidentPoint coordinates to provinces using the existing exact polygon lookup, without Longdo geocoding or new API keys.
- Multiple provinces are supported. Other operational points, map viewport, and GISTDA province selections do not expand this scope.
- Legacy incidents without IncidentPoint records use the incident center coordinate.
- Unchanged coordinates reuse the resolved scope across polling, zoom and pan. Out-of-scope sources, layers and listeners are removed. Late responses cannot restore obsolete provinces.
- Unresolved provinces never fall back to nationwide rendering; a status note identifies partial/unknown resolution. Retry cooldown: 60 seconds.
- Layer checkbox remains authoritative; no auto camera moves. Style changes restore only the current scope.
- No GAS, Supabase, incident records, flood geometry or Worker changes.

## Recovery

Pre-change commit: `43f1027`. Backup branch: `backup/pre-incident-tambon-20261005`.
Workspace backups: `../../backups/The-1-ICS-Connect-pre-incident-tambon-20261005.zip` and verified complete-history `.bundle`.
These are code/history backups, not database exports.

## Verification

Scope tests cover one/multiple provinces, stable cached coordinates, removal/listener cleanup, legacy incidents, unresolved/stale responses, disabled layers and style rebuild.
All 12 regression suites passed. GitHub Pages run `37277887169` successfully deployed `aa5ab2c`.

Production Chrome QA: enabled tambon layer for the existing two-point Rayong incident, zoomed out eight levels to a country-scale view, and saw only Rayong boundaries. The layer status remained “เขตตำบลเฉพาะจังหวัดที่เกิดเหตุ: ระยอง”. Switched from satellite to street base: boundaries remained scoped and rendered. Existing two incident markers, two flood areas/depth labels and the red road closure were present before zooming out. No warnings/errors were captured during this check. No operational records were created, changed or deleted.

Proof screenshot in workspace: `../../outputs/tambon-incident-scope-live-20261005.png`.
This reduces boundary-rendering scope; no quantitative response-time or multi-user load benchmark was performed.
