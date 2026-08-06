# WorldGuard Region Viewer

Visualize WorldGuard region hierarchies with spatial overlaps (**intersects**) and full containment (**contains**).

Load your own `regions.yml` or a saved scheme, explore the tree, collapse large subtrees, search regions, manage flags, and export YAML back for the plugin — all in the browser.

Repository: [Serafim96/WorldGuard-Region-Viewer](https://github.com/Serafim96/WorldGuard-Region-Viewer)

This repository is the **app** root (`backend/`, `frontend/`, `docs/`). Local workspace files (venv, WorldGuard references, notes) may live one level above when you develop in a larger Cursor workspace.

## Features

- Open **YAML** or **`.mrv.json`** scheme from one **Open file** button (scheme builds immediately from YAML)
- Hierarchy graph with spatial edges, collapse/expand, search, legend, metrics
- **Flag conflicts** (overwrites + overlaps) and a **notifications** bell (errors / warnings)
- Temporary regions, rename/delete, flag manager + catalog, **Export YAML**
- Dark/light theme, Russian / English UI
- See [CHANGELOG.md](CHANGELOG.md) for recent changes

## Requirements

- Python 3.11+
- Node.js 18+ (to build the UI on first run)

## Setup

Virtual environment lives in the **parent** folder (`../.venv`) so it stays outside the git repo:

```bash
python -m venv ../.venv
../.venv\Scripts\activate          # Windows
# source ../.venv/bin/activate     # Linux/macOS
pip install -r requirements.txt
cd frontend && npm install && npm run build && cd ..
```

## Run

From this directory (repo root):

**Windows:** double-click `run.bat` or:

```bash
run.bat
```

**Linux/macOS:**

```bash
chmod +x run.sh && ./run.sh
```

The launcher uses `../.venv`, installs dependencies, builds the frontend if needed, and opens http://127.0.0.1:8000 in your browser.

## Usage

1. Click **Open file** and choose a WorldGuard **`regions.yml`** / `.yaml`, or a saved **`.mrv.json`** scheme.
2. If a scheme is already open, confirm that it will be discarded; YAML is parsed and the scheme is built right away.
3. Use the map controls for search, legend, metrics, collapse/expand, highlights, and the notifications bell.
4. **Save scheme** writes **`.mrv.json`** (tree, edges, layout, metrics). **Export YAML** writes a WorldGuard-compatible `regions.export.yml` (with checks for temporary regions and conflicts).

The UI supports **Russian** and **English** (language switcher in the sidebar).

## Tests

Backend tests live in `backend/tests/`. Run them from this directory (the folder that contains `pytest.ini`, `backend/`, and `frontend/`).

### 1. One-time setup

```bash
python -m venv ../.venv
../.venv\Scripts\activate          # Windows
# source ../.venv/bin/activate     # Linux/macOS
pip install -r requirements.txt
```

### 2. Run all tests

**Windows (PowerShell or CMD), from this folder:**

```powershell
..\.venv\Scripts\activate
pytest
```

**Linux/macOS:**

```bash
cd path/to/WorldGuard-Region-Viewer
source ../.venv/bin/activate
pytest
```

`pytest.ini` already points to `backend/tests`, so no extra paths are needed.

Optional local files for flag/jar tests: place `all_flags.txt` and the WorldGuard jar in the **parent** workspace folder (one level above this repo).

### 3. Optional: full dataset tests

Some integration tests read **`backend/tests/fixtures/wg_regions_reference.yml`** — a frozen copy for pytest.

```bash
pytest backend/tests/test_parser.py
pytest backend/tests/test_full_dataset.py -v
```

### What is covered

| Area | Examples |
|------|----------|
| YAML parser | `test_parser.py` |
| Region tree | `test_tree.py` |
| Spatial geometry | `test_intersections.py` |
| Scheme I/O | `test_scheme.py` |
| Full export | `test_full_dataset.py`, `test_reference_intersections.py` |

You do **not** need Node.js or a running web server for `pytest` — only Python and `requirements.txt` dependencies.

## Documentation

- Changelog: [CHANGELOG.md](CHANGELOG.md)
- Full user guide (English): [docs/USER_GUIDE.md](docs/USER_GUIDE.md)
- Full user guide (Russian): [docs/ИНСТРУКЦИЯ.md](docs/ИНСТРУКЦИЯ.md)

## Data files (not in this repository)

| File | Typical location | Purpose |
|------|------------------|---------|
| `regions.yml` | parent workspace | Your WorldGuard regions export |
| `all_flags.txt` | parent workspace | Flag catalog reference |
| `*.mrv.json` | anywhere you choose | Saved scheme (MRV format) |

## License

Use and modify as needed for your server administration workflow.
