#!/usr/bin/env node
// Automated smoke-test / eval suite for Duoscribe. Launches the app with an
// isolated user-data dir and drives it via the Chrome DevTools Protocol,
// asserting on real DOM/state rather than just "did it crash". Exit code 0
// means every check passed; non-zero (with details printed) means something
// broke.
//
// Usage: node scripts/eval-app.js

const path = require('path');
const os = require('os');
const fs = require('fs');
const { spawn } = require('child_process');
const WebSocket = require('ws');
const electronPath = require('electron');

const ROOT = path.join(__dirname, '..');
const FIXTURE = path.join(__dirname, 'fixtures', 'eval.md');
const USER_DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'duoscribe-eval-'));
const DEBUG_PORT = 9555;

const results = [];
let currentSection = '';

function section(name) {
  currentSection = name;
}

function record(name, pass, detail) {
  results.push({ section: currentSection, name, pass, detail });
  const status = pass ? 'PASS' : 'FAIL';
  console.log(`[${status}] ${currentSection} > ${name}${detail ? ' -- ' + detail : ''}`);
}

function assert(name, condition, detail) {
  record(name, !!condition, detail);
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function waitForDebuggerTarget(retries = 30) {
  for (let i = 0; i < retries; i++) {
    try {
      const res = await fetch(`http://127.0.0.1:${DEBUG_PORT}/json`);
      const tabs = await res.json();
      const page = tabs.find((t) => t.type === 'page');
      if (page) return page.webSocketDebuggerUrl;
    } catch (err) {
      // not up yet
    }
    await sleep(300);
  }
  throw new Error('Electron devtools endpoint never came up');
}

function connect(wsUrl) {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(wsUrl);
    let id = 0;
    const pending = new Map();
    const consoleErrors = [];

    ws.on('message', (data) => {
      const msg = JSON.parse(data.toString());
      if (msg.id && pending.has(msg.id)) {
        const { resolve: res, reject: rej } = pending.get(msg.id);
        pending.delete(msg.id);
        if (msg.error) rej(new Error(msg.error.message));
        else res(msg.result);
      }
      if (msg.method === 'Runtime.exceptionThrown') {
        const desc = msg.params.exceptionDetails;
        consoleErrors.push(
          (desc.exception && (desc.exception.description || desc.exception.value)) || desc.text
        );
      }
    });

    ws.on('open', () => {
      resolve({
        consoleErrors,
        send(method, params = {}) {
          return new Promise((res, rej) => {
            const msgId = ++id;
            pending.set(msgId, { resolve: res, reject: rej });
            ws.send(JSON.stringify({ id: msgId, method, params }));
          });
        },
        close() {
          ws.close();
        },
      });
    });
    ws.on('error', reject);
  });
}

function evaluate(client, expression) {
  return client
    .send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true })
    .then((r) => {
      if (r.exceptionDetails) {
        throw new Error(
          `evaluate() threw: ${r.exceptionDetails.text} :: ${expression.slice(0, 200)}`
        );
      }
      return r.result.value;
    });
}

// Dispatches from document.activeElement, not document itself: several
// shortcuts (e.g. the command palette's Escape) are bound on a specific
// focused input rather than the global listener, and events dispatched
// programmatically don't bubble "down" into descendants the way a real
// keypress -- which originates at whatever element has focus -- would.
function dispatchKey(client, { key, code, shiftKey = false, metaKey = false, ctrlKey = false }) {
  return evaluate(
    client,
    `(() => {
      const e = new KeyboardEvent('keydown', { key: ${JSON.stringify(key)}, code: ${JSON.stringify(code)}, shiftKey: ${shiftKey}, metaKey: ${metaKey}, ctrlKey: ${ctrlKey}, bubbles: true });
      (document.activeElement || document).dispatchEvent(e);
    })()`
  );
}

