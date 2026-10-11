# Implementation Plan: WebOS v6.2 Bug Fix Pass

This plan addresses the three specific performance and visual bugs identified in WebOS v6.2 (`index.html`), establishes regression tests in `verify_v62.js`, and sets up side-by-side visual capture. Per strict instructions, no new features, architecture refactors, or unrelated changes will be introduced.

---

## 1. Bug 1: Desktop Files Icon Crashes on Click

### Problem & Root Cause
- **Error**: `Uncaught TypeError: initialPath.split is not a function at HTMLDivElement.launchFiles (webos/:2840:73)`
- **Mechanism**:
  - In `index.html` (lines 2958–2959):
    ```javascript
    const d = document.getElementById('icon-' + app);
    if (d) d.addEventListener('click', fn);
    ```
  - When clicking `#icon-files`, the event listener calls `launchFiles(event)` where `event` is a `MouseEvent` or `PointerEvent`.
  - Inside `launchFiles` (line 2840):
    ```javascript
    const initialTitle = initialPath === '/' ? 'Files' : (initialPath.split('/').filter(Boolean).pop() || 'Files');
    ```
    `initialPath` is an object (`MouseEvent`), so calling `initialPath.split('/')` throws a `TypeError`.
  - The taskbar button (`#taskbar-btn-files`) invokes `fn()` without arguments (line 2966), so `initialPath` defaults to `'/home/user'`, working only by accident.

### Surgical Fix in `index.html`
At the very top of `launchFiles` (around line 2343):
```javascript
function launchFiles(initialPath = '/home/user') {
  if (typeof initialPath !== 'string' || !initialPath) {
    initialPath = '/home/user';
  }
  // existing window restoration & creation logic continues...
```
This safely normalizes any non-string argument (DOM Event, `undefined`, `null`, empty string) to `'/home/user'` before calling `Kernel.spawn`, `Kernel.fs.normalize`, or string methods.

### Regression Test in `verify_v62.js`
- Clean up any open Files window.
- Attach an unhandled error listener / CDP exception inspector.
- Trigger click on the desktop icon: `document.getElementById('icon-files').click()`.
- Assert no errors were caught.
- Assert the File Manager window opened (`WindowManager.windows.some(w => w.appKey === 'files' && w.el.style.display !== 'none')`).

---

## 2. Bug 2: Liquid Glass Slider Has No Visual Effect

### Problem & Root Cause
- `--glass-opacity` is set on `:root` and updated on slider input / `theme set glassOpacity`, but the taskbar and titlebar CSS rules do not dynamically consume it for all visual properties:
  - Taskbar `backdrop-filter` currently has hardcoded saturation: `saturate(180%)`.
  - Titlebar `backdrop-filter` has hardcoded saturation `saturate(180%)` and hardcoded blur scaling `blur(calc(24px * var(--glass-opacity)))`.
  - Background alpha in `:root` was defined as `rgba(22, 22, 26, var(--glass-opacity))` and `rgba(30, 30, 36, var(--glass-opacity))`, omitting the required base opacity formula `calc(0.35 + 0.55 * var(--glass-opacity))`. At 0.0, the taskbar background alpha dropped to 0, but backdrop saturation was still fixed at 180%.

### Surgical Fix in `index.html`
1. Define base RGB variables in `:root` and `[data-theme="light"]`:
   - `:root` (dark mode):
     ```css
     --taskbar-bg-rgb: 22, 22, 26;
     --titlebar-bg-rgb: 30, 30, 36;
     ```
   - `[data-theme="light"]` (light mode):
     ```css
     --taskbar-bg-rgb: 255, 255, 255;
     --titlebar-bg-rgb: 245, 245, 247;
     ```

