# Optional tambon labels — 2026-10-05

The layer menu has a separate “ป้ายชื่อตำบล” checkbox, default off. Labels appear only when tambon boundaries are on and zoom is at least 10. Disabling boundaries hides the labels too; re-enabling preserves the local label preference. No saved incident data or backend is changed.

Labels use the same province GeoJSON source. `NAME_TH_3` is preferred; `NAME_3` is the fallback. Rayong currently has Thai names, but many other province files only have English names. No translated names are invented. Collision prevention and small text with a white halo keep the display legible. Style switching preserves label visibility and incident-province scope; obsolete scope snapshots are not restored.

Backup before changes: branch `backup/pre-tambon-labels-20261005`, commit `e7ee3a4`; workspace ZIP and complete-history bundle in `../../backups/The-1-ICS-Connect-pre-tambon-labels-20261005.*`. These back up code, not production databases.

All 12 regression suites passed, including label defaults, visibility without new fetches, boundary-off hiding, fallback properties and style rebuild. Pages run `37278790243` successfully deployed `f429068`.

Chrome QA on the existing incident: Thai names visibly rendered (ทับมา, มาบตาพุด, บ้านค่าย); unchecking labels removed names while boundaries stayed visible. Switching base styles preserved the checked preference. Disabling boundaries disabled the label control, and re-enabling restored it. No operational records were changed. Satellite view was left with labels enabled for the user to inspect.

One MapTiler street-style warning about missing image `transportation:road_` appeared during the street-base switch; no JavaScript errors were captured. This warning is not a tambon-label glyph error.

Workspace proof: `../../outputs/tambon-labels-live-20261005.png`.
