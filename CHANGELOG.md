# Changelog

All notable changes to [WorldGuard Region Viewer](https://github.com/Serafim96/WorldGuard-Region-Viewer) are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).

## [Unreleased]

### Added

- **Open file** — one sidebar action opens either WorldGuard `regions.yml` / `.yaml` or a saved `.mrv.json` scheme; YAML builds the scheme immediately.
- **Export YAML** — download WorldGuard-compatible `regions.export.yml` from the current session, with in-app ask about temporary regions and a scrollable error dialog when export is blocked (invalid names, parent cycles, ambiguous flag conflicts, missing coordinates).
- **Flag conflicts** — analyze inheritance overwrites and spatial overlaps; show pairs on the scheme; ambiguous equal-priority cases appear as errors in the notifications bell.
- **Notifications bell** — errors and warnings (conflicts, orphans, overwrites); click an item to focus it on the scheme; refresh icon in the panel header rebuilds the list without toast popups.
- **Temporary regions** — add drafts (including descendants), edit geometry/flags/members, rename and delete any region (cascade / reparent / orphan).
- **Flag management** — tree editor, bulk operations, catalog, flag tree view on the scheme (collapsible, values, inheritance).
- **Scheme tools** — reset scheme (drop temporary regions and rebuild), clear session, edge display modes, branch / containment / intersection highlights, realign layout, lock/unlock nodes.
- **UI** — dark/light theme, RU/EN, in-app confirm dialogs (no browser `confirm()` for main flows), green save / red delete affordances, natural sort in lists.

### Changed

- Removed separate **Open YAML** / **Open scheme** / **Build scheme** / **Cancel YAML load** / **Rebuild scheme** flow.
- File picker filters to YAML and scheme extensions only (`excludeAcceptAllOption`); wrong or corrupt files show an in-app error dialog.
- Sidebar no longer dumps node counts / auto-collapse stats into the status line (see **Metrics**).
- Empty scheme: **Save** and actions below it stay disabled until a scheme is loaded.

### Documentation

- README, English [USER_GUIDE](docs/USER_GUIDE.md), and Russian [ИНСТРУКЦИЯ](docs/ИНСТРУКЦИЯ.md) updated for the current UI.

## [0.1.0] — 2026-08 — initial public tree

Baseline published on GitHub: YAML parse → hierarchy + spatial edges, Cytoscape scheme, collapse/search/legend/metrics, scheme save/load (`.mrv.json`), bilingual UI, pytest suite, local-only `regions.yml` / `all_flags.txt`.

[Unreleased]: https://github.com/Serafim96/WorldGuard-Region-Viewer/compare/6e5bbc9...HEAD
[0.1.0]: https://github.com/Serafim96/WorldGuard-Region-Viewer/tree/6e5bbc9