2. Wire the exact formulas specified into `.titlebar` and `#taskbar`:
   ```css
   .titlebar {
     height: 38px;
     background: rgba(var(--titlebar-bg-rgb), calc(0.35 + 0.55 * var(--glass-opacity)));
     backdrop-filter: blur(calc(30px * var(--glass-opacity)))
                      saturate(calc(100% + 80% * var(--glass-opacity)));
     -webkit-backdrop-filter: blur(calc(30px * var(--glass-opacity)))
                              saturate(calc(100% + 80% * var(--glass-opacity)));
     border-bottom: 1px solid var(--border-titlebar);
     display: flex;
     align-items: center;
     justify-content: space-between;
     padding: 0 12px;
     cursor: grab;
   }

   #taskbar {
     position: fixed;
     bottom: 0;
     left: 0;
     right: 0;
     height: 44px;
     background: rgba(var(--taskbar-bg-rgb), calc(0.35 + 0.55 * var(--glass-opacity)));
     backdrop-filter: blur(calc(30px * var(--glass-opacity)))
                      saturate(calc(100% + 80% * var(--glass-opacity)));
     -webkit-backdrop-filter: blur(calc(30px * var(--glass-opacity)))
                              saturate(calc(100% + 80% * var(--glass-opacity)));
     border-top: 1px solid var(--taskbar-border);
     display: flex;
     align-items: center;
     justify-content: space-between;
     padding: 0 16px;
     z-index: 9999;
   }
   ```

3. Verification behavior:
   - At `--glass-opacity: 0.0`:
     - `backdrop-filter`: `blur(0px) saturate(1)` (no blur, 100% saturation)
     - `background`: `rgba(..., 0.35)` (nearly clear, wallpaper and any content behind clearly visible)
   - At `--glass-opacity: 1.0`:
     - `backdrop-filter`: `blur(30px) saturate(1.8)` (strong blur, 180% saturation)
     - `background`: `rgba(..., 0.90)` (nearly opaque frosted glass look)

### Regression Test in `verify_v62.js`
- Set `glassOpacity` to `0.0`. Read computed `backdrop-filter` (or `webkitBackdropFilter`) on `#taskbar`.
- Set `glassOpacity` to `1.0`. Read computed `backdrop-filter` (or `webkitBackdropFilter`) on `#taskbar`.
- Assert the computed values differ:
  - At 0.0: computes to `blur(0px) saturate(1)`
  - At 1.0: computes to `blur(30px) saturate(1.8)`
- Also verify computed `backgroundColor` changes from `rgba(22, 22, 26, 0.35)` to `rgba(22, 22, 26, 0.9)`.

---

## 3. Bug 3: OS Frame Rate Drops Under Window Load

### Problem & Root Cause
1. **Kernel Log (`launchKernelLog`)**:
   - `setInterval(renderLog, 200)` sets `container.textContent = Kernel.scheduler.history.join('\n')` on up to 200 strings every 200ms, immediately followed by `container.scrollTop = container.scrollHeight`.
   - Joining 200 strings and assigning `textContent` causes full text node destruction and layout recalculation 5 times per second.
   - It runs unconditionally even if the window is minimized (`display: none`) or obscured.
2. **Task Manager (`launchTaskManager`)**:
   - `setInterval(renderProcesses, 300)` runs 3.3 times per second.
   - Every tick executes `tbody.innerHTML = Kernel.processes.map(...).join('')` and `summaryDiv.innerHTML = ...`.
   - Full HTML serialization, DOM subtree deletion, and HTML parsing runs every 300ms, causing extreme GC churn and layout thrashing.
   - Runs unconditionally even if the window is minimized (`display: none`).
3. **Headless Chrome VSync Cap**:
   - Headless Chrome (`--headless=new`) caps `requestAnimationFrame` at 30 FPS unless `--disable-frame-rate-limit` is supplied. When coupled with layout thrashing from Kernel Log and Task Manager, FPS drops into single digits (~4.8 FPS).

