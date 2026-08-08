# Running unit tests

Backend tests live in `backend/tests/`. You do **not** need Node.js or a running web server — only Python and the packages from `requirements.txt`.

Russian version: [ЗАПУСК_ТЕСТОВ.md](../RU/ЗАПУСК_ТЕСТОВ.md)

## Prerequisites

Run **`setup.bat`** / **`setup.sh`** once (or at least create the venv and `pip install -r requirements.txt`).

## Run all tests

From the repository root (the folder with `pytest.ini`, `backend/`, `frontend/`):

**Windows (PowerShell or CMD):**

```powershell
..\.venv\Scripts\activate
pytest
```

**Linux/macOS:**

```bash
source ../.venv/bin/activate
pytest
```

`pytest.ini` already points at `backend/tests`.

## Optional: focused runs

```bash
pytest backend/tests/test_parser.py
pytest backend/tests/test_full_dataset.py -v
```

Some integration tests use `backend/tests/fixtures/wg_regions_reference.yml`.

## What is covered

| Area | Examples |
|------|----------|
| YAML parser | `test_parser.py` |
| Region tree | `test_tree.py` |
| Spatial geometry | `test_intersections.py` |
| Scheme I/O | `test_scheme.py` |
| Full export | `test_full_dataset.py`, `test_reference_intersections.py` |
