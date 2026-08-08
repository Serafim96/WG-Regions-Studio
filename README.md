# WorldGuard Region Viewer

Visualize WorldGuard region hierarchies with spatial overlaps (**intersects**) and full containment (**contains**).

Load your own `regions.yml` or a saved scheme, explore the tree, manage flags, and export YAML back for the plugin — all in the browser.

## Features

- Open **YAML** or **`.mrv.json`** from one **Open file** button
- Hierarchy graph with spatial edges, collapse/expand, search, legend, metrics
- **Visualize flag inheritance** on the scheme and **see conflicts** (overwrites + overlaps)
- Temporary regions, rename/delete, flag manager + catalog, **Export YAML**
- Dark/light theme, Russian / English UI

## Requirements

- Python 3.11+
- Node.js 18+

## Setup

Double-click **`setup.bat`** (Windows) or run **`./setup.sh`** (Linux/macOS).

That creates the virtual environment and installs all dependencies (Python packages and the frontend build). No manual steps.

## Run

**Windows:** double-click `run.bat`

**Linux/macOS:** `chmod +x run.sh && ./run.sh`

Rebuilds the UI and starts the server. Open http://127.0.0.1:8000 in your browser if it was not opened automatically.

## Documentation

| | English | Русский |
|--|---------|---------|
| Changelog | [CHANGELOG.md](docs/EN/CHANGELOG.md) | [ЖУРНАЛ_ИЗМЕНЕНИЙ.md](docs/RU/ЖУРНАЛ_ИЗМЕНЕНИЙ.md) |
| User guide | [USER_GUIDE.md](docs/EN/USER_GUIDE.md) | [ИНСТРУКЦИЯ.md](docs/RU/ИНСТРУКЦИЯ.md) |
| Running unit tests | [RUNNING_TESTS.md](docs/EN/RUNNING_TESTS.md) | [ЗАПУСК_ТЕСТОВ.md](docs/RU/ЗАПУСК_ТЕСТОВ.md) |

## License

Use and modify as needed for your server administration workflow.
