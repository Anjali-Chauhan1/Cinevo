const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const ts = require('typescript');
const test = require('node:test');

function harness({ authenticated = true, ready = true, wallet = '0xabc', me = null, responses = [], token = 'test-access-token' } = {}) {
  const state = { logins: 0, requests: [], redirects: [], errors: [], effects: [] };
  const react = {
    useCallback: (fn) => fn,
    useMemo: (fn) => fn(),
    useRef: (value) => ({ current: value }),
    useState: (value) => [value, (next) => state.errors.push(next)],
    useEffect: (fn) => state.effects.push(fn),
  };
  const sdk = {
    PrivyProvider: 'PrivyProvider',
    usePrivy: () => ({ ready, authenticated, login: () => state.logins++, logout: async () => {}, getAccessToken: async () => token }),
    useWallets: () => ({ wallets: wallet ? [{ walletClientType: 'privy', address: wallet }] : [] }),
    useSendTransaction: () => ({}),
    useSignTypedData: () => ({}),
  };
  const jsx = (type, props) => ({ type, props });
  const modules = {
    react,
    'react/jsx-runtime': { jsx, jsxs: jsx },
    '@privy-io/react-auth': sdk,
    viem: {},
    '@/lib/chain/config': {},
    '@/components/web3/Onchain': { OnchainContext: { Provider: 'Context' } },
  };
  const source = fs.readFileSync('components/web3/PrivyLayer.tsx', 'utf8') + '\nexport { PrivyBridge };';
  const code = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX } }).outputText;
  const exports = {};
  vm.runInNewContext(code, {
    exports, require: (name) => { assert.ok(modules[name], name); return modules[name]; },
    process: { env: { NEXT_PUBLIC_PRIVY_APP_ID: 'test-app' } }, Error,
    window: { location: { pathname: '/login', href: 'http://localhost:3001/login', replace: (url) => state.redirects.push(url), assign: (url) => state.redirects.push(url) } },
    setTimeout: (fn) => fn(),
    fetch: async (url) => {
      state.requests.push(url);
      if (url === '/api/auth/me') return { json: async () => ({ user: me }) };
      const response = responses.shift() ?? { ok: true };
      if (response instanceof Error) throw response;
      return { ...response, json: async () => ({ error: response.error }) };
    },
  });
  state.config = exports.default({ children: null }).props.config;
  state.context = exports.PrivyBridge({ children: null }).props.value;
  state.flush = () => new Promise((resolve) => setImmediate(resolve));
  return state;
}

test('only embedded wallets are enabled for every user', () => {
  const h = harness();
  assert.equal(h.config.externalWallets.disableAllExternalWallets, true);
  assert.equal(h.config.embeddedWallets.ethereum.createOnLogin, 'all-users');
});

test('authenticated clicks finish the app session without another Privy login', async () => {
  const h = harness();
  h.context.login();
  h.context.login();
  await h.flush();
  assert.equal(h.logins, 0);
  assert.deepEqual(h.requests, ['/api/auth/me', '/api/auth/privy']);
  assert.deepEqual(h.redirects, ['/']);
});

test('restored matching app sessions redirect without exchanging again', async () => {
  const h = harness({ me: { walletAddress: '0xABC' } });
  h.effects[0]();
  await h.flush();
  assert.deepEqual(h.requests, ['/api/auth/me']);
  assert.deepEqual(h.redirects, ['/']);
});

test('session failures are shown and can be retried', async () => {
  const h = harness({ responses: [new Error('Network unavailable'), { ok: true }] });
  h.context.login();
  await h.flush();
  assert.equal(h.errors.at(-1), 'Network unavailable');
  h.context.login();
  await h.flush();
  assert.equal(h.logins, 0);
  assert.deepEqual(h.redirects, ['/']);
});

test('wallet creation conflicts retry and eventually show the server error', async () => {
  const h = harness({ responses: Array.from({ length: 5 }, () => ({ ok: false, status: 409, error: 'Wallet is still being created' })) });
  h.context.login();
  await h.flush();
  assert.equal(h.requests.filter((url) => url === '/api/auth/privy').length, 5);
  assert.equal(h.errors.at(-1), 'Wallet is still being created');
});

test('login waits for SDK readiness and never restarts a restored session awaiting its wallet', () => {
  const unready = harness({ ready: false, authenticated: false });
  unready.context.login();
  assert.equal(unready.logins, 0);
  const waiting = harness({ wallet: null });
  waiting.context.login();
  assert.equal(waiting.logins, 0);
  const signedOut = harness({ authenticated: false });
  signedOut.context.login();
  assert.equal(signedOut.logins, 1);
});
