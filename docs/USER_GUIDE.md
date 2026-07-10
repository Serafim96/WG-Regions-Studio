# User Guide — WorldGuard Region Viewer

## Table of contents

1. [Install and run](#install-and-run)
2. [Load regions YAML](#load-regions-yaml)
3. [Build scheme](#build-scheme)
4. [Save and load scheme](#save-and-load-scheme)
5. [Navigation: pan and zoom](#navigation-pan-and-zoom)
6. [Nodes: colors, shapes, labels](#nodes-colors-shapes-labels)
7. [Region details, flags, copy name](#region-details-flags-copy-name)
8. [Collapse and expand](#collapse-and-expand)
9. [Edges on the scheme](#edges-on-the-scheme)
10. [Search](#search)
11. [Auto-collapse](#auto-collapse)
12. [Temporary region](#temporary-region)
13. [Metrics](#metrics)
14. [Legend and language](#legend-and-language)
15. [File formats and limits](#file-formats-and-limits)

---

## Install and run

1. Install Python 3.11+ and Node.js 18+.
2. From the project root, run `run.bat` (Windows) or `./run.sh` (Linux/macOS).
3. Your browser opens at http://127.0.0.1:8000 automatically.

The launcher creates a virtual environment, installs dependencies, and builds the UI on first run.

---

## Load regions YAML

1. Click **Open YAML**.
2. Choose your WorldGuard `regions.yml` (or any compatible YAML file).
3. The status line shows how many regions were loaded.

---

## Build scheme

1. After loading YAML, click **Build scheme**.
2. The app builds the parent/child tree, computes spatial overlaps, and lays out nodes.
3. The graph appears in the main area.

If some regions have no `parent` (except the root `root`), a warning lists them; those nodes are highlighted in red on the scheme.

---

## Save and load scheme

### Save

1. Build a scheme first.
2. Click **Save scheme**.
3. Enter a path, e.g. `my_world.mrv.json`.

### Load

1. Click **Load scheme**.
2. Enter the path to an `.mrv.json` file.

### Notes

- **`.mrv.json`** is the app’s saved-scheme format: tree, spatial edges, layout, and metrics. Loading it does **not** recompute geometry from YAML.
- If you load a different YAML later, rebuild the scheme from YAML.
- If the open scheme was built from another YAML file, a `sourceHash` mismatch warning appears.

---

## Navigation: pan and zoom

- **Drag** — pan the graph.
- **Mouse wheel** — zoom in/out (accelerated for large schemes).
- **Search** or links in the region panel — center the camera on a region and zoom in so it is easy to see.

---

## Nodes: colors, shapes, labels

- **Color** — hierarchy depth (parent and child use different hues).
- **Shape** — cuboid/poly2d regions are ovals; **global** and **manual** regions are white ovals (manual uses a dashed border).
- **Label** — region id, priority (`p:`), hierarchy level (`d:`).
- **Collapsed children** — double orange border and `▸ N hidden` in the label when descendants are hidden.
- **Selected** — blue border (single click).
- **Orphan** (no parent, except `root`) — red fill.

---

## Region details, flags, copy name

- **Single click** — select a node (highlight only; graph is not rebuilt).
- **Double click** — open the region card.
- **Right click** — context menu: copy name, hide/show children.

In the region card:

- **Parent** and **Children** lists — click a name to focus the camera on that region (hidden nodes are revealed on the path if needed).
- **Spatial links** — partial overlap, full containment (inside / contains); same click-to-focus behavior.
- **Copy name** — copy region id to the clipboard.
- **Flags** — scrollable table of WorldGuard flags.

---

## Collapse and expand

1. Select a node (click) — the left panel shows collapse controls for that region.
2. **− Hide children** / **+ Show children** — direct children only.
3. **Collapse recursively** / **Expand recursively** — entire subtree.
4. **Collapse all nodes** / **Expand all nodes** — toolbar buttons for the whole scheme.
5. After hide/show, the camera stays centered on the selected region.

Spatial edges of hidden nodes are remapped to the nearest visible ancestor.

---

## Edges on the scheme

| Style | Meaning |
|-------|---------|
| **Thick black arrow** | Hierarchy parent → child |
| **Thin dashed orange** | Partial overlap (`intersects`), no arrow |
| **Thin purple arrow** | Full containment (`contains`): inner region → outer container |

Open **Legend** in the toolbar for visual samples.

---

## Search

- Toolbar button **Search**, or **Ctrl+F**.
- Type a region name; matching ids appear as you type.
- If exactly one match — press Enter or click to focus.
- If several matches — pick from the list.

---

## Auto-collapse

When building a scheme, subtrees whose parent has **more than N direct children** can be auto-hidden. Adjust **Threshold (N)** in the sidebar (default 40) before building.

After collapsing, the layout stays compact; the camera can stay on the node you were working with.

---

## Temporary region

1. Click **+ Temporary region** (requires a built scheme).
2. Enter id, parent, priority, and flags (no coordinates).
3. The region appears on the scheme until you reload YAML and rebuild.

---

## Metrics

**Metrics** opens a panel with:

- total region count by type;
- top regions by block volume;
- top poly2d regions by point count;
- top regions by intersection count.

---

## Legend and language

- **Legend** — visual guide to node and edge styles.
- **Language** — **RU** / **EN** switcher at the top of the sidebar; choice is saved in the browser.

View state (collapsed nodes, selected region) is stored in **localStorage** separately from `.mrv.json` scheme files.

---

## File formats and limits

| File | Purpose |
|------|---------|
| `regions.yml` | Your WorldGuard export (not included in the Git repository) |
| `*.mrv.json` | Saved scheme in **MRV** format (tree, edges, layout, metrics) |

**Behavior notes:**

- `global` and `manual` regions are excluded from spatial overlap calculations.
- Touching boundaries only (no area overlap) is not treated as `intersects`.
- For ~400 regions, overlap computation typically takes 1–2 seconds.
