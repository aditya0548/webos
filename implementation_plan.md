# Implementation Plan: WebOS v6.2 — Matios UI Integration, macOS 27 Liquid Glass & Shareable Themes

## 1. Overview & Architectural Goals

WebOS v6.2 is a **"Library Integration & Polish"** milestone. It integrates **Matios UI**—a zero-build, dependency-free CSS/JS UI component framework—into the existing single-file WebOS architecture, introduces the **macOS 27 "Golden Gate" Liquid Glass transparency slider**, provides a **shareable theme file system** within the Virtual File System (VFS), and incorporates the complete **File Manager ("Files")** desktop application.

All additions will be made **in place within `index.html`** while preserving every existing feature:
- 100ms preemptive round-robin scheduler
- In-memory VFS with `localStorage` persistence, per-process `cwd`, and safety flow for `rm -rf /`
- Shell with pipes, redirections, and process execution
- Window manager with authentic Apple cubic-bezier window motion
- Zero-emoji design aesthetic using Lucide-style inline SVGs

---

## 2. Target Specifications & Technical Design

### A. Matios UI Framework Integration (Zero-Build CDN)
- **CDN Assets in `<head>`**:
  ```html
  <link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/@matios/ui/dist/matios-ui.min.css">
  <link id="mts-accent-link" rel="stylesheet" href="https://cdn.jsdelivr.net/npm/@matios/ui/themes/matios-ui-accent-violet.css">
  <script src="https://cdn.jsdelivr.net/npm/@matios/ui/dist/matios-ui.min.js"></script>
  ```
- **Global Availability**: `window.MTS` will be available after boot.
- **Theme & Mode Synchronization**:
  - Whenever WebOS switches light/dark mode, update `<html data-mts-mode="dark|light">` to keep all Matios components natively themed.
  - Whenever WebOS accent color changes, map the 8 WebOS accents to Matios theme equivalents (e.g., `blue` &rarr; `matios-ui-accent-blue.css`, `purple` &rarr; `matios-ui-accent-violet.css`, `orange` &rarr; `matios-ui-accent-orange.css`, etc.) and set `<html data-mts-accent="...">`.
- **Scope & Scoping Boundary**:
  - Matios UI components will be utilized strictly for **application content controls** (Settings controls, File Manager toolbar, context menus, and confirmation dialogs).
  - OS-level window chrome (traffic light buttons, title bars, window framing) remains custom to preserve authentic macOS Sequoia styling.

### B. macOS 27 "Golden Gate" Liquid Glass Transparency Slider
- **CSS Variable**: `--glass-opacity` defined on `:root` (default `0.8`, valid range `0.0` to `1.0`).
- **Dynamic Glass Styling**:
  - Taskbar: `background: rgba(var(--taskbar-bg-rgb), var(--glass-opacity)); backdrop-filter: blur(calc(24px * var(--glass-opacity)));`
  - Window Titlebars: `background: rgba(var(--titlebar-bg-rgb), var(--glass-opacity)); backdrop-filter: blur(calc(20px * var(--glass-opacity)));`
  - Sidebar surfaces: dynamic frosted glass scaling with `--glass-opacity`.
- **Settings App Integration**:
  - Located under the **APPEARANCE** section as a dedicated row.
  - Row Label: `"Liquid Glass"`.
  - Icon Tile: Droplet icon on a vibrant blue tile (`#007aff`).
  - Control: Matios-styled slider from `0.0` (ultra-clear glass) to `1.0` (fully opaque tinted glass), showing live decimal value readout (`0.80`).
- **Persistence & CLI**:
  - Persisted to `localStorage["webos.settings"]` under `glassOpacity`.
  - Supported in shell: `theme set glassOpacity <0.0-1.0>`.
  - Exported in `theme export` JSON object.

### C. Shareable Theme File System
- **File System Location**: `/home/user/Documents/webos-theme-<name>.json`.
- **JSON Schema**:
  ```json
  {
    "version": "6.2",
    "name": "<name>",
    "mode": "dark" | "light",
    "accent": "blue" | "purple" | "pink" | "red" | "orange" | "yellow" | "green" | "graphite",
    "wallpaper": 1 | 2 | 3 | 4 | 5 | 6,
    "motion": "full" | "reduced",
    "glassOpacity": 0.8,
    "termFontSize": 13,
    "termLineHeight": 1.5,
    "termShowPath": true
  }
  ```
- **CLI Commands**:
  - `theme save <name>`: Serializes current settings to `/home/user/Documents/webos-theme-<name>.json`.
  - `theme load <path>`: Reads theme JSON from VFS path, parses/validates fields, applies settings dynamically, updates CSS variables and Matios mode/accent, persists to `localStorage`.
  - `theme list`: Scans `/home/user/Documents/`, lists all files matching `webos-theme-*.json`, displaying name, accent, mode, and glass opacity.

### D. File Manager ("Files") App & VFS Modernization (v6.1 Foundation)
- **VFS Extensions**:
  - Add `mtime` tracking across touch, mkdir, write, rename, duplicate, remove.
  - Implement graceful migration in `Kernel.fs.load()` for legacy trees without `mtime`.
  - Ensure `/home/user/Desktop`, `/home/user/Documents`, `/home/user/Downloads` exist on boot.
  - Implement `Kernel.fs.stat(path, cwd)`, `Kernel.fs.rename(path, newName, cwd)`, `Kernel.fs.duplicate(path, cwd)`, and recursive `Kernel.fs.remove(path, cwd, recursive)`.
