# WorldGuard Region Viewer

Visualize WorldGuard region hierarchies with spatial overlaps (intersects) and full containment (contains).

Load your own `regions.yml`, explore the tree, collapse large subtrees, search regions, and inspect flags and metrics in the browser.

This repository is the **app** root (`backend/`, `frontend/`, docs). Local workspace files (venv, WorldGuard references, notes) live one level above when you develop in the full Cursor workspace.

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

From this directory (`app/`):

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

1. Place your WorldGuard **`regions.yml`** next to the app (workspace folder) or pick any path via the file dialog.
2. Click **Open YAML**, then **Build scheme**.
3. Use the toolbar for search, legend, metrics, collapse/expand, and scheme save/load.
4. **Save scheme** / **Load scheme** use the **`.mrv.json`** format — a JSON snapshot of the built graph (nodes, edges, layout, metrics), so you can reopen it without rebuilding from YAML.

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
