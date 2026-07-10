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
2. Optionally add **`all_flags.txt`** next to the app for flag type hints in the region panel.
3. Click **Open YAML**, then **Build scheme**.
4. Use the toolbar for search, legend, metrics, collapse/expand, and scheme save/load (`.mrv.json`).

The UI supports **Russian** and **English** (language switcher in the sidebar).

## Tests

```bash
pytest
```

Integration tests expect `regions.yml` in the project root; they are skipped if the file is missing.

## Documentation

Full user guide (Russian): [docs/ИНСТРУКЦИЯ.md](docs/ИНСТРУКЦИЯ.md)

## Data files (not in this repository)

These files are local-only (see `.gitignore`):

| File | Purpose |
|------|---------|
| `regions.yml` | Your WorldGuard regions export |
| `all_flags.txt` | WorldGuard flags reference for the UI |
| `*.mrv.json` | Saved scheme snapshots |

## License

Use and modify as needed for your server administration workflow.
