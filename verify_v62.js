const { spawn } = require('child_process');
const fs = require('fs');

const CHROME_PATH = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const PORT = 9356;
const TARGET_URL = 'file:///Users/aditya/webos/index.html';
const SCREENSHOT_PATH = '/Users/aditya/webos/webos_screenshot.png';
const COMPARISON_SCREENSHOT_PATH = '/Users/aditya/webos/webos_glass_comparison.png';

async function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

let chromeProc = null;

async function run() {
  console.log('--- Starting WebOS v6.2 Automated CDP Verification Suite ---');
  console.log('1. Launching Headless Chrome on port', PORT);
  chromeProc = spawn(CHROME_PATH, [
    `--remote-debugging-port=${PORT}`,
    '--headless=new',
    '--window-size=1440,900',
    '--no-first-run',
    '--no-default-browser-check',
    '--user-data-dir=/tmp/webos_v62_profile_' + Date.now()
  ]);

  let versionData = null;
  for (let i = 0; i < 30; i++) {
    await sleep(200);
    try {
      const res = await fetch(`http://127.0.0.1:${PORT}/json/version`);
      if (res.ok) {
        versionData = await res.json();
        break;
      }
    } catch (e) {}
  }

  if (!versionData) {
    console.error('Failed to connect to Chrome CDP.');
    chromeProc.kill();
    process.exit(1);
  }

  console.log('2. Opening target URL:', TARGET_URL);
  const newTabRes = await fetch(`http://127.0.0.1:${PORT}/json/new?${encodeURIComponent(TARGET_URL)}`, { method: 'PUT' });
  const tabData = await newTabRes.json();
  const wsUrl = tabData.webSocketDebuggerUrl;

  console.log('3. Connecting to WebSocket CDP session at:', wsUrl);
  const ws = new WebSocket(wsUrl);

  let idCounter = 1;
  const pending = new Map();
  const runtimeExceptions = [];

  ws.onmessage = (event) => {
    const msg = JSON.parse(event.data);
    if (msg.method === 'Runtime.exceptionThrown') {
      runtimeExceptions.push(msg.params.exceptionDetails);
    }
    if (msg.id && pending.has(msg.id)) {
      const { resolve, reject } = pending.get(msg.id);
      pending.delete(msg.id);
      if (msg.error) reject(msg.error);
      else resolve(msg.result);
    }
  };

  await new Promise((resolve, reject) => {
    ws.onopen = resolve;
    ws.onerror = reject;
  });

  function send(method, params = {}) {
    const id = idCounter++;
    return new Promise((resolve, reject) => {
      pending.set(id, { resolve, reject });
      ws.send(JSON.stringify({ id, method, params }));
    });
  }

  await send('Runtime.enable');

  async function evaluate(expression) {
    const res = await send('Runtime.evaluate', {
      expression,
      returnByValue: true,
      awaitPromise: true
    });
    if (res.exceptionDetails) {
      throw new Error(JSON.stringify(res.exceptionDetails));
    }
    return res.result?.value;
  }

  console.log('4. Waiting for boot sequence to finish...');
  const bootStart = Date.now();
  let bootDone = false;
  while (Date.now() - bootStart < 15000) {
    try {
      const ready = await evaluate(`!!(typeof Kernel !== 'undefined' && Kernel.processes && Kernel.processes.some(p => p.name === 'shell'))`);
      if (ready) {
        bootDone = true;
        break;
      }
    } catch (e) {}
    await sleep(250);
  }
  if (!bootDone) throw new Error('Timed out waiting for boot sequence to initialize Kernel & shell');
  await sleep(500);


  // Assertion 1: Zero-Emoji Audit
  console.log('5. Auditing Zero-Emoji constraint on rendered DOM...');
  const renderedText = await evaluate(`document.body.innerText`);
  const emojiRegex = /[\u{1F300}-\u{1F5FF}\u{1F600}-\u{1F64F}\u{1F680}-\u{1F6FF}\u{1F700}-\u{1F77F}\u{1F780}-\u{1F7FF}\u{1F800}-\u{1F8FF}\u{1F900}-\u{1F9FF}\u{1FA00}-\u{1FA6F}\u{1FA70}-\u{1FAFF}\u{2600}-\u{26FF}\u{2700}-\u{27BF}]/gu;
  const emojiMatches = renderedText.match(emojiRegex);
  if (emojiMatches && emojiMatches.length > 0) {
    throw new Error('Found emoji characters in rendered DOM: ' + emojiMatches.join(', '));
  }
  console.log('   [PASS] Zero-Emoji constraint verified (0 emoji glyphs).');

  // Assertion 2: Matios UI Framework Availability
  console.log('6. Verifying Matios UI framework availability...');
  const matiosAvailable = await evaluate(`typeof window.MTS !== 'undefined'`);
  console.log('   window.MTS available:', matiosAvailable);
  if (!matiosAvailable) {
    throw new Error('Matios UI window.MTS is undefined!');
  }
  const matiosComponentsCount = await evaluate(`Object.keys(window.MTS).length`);
  console.log('   [PASS] Matios UI loaded successfully with', matiosComponentsCount, 'sub-components.');

  // Assertion 3: Scheduler and Process Integrity
  console.log('7. Verifying Scheduler and boot processes...');
  const quantum = await evaluate(`Kernel.scheduler.quantumMs`);
  const procs = await evaluate(`Kernel.processes.map(p => ({ pid: p.pid, name: p.name, state: p.state }))`);
  console.log('   Scheduler quantum:', quantum + 'ms');
  console.log('   Processes:', JSON.stringify(procs));
  if (quantum !== 100) throw new Error('Scheduler quantum is not 100ms: ' + quantum);
  if (!procs.some(p => p.name === 'kernel') || !procs.some(p => p.name === 'shell')) {
    throw new Error('Kernel or shell process missing after boot');
  }
  console.log('   [PASS] 100ms round-robin scheduler & core processes verified.');

  // Assertion 4: Shell Pipes and Stream Pipelines
  console.log('8. Testing Shell stream pipelines...');
  const pipeRes = await evaluate(`
    (() => {
      const shellProc = Kernel.processes.find(p => p.name === 'shell');
      const ctx = { proc: shellProc, commandHistory: [] };
      return executePipeline('cat /README.txt | grep WebOS', ctx);
    })()
  `);
  console.log('   Pipeline cat | grep output:', pipeRes.stdout.trim());
  if (!pipeRes.stdout.includes('Welcome to WebOS.')) {
    throw new Error('Pipeline cat | grep failed: ' + JSON.stringify(pipeRes));
  }
  console.log('   [PASS] Shell pipelines verified.');

  // Assertion 5: Settings App & Liquid Glass Slider
  console.log('9. Launching Settings app & verifying Matios UI controls...');
  await evaluate(`launchSettings()`);
  await sleep(300);

  const settingsMtsControls = await evaluate(`
    (() => {
      const hasBtnGroup = !!document.querySelector('.settings-container .mts-btn-group');
      const hasSliderWrap = !!document.querySelector('.settings-container .mts-slider-wrap');
      const hasToggleWrap = !!document.querySelector('.settings-container .mts-toggle-wrap');
      const glassSlider = document.getElementById('ctrl-glass');
      const currentOpacity = getComputedStyle(document.documentElement).getPropertyValue('--glass-opacity').trim();
      return { hasBtnGroup, hasSliderWrap, hasToggleWrap, glassSliderExists: !!glassSlider, currentOpacity };
    })()
  `);
  console.log('   Settings controls check:', JSON.stringify(settingsMtsControls));
  if (!settingsMtsControls.hasBtnGroup || !settingsMtsControls.hasSliderWrap || !settingsMtsControls.hasToggleWrap) {
    throw new Error('Settings app missing Matios UI component controls: ' + JSON.stringify(settingsMtsControls));
  }
  if (!settingsMtsControls.glassSliderExists) {
    throw new Error('Liquid Glass slider #ctrl-glass not found in Settings app!');
  }
  if (settingsMtsControls.currentOpacity !== '0.8') {
    throw new Error('Expected default --glass-opacity to be 0.8, got: ' + settingsMtsControls.currentOpacity);
  }
  console.log('   [PASS] Settings app rendered with Matios controls & default glass opacity 0.8.');

  // Assertion 6: Changing Liquid Glass slider & DOM live update
  console.log('10. Testing Liquid Glass slider live DOM update...');
  const updatedGlass = await evaluate(`
    (() => {
      const slider = document.getElementById('ctrl-glass');
      slider.value = '0.6';
      slider.dispatchEvent(new Event('input'));
      const val = getComputedStyle(document.documentElement).getPropertyValue('--glass-opacity').trim();
      const saved = JSON.parse(localStorage.getItem('webos.settings') || '{}');
      return { cssVal: val, savedVal: saved.glassOpacity, labelText: document.getElementById('label-glass').textContent };
    })()
  `);
  console.log('   Slider update result:', JSON.stringify(updatedGlass));
  if (updatedGlass.cssVal !== '0.6' || updatedGlass.savedVal !== 0.6) {
    throw new Error('Liquid glass slider failed to update --glass-opacity: ' + JSON.stringify(updatedGlass));
  }
  console.log('   [PASS] Liquid glass slider live update & localStorage persistence verified.');

  // Assertion 7: theme set glassOpacity CLI & theme export
  console.log('11. Testing "theme set glassOpacity" and "theme export" CLI...');
  const themeCliRes = await evaluate(`
    (() => {
      const shellProc = Kernel.processes.find(p => p.name === 'shell');
      const ctx = { proc: shellProc, commandHistory: [] };
      const setRes = executePipeline('theme set glassOpacity 0.45', ctx);
      const expRes = executePipeline('theme export', ctx);
      const parsedExp = JSON.parse(expRes.stdout);
      const cssVal = getComputedStyle(document.documentElement).getPropertyValue('--glass-opacity').trim();
      const sliderVal = document.getElementById('ctrl-glass').value;
      return { setOut: setRes.stdout, glassOpacityExported: parsedExp.glassOpacity, cssVal, sliderVal };
    })()
  `);
  console.log('   theme CLI result:', JSON.stringify(themeCliRes));
  if (themeCliRes.glassOpacityExported !== 0.45 || themeCliRes.cssVal !== '0.45' || themeCliRes.sliderVal !== '0.45') {
    throw new Error('theme set glassOpacity failed: ' + JSON.stringify(themeCliRes));
  }
  console.log('   [PASS] "theme set glassOpacity 0.45" and "theme export" verified.');

  // Assertion 8: Matios Mode & Accent Synchronization
  console.log('12. Testing Matios UI mode and accent synchronization...');
  const syncRes = await evaluate(`
    (() => {
      Settings.set('mode', 'light');
      const modeAttr1 = document.documentElement.getAttribute('data-mts-mode');
      Settings.set('mode', 'dark');
      const modeAttr2 = document.documentElement.getAttribute('data-mts-mode');
      Settings.set('accent', 'green');
      const accAttr = document.documentElement.getAttribute('data-mts-accent');
      const linkHref = document.getElementById('mts-accent-link').href;
      return { modeAttr1, modeAttr2, accAttr, linkHref };
    })()
  `);
  console.log('   Theme sync result:', JSON.stringify(syncRes));
  if (syncRes.modeAttr1 !== 'light' || syncRes.modeAttr2 !== 'dark' || syncRes.accAttr !== 'emerald') {
    throw new Error('Matios theme mode/accent sync failed: ' + JSON.stringify(syncRes));
  }
  console.log('   [PASS] Matios data-mts-mode and data-mts-accent synchronization verified.');

  // Assertion 9: Shareable Theme File System (save, list, load)
  console.log('13. Testing Shareable Theme File System (save, list, load)...');
  const themeFsRes = await evaluate(`
    (() => {
      const shellProc = Kernel.processes.find(p => p.name === 'shell');
      const ctx = { proc: shellProc, commandHistory: [] };
      const saveRes = executePipeline('theme save golden', ctx);
      const listRes = executePipeline('theme list', ctx);
      const vfsFile = Kernel.fs.resolve('/home/user/Documents/webos-theme-golden.json', '/');
      
      // Mutate settings
      Settings.set('glassOpacity', 0.95);
      Settings.set('accent', 'blue');
      
      // Load back
      const loadRes = executePipeline('theme load /home/user/Documents/webos-theme-golden.json', ctx);
      const restoredGlass = Settings.current.glassOpacity;
      const restoredAccent = Settings.current.accent;
      
      return {
        saveOut: saveRes.stdout,
        listOut: listRes.stdout,
        fileExists: !!vfsFile,
        loadOut: loadRes.stdout,
        restoredGlass,
        restoredAccent
      };
    })()
  `);
  console.log('   Theme FS pipeline result:', JSON.stringify(themeFsRes));
  if (!themeFsRes.fileExists || !themeFsRes.listOut.includes('golden') || themeFsRes.restoredGlass !== 0.45 || themeFsRes.restoredAccent !== 'green') {
    throw new Error('Shareable theme system failed: ' + JSON.stringify(themeFsRes));
  }
  console.log('   [PASS] theme save, list, and load pipeline verified.');

  // Assertion 10: File Manager ("Files") App
  console.log('14. Testing File Manager app ("Files") and VFS modernization...');
  await evaluate(`launchFiles('/home/user')`);
  await sleep(300);

  const filesAppRes = await evaluate(`
    (() => {
      const filesWin = document.querySelector('.files-container');
      const hasViewToggle = !!document.getElementById('files-view-toggle');
      const hasNewFolderBtn = !!document.getElementById('files-btn-new-folder');
      const hasSearchInput = !!document.getElementById('files-search-input');
      const sidebarRows = document.querySelectorAll('.files-sidebar-row').length;
      
      // Test creating a folder via toolbar button
      document.getElementById('files-btn-new-folder').click();
      const createdFolder = Kernel.fs.resolve('/home/user/New Folder', '/');
      
      // Test duplicate
      const dupName = Kernel.fs.duplicate('New Folder', '/home/user');
      const duplicatedNode = Kernel.fs.resolve('/home/user/' + dupName, '/');
      
      // Test stat
      const statInfo = Kernel.fs.stat('/home/user/' + dupName, '/');
      
      // Test stat CLI command
      const shellProc = Kernel.processes.find(p => p.name === 'shell');
      const ctx = { proc: shellProc, commandHistory: [] };
      const statCli = executePipeline('stat "' + '/home/user/' + dupName + '"', ctx);
      
      // Test recursive rm
      const rmCli = executePipeline('rm -r "' + '/home/user/' + dupName + '"', ctx);
      const afterRmNode = Kernel.fs.resolve('/home/user/' + dupName, '/');
      
      return {
        filesWinExists: !!filesWin,
        hasViewToggle,
        hasNewFolderBtn,
        hasSearchInput,
        sidebarRows,
        createdFolderExists: !!createdFolder,
        duplicatedNodeExists: !!duplicatedNode,
        statHasMtime: !!statInfo.mtime,
        statCliOut: statCli.stdout,
        deletedCleanly: afterRmNode === null
      };
    })()
  `);
  console.log('   File Manager test result:', JSON.stringify(filesAppRes));
  if (!filesAppRes.filesWinExists || !filesAppRes.hasViewToggle || !filesAppRes.createdFolderExists || !filesAppRes.duplicatedNodeExists || !filesAppRes.deletedCleanly) {
    throw new Error('File Manager verification failed: ' + JSON.stringify(filesAppRes));
  }
  console.log('   [PASS] File Manager app with Matios toolbar, duplicate, stat, and recursive rm verified.');

  // Assertion 12 (Bug 1 Regression): Click Desktop Files Icon
  console.log('15. Testing Desktop Files icon click handling (Bug 1 regression)...');
  runtimeExceptions.length = 0;
  const desktopIconTestRes = await evaluate(`
    (() => {
      // Close any existing files window
      const openFiles = WindowManager.windows.filter(w => w.appKey === 'files');
      openFiles.forEach(w => WindowManager.closeByPid(w.pid));

      const errors = [];
      const errHandler = (e) => { errors.push(e.message || String(e)); };
      window.addEventListener('error', errHandler);

      const filesIcon = document.getElementById('icon-files');
      if (!filesIcon) throw new Error('Desktop Files icon #icon-files not found');

      filesIcon.click();
      window.removeEventListener('error', errHandler);

      const openedWin = WindowManager.windows.find(w => w.appKey === 'files' && w.el.style.display !== 'none');
      return {
        hasErrors: errors.length > 0,
        errors,
        windowOpened: !!openedWin
      };
    })()
  `);
  console.log('   Desktop Files icon test result:', JSON.stringify(desktopIconTestRes));
  if (desktopIconTestRes.hasErrors || !desktopIconTestRes.windowOpened || runtimeExceptions.length > 0) {
    throw new Error('Desktop Files icon click failed: ' + JSON.stringify({ desktopIconTestRes, runtimeExceptions }));
  }
  console.log('   [PASS] Desktop Files icon clicked without error and File Manager window opened successfully.');

  // Assertion 13 (Bug 2 Regression): Liquid Glass Dynamic CSS Variables Consumption
  console.log('16. Testing Liquid Glass dynamic CSS variables consumption (Bug 2 regression)...');
  const glassCssRes = await evaluate(`
    (() => {
      const tb = document.getElementById('taskbar');
      const root = document.documentElement;

      // Set glassOpacity to 0.0
      root.style.setProperty('--glass-opacity', '0.0');
      const bf0 = getComputedStyle(tb).backdropFilter || getComputedStyle(tb).webkitBackdropFilter || '';
      const bg0 = getComputedStyle(tb).backgroundColor || '';

      // Set glassOpacity to 1.0
      root.style.setProperty('--glass-opacity', '1.0');
      const bf1 = getComputedStyle(tb).backdropFilter || getComputedStyle(tb).webkitBackdropFilter || '';
      const bg1 = getComputedStyle(tb).backgroundColor || '';

      // Restore to 0.8 default
      root.style.setProperty('--glass-opacity', '0.8');

      return {
        bf0,
        bf1,
        bg0,
        bg1,
        valuesDiffer: bf0 !== bf1
      };
    })()
  `);
  console.log('   Liquid Glass computed styles check:', JSON.stringify(glassCssRes));
  if (!glassCssRes.valuesDiffer) {
    throw new Error('Liquid Glass CSS dynamic update failed: backdrop-filter did not change between 0.0 and 1.0: ' + JSON.stringify(glassCssRes));
  }
  console.log('   [PASS] Liquid Glass dynamic CSS variables verified (backdrop-filter changes with --glass-opacity).');

  // Assertion 14 (Bug 3 Regression): 3-App Loaded FPS Benchmark Sampling (>= 30 FPS)
  console.log('17. Testing OS frame rate under load (Kernel Log + Task Manager + File Manager) (Bug 3 regression)...');
  const fpsRes = await evaluate(`
    (async () => {
      // Launch all three apps
      launchKernelLog();
      launchTaskManager();
      launchFiles('/home/user');

      // Wait 3 seconds for initial render and history buffer
      await new Promise(r => setTimeout(r, 3000));

      // Sample requestAnimationFrame timestamps for 2 seconds
      return new Promise(resolve => {
        let frameCount = 0;
        const start = performance.now();
        function countFrame() {
          frameCount++;
          const elapsed = performance.now() - start;
          if (elapsed < 2000) {
            requestAnimationFrame(countFrame);
          } else {
            const avgFps = frameCount / (elapsed / 1000);
            resolve({
              frameCount,
              elapsedMs: elapsed,
              avgFps: Math.round(avgFps * 10) / 10
            });
          }
        }
        requestAnimationFrame(countFrame);
      });
    })()
  `);
  console.log('   3-App Loaded FPS benchmark result:', JSON.stringify(fpsRes));
  if (fpsRes.avgFps < 30) {
    throw new Error('Loaded frame rate benchmark failed: expected >= 30 FPS, got ' + fpsRes.avgFps + ' FPS');
  }
  console.log('   [PASS] Loaded frame rate benchmark verified (' + fpsRes.avgFps + ' FPS >= 30 FPS).');

  // Side-by-Side Liquid Glass Comparison Screenshot (0.0 vs 1.0)
  console.log('18. Generating side-by-side Liquid Glass comparison screenshot (0.0 vs 1.0)...');
  await evaluate(`
    (() => {
      // Open settings to glass section
      launchSettings();
      const sWin = WindowManager.windows.find(w => w.appKey === 'settings');
      if (sWin) {
        sWin.el.style.left = '40px';
        sWin.el.style.top = '40px';
        sWin.el.style.width = '640px';
        sWin.el.style.height = '520px';
        const navGlass = sWin.el.querySelector('.settings-nav-row[data-section="glass"]');
        if (navGlass) navGlass.click();
        const rowGlass = document.getElementById('row-glass');
        if (rowGlass) rowGlass.scrollIntoView({ behavior: 'instant', block: 'center' });
        WindowManager.focus(sWin.el);
      }
      Settings.set('glassOpacity', 0.0);
    })()
  `);
  await sleep(400);
  const shot0Res = await send('Page.captureScreenshot', { format: 'png' });

  await evaluate(`
    (() => {
      Settings.set('glassOpacity', 1.0);
    })()
  `);
  await sleep(400);
  const shot1Res = await send('Page.captureScreenshot', { format: 'png' });

  // Reset glass opacity
  await evaluate(`Settings.set('glassOpacity', 0.8)`);

  const stitchedPngBase64 = await evaluate(`
    new Promise((resolve, reject) => {
      const img1 = new Image();
      const img2 = new Image();
      let loaded = 0;
      const onDone = () => {
        loaded++;
        if (loaded === 2) {
          const canvas = document.createElement('canvas');
          canvas.width = img1.width + img2.width;
          canvas.height = Math.max(img1.height, img2.height);
          const ctx = canvas.getContext('2d');
          ctx.drawImage(img1, 0, 0);
          ctx.drawImage(img2, img1.width, 0);

          // Top Header Banner
          ctx.fillStyle = 'rgba(10, 10, 15, 0.88)';
          ctx.fillRect(0, 0, canvas.width, 54);

          ctx.fillStyle = '#ffffff';
          ctx.font = 'bold 20px -apple-system, sans-serif';
          ctx.fillText('Liquid Glass Opacity: 0.0 (High Transparency)', 24, 34);
          ctx.fillText('Liquid Glass Opacity: 1.0 (Frosted Glass)', img1.width + 24, 34);

          // Center divider
          ctx.strokeStyle = '#0a84ff';
          ctx.lineWidth = 4;
          ctx.beginPath();
          ctx.moveTo(img1.width, 0);
          ctx.lineTo(img1.width, canvas.height);
          ctx.stroke();

          resolve(canvas.toDataURL('image/png').split(',')[1]);
        }
      };
      img1.onload = onDone;
      img2.onload = onDone;
      img1.onerror = reject;
      img2.onerror = reject;
      img1.src = 'data:image/png;base64,' + ${JSON.stringify(shot0Res.data)};
      img2.src = 'data:image/png;base64,' + ${JSON.stringify(shot1Res.data)};
    })
  `);
  fs.writeFileSync(COMPARISON_SCREENSHOT_PATH, Buffer.from(stitchedPngBase64, 'base64'));
  console.log('   [PASS] Liquid Glass side-by-side comparison screenshot saved to:', COMPARISON_SCREENSHOT_PATH);

  // Assertion 11: Setup UI for Showcase Screenshot
  console.log('19. Arranging windows for showcase screenshot...');
  await evaluate(`
    (() => {
      // Launch Terminal and run theme list
      launchTerminal();
      const termWins = WindowManager.windows.filter(w => w.appKey === 'terminal');
      const termWin = termWins[termWins.length - 1];
      if (termWin) {
        termWin.el.style.left = '680px';
        termWin.el.style.top = '60px';
        termWin.el.style.width = '680px';
        termWin.el.style.height = '480px';
        WindowManager.focus(termWin.el);

        // Execute theme list in terminal
        const termInput = termWin.el.querySelector('.term-input');
        if (termInput) {
          termInput.value = 'theme list';
          termInput.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
        }
      }

      // Position Settings window
      const settingsWin = WindowManager.windows.find(w => w.appKey === 'settings');
      if (settingsWin) {
        settingsWin.el.style.left = '30px';
        settingsWin.el.style.top = '50px';
        settingsWin.el.style.width = '640px';
        settingsWin.el.style.height = '620px';

        // Select Liquid Glass section in Settings
        const navGlass = settingsWin.el.querySelector('.settings-nav-row[data-section="glass"]');
        if (navGlass) navGlass.click();
        const rowGlass = document.getElementById('row-glass');
        if (rowGlass) rowGlass.scrollIntoView({ behavior: 'instant', block: 'center' });
        WindowManager.focus(settingsWin.el);
      }

      // Position Files window below Settings & Terminal
      const filesWin = WindowManager.windows.find(w => w.appKey === 'files');
      if (filesWin) {
        filesWin.el.style.left = '700px';
        filesWin.el.style.top = '480px';
        filesWin.el.style.width = '680px';
        filesWin.el.style.height = '360px';
      }

      // Focus Terminal to keep prompt highlighted
      if (termWin) WindowManager.focus(termWin.el);
    })()
  `);
  await sleep(600);

  console.log('20. Capturing screenshot via CDP...');
  const screenshotRes = await send('Page.captureScreenshot', { format: 'png' });
  const buffer = Buffer.from(screenshotRes.data, 'base64');
  fs.writeFileSync(SCREENSHOT_PATH, buffer);
  console.log('   [PASS] Showcase screenshot saved to:', SCREENSHOT_PATH, '(' + buffer.length + ' bytes)');

  console.log('\n======================================================');
  console.log(' ALL WEBOS v6.2 VERIFICATION ASSERTIONS PASSED (100%)');
  console.log('======================================================\n');
}

run().then(() => {
  if (chromeProc) chromeProc.kill();
  process.exit(0);
}).catch(err => {
  console.error('\nVerification FAILED with error:\n', err);
  if (chromeProc) chromeProc.kill();
  process.exit(1);
});

