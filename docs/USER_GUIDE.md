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
11. [Flag management](#flag-management)
12. [Auto-collapse](#auto-collapse)
13. [Temporary region](#temporary-region)
14. [Metrics](#metrics)
15. [Legend and language](#legend-and-language)
16. [File formats and limits](#file-formats-and-limits)

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
3. YAML is validated and loaded into the current session; the status line shows the region count. If a scheme is already displayed, it stays unchanged until you explicitly build it again.

---

## Build scheme

1. After loading YAML, click **Build scheme**.
2. The app builds the parent/child tree, computes spatial overlaps, and lays out nodes.
3. The graph appears in the main area (camera resets to a full overview; a previous search focus is cleared).

If some regions have no `parent` (except the root `root`), a warning lists them; those nodes are highlighted in red on the scheme.

---

## Save and load scheme

### Save

1. Build a scheme first.
2. Click **Save scheme**.
3. In the system file dialog choose a folder and filename (e.g. `my_world.mrv.json`).

### Load

1. Click **Load scheme**.
2. In the system file dialog pick an `.mrv.json` file.

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
- **Right click** — context menu: **Properties** (same as double-click), copy name, hide/show children (direct and recursive), and more.
- Bottom-right scheme controls: zoom and **fullscreen** (like F11).
- Bottom-left also has **edge display mode** (intersects / containment / both / hierarchy / all). Special highlights respect the active edge filter.
- Top-right badge **Selected: …** — click to center and zoom the camera on that region.

In the region card:

- **Parent** and **Children** lists — click a name to focus the camera on that region (hidden nodes are revealed on the path if needed). Use **Edit** next to Parent to change, clear, or set a parent (cycles are rejected).
- **Spatial links** — partial overlap, full containment (inside / contains); same click-to-focus behavior. Region names are blue underlined links.
- **Copy** icon next to the region name — copy region id to the clipboard (status «Copied»).
- **Flags** — always visible scrollable WorldGuard flags table; **«?»** next to a name opens the catalog description.

---

## Collapse and expand

1. Select a node (click) — a **Selected: name** badge appears top-right; click it to center and zoom. Click empty space on the scheme to deselect.
2. Right-click → **− Hide children**, **− Collapse recursively**, **+ Show children**, **+ Expand recursively**.
3. Top-right **expand / collapse** buttons always affect the **whole** scheme. Below them — **expand with threshold** (same as auto-collapse).
4. Right-click → **Highlight branch** → submenu: **Entire** (ancestors + descendants), **Children only**; for non-global regions also **Intersections** and **Containment** → **All** / **Children only** / **Parents only**. If no related regions exist — a toast notification. The camera fits the selection. When a parent is collapsed, remapped spatial highlight edges stay bright. **Clear branch highlight** turns the mode off. A new special highlight clears the previous one (including conflict highlight).
5. Collapse/expand does **not** move the camera.

Spatial edges of hidden nodes are remapped to the nearest visible ancestor.

---

## Edges on the scheme

| Style | Meaning |
|-------|---------|
| **Thick black arrow** | Hierarchy parent → child |
| **Thin dashed orange** | Partial overlap (`intersects`), no arrow |
| **Thin purple arrow** | Full containment (`contains`): inner region → outer container |

Open **Legend** in the toolbar for visual samples.

Bottom-left **edge display mode** filters which families are drawn (intersects only, containment only, both spatial, hierarchy only, or all). Special highlights are applied on top of that filter — edges hidden by the mode stay hidden.

---

## Search

- Toolbar button **Search**, or **Ctrl+F** (only on the main scheme view when no other dialogs are open).
- Type a region name; matching ids appear as you type.
- If exactly one match — press Enter or click to focus.
- If several matches — pick from the list.
- After **Expand all nodes**, search still zooms in on the selected region (it does not snap back to a full-scheme overview).
- Search focus is one-shot: later collapse/expand actions do not keep pulling the camera back to the previously found region.
- Building the scheme again clears the search focus and fits the full overview (and shows the orphan-parent warning when applicable).

---

## Flag management

1. Click **Flag management** (a built scheme is required). You can also open it from a node **context menu** — then the tree shows regions with flags plus the chosen region and all its parents, ready for editing.
2. Left: tree of regions with flags (**green** text) and their parents (parents are selectable so you can add flags there too).
3. Toggle **All regions** / **Only with flags**. Subtrees without flags start collapsed; use **Expand all** to open everything. Switching to all regions always resets to the collapsed default.
4. The **+** button opens a region search for nodes that are not yet in the tree; the chosen region is inserted with its parents.
5. Right: editable flag table for the selected region (name, value, catalog type). Add, edit, or remove rows, then **Save**. Flags can also be edited in the region card (double-click a node).
6. **Flag tree view**: pick any flag that is set somewhere to see the nearest-to-root assignment and every descendant that reassigns it (even to the same value). **Show on scheme** dims unrelated nodes and keeps the assignment path bright.
7. **Bulk operation**: pick a flag, choose Update or Delete, build a target list via search, or click **For all**.
8. Changes apply to the current session and are kept when you save the scheme (`.mrv.json`); the source YAML on disk is not overwritten.

---

## Flag conflicts

When the scheme is built (and after flag edits), the app computes *effective flags* by walking `parent` chains.

The analysis dialog has two tabs:
- **Overwrites** — a child *explicitly* sets a different value than its parent. This is normal WorldGuard inheritance, not a conflict (e.g. `passthrough` on `root` → different value on `metro`). On scheme open and after edits they appear in the bell as **warnings**.
- **Region overlaps** — overlapping regions (not parent/child) have different effective values. The full list is in the dialog; each overlap (and each overwrite) has **Show on scheme**, which highlights only that pair/path — not every region that sets the same flag. **Bell**: equal priority (ambiguous value) → **Errors** tab (title «Flag conflict …»; no Clear button and no per-item ×); higher priority on one region → **Warnings** (after flag edits; Clear and × available). Regions without `parent` (except root) also appear under **Warnings** when the scheme opens. On scheme open/build, errors, overwrites, and orphans are notified immediately (bell + toasts; the toast × hides toasts but keeps bell entries). Opening a new scheme clears old notifications; they are not kept after the app is closed. Notification text can be selected and copied.

Clicking a notification (or the on-screen toast) shows the conflict **on the flag scheme**: overlaps highlight only the chosen pair with a red border and spatial edge; overwrites highlight parent and child; orphans focus the region. When a conflict is fixed, its notification is removed automatically. Warning items also have an × to dismiss that entry only.

Bottom-left on the scheme — a warning-triangle button for problem-region highlight (dropdown: regions in errors / warnings). When active the button lights up and other nodes are dimmed, like flag-scheme mode. Below it, a **clear special highlight** button appears when a notification, conflict-analysis, or branch highlight is active.

On spatial overlaps, the winner is chosen only by higher region `priority`. When priorities are **equal**, the winner is treated as unclear (error) — including for `state` flags, because WorldGuard may pick either region.
---

## Export regions.yml

Click **Export regions.yml** to generate WorldGuard-compatible YAML from the *current session* (including flag changes).

Before download:
1. the app asks whether to **include temporary regions**;
2. if yes and any temporary non-global region lacks coordinates — export is blocked;
3. if no — temporary regions are omitted (YAML children are reparented to the nearest exported ancestor);
4. a `parent` cycle blocks export;
5. otherwise YAML is downloaded as `regions.export.yml`.

---

## Auto-collapse

When building a scheme, subtrees whose parent has **more than N direct children** can be auto-hidden. Adjust **Threshold (N)** in the sidebar (default 40) before building. The **expand with threshold** button on the scheme restores that same state after a full expand.

Drag the sidebar’s right edge to change its width (the default width is the minimum).

After collapsing, the layout stays compact; the camera does not jump when collapsing a selected region.

---

## Temporary region

1. Click **+** on the graph or **+ Temporary region** in the sidebar (requires a built scheme).
2. Enter id, parent, priority.
3. Type: **global** (no coordinates) or regular **cuboid** / **poly2d** with coordinates (can be filled later).
4. In the temporary region card (double-click) you can switch global ↔ regular and edit coordinates.
5. The region appears on the scheme until you reload YAML and rebuild.

---

## Metrics

**Metrics** opens a panel with:

- total region count by type;
- top regions by block volume;
- top poly2d regions by point count;
- top regions by intersection count.

---

## Legend and language

- **Legend** — two tabs:
  - **Scheme** — visual guide to node and edge styles;
  - **Flags** — WorldGuard catalog (name, type, description) with search. Standard entries are read-only; you can add custom catalog entries (and delete only those).
- In the flags manager, flag names use typeahead suggestions while typing (unknown/custom names are still allowed).
- In flag tables (region card, flags manager, conflicts) the **«?»** button opens a short description tip for known flags only.
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

## Interface and flags catalog controls

- Opening YAML now parses it into the current session only: an already displayed scheme stays visible until you click **Rebuild scheme**. The action is **Reset scheme** for the current YAML, and **Build scheme** when no scheme is shown.
- Bottom of the sidebar — **Clear scheme**: resets the session to the empty post-startup state (no YAML / no on-screen scheme; language, theme, and sidebar settings are kept).
- **Legend** contains only scheme symbols. The separate **Flags catalog** button opens Standard and Custom flag tabs.
- Add custom flags using supported WorldGuard types, import/export their JSON catalog, or delete them. Deleting also removes the flag from every region in the current scheme after a confirmation that lists affected region IDs.
- The sidebar can be collapsed with its top control; drag the right edge to resize. Graph corners: **+** (temporary) top-left; expand/collapse all and search top-right; lock, legend and problem mode bottom-left (clear special highlight below them when active); zoom bottom-right.
- The scheme starts locked. The lock icon toggles between closed and open.
