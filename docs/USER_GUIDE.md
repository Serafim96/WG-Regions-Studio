# User Guide — WorldGuard Region Viewer

## Table of contents

1. [Install and run](#install-and-run)
2. [Open a file (YAML or scheme)](#open-a-file-yaml-or-scheme)
3. [Save scheme](#save-scheme)
4. [Navigation: pan and zoom](#navigation-pan-and-zoom)
5. [Nodes: colors, shapes, labels](#nodes-colors-shapes-labels)
6. [Region details, flags, copy name](#region-details-flags-copy-name)
7. [Collapse and expand](#collapse-and-expand)
8. [Edges on the scheme](#edges-on-the-scheme)
9. [Search](#search)
10. [Flag management](#flag-management)
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

## Open a file (YAML or scheme)

1. Click **Open file** (blue while no scheme is loaded).
2. If a scheme is already on screen, confirm that it will be discarded (in-app dialog, not the browser confirm).
3. In the system file dialog pick either a WorldGuard `regions.yml` / `.yaml` or a saved `.mrv.json` scheme.
4. The file is applied immediately: YAML is parsed and the scheme is built; `.mrv.json` loads the saved scheme.

Until a scheme exists, **Save scheme** and everything below it (flag management, catalog, clear, etc.) stay disabled.

Regions without `parent` (except `root`) are highlighted in red and appear in notifications (bell / Warnings).

### Notes

- **`.mrv.json`** is the app’s saved-scheme format: tree, spatial edges, layout, and metrics. Loading it does **not** recompute geometry from YAML.
- If the open scheme was built from another YAML file, a `sourceHash` mismatch warning may appear.

---

## Save scheme

1. Open a YAML or scheme file.
2. Click **Save scheme**.
3. In the system file dialog choose a folder and filename (e.g. `my_world.mrv.json`).

---

## Navigation: pan and zoom

- **Drag** — pan the graph.
- **Mouse wheel** — zoom in/out (accelerated for large schemes).
- **Search** or links in the region panel — center the camera on a region and zoom in so it is easy to see (zoom is capped by a shared limit).
- When fitting the camera to several nodes (conflict, overwrite, branch), the same zoom ceiling applies: if the selection already hit the limit, zoom stops even if empty margin remains around the edges.

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
- Bottom-right scheme controls: **Legend**, zoom, and **fullscreen** (like F11).
- Top-right badge **Selected: …** — click to center and zoom the camera on that region.

In the region card:

- **Name** — **Rename** opens the same dialog as the scheme context menu (Latin id only: letters, digits, `_`, `-`); parent/children links and spatial edges are kept.
- **Parent**, **priority**, **children** — priority is editable; click a name to focus the camera (hidden nodes on the path are revealed if needed). **Edit** next to Parent to change, clear, or set a parent (cycles are rejected). Children and spatial links are shown as bordered tables.
- **Type and coordinates** — for non-global regions (including from YAML) you can change cuboid/poly2d and coordinates (**Point 1** / **Point 2**); values are validated as integers and for completeness.
- **Owners / Members** — editable `players` and `unique-ids` tables.
- **Flags** — always visible scrollable WorldGuard flags table; **«?»** next to a name opens the catalog description.
- **Copy** icon next to the name — copy region id to the clipboard.
- Closing with unsaved edits asks for confirmation.

---

## Collapse and expand

1. Select a node (click) — a **Selected: name** badge appears top-right; click it to center and zoom. Click empty space on the scheme to deselect.
2. Right-click → **− Hide children**, **− Collapse recursively**, **+ Show children**, **+ Expand recursively**.
3. Top-right **expand / collapse** buttons always affect the **whole** scheme. Below them — **expand with threshold** (same as auto-collapse).
4. Right-click → **Highlight branch** → submenu: **Entire** (ancestors + descendants), **Children only**; for non-global regions also **Intersections** and **Containment** → **All** / **Children only** / **Parents only**. If no related regions exist — a toast notification. The camera fits the selection. When a parent is collapsed, remapped spatial highlight edges stay bright. **Clear branch highlight** turns the mode off. A new special highlight clears the previous one (including conflict highlight).
5. Collapse/expand (whole scheme or one node's children, including recursive) fits the camera to the remaining / newly visible nodes so they fill the viewport.

Spatial edges of hidden nodes are remapped to the nearest visible ancestor.

---

## Edges on the scheme

| Style | Meaning |
|-------|---------|
| **Thick black arrow** | Hierarchy parent → child |
| **Thin dashed orange** | Partial overlap (`intersects`), no arrow |
| **Thin purple arrow** | Full containment (`contains`): inner region → outer container |

Open **Legend** (bottom-right on the scheme) for visual samples of scheme styles and flag-highlight styles (both sections are always shown).

Edges are not selectable or clickable.

Bottom-right — legend, zoom, and fullscreen. Bottom-left — **edge display mode**: intersects only, containment only, both spatial, hierarchy only, or all. Special highlights are applied on top of that filter — edges hidden by the mode stay hidden.

---

## Search

- Toolbar button **Search**, or **Ctrl+F** (only on the main scheme view when no other dialogs are open).
- Type a region name; matching ids appear as you type.
- If exactly one match — press Enter or click to focus.
- If several matches — pick from the list.
- After **Expand all nodes**, search still zooms in on the selected region (it does not snap back to a full-scheme overview).
- Search focus is one-shot: later collapse/expand actions do not keep pulling the camera back to the previously found region.
- Building the scheme again clears the search focus and fits the full overview (orphan regions are notified via the bell when applicable).

---

## Flag management

1. Click **Flag management** (a built scheme is required). You can also open it from a node **context menu** — then the tree shows regions with flags plus the chosen region and all its parents, ready for editing.
2. Left: tree of regions with flags (**green** text) and their parents. The left panel width is resizable.
3. One toolbar row: **expand/collapse all**, **Only with flags** checkbox, and **+** to add a flagless region into the tree.
4. Right, above the table: **Catalog** and **Bulk operation** (separate dialog).
5. Flag table: names must exist in the catalog and values must be filled, or **Save** rejects the rows. Name suggestions use a dropdown list.
6. **Flag tree view** is a **flag icon** bottom-left on the scheme (not inside flag management). The tree is collapsible (same as flag management): **green** marks regions that set the flag (value shown); inheriting regions appear too. **Show on scheme** highlights the path and fits the camera so all flagged nodes are visible, even at opposite ends of the scheme.
7. Changes apply to the current session and are kept when you save the scheme (`.mrv.json`); the source YAML on disk is not overwritten.

---

## Flag conflicts

When the scheme is built (and after flag edits), the app computes flag values by walking `parent` chains.

The analysis dialog has two tabs:
- **Overwrites** — a child *explicitly* sets a different value than its parent. This is normal WorldGuard inheritance, not a conflict (e.g. `passthrough` on `root` → different value on `metro`). On scheme open and after edits they appear in the bell as **warnings**.
- **Region overlaps** — overlapping regions (not parent/child) have different values. The full list is in the dialog; each overlap (and each overwrite) has **Show on scheme**, which highlights only that pair/path — not every region that sets the same flag. **Bell**: equal priority (ambiguous value) → **Errors** tab (title «Flag conflict …»; no Clear button and no per-item ×); higher priority on one region → **Warnings** (after flag edits; Clear and × available). Regions without `parent` (except root) also appear under **Warnings** when the scheme opens. On scheme open/build, errors, overwrites, and orphans are notified immediately (bell + toasts; the toast × hides toasts but keeps bell entries). Opening a new scheme clears old notifications; they are not kept after the app is closed. Notification text can be selected and copied.

Clicking a notification (or the on-screen toast) shows the conflict **on the flag scheme**: overlaps highlight only the chosen pair with a red border and spatial edge (plus inheritance parent path); overwrites highlight parent and child; orphans focus the region. The camera fits **all** highlighted nodes, with the same zoom ceiling as single-region focus. When a conflict is fixed, its notification is removed automatically. Warning items also have an × to dismiss that entry only.

Bottom-left on the scheme — a warning-triangle button for problem-region highlight (dropdown: regions in errors / warnings). When active the button lights up and other nodes are dimmed, like flag-scheme mode. Below it, a **clear special highlight** button appears when a notification, conflict-analysis, or branch highlight is active.

On spatial overlaps, the winner is chosen only by higher region `priority`. When priorities are **equal**, the winner is treated as unclear (error) — including for `state` flags, because WorldGuard may pick either region.
---

## Export YAML

Click **Export YAML** (under Save scheme) to generate WorldGuard-compatible YAML from the *current session* (including flag changes).

Below it there is no separate validate button: current errors and warnings are already in the **bell**. The refresh icon in the notifications panel header clears and rebuilds the list from the current scheme (without toast popups).

Before download:
1. the app asks whether to **include temporary regions** (in-app dialog);
2. if yes and any temporary non-global region lacks coordinates — export is blocked with an explicit error list;
3. if no — temporary regions are omitted (YAML children are reparented to the nearest exported ancestor);
4. invalid names, parent cycles, or ambiguous flag conflicts also block export with the same error dialog;
5. otherwise YAML is downloaded as `regions.export.yml`.

---

## Auto-collapse

When building a scheme, subtrees whose parent has **more than N direct children** can be auto-hidden. Adjust **Threshold (N)** in the sidebar with the slider or the number field (default 40) before building. The **expand with threshold** button on the scheme restores that same state after a full expand.

Drag the sidebar’s right edge to change its width (the default width is the minimum).

After collapsing, the layout stays compact; the camera fits the remaining visible branch.

---

## Temporary region

1. Click **+** on the graph or **+ Temporary region** in the sidebar (requires a built scheme).
2. Enter id (Latin only), parent, priority; flags use the same UI as the region card.
3. Type: **global** (no coordinates) or **cuboid** / **poly2d**. Coordinates are validated on save (cuboid — all 6 numbers; poly2d — ≥3 points and min-y/max-y).
4. In the card you can change type and coordinates; after save, a temporary region with coordinates participates in intersections like a normal region.
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

- **Legend** (button bottom-right on the scheme) — node/edge styles for the scheme and for flag highlighting (flag section is always present).
- WorldGuard flags catalog — separate **Flags catalog** button in the sidebar.
- In the flags manager, flag names use typeahead suggestions while typing (unknown/custom names are still allowed).
- In flag tables (region card, flags manager, conflicts) the **«?»** button opens a short description tip for known flags only.
- **Language** — **RU** / **EN** switcher at the top of the sidebar; choice is saved in the browser. Notifications and toasts translate on language switch; toasts stay on screen longer.

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
- Region names use natural (Windows Explorer-like) sorting everywhere, including scheme layout.
- For ~400 regions, overlap computation typically takes 1–2 seconds.

## Interface and flags catalog controls

- **Open file** immediately loads YAML (and builds the scheme) or `.mrv.json`. If a scheme is already shown, you confirm discard first. **Reset scheme** (with confirmation) removes temporary regions and rebuilds from the loaded YAML. A blocking spinner covers the UI during builds.
- Bottom of the sidebar — **Clear scheme**: resets the session to the empty post-startup state (no YAML / no on-screen scheme; language, theme, and sidebar settings are kept).
- **Legend** shows scheme symbols only. The separate **Flags catalog** button opens Standard and Custom flag tabs.
- Add custom flags using supported WorldGuard types, import/export their JSON catalog, or delete them. Deleting also removes the flag from every region in the current scheme after a confirmation that lists affected region IDs.
- Collapse the sidebar with **««** at its top — the panel hides fully; **»»** to restore appears top-left on the scheme. Drag the right edge to resize. On the scheme: **+** (temporary) top-left; collapse/expand all and search top-right; lock, **Align**, flag-tree, problem mode, and edge display mode bottom-left (clear special highlight when active); **Legend**, zoom, and fullscreen bottom-right.
- **Hide children** hides only direct children; **Collapse recursively** hides the whole subtree. **Expand all** and **Expand with threshold** recenter the camera like reset scheme.
- The region card and context menu support **Rename** and **Delete** for any region (with children: reparent to grandparent, leave orphaned, or cascade-delete).
- The scheme starts locked. The lock icon toggles between closed and open.
- In the region card, flags are always visible (no “Hide flags” button).
