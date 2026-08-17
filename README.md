# <img src="packaging/icon.png" alt="" width="56" height="56" align="absmiddle"> WG Regions Studio

Visualize WorldGuard region hierarchies with spatial overlaps (**intersects**) and full containment (**contains**).

Load your own `regions.yml` or a saved scheme, explore the tree, manage flags, and export YAML back for the plugin — all in the browser.

## Features

- Open **YAML** or **`.mrv.json`** from one **Open file** button
- Hierarchy graph with spatial edges, collapse/expand, search, metrics
- **Legend** with **Scheme** / **Flag scheme** / **Shortcuts** tabs (samples + hotkeys)
- **Visualize flag inheritance** on the scheme and **see conflicts** (overwrites + overlaps)
- Flag scheme badge (fit camera / help / open flag management filtered to that flag)
- Temporary regions, rename/delete, flag manager + catalog, **Export YAML**
- Dark/light theme, Russian / English UI
- Startup check against the latest GitHub release; **What's New** on first launch of a version
## Download / one-click start

| Platform | What to click | Notes |
|----------|---------------|--------|
| **Windows (release)** | `WG-Regions-Studio.exe` inside the zip | No Python/Node needed; keep `_internal` next to the exe |
| **Windows (from source)** | `WG-Regions-Studio.bat` | Checks deps; can install Python/Node via winget; then venv + frontend + start |
| **macOS** | `WG-Regions-Studio.app` or `WG-Regions-Studio.command` | Same bootstrap; may install Python/Node via Homebrew if available |
| **Linux** | `./WG-Regions-Studio.sh` | Same bootstrap (`chmod +x` once if needed) |

Windows zip: [Releases](https://github.com/Serafim96/WG-Regions-Studio/releases) → **`WG-Regions-Studio-*-windows.zip`**.

**Rebuild Windows exe (required for packaged testing):** `packaging\build_windows.bat` → run `dist\WG-Regions-Studio\WG-Regions-Studio.exe` (keep `_internal` beside it). `npm run build` alone does **not** refresh the exe. Dev notes (workspace): `docs/dev/BUILD_WINDOWS.md`.

A frozen macOS `.app` binary (no Python/Node) needs a Mac build machine / CI — not produced on Windows. Until then the `.app` / `.command` wrappers bootstrap from source.

## Requirements (bootstrap / from source)

- Python 3.11+ and Node.js 18+ on PATH, **or** winget (Windows) / Homebrew (macOS) so the launcher can install them

Optional: `setup.bat` / `./setup.sh` only installs (does not start). `run.sh` is a thin alias of `WG-Regions-Studio.sh`.

## Documentation

| | English | Русский |
|--|---------|---------|
| Changelog | [CHANGELOG.md](docs/EN/CHANGELOG.md) | [ЖУРНАЛ_ИЗМЕНЕНИЙ.md](docs/RU/ЖУРНАЛ_ИЗМЕНЕНИЙ.md) |
| User guide | [USER_GUIDE.md](docs/EN/USER_GUIDE.md) | [ИНСТРУКЦИЯ.md](docs/RU/ИНСТРУКЦИЯ.md) |
| Running unit tests | [RUNNING_TESTS.md](docs/EN/RUNNING_TESTS.md) | [ЗАПУСК_ТЕСТОВ.md](docs/RU/ЗАПУСК_ТЕСТОВ.md) |

## License

Use and modify as needed for your server administration workflow.
