const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const ts = require('typescript');
const compiled = ts.transpileModule(fs.readFileSync('lib/extension-error-guard.ts', 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS },
}).outputText;
const exported = {};
vm.runInNewContext(compiled, { exports: exported });
const extension = 'chrome-extension://nkbihfbeogaeaoehlefnkodbefgpgknn/scripts/inpage.js';
function dispatch(type, error) {
  const listeners = {};
  let stopped = false, prevented = false, warned = false;
  vm.runInNewContext(exported.extensionErrorGuard, {
    window: { addEventListener: (name, handler, capture) => { assert.equal(capture, true); listeners[name] = handler; } },
    console: { warn: () => { warned = true; } },
  });
  listeners[type]({ type, error, reason: error, preventDefault: () => { prevented = true; }, stopImmediatePropagation: () => { stopped = true; } });
  return { stopped, prevented, warned };
}
for (const type of ['error', 'unhandledrejection']) {
  test(`${type}: handles the reported extension-only failure`, () => {
    assert.deepEqual(dispatch(type, { message: 'Failed to connect to MetaMask', stack: `i: Failed to connect to MetaMask\n    at Object.connect (${extension}:7:84292)` }), { stopped: true, prevented: true, warned: true });
  });
  test(`${type}: preserves application and unknown failures`, () => {
    for (const error of [
      { message: 'Failed to connect to MetaMask', stack: 'Error\n at connect (http://localhost:3001/app.js:1:1)' },
      { message: 'Failed to connect to MetaMask', stack: `Error\n at connect (${extension}:7:84292)\n at login (webpack-internal:///app.tsx:1:1)` },
      { message: 'Unrelated error', stack: `Error\n at connect (${extension}:7:84292)` },
      { message: 'Failed to connect to MetaMask' },
      null,
      'Failed to connect to MetaMask',
    ]) assert.deepEqual(dispatch(type, error), { stopped: false, prevented: false, warned: false });
  });
}