async function main() {
  const child = spawn(
    electronPath,
    ['.', `--user-data-dir=${USER_DATA_DIR}`, `--remote-debugging-port=${DEBUG_PORT}`, '--no-sandbox', FIXTURE],
    { cwd: ROOT, stdio: 'ignore' }
  );

  let client;
  try {
    const wsUrl = await waitForDebuggerTarget();
    client = await connect(wsUrl);
    await client.send('Runtime.enable');

    // Give the app a moment to load the fixture and render it.
    await sleep(1500);

    section('load');
    const hasDoc = await evaluate(client, `!!document.getElementById('source').value`);
    assert('fixture loaded into editor', hasDoc);

    const previewHtml = await evaluate(client, `document.getElementById('preview').innerHTML`);
    assert('preview has rendered content', previewHtml.length > 0);

    section('task lists');
    const checkboxStates = await evaluate(
      client,
      `Array.from(document.querySelectorAll('.task-list-item-checkbox')).map(c => c.checked)`
    );
    assert('two task checkboxes rendered', checkboxStates.length === 2, `found ${checkboxStates.length}`);
    assert(
      'checkbox checked-state matches fixture ([ ], [x])',
      checkboxStates[0] === false && checkboxStates[1] === true,
      JSON.stringify(checkboxStates)
    );

    await evaluate(client, `document.querySelectorAll('.task-list-item-checkbox')[0].click()`);
    await sleep(200);
    const sourceAfterToggle = await evaluate(client, `document.getElementById('source').value`);
    assert(
      'clicking checkbox flips raw source to [x]',
      /- \[x\] first task/.test(sourceAfterToggle),
      sourceAfterToggle.split('\n').find((l) => l.includes('first task'))
    );

    section('syntax highlighting');
    const hasHljs = await evaluate(
      client,
      `!!document.querySelector('#preview .hljs') && document.querySelectorAll('#preview .hljs-keyword, #preview .hljs-title').length > 0`
    );
    assert('code block has highlight.js token spans', hasHljs);

    section('mermaid');
    await sleep(500); // mermaid.run() is async
    const mermaidSvg = await evaluate(client, `!!document.querySelector('#preview pre.mermaid svg')`);
    assert('mermaid block rendered to an svg', mermaidSvg);

    section('outline panel');
    await evaluate(client, `document.getElementById('outline-toggle').click()`);
    await sleep(100);
    const outlineOpen = await evaluate(client, `document.getElementById('outline-panel').classList.contains('open')`);
    assert('outline panel opens', outlineOpen);
    const outlineItems = await evaluate(
      client,
      `Array.from(document.querySelectorAll('.outline-item')).map(i => i.textContent)`
    );
    assert(
      'outline lists exactly the 3 real headings, skipping the one inside the fence',
      outlineItems.length === 3 &&
        outlineItems[0] === 'Eval fixture' &&
        outlineItems[1] === 'Task list' &&
        outlineItems[2] === 'Code',
      JSON.stringify(outlineItems)
    );
    await evaluate(client, `document.getElementById('outline-toggle').click()`);

    section('theme toggle');
    const themeBefore = await evaluate(client, `document.documentElement.dataset.theme || 'system'`);
    await evaluate(client, `document.getElementById('theme-toggle').click()`);
    await sleep(100);
    const themeAfter = await evaluate(client, `document.documentElement.dataset.theme || 'system'`);
    assert('theme toggle changes state', themeBefore !== themeAfter, `${themeBefore} -> ${themeAfter}`);

    section('single-pane focus');
    await evaluate(client, `document.getElementById('view-source-only').click()`);
    await sleep(100);
    const sourceOnlyState = await evaluate(
      client,
      `({ previewDisplay: getComputedStyle(document.getElementById('preview')).display, panesClass: document.getElementById('panes').className })`
    );
    assert(
      'source-only mode hides preview',
      sourceOnlyState.previewDisplay === 'none' && sourceOnlyState.panesClass === 'view-source-only',
      JSON.stringify(sourceOnlyState)
    );
    await evaluate(client, `document.getElementById('view-source-only').click()`);
    await sleep(100);
    const backToSplit = await evaluate(
      client,
      `({ previewDisplay: getComputedStyle(document.getElementById('preview')).display, panesClass: document.getElementById('panes').className })`
    );
    assert(
      'toggling again returns to split view',
      backToSplit.previewDisplay === 'block' && backToSplit.panesClass === '',
      JSON.stringify(backToSplit)
    );

    section('command palette');
    await dispatchKey(client, { key: 'k', code: 'KeyK', metaKey: true, ctrlKey: true });
    await sleep(100);
    const paletteOpen = await evaluate(
      client,
      `!document.getElementById('command-palette-overlay').classList.contains('hidden')`
    );
    assert('Cmd/Ctrl+K opens the command palette', paletteOpen);

    await evaluate(client, `document.getElementById('command-palette-input').value = 'theme'`);
    await evaluate(
      client,
      `document.getElementById('command-palette-input').dispatchEvent(new Event('input', { bubbles: true }))`
    );
    await sleep(100);
    const filteredCount = await evaluate(
      client,
      `document.querySelectorAll('#command-palette-list .command-item').length`
    );
    assert('typing filters the command list', filteredCount === 1, `${filteredCount} matches for "theme"`);

    await dispatchKey(client, { key: 'Escape', code: 'Escape' });
    await sleep(100);
    const paletteClosed = await evaluate(
      client,
      `document.getElementById('command-palette-overlay').classList.contains('hidden')`
    );
    assert('Escape closes the command palette', paletteClosed);

    section('find bar');
    await dispatchKey(client, { key: 'f', code: 'KeyF', metaKey: true, ctrlKey: true });
    await sleep(100);
    const findOpen = await evaluate(client, `!document.getElementById('findbar').classList.contains('hidden')`);
    assert('Cmd/Ctrl+F opens the find bar', findOpen);

    section('console');
    assert(
      'no uncaught exceptions during the whole run',
      client.consoleErrors.length === 0,
      client.consoleErrors.join(' | ')
    );
  } finally {
    if (client) client.close();
    child.kill('SIGKILL');
    // Electron's helper processes (GPU/renderer/network) don't die the
    // instant the main process does, so an immediate rmSync can race a
    // helper still writing/exiting inside this dir. Retry briefly rather
    // than fail the whole run over cleanup.
    for (let attempt = 0; attempt < 10; attempt++) {
      try {
        fs.rmSync(USER_DATA_DIR, { recursive: true, force: true });
        break;
      } catch (err) {
        if (attempt === 9) throw err;
        await sleep(300);
      }
    }
  }

  const failed = results.filter((r) => !r.pass);
  console.log('\n---');
  console.log(`${results.length - failed.length}/${results.length} checks passed`);
  if (failed.length > 0) {
    console.log('\nFailed checks:');
    failed.forEach((f) => console.log(`  - [${f.section}] ${f.name}${f.detail ? ': ' + f.detail : ''}`));
    process.exit(1);
  }
  process.exit(0);
}

main().catch((err) => {
  console.error('eval-app.js crashed:', err);
  process.exit(1);
});
