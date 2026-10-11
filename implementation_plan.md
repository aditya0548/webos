# Implementation Plan: WebOS v5.1 Precision Polish (macOS System Settings & Window Motion)

This implementation plan details the strategy for upgrading **WebOS v5** to **WebOS v5.1** in-place inside `index.html`. The focus is twofold:
1. **Rebuilding the Settings App**: Mirroring macOS Sequoia System Settings structure with a two-pane layout, 200px translucent sidebar, decorative search, 3 grouped sections with 7 total rows, dynamic 48px header cards, 28px colored icon tiles, live settings binding, and a centered reset confirmation modal.
2. **Tuning Window Motion to Apple Spec**: Implementing Apple's cubic-bezier timing curves (`cubic-bezier(0.32, 0.72, 0, 1)` and `cubic-bezier(0.4, 0, 1, 1)`), sub-300ms transitions, 1:1 instantaneous drag response, and full accessibility fallback for reduced motion.

---

## User Review Required

> [!IMPORTANT]
> - **Self-Contained Architecture Preserved**: All changes will be made directly in [index.html](file:///Users/aditya/webos/index.html). No npm dependencies, CDNs, or external libraries will be introduced.
> - **Zero-Emoji Policy**: All icons are inline geometric SVGs (1.5 stroke width) matching the Apple SF Symbols aesthetic. Zero emojis will exist anywhere in the UI or terminal text.
> - **Strict Line Budget**: Code optimizations will maintain total file size well under the ~2,100 line limit (currently 1,884 lines).

---

## Proposed Changes

```
WebOS v5.1 Architecture Overview:
┌────────────────────────────────────────────────────────────────────────┐
│ index.html                                                             │
│                                                                        │
│ ┌──────────────────────┐   ┌─────────────────────────────────────────┐ │
│ │ Window Motion (CSS)  │   │ Settings App Architecture               │ │
│ │ - cubic-bezier open  │   │ ┌───────────────┐ ┌───────────────────┐ │ │
│ │ - cubic-bezier close │   │ │ Left Sidebar  │ │ Right Content     │ │ │
│ │ - minimize / max     │   │ │ - Search (28p)│ │ - Header Card     │ │ │
│ │ - reduced-motion     │   │ │ - 3 Groups    │ │ - 28px Icon Tiles │ │ │
│ └──────────────────────┘   │ │ - 7 Rows      │ │ - Reset Modal     │ │ │
│                            │ └───────────────┘ └───────────────────┘ │ │
│                            └─────────────────────────────────────────┘ │
│                                                                        │
│ ┌────────────────────────────────────────────────────────────────────┐ │
│ │ Preserved Subsystems: RR Scheduler, VFS, Shell Streams, Terminal   │ │
│ └────────────────────────────────────────────────────────────────────┘ │
└────────────────────────────────────────────────────────────────────────┘
```

---

### Component 1: Icon System Expansion & Theming Subsystem
**File:** [index.html](file:///Users/aditya/webos/index.html)

- **New Lucide SVG Glyphs**:
  - `image`: Rectangular frame with sun and mountain silhouette for Wallpaper.
  - `droplet`: Geometric teardrop icon for Accent.
  - `type`: Serif/sans T glyph for Terminal Font.
  - `alignLeft`: Horizontal step lines for Terminal Line Height.
- **Settings State Extension**:
  - Extend `Settings.defaults` with `termLineHeight: 1.5`.
  - Expose CSS variable `--term-line-height` on `:root` and connect to `.terminal-container`.
  - Ensure `Settings.set('termLineHeight', val)` accepts `1.3` to `1.8` and syncs live to `localStorage["webos.settings"]`.

---

### Component 2: macOS System Settings App Rebuild
**File:** [index.html](file:///Users/aditya/webos/index.html)

- **Two-Pane Window Layout**:
  - Dimensions: 620×450px with a flexible split.
  - **Left Sidebar** (~200px wide):
    - Translucent background with a 1px right border (`rgba(255, 255, 255, 0.08)` in dark, `rgba(0, 0, 0, 0.08)` in light).
    - Top decorative search field: 28px tall, 6px border-radius, magnifier icon (`search`), placeholder `"Search"`, non-interactive.
    - 3 Grouped Sections (uppercase, 11px, gray, 6px left padding, 14px top margin):
      1. **APPEARANCE**: `Appearance` (palette), `Wallpaper` (image), `Accent` (droplet).
      2. **TERMINAL**: `Font` (type), `Behavior` (terminal).
      3. **SYSTEM**: `Motion` (activity), `Reset` (trash).
    - Rows: 28px height, 6px border radius, 14px icon, 11px label.
    - Active row state: soft rounded pill highlight (`rgba(255,255,255,0.08)` dark / `rgba(0,0,0,0.06)` light).
    - Hover state: half opacity highlight, 120ms background transition.
  - **Right Content Pane**:
    - Header Card at top: rounded 10px, 20px padding, subtle background card (`rgba(255,255,255,0.03)`).
      - Big centered icon: 48px in accent color (`var(--accent)`).
      - Bold centered title: 20px.
      - Muted subtitle: 12px, centered, 2-line max.
    - Content Cards:
      - 20px gap below header card.
      - 10px rounded cards with `rgba(255,255,255,0.03)` background and no harsh outer border.
      - 44px minimum row height with 12px horizontal padding and 1px separator lines at 6% opacity.
      - **28×28px Colored Icon Tiles** with 6px radius and white 16px Lucide glyph:
        - `palette` on Purple (`#af52de`)
        - `droplet` on Blue (`#007aff`)
        - `image` on Teal (`#30b0c7`)
        - `type` on Orange (`#ff9500`)
        - `terminal` on Green (`#34c759`)
        - `alignLeft` on Slate (`#8e8e93`)
        - `activity` on Red (`#ff3b30`)
        - `trash` on Gray (`#8e8e93`)
      - Controls:
        - Theme Mode: segmented control (Light / Dark / Auto).
        - Accent Color: 8 circular color swatches (20px) with 2px active ring.
        - Wallpaper: 6 wallpaper preview swatches (48×28px, 6px rounded) with active border.
        - Font Size: range slider (12–16px) with dynamic live label.
        - Show Path: macOS-style toggle switch.
        - Line Height: range slider (1.3–1.8) with live numeric indicator.
        - Motion: segmented control (Full / Reduced).
        - Reset to Defaults: "Reset..." button that triggers the modal dialog.
  - **Reset Confirmation Modal**:
    - Fixed centered dialog (320px wide, rounded 12px, elevated shadow).
    - 8px blurred backdrop (`rgba(0,0,0,0.35)`) fading in over 150ms.
    - Title (15px semibold: "Reset All Settings?"), subtitle (12px muted).
    - Two buttons: "Cancel" (neutral) and "Reset" (red accent), with instant action handlers.

---

### Component 3: Apple-Spec Window Motion Tuning
**File:** [index.html](file:///Users/aditya/webos/index.html)

- **Timing Curves**:
  - Open: 220ms, `scale(0.96) → scale(1)`, `opacity: 0 → 1`, `cubic-bezier(0.32, 0.72, 0, 1)`.
  - Close: 180ms, `scale(1) → scale(0.96)`, `opacity: 1 → 0`, `cubic-bezier(0.4, 0, 1, 1)`.
  - Minimize: 260ms, `scale(1) → scale(0.15)` + translate toward taskbar icon, `opacity: 1 → 0`, `cubic-bezier(0.32, 0.72, 0, 1)`.
  - Restore: 240ms reverse minimize transition.
  - Maximize: 280ms left/top/width/height geometry transition, `cubic-bezier(0.32, 0.72, 0, 1)`.
  - Restore from Maximize: 260ms reverse.
  - Focus gain/loss: 200ms ease on `box-shadow`, `border-color`, and titlebar text `opacity`.
  - Dragging: `.is-dragging { transition: none !important; }` to maintain strict 1:1 mouse tracking.
  - Reduced Motion Fallback: `@media (prefers-reduced-motion: reduce)` and `[data-motion="reduced"]` bypass all transforms, executing 100ms opacity fades only.

---

### Component 4: Taskbar Micro-Interactions
**File:** [index.html](file:///Users/aditya/webos/index.html)

- **Hover Elevation**: `.taskbar-btn:hover { transform: scale(1.06); transition: transform 140ms ease-out; }`
- **Active Indicator Dot**: Fades in over 160ms with a subtle 2px upward translation (`translateY(-2px)`).
- **Click Behavior**: Clean press feedback without gimmicky wave/ripple effects.

---

## Verification Plan

### Automated Tests (`verify_v51.js`)
Extend the automated test runner in the scratch directory and execute against headless Chrome via `run_command`:

```bash
node /Users/aditya/.gemini/antigravity/brain/1ea5e927-9ef3-408d-8f80-8203f0208295/scratch/verify_v51.js
```

The test suite will assert:
1. **Boot & Desktop Initialization**: BIOS lines scroll, desktop fades in.
2. **Settings App Structure**:
   - Sidebar renders 3 grouped sections and exactly 7 selectable rows.
   - Decorative search bar is present with magnifier icon.
   - Header Card dynamically displays the 48px accent icon, title, and subtitle.
   - Content cards display 28×28px colored icon tiles and proper controls.
3. **Live Theming & CLI Sync**:
   - Toggling Theme Mode switches `data-theme` attribute and CSS tokens instantly.
   - Changing Accent updates window borders, terminal prompt, and selection highlights live.
   - Wallpaper swatch clicks update desktop background style.
   - `theme export` returns valid JSON matching current settings.
   - `theme set accent green` syncs with the GUI Settings app.
4. **Motion System**:
   - Setting motion to "reduced" eliminates window scaling transforms and reduces duration to 100ms.
5. **Reset Confirmation Modal**:
   - Clicking "Reset..." opens the 320px modal dialog with backdrop blur.
   - "Cancel" closes the modal without altering state.
   - "Reset" restores factory defaults and closes the modal.
6. **Core Systems Integrity**:
   - Shell pipeline commands (`cat /README.txt | grep WebOS`, `echo hi > /tmp/x.txt`, `ps | grep terminal`) execute with code 0.
   - Scheduler ticks advance at 100ms quantum.
   - Process-window linkage terminates processes when traffic light close is clicked.
7. **Zero-Emoji Audit**:
   - Automated regex verification ensures 0 emoji characters exist across DOM text and attributes.

### Screenshot Deliverable
- Capture high-resolution screenshots of WebOS v5.1 with Settings app open in Dark Mode (Terminal and Task Manager stacked behind) and in Light Mode.
- Output composite image to [webos_screenshot.png](file:///Users/aditya/webos/webos_screenshot.png) and copy to artifact storage.
- Save full release report to [webos_verification_report.md](file:///Users/aditya/.gemini/antigravity/brain/1ea5e927-9ef3-408d-8f80-8203f0208295/webos_verification_report.md).
