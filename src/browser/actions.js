import { sendBrowserCommand } from '../services/browser.js';

const DEFAULT_TIMEOUT = 30_000;

export async function waitForPage(target, opts = {}) {
  const expression = JSON.stringify(target);
  return sendBrowserCommand('eval', {
    expression: `
      new Promise((resolve) => {
        const target = ${expression};
        const timeout = ${Number(opts.timeout || DEFAULT_TIMEOUT)};
        const start = Date.now();
        const check = () => {
          const matches = typeof target === 'string'
            ? window.location.href.includes(target)
            : true;
          if (matches) return resolve({ ok: true, url: window.location.href });
          if (Date.now() - start > timeout) return resolve({ ok: false, url: window.location.href });
          setTimeout(check, 250);
        };
        check();
      })
    `,
  });
}

export async function fillForm(fields = [], opts = {}) {
  for (const field of fields) {
    await sendBrowserCommand('type', {
      selector: field.selector,
      text: field.value,
      timeout: opts.timeout || DEFAULT_TIMEOUT,
    });
  }
  return true;
}

export async function runLoginFlow(flow = {}) {
  if (flow.url) {
    await sendBrowserCommand('navigate', {
      url: flow.url,
      timeout: flow.timeout || DEFAULT_TIMEOUT,
    });
  }
  if (Array.isArray(flow.fields) && flow.fields.length) {
    await fillForm(flow.fields, flow);
  }
  if (flow.submitSelector) {
    await sendBrowserCommand('click', {
      selector: flow.submitSelector,
      timeout: flow.timeout || DEFAULT_TIMEOUT,
    });
  }
  if (flow.waitFor) {
    await waitForPage(flow.waitFor, flow);
  }
  return sendBrowserCommand('status');
}
