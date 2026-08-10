# Changelog

All notable changes to [WG Regions Studio](https://github.com/Serafim96/WG-Regions-Studio) are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).

Russian version: [ЖУРНАЛ_ИЗМЕНЕНИЙ.md](../RU/ЖУРНАЛ_ИЗМЕНЕНИЙ.md)

## [2.0.11] — 2026-08-10

### Changed

- Windows source launcher: opens the branded classic `conhost` window **before** dependency install, so pip/npm output appears under the app icon.
- After setup, the server keeps running in that same console (no second relaunch).

## [2.0.10] — 2026-08-09

### Added

- **What's New** dialog on the first launch of a new version (once per build).
- Update toast / bell notice includes a short summary from the GitHub release notes.
- README title shows the app icon (`packaging/icon.png`).

### Fixed

- Packaged Windows EXE: no interim console flash on start (Windows subsystem + in-process console allocation).

## [2.0.9] — 2026-08-09

### Changed

- Windows: server always relaunches under classic `conhost` (including Explorer double-click when Default Terminal is Windows Terminal), so the console is a separate window with the app icon — not a Windows Terminal tab.
- Browser tab uses the app favicon.

### Fixed

- Double-clicking `WG-Regions-Studio.exe` no longer opens inside Windows Terminal when it is the system default terminal.

## [2.0.8] — 2026-08-09

### Changed

- App icon: refined daisy + **WGS** (letter size, spacing, stroke weight); Windows `.exe` / zip rebuilt with the new icon.

## [2.0.7] — 2026-08-09

### Added

- Windows packaged build: `WG-Regions-Studio.exe` (daisy + **WGS** icon) with helper files in a zip (`packaging\build_windows.bat`).
- One-click launchers: `WG-Regions-Studio.bat` (Windows), `.command` / `.app` (macOS), `.sh` (Linux) — check/install deps then start (`launch.py`).

### Changed

- Removed `run.bat`; `setup.*` / `run.sh` wrap the new launchers.

## [2.0.6] — 2026-08-09

### Changed

- Top-right selection badge label: **Region: …** / **Регион: …** (was Selected / Выбрано).

## [2.0.5] — 2026-08-09

### Added

- Next to flag help (**?**) in region flags / flag management — icon button to open that flag on the scheme; unsaved edits show a short “save first” flash.
- On the flag scheme, top-right — **Flag: …** badge (click the name to refit the camera; help and flag-management filter buttons to the left).
- Map legend tabs **Scheme** / **Flag scheme**, with labeled node samples (including ◆ / ◇ / ∈ / ≈ and text glow).

### Changed

- Flag-scheme dimming uses washed/muted opaque node colors instead of low opacity (edges no longer show through).
- Flag-scheme spatial edges: highlighted intersections/containment use solid strokes; dim intersections stay washed dashed; fewer expensive dash+alpha combinations while panning.
- Text glow (`text-outline`) only on regions that set the flag (green) and conflict participants (red).
- Wider camera pan margin around the scheme; flag-pick dialog always opens with an empty name field.
- Sidebar starts expanded; camera zoom/pan limits included.

## [2.0.4] — 2026-08-08

### Changed

- Sidebar product title stays **WG Regions Studio** in both English and Russian UI.

## [2.0.3] — 2026-08-08

### Changed

- Product rename: **WG Regions Studio** (repository: [Serafim96/WG-Regions-Studio](https://github.com/Serafim96/WG-Regions-Studio)).

## [2.0.2] — 2026-08-08

### Added

- **Update check** — on startup, compare the running version to the latest GitHub release; if outdated, show a toast and a notifications-bell warning with a link to the release page.

## [2.0.1] — 2026-08-08

### Added

- **Clear flags** — yellow button on the region card and in flag management (selected region), with yes/no confirmation; clears the draft, then **Save**.
- **Delete all flags** — red button in flag management that removes every flag from every region on the scheme, with confirmation.
- Backend `DELETE /api/regions/flags` to clear all region flags in the session.
- **Nesting level** — read-only field on the region card (same as scheme `d:`).

### Changed

- **Flag management** — removed the «flag tree» tab; with a flag filter the tree shows the flag value, and an **Inheritance** checkbox includes inheriting regions.
- Flag highlight: inherited nodes use light text with an outline so labels stay readable on saturated fills (including purple at depth 2).

## [2.0.0] — 2026-08-08

### Added

- **Open file** — one sidebar action opens either WorldGuard `regions.yml` / `.yaml` or a saved `.mrv.json` scheme; YAML builds the scheme immediately.
- **Export YAML** — download WorldGuard-compatible `regions.export.yml` from the current session, with in-app ask about temporary regions and a scrollable error dialog when export is blocked (invalid names, parent cycles, ambiguous flag conflicts, missing coordinates).
- **Flag conflicts** — analyze inheritance overwrites and spatial overlaps; show pairs on the scheme; ambiguous equal-priority cases appear as errors in the notifications bell.
- **Notifications bell** — errors and warnings (conflicts, orphans, overwrites); click an item to focus it on the scheme; refresh icon in the panel header rebuilds the list without toast popups.
- **Temporary regions** — add drafts (including descendants), edit geometry/flags/members, rename and delete any region (cascade / reparent / orphan).
- **Flag management** — tree editor, bulk operations, catalog; flag filter shows values and optional inheritance; scheme flag button is search + **Display** only; highlight options (Intersections / Containment / Inheritance / Conflicts) with ∈ / ≈ captions and carrier values.
- **Region card overlaps** — partial-intersection table with **affected blocks** and **percent**, sortable; spatial edges store `overlapBlocks` from the build.
- **Scheme tools** — reset scheme (drop temporary regions and rebuild), clear session, edge display modes, branch / containment / intersection highlights, realign layout, lock/unlock nodes.
- **UI** — dark/light theme, RU/EN, in-app confirm dialogs (no browser `confirm()` for main flows), green save / red delete affordances, natural sort in lists.

### Changed

- Removed separate **Open YAML** / **Open scheme** / **Build scheme** / **Cancel YAML load** / **Rebuild scheme** flow.
- File picker filters to YAML and scheme extensions only (`excludeAcceptAllOption`); wrong or corrupt files show an in-app error dialog.
- Sidebar no longer dumps node counts / auto-collapse stats into the status line (see **Metrics**).
- Empty scheme: **Save** and actions below it stay disabled until a scheme is loaded.
- Region card containment labels shortened to **Inside** / **Contains**; flag-scheme containment mark is **∈** (with container value) instead of ∉.
- Flag highlight: clearer set-vs-inherit styling; orphan parking and overlap separation in layout; conflict-only mode keeps needed inheritance paths.
- Sidebar collapse control stays top-left on the scheme (next to add temporary region), not inside the sidebar.
- Right-click empty scheme space opens a context menu to add a temporary region; parent is prefilled from a node but remains editable.

### Documentation

- README and bilingual guides under `docs/EN/` and `docs/RU/` updated for the current UI.

## [0.1.0] — 2026-08 — initial public tree

Baseline published on GitHub: YAML parse → hierarchy + spatial edges, Cytoscape scheme, collapse/search/legend/metrics, scheme save/load (`.mrv.json`), bilingual UI, pytest suite, local-only `regions.yml` / `all_flags.txt`.

[2.0.8]: https://github.com/Serafim96/WG-Regions-Studio/releases/tag/v2.0.8
[2.0.7]: https://github.com/Serafim96/WG-Regions-Studio/releases/tag/v2.0.7
[2.0.6]: https://github.com/Serafim96/WG-Regions-Studio/releases/tag/v2.0.6
[2.0.5]: https://github.com/Serafim96/WG-Regions-Studio/releases/tag/v2.0.5
[2.0.4]: https://github.com/Serafim96/WG-Regions-Studio/releases/tag/v2.0.4
[2.0.3]: https://github.com/Serafim96/WG-Regions-Studio/releases/tag/v2.0.3
[2.0.2]: https://github.com/Serafim96/WG-Regions-Studio/releases/tag/v2.0.2
[2.0.1]: https://github.com/Serafim96/WG-Regions-Studio/releases/tag/v2.0.1
[2.0.0]: https://github.com/Serafim96/WG-Regions-Studio/releases/tag/v2.0.0
[0.1.0]: https://github.com/Serafim96/WG-Regions-Studio/tree/6e5bbc9
