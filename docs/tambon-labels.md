# Optional tambon labels — 2026-10-05

The layer menu has a separate “ป้ายชื่อตำบล” checkbox, default off. Labels appear only when tambon boundaries are on and zoom is at least 10. Disabling boundaries hides the labels too; re-enabling preserves the local label preference. No saved incident data or backend is changed.

Labels use the same province GeoJSON source. `NAME_TH_3` is preferred; `NAME_3` is the fallback. Rayong currently has Thai names, but many other province files only have English names. No translated names are invented. Collision prevention and small text with a white halo keep the display legible. Style switching preserves label visibility and incident-province scope; obsolete scope snapshots are not restored.

Backup before changes: branch `backup/pre-tambon-labels-20261005`, commit `e7ee3a4`; workspace ZIP and complete-history bundle in `../../backups/The-1-ICS-Connect-pre-tambon-labels-20261005.*`. These back up code, not production databases.

Regression tests and Chrome visual QA are recorded after verification.
