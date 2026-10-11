/** Ignore only MetaMask's extension-owned connection failure, never app failures. */
export const extensionErrorGuard = String.raw`
(function () {
  var source = 'chrome-extension://nkbihfbeogaeaoehlefnkodbefgpgknn/scripts/inpage.js';
  function handle(event) {
    var error = event.type === 'unhandledrejection' ? event.reason : event.error;
    if (!error || error.message !== 'Failed to connect to MetaMask' || typeof error.stack !== 'string') return;
    var frames = error.stack.split('\n').filter(function (line) { return /^\s*at\s/.test(line); });
    if (!frames.length || !frames.every(function (line) { return line.indexOf(source + ':') !== -1; })) return;
    event.preventDefault();
    event.stopImmediatePropagation();
    console.warn('[Cinevo] MetaMask extension connection failed. Cinevo uses an embedded wallet.', error);
  }
  window.addEventListener('error', handle, true);
  window.addEventListener('unhandledrejection', handle, true);
})();
`;
