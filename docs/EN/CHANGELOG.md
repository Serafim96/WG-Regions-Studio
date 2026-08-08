# Changelog

All notable changes to [WG Regions Studio](https://github.com/Serafim96/WG-Regions-Studio) are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).

Russian version: [ЖУРНАЛ_ИЗМЕНЕНИЙ.md](../RU/ЖУРНАЛ_ИЗМЕНЕНИЙ.md)

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

[2.0.4]: https://github.com/Serafim96/WG-Regions-Studio/releases/tag/v2.0.4
[2.0.3]: https://github.com/Serafim96/WG-Regions-Studio/releases/tag/v2.0.3
[2.0.2]: https://github.com/Serafim96/WG-Regions-Studio/releases/tag/v2.0.2
[2.0.1]: https://github.com/Serafim96/WG-Regions-Studio/releases/tag/v2.0.1
[2.0.0]: https://github.com/Serafim96/WG-Regions-Studio/releases/tag/v2.0.0
[0.1.0]: https://github.com/Serafim96/WG-Regions-Studio/tree/6e5bbc9
