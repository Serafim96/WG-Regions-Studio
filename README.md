# WorldGuard Region Viewer

Visualize WorldGuard region hierarchies with spatial overlaps (intersects) and full containment (contains).

Load your own `regions.yml`, explore the tree, collapse large subtrees, search regions, and inspect flags and metrics in the browser.

## Requirements

- Python 3.11+
- Node.js 18+ (to build the UI on first run)

## Setup

```bash
python -m venv .venv
.venv\Scripts\activate          # Windows
# source .venv/bin/activate     # Linux/macOS
pip install -r requirements.txt
cd frontend && npm install && npm run build && cd ..
```

## Run

**Windows:** double-click `run.bat` or:

```bash
run.bat
```

**Linux/macOS:**

```bash
chmod +x run.sh && ./run.sh
```

The launcher creates a virtual environment, installs dependencies, builds the frontend if needed, and opens http://127.0.0.1:8000 in your browser.

## Usage

1. Place your WorldGuard **`regions.yml`** in the project folder (or pick any path via the file dialog).
2. Click **Open YAML**, then **Build scheme**.
3. Use the toolbar for search, legend, metrics, collapse/expand, and scheme save/load.
4. **Save scheme** / **Load scheme** use the **`.mrv.json`** format — a JSON snapshot of the built graph (nodes, edges, layout, metrics), so you can reopen it without rebuilding from YAML.

The UI supports **Russian** and **English** (language switcher in the sidebar).

## Tests

Backend tests live in `backend/tests/`. Run them from the **project root** (the folder that contains `pytest.ini`, `backend/`, and `frontend/`).

### 1. One-time setup

Use the same virtual environment as the app:

```bash
python -m venv .venv
.venv\Scripts\activate          # Windows
# source .venv/bin/activate     # Linux/macOS
pip install -r requirements.txt
```

### 2. Run all tests

**Windows (PowerShell or CMD), from project root:**

```powershell
cd path\to\WorldGuard-Region-Viewer
.venv\Scripts\activate
pytest
```

**Linux/macOS:**

```bash
cd path/to/WorldGuard-Region-Viewer
source .venv/bin/activate
pytest
```

`pytest.ini` already points to `backend/tests`, so no extra paths are needed.

### 3. Optional: full dataset tests

Some tests read **`regions.yml`** from the project root (same file you use in the UI). If the file is missing, those tests are **skipped**; the rest still run.

```text
WorldGuard-Region-Viewer/
├── regions.yml          ← optional, for integration tests
├── pytest.ini
├── backend/tests/       ← test files
└── ...
```

Run a single file or test:

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
| Full export (needs `regions.yml`) | `test_full_dataset.py`, `test_reference_intersections.py` |

You do **not** need Node.js or a running web server for `pytest` — only Python and `requirements.txt` dependencies.

## Documentation

- Full user guide (English): [docs/USER_GUIDE.md](docs/USER_GUIDE.md)
- Full user guide (Russian): [docs/ИНСТРУКЦИЯ.md](docs/ИНСТРУКЦИЯ.md)

## Data files (not in this repository)

These files are local-only (see `.gitignore`):

| File | Purpose |
|------|---------|
| `regions.yml` | Your WorldGuard regions export |
| `*.mrv.json` | Saved scheme in the app’s **MRV** format (built tree, spatial edges, layout, metrics) — created via **Save scheme**, opened via **Load scheme** |

## License

Use and modify as needed for your server administration workflow.
