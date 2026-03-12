import net from 'node:net';
import { spawn } from 'node:child_process';
import { copyFileSync, existsSync, mkdirSync, rmSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { homedir } from 'node:os';
import { success, error, warn, info, kvDisplay, spinner } from '../ui/components.js';
import { showSection } from '../ui/banner.js';
import { theme } from '../ui/theme.js';

const DARKSOL_DIR = join(homedir(), '.darksol');
const BROWSER_DIR = join(DARKSOL_DIR, 'browser');
const BROWSER_PROFILES_DIR = join(BROWSER_DIR, 'profiles');
const BROWSER_SCREENSHOT_PATH = join(BROWSER_DIR, 'latest.png');
const BROWSER_METADATA_PATH = join(BROWSER_DIR, 'metadata.json');
const DEFAULT_TIMEOUT = 30_000;
const DEFAULT_BROWSER_TYPE = 'chromium';
const DEFAULT_PROFILE = 'default';
const BROWSER_PIPE_PATH = process.platform === 'win32'
  ? '\\\\.\\pipe\\darksol-browser'
  : join(DARKSOL_DIR, 'browser.sock');

let playwrightLoader = () => import('playwright-core');

function ensureBrowserDirs() {
  mkdirSync(BROWSER_PROFILES_DIR, { recursive: true });
}

function ensureParentDir(path) {
  mkdirSync(dirname(path), { recursive: true });
}

function browserNotRunningError() {
  return new Error('Browser service is not running. Start it with: darksol browser launch');
}

function createErrorPayload(err) {
  return {
    message: err?.message || String(err),
    code: err?.code || 'BROWSER_ERROR',
  };
}

function normalizeUrl(url) {
  if (/^https?:\/\//i.test(url)) return url;
  return `https://${url}`;
}

function sanitizeEvalResult(result) {
  if (result === undefined) return 'undefined';
  if (typeof result === 'string') return result;
  try {
    return JSON.stringify(result, null, 2);
  } catch {
    return String(result);
  }
}

async function pathExists(path) {
  return existsSync(path);
}

export function getBrowserPipePath() {
  return BROWSER_PIPE_PATH;
}

export function getBrowserScreenshotPath() {
  return BROWSER_SCREENSHOT_PATH;
}

export function getBrowserMetadataPath() {
  return BROWSER_METADATA_PATH;
}

export function setPlaywrightLoaderForTests(loader) {
  playwrightLoader = loader;
}

export class BrowserController {
  constructor(opts = {}) {
    this.playwright = null;
    this.context = null;
    this.pages = new Map();
    this.currentPageId = null;
    this.browserType = DEFAULT_BROWSER_TYPE;
    this.profile = DEFAULT_PROFILE;
    this.headed = false;
    this.startedAt = null;
    this.server = null;
    this.serverClosing = false;
    this.keepAlivePromise = null;
    this.keepAliveResolve = null;
    this.playwrightLoader = opts.playwrightLoader || playwrightLoader;
    ensureBrowserDirs();
  }

  async ensurePlaywrightAvailable() {
    if (this.playwright) return this.playwright;
    try {
      this.playwright = await this.playwrightLoader();
      return this.playwright;
    } catch {
      const err = new Error('Playwright is not installed. Run `npm install playwright-core --save-optional` or `darksol browser install`.');
      err.code = 'PLAYWRIGHT_MISSING';
      throw err;
    }
  }

  async launch(opts = {}) {
    if (this.context) {
      throw new Error('Browser is already running. Use `darksol browser status` or `darksol browser close` first.');
    }

    const playwright = await this.ensurePlaywrightAvailable();
    this.browserType = opts.type || DEFAULT_BROWSER_TYPE;
    this.profile = opts.profile || DEFAULT_PROFILE;
    this.headed = Boolean(opts.headed);
    const timeout = Number(opts.timeout || DEFAULT_TIMEOUT);
    const browserType = playwright[this.browserType];

    if (!browserType) {
      throw new Error(`Unsupported browser type: ${this.browserType}. Use chromium, firefox, or webkit.`);
    }

    const userDataDir = join(BROWSER_PROFILES_DIR, this.profile);
    mkdirSync(userDataDir, { recursive: true });

    this.context = await browserType.launchPersistentContext(userDataDir, {
      headless: !this.headed,
    });
    this.context.setDefaultTimeout(timeout);
    this.context.setDefaultNavigationTimeout(timeout);
    this.startedAt = new Date().toISOString();

    this.pages.clear();
    const pages = this.context.pages();
    if (pages.length === 0) {
      const page = await this.context.newPage();
      this.registerPage(page);
    } else {
      pages.forEach((page) => this.registerPage(page));
    }

    this.context.on('page', (page) => this.registerPage(page));
    this.context.on('close', async () => {
      await this.cleanupRuntimeState();
      await this.stopServer();
    });

    await this.persistMetadata();
    return this.getStatus();
  }

  registerPage(page) {
    const pageId = this.pages.size + 1;
    const pageState = { id: pageId, page };
    this.pages.set(pageId, pageState);
    this.currentPageId = pageId;

    page.on('close', () => {
      this.pages.delete(pageId);
      if (this.currentPageId === pageId) {
        this.currentPageId = this.pages.size ? [...this.pages.keys()].at(-1) : null;
      }
    });

    page.on('crash', async () => {
      await this.cleanupRuntimeState();
      await this.stopServer();
    });
  }

  getCurrentPage() {
    if (!this.currentPageId || !this.pages.has(this.currentPageId)) {
      throw new Error('No active browser page. Launch a browser first.');
    }
    return this.pages.get(this.currentPageId).page;
  }

  async navigate(url, opts = {}) {
    const page = this.getCurrentPage();
    const target = normalizeUrl(url);
    try {
      await page.goto(target, {
        waitUntil: opts.waitUntil || 'domcontentloaded',
        timeout: Number(opts.timeout || DEFAULT_TIMEOUT),
      });
      await this.persistMetadata();
      return this.getStatus();
    } catch (err) {
      if (err?.name === 'TimeoutError') {
        throw new Error(`Navigation timed out after ${Math.round((opts.timeout || DEFAULT_TIMEOUT) / 1000)}s. Try a longer timeout or wait condition.`);
      }
      throw err;
    }
  }

  async click(selector, opts = {}) {
    const page = this.getCurrentPage();
    try {
      await page.waitForSelector(selector, { timeout: Number(opts.timeout || DEFAULT_TIMEOUT), state: 'visible' });
      await page.click(selector, opts);
      await this.persistMetadata();
      return this.getStatus();
    } catch (err) {
      if (err?.name === 'TimeoutError') {
        throw new Error(`Selector not found: ${selector}. Check that the selector is correct and the element is visible.`);
      }
      throw err;
    }
  }

  async type(selector, text, opts = {}) {
    const page = this.getCurrentPage();
    try {
      await page.waitForSelector(selector, { timeout: Number(opts.timeout || DEFAULT_TIMEOUT), state: 'visible' });
      await page.fill(selector, '');
      await page.type(selector, text, opts);
      await this.persistMetadata();
      return this.getStatus();
    } catch (err) {
      if (err?.name === 'TimeoutError') {
        throw new Error(`Selector not found: ${selector}. Check that the selector is correct and the element is visible.`);
      }
      throw err;
    }
  }

  async evaluate(expression) {
    const page = this.getCurrentPage();
    const result = await page.evaluate((source) => {
      // eslint-disable-next-line no-eval
      return eval(source);
    }, expression);
    return {
      result,
      formatted: sanitizeEvalResult(result),
    };
  }

  async screenshot(opts = {}) {
    const page = this.getCurrentPage();
    const outputPath = resolve(opts.path || `screenshot-${Date.now()}.png`);
    ensureParentDir(outputPath);
    await page.screenshot({
      path: outputPath,
      fullPage: opts.fullPage !== false,
    });
    ensureParentDir(BROWSER_SCREENSHOT_PATH);
    copyFileSync(outputPath, BROWSER_SCREENSHOT_PATH);
    await this.persistMetadata();
    return {
      path: outputPath,
      latest: BROWSER_SCREENSHOT_PATH,
    };
  }

  async getStatus() {
    const page = this.currentPageId ? this.pages.get(this.currentPageId)?.page : null;
    const url = page ? page.url() : '';
    let title = '';
    if (page) {
      try {
        title = await page.title();
      } catch {}
    }

    return {
      running: Boolean(this.context),
      browserType: this.browserType,
      profile: this.profile,
      headed: this.headed,
      startedAt: this.startedAt,
      currentPageId: this.currentPageId,
      pageCount: this.pages.size,
      url,
      title,
      screenshotPath: (await pathExists(BROWSER_SCREENSHOT_PATH)) ? BROWSER_SCREENSHOT_PATH : null,
      pages: await Promise.all(
        [...this.pages.entries()].map(async ([id, entry]) => ({
          id,
          url: entry.page.url(),
          title: await entry.page.title().catch(() => ''),
          active: id === this.currentPageId,
        })),
      ),
    };
  }

  async close() {
    if (!this.context) {
      throw new Error('Browser is not running.');
    }
    const context = this.context;
    await context.close();
    await this.cleanupRuntimeState();
    await this.stopServer();
    return { running: false };
  }

  async cleanupRuntimeState() {
    this.context = null;
    this.pages.clear();
    this.currentPageId = null;
    this.startedAt = null;
    rmSync(BROWSER_METADATA_PATH, { force: true });
  }

  async persistMetadata() {
    const status = await this.getStatus();
    ensureParentDir(BROWSER_METADATA_PATH);
    await import('node:fs/promises').then(({ writeFile }) => writeFile(BROWSER_METADATA_PATH, JSON.stringify(status, null, 2)));
  }

  async startServer(pipePath = BROWSER_PIPE_PATH) {
    if (this.server) return pipePath;

    if (process.platform !== 'win32' && existsSync(pipePath)) {
      rmSync(pipePath, { force: true });
    }

    this.server = net.createServer((socket) => {
      socket.setEncoding('utf8');
      let buffer = '';
      socket.on('data', async (chunk) => {
        buffer += chunk;
        let index = buffer.indexOf('\n');
        while (index !== -1) {
          const line = buffer.slice(0, index).trim();
          buffer = buffer.slice(index + 1);
          if (line) {
            const message = JSON.parse(line);
            const response = await this.handleIpcMessage(message);
            socket.write(`${JSON.stringify(response)}\n`);
          }
          index = buffer.indexOf('\n');
        }
      });
    });

    await new Promise((resolvePromise, rejectPromise) => {
      this.server.once('error', rejectPromise);
      this.server.listen(pipePath, () => {
        this.server.off('error', rejectPromise);
        resolvePromise();
      });
    });

    this.keepAlivePromise = new Promise((resolvePromise) => {
      this.keepAliveResolve = resolvePromise;
    });

    return pipePath;
  }

  async stopServer() {
    if (!this.server || this.serverClosing) return;
    this.serverClosing = true;
    await new Promise((resolvePromise) => this.server.close(() => resolvePromise()));
    this.server = null;
    this.serverClosing = false;
    if (process.platform !== 'win32' && existsSync(BROWSER_PIPE_PATH)) {
      rmSync(BROWSER_PIPE_PATH, { force: true });
    }
    if (this.keepAliveResolve) {
      this.keepAliveResolve();
      this.keepAliveResolve = null;
      this.keepAlivePromise = null;
    }
  }

  waitUntilClosed() {
    return this.keepAlivePromise || Promise.resolve();
  }

  async handleIpcMessage(message) {
    try {
      const result = await this.dispatch(message.action, message.args || {});
      return { ok: true, id: message.id, result };
    } catch (err) {
      return { ok: false, id: message.id, error: createErrorPayload(err) };
    }
  }

  async dispatch(action, args) {
    switch (action) {
      case 'status':
        return this.getStatus();
      case 'navigate':
        return this.navigate(args.url, args);
      case 'click':
        return this.click(args.selector, args);
      case 'type':
        return this.type(args.selector, args.text, args);
      case 'eval':
        return this.evaluate(args.expression);
      case 'screenshot':
        return this.screenshot(args);
      case 'close':
        return this.close();
      default:
        throw new Error(`Unknown browser action: ${action}`);
    }
  }
}

export async function browserServiceAvailable(pipePath = BROWSER_PIPE_PATH) {
  try {
    await sendBrowserCommand('status', {}, { pipePath, timeout: 500 });
    return true;
  } catch {
    return false;
  }
}

export async function sendBrowserCommand(action, args = {}, opts = {}) {
  const pipePath = opts.pipePath || BROWSER_PIPE_PATH;
  return new Promise((resolvePromise, rejectPromise) => {
    const socket = net.createConnection(pipePath);
    const timeout = setTimeout(() => {
      socket.destroy();
      rejectPromise(browserNotRunningError());
    }, opts.timeout || DEFAULT_TIMEOUT);

    let buffer = '';
    socket.setEncoding('utf8');

    socket.once('error', () => {
      clearTimeout(timeout);
      rejectPromise(browserNotRunningError());
    });

    socket.on('data', (chunk) => {
      buffer += chunk;
      const newline = buffer.indexOf('\n');
      if (newline === -1) return;

      clearTimeout(timeout);
      const line = buffer.slice(0, newline);
      socket.end();

      const response = JSON.parse(line);
      if (!response.ok) {
        const err = new Error(response.error?.message || 'Browser command failed');
        err.code = response.error?.code;
        rejectPromise(err);
        return;
      }
      resolvePromise(response.result);
    });

    socket.on('connect', () => {
      socket.write(`${JSON.stringify({ id: `${Date.now()}`, action, args })}\n`);
    });
  });
}

async function promptToInstallPlaywright() {
  if (!process.stdin.isTTY || !process.stdout.isTTY) return false;
  const inquirer = (await import('inquirer')).default;
  const { install } = await inquirer.prompt([{
    type: 'confirm',
    name: 'install',
    message: theme.gold('Playwright is not installed. Install `playwright-core` now?'),
    default: false,
  }]);
  return install;
}

export async function installPlaywrightBrowsers() {
  const spin = spinner('Installing Chromium for Playwright...').start();

  try {
    await new Promise((resolvePromise, rejectPromise) => {
      const runner = process.platform === 'win32' ? 'npx.cmd' : 'npx';
      const child = spawn(runner, ['playwright', 'install', 'chromium'], {
        stdio: 'inherit',
      });
      child.on('exit', (code) => {
        if (code === 0) resolvePromise();
        else rejectPromise(new Error(`Playwright install exited with code ${code}`));
      });
      child.on('error', rejectPromise);
    });

    spin.succeed('Chromium installed for Playwright');
  } catch (err) {
    spin.fail('Playwright install failed');
    throw err;
  }
}

export async function startBrowserService(opts = {}) {
  const controller = new BrowserController();
  try {
    await controller.launch(opts);
  } catch (err) {
    if (err.code === 'PLAYWRIGHT_MISSING' && await promptToInstallPlaywright()) {
      await installPlaywrightBrowsers().catch(() => {});
    }
    throw err;
  }

  await controller.startServer();

  process.once('SIGINT', async () => {
    if (controller.context) {
      await controller.close().catch(() => {});
    } else {
      await controller.stopServer().catch(() => {});
    }
  });

  return controller;
}

export async function ensureBrowserStatus() {
  return sendBrowserCommand('status');
}

export async function showBrowserStatus() {
  try {
    const status = await ensureBrowserStatus();
    showSection('BROWSER STATUS');
    kvDisplay([
      ['Running', status.running ? theme.success('yes') : theme.dim('no')],
      ['Type', status.browserType || theme.dim('(unknown)')],
      ['Profile', status.profile || theme.dim('(default)')],
      ['Mode', status.headed ? 'headed' : 'headless'],
      ['Page', status.url || theme.dim('(blank)')],
      ['Title', status.title || theme.dim('(none)')],
      ['Pages', String(status.pageCount || 0)],
    ]);
    console.log('');
    return status;
  } catch (err) {
    error(err.message);
    return null;
  }
}

export async function launchBrowserCommand(opts = {}) {
  if (await browserServiceAvailable()) {
    warn('Browser service is already running.');
    await showBrowserStatus();
    return;
  }

  const spin = spinner(`Launching ${opts.type || DEFAULT_BROWSER_TYPE} browser...`).start();

  try {
    const controller = await startBrowserService(opts);
    spin.succeed('Browser launched');

    const status = await controller.getStatus();
    info(`Browser service listening on ${BROWSER_PIPE_PATH}`);
    info(`Profile: ${status.profile} | Mode: ${status.headed ? 'headed' : 'headless'}`);
    console.log('');
    await controller.waitUntilClosed();
  } catch (err) {
    spin.fail('Browser launch failed');
    error(err.message);
  }
}

export async function navigateBrowserCommand(url, opts = {}) {
  const spin = spinner(`Navigating to ${url}...`).start();
  try {
    const status = await sendBrowserCommand('navigate', { url, timeout: opts.timeout });
    spin.succeed('Navigation complete');
    success(status.url || url);
    return status;
  } catch (err) {
    spin.fail('Navigation failed');
    error(err.message);
  }
}

export async function browserScreenshotCommand(filename) {
  const spin = spinner('Capturing screenshot...').start();
  try {
    const result = await sendBrowserCommand('screenshot', {
      path: filename ? resolve(filename) : resolve(`screenshot-${Date.now()}.png`),
    });
    spin.succeed('Screenshot saved');
    success(result.path);
    return result;
  } catch (err) {
    spin.fail('Screenshot failed');
    error(err.message);
  }
}

export async function browserClickCommand(selector) {
  const spin = spinner(`Clicking ${selector}...`).start();
  try {
    await sendBrowserCommand('click', { selector });
    spin.succeed('Click complete');
    success(`Clicked ${selector}`);
  } catch (err) {
    spin.fail('Click failed');
    error(err.message);
  }
}

export async function browserTypeCommand(selector, text) {
  const spin = spinner(`Typing into ${selector}...`).start();
  try {
    await sendBrowserCommand('type', { selector, text });
    spin.succeed('Text entered');
    success(`Typed into ${selector}`);
  } catch (err) {
    spin.fail('Typing failed');
    error(err.message);
  }
}

export async function browserEvalCommand(expression) {
  const spin = spinner('Evaluating JavaScript...').start();
  try {
    const result = await sendBrowserCommand('eval', { expression });
    spin.succeed('Evaluation complete');
    showSection('BROWSER EVAL');
    console.log(`  ${theme.bright(result.formatted)}`);
    console.log('');
    return result;
  } catch (err) {
    spin.fail('Evaluation failed');
    error(err.message);
  }
}

export async function browserCloseCommand() {
  const spin = spinner('Closing browser...').start();
  try {
    await sendBrowserCommand('close');
    spin.succeed('Browser closed');
  } catch (err) {
    spin.fail('Close failed');
    error(err.message);
  }
}

export async function ensurePlaywrightOrExplain() {
  try {
    const controller = new BrowserController();
    await controller.ensurePlaywrightAvailable();
    return true;
  } catch (err) {
    error(err.message);
    info('Install optional dependency: npm install playwright-core --save-optional');
    info('Install browser binary: darksol browser install');
    return false;
  }
}

export const __test = {
  setPlaywrightLoader: setPlaywrightLoaderForTests,
  browserNotRunningError,
};