### Surgical Fix in `index.html`
1. **Kernel Log Optimization**:
   - Do NOT wipe and reconstruct `container.textContent` every tick.
   - On launch, initialize the container with child lines.
   - Keep track of `lastSeenTick = 0`.
   - On each interval (increased from 200ms to 500ms):
     - If the window is minimized (`winEl.style.display === 'none'`) or `document.hidden`, skip updates.
     - Detect only new entries in `Kernel.scheduler.history` since `lastSeenTick`.
     - Use `requestAnimationFrame` to batch DOM updates:
       - Append only the new line elements (`document.createElement('div')`).
       - Cap the DOM at a rolling max of 200 nodes by removing `container.firstChild` in a while loop (`while (container.childElementCount > 200) container.removeChild(container.firstChild)`).
       - Smoothly update `container.scrollTop = container.scrollHeight`.

2. **Task Manager Optimization**:
   - Keep the DOM stable.
   - In `taskmgr-table`, keep rows persistent, keyed by PID (`<tr data-pid="${p.pid}">`).
   - On each update tick (interval increased from 300ms to 800ms):
     - If the window is minimized (`winEl.style.display === 'none'`) or `document.hidden`, skip updates.
     - Use `requestAnimationFrame` to apply updates:
       - For existing processes: update cell text in place (`cellCpu.textContent = p.cpu.toFixed(1) + '%'`, `cellMem.textContent = p.mem.toFixed(1) + ' MB'`, badge class, sched count).
       - For newly spawned processes: create and append a new `<tr>`.
       - For terminated processes: remove the stale `<tr>`.
     - In `summaryDiv`: structure with static labeled spans (`#tm-procs-count`, `#tm-sched-q`, `#tm-curr-proc`, `#tm-uptime`, `#tm-fs-stats`, `#tm-total-cpu`, `#tm-total-mem`) and update their `textContent` directly without replacing `summaryDiv.innerHTML`.

3. **Window Inactivity Throttling**:
   - If either window is closed, clear its timer via `onClose`.
   - If minimized (`winEl.style.display === 'none'`), bypass DOM manipulation completely until restored.

4. **Performance Target**:
   - Idle FPS (no windows open): >= 55 FPS.
   - Loaded FPS (Kernel Log + Task Manager + File Manager all open): >= 30 FPS.

### Regression Test in `verify_v62.js`
- Launch all three applications: `launchKernelLog()`, `launchTaskManager()`, `launchFiles('/home/user')`.
- Wait 3 seconds for initial render and history buffer to fill.
- Sample `requestAnimationFrame` timestamps over a 2-second measurement window.
- Compute average FPS: `totalFrames / (elapsedSeconds)`.
- Assert `averageFps >= 30`.

---

## 4. Extended Test Plan & Deliverables

1. **`verify_v62.js` Test Additions**:
   - Add Assertion 12: Desktop Files icon click handling (no crash, window opens).
   - Add Assertion 13: Liquid Glass dynamic CSS variables consumption (0.0 vs 1.0 computed values comparison).
   - Add Assertion 14: Loaded 3-app FPS benchmark sampling (>= 30 FPS assertion).
   - Ensure all existing assertions 1–11 continue to pass at 100%.

2. **Before / After Performance Recording**:
   - Record and report Idle FPS and 3-App Loaded FPS.

3. **Visual Verification Screenshot**:
   - Generate `webos_glass_comparison.png` displaying Liquid Glass slider at `0.0` vs `1.0` side-by-side with wallpaper and taskbar clearly contrasting transparency levels.

---

## 5. Verification Schedule & Approval Gate

- [x] Step 1: Write and present this detailed `implementation_plan.md` and updated `task.md`.
- [x] Step 2: Apply surgical fixes for Bugs 1, 2, and 3 to `index.html`.
- [x] Step 3: Extend `verify_v62.js` with the 3 regression test assertions.
- [x] Step 4: Run the full test suite and confirm 100% pass rate.
- [x] Step 5: Capture side-by-side screenshot artifact and report FPS numbers.