- **Files Application UI**:
  - Process name: `files` (`Kernel.spawn('files', 2, 20.0, currentPath)`).
  - Desktop icon (`#icon-files`) and taskbar button (`#taskbar-btn-files`) with active dot indicator.
  - **Finder 38px Toolbar**:
    - Left: Back/Forward navigation buttons and interactive breadcrumbs.
    - Right: View mode toggle (Grid / List) using Matios button group (`.mts-btn-group`, `.mts-btn`).
    - Right: New Folder button using Matios icon button (`.mts-btn`).
    - Right: Search input using Matios input styling (`.mts-input`).
  - **Translucent Sidebar (180px)**: FAVORITES (Home, Desktop, Documents, Downloads) and LOCATIONS (Root, Bin, Etc, Tmp).
  - **Content Views**:
    - Grid (Icon) View: 96×100px cells, 48px icons, soft selection highlight, inline rename.
    - List View: 24px rows, columns: Name, Size (human-readable), Modified (`mtime`).
  - **Context Menus**: Built with Matios Context Menu component / styling (`Open`, `New Folder`, `Rename`, `Duplicate`, `Copy path`, `Delete`).
  - **Delete Confirmation Modal**: Built with Matios Modal component / styling for non-empty folders.
  - **Toasts**: Non-intrusive notifications for copy path, file actions.
- **Terminal Integration**:
  - `files [path]`: Launches File Manager at specified path.
  - `stat <path>`: Displays formatted node metadata.
  - `rm -r / -rf <path>`: Recursive removal support.

### E. Settings App Refactoring with Matios UI
- Retain the macOS System Settings two-pane architecture (200px sidebar + scrollable content cards + 28×28px colored icon tiles).
- Replace controls with Matios UI equivalents:
  - Theme Mode: Matios segmented button group (`.mts-btn-group` containing `.mts-btn` items for Light / Dark / Auto).
  - Sliders (Font Size, Line Height, Liquid Glass): Matios slider styling / component (`.mts-slider-wrap` with header, track, rail, fill, thumb).
  - Toggles (Show Path): Matios toggle component (`.mts-toggle-wrap`, `.mts-toggle`).
  - Motion Mode: Matios button group (`Full` / `Reduced`).
  - Reset & Modals: Matios button (`.mts-btn--secondary`) triggering Matios confirmation modal.

---

## 3. Line Budget & Implementation Strategy

- **Baseline v5.1**: 2,081 lines
- **Ceiling Target**: < 3,100 lines
- **Projected Additions**:
  - CDN links & `<head>` configuration: ~10 lines
  - Lucide SVG icons (Files app icons + Golden Gate droplet): ~25 lines
  - CSS styling (Liquid Glass variables, Matios theme bindings, Files app layout): ~220 lines
  - VFS enhancements (`mtime`, `stat`, `rename`, `duplicate`, recursive `remove`): ~85 lines
  - Theme System extensions (`save`, `load`, `list`, `glassOpacity`): ~65 lines
  - Settings App Matios controls refactoring: ~80 lines
  - File Manager app implementation with Matios components: ~290 lines
  - Shell commands (`files`, `stat`, `rm -r`, `help`): ~35 lines
- **Estimated Total Lines**: ~2,890 lines (comfortably below the 3,100 line limit).

---

## 4. Verification Plan

### Automated Test Suite (`verify_v62.js`)
We will execute an automated, end-to-end verification script via Google Chrome CDP on port 9356:

1. **System & Boot Integrity**:
   - Zero-emoji audit across entire rendered DOM.
   - 100ms scheduler quantum check and kernel boot process verification.
   - Verify `window.MTS` exists and Matios UI CSS/JS loaded successfully.
2. **Liquid Glass Transparency**:
   - Verify `--glass-opacity` CSS property on `:root` defaults to `0.8`.
   - Adjust slider and confirm live update of `--glass-opacity` and visual taskbar opacity.
   - Verify persistence in `localStorage["webos.settings"]` across page reload.
   - Test shell command: `theme set glassOpacity 0.5`.
   - Test `theme export` includes `"glassOpacity": 0.5`.
3. **Shareable Theme Files**:
   - Execute `theme save mytheme` &rarr; verify `/home/user/Documents/webos-theme-mytheme.json` created in VFS.
   - Execute `theme list` &rarr; verify output lists `webos-theme-mytheme.json` with correct metadata.
   - Execute `theme load /home/user/Documents/webos-theme-mytheme.json` &rarr; verify theme reloaded cleanly.
4. **Settings App Matios Controls**:
   - Verify Matios segmented button group (`.mts-btn-group`), slider (`.mts-slider-wrap`), and toggle (`.mts-toggle-wrap`).
   - Switch mode Light &harr; Dark &rarr; verify `data-mts-mode` attribute updates on `<html>`.
5. **File Manager App**:
   - Launch `files` via desktop icon, taskbar button, and shell command `files /home/user`.
   - Test navigation: back/forward buttons, breadcrumb segments, sidebar favorites/locations.
   - Test view toggle between Grid (Icon) view and List view.
   - Test New Folder creation and inline rename on Enter/Esc/blur.
   - Test Duplicate operation and clipboard copy path with toast.
   - Test Delete with Matios confirmation dialog for non-empty directories.
6. **Shell Pipeline & Backward Compatibility**:
   - Pipeline test: `cat /README.txt | grep WebOS`.
   - VFS test: `stat /README.txt`.
   - All v6.1 and v5.1 regression tests passing with exit code 0.

### Visual & Documentation Artifacts
1. High-resolution screenshot showing Settings app open with the **Liquid Glass** slider visible alongside the Terminal running `theme list`.
2. Detailed completion report saved to `webos_verification_report.md`.
