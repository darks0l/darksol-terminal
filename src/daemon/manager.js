/**
 * Service registry and lifecycle manager for the daemon.
 * Services register with the manager and can be started/stopped/queried.
 */

const services = new Map();

/**
 * Register a service with the daemon manager.
 * @param {string} name - Unique service name (e.g. 'telegram', 'web-shell')
 * @param {{start: Function, stop: Function, status: Function}} handler
 */
export function registerService(name, handler) {
  if (services.has(name)) {
    throw new Error(`Service "${name}" is already registered`);
  }
  services.set(name, {
    name,
    handler,
    state: 'stopped',
    startedAt: null,
    error: null,
  });
}

/**
 * Unregister a service.
 * @param {string} name
 */
export function unregisterService(name) {
  services.delete(name);
}

/**
 * Start a registered service.
 * @param {string} name
 * @param {object} [opts]
 * @returns {Promise<void>}
 */
export async function startService(name, opts = {}) {
  const svc = services.get(name);
  if (!svc) throw new Error(`Unknown service: ${name}`);
  if (svc.state === 'running') return;

  try {
    svc.state = 'starting';
    svc.error = null;
    await svc.handler.start(opts);
    svc.state = 'running';
    svc.startedAt = new Date().toISOString();
  } catch (err) {
    svc.state = 'error';
    svc.error = err.message;
    throw err;
  }
}

/**
 * Stop a registered service.
 * @param {string} name
 * @returns {Promise<void>}
 */
export async function stopService(name) {
  const svc = services.get(name);
  if (!svc) return;
  if (svc.state !== 'running' && svc.state !== 'starting') return;

  try {
    await svc.handler.stop();
  } catch {
    // best-effort stop
  }
  svc.state = 'stopped';
  svc.startedAt = null;
}

/**
 * Stop all running services.
 * @returns {Promise<void>}
 */
export async function stopAllServices() {
  for (const [name] of services) {
    await stopService(name);
  }
}

/**
 * Get status of a specific service.
 * @param {string} name
 * @returns {object|null}
 */
export function getServiceStatus(name) {
  const svc = services.get(name);
  if (!svc) return null;

  let extra = {};
  if (svc.handler.status) {
    try {
      extra = svc.handler.status() || {};
    } catch {
      // ignore
    }
  }

  return {
    name: svc.name,
    state: svc.state,
    startedAt: svc.startedAt,
    error: svc.error,
    ...extra,
  };
}

/**
 * Get health summary for all registered services.
 * @returns {Array<object>}
 */
export function getAllServiceStatus() {
  const result = [];
  for (const [name] of services) {
    result.push(getServiceStatus(name));
  }
  return result;
}

/**
 * List names of all registered services.
 * @returns {string[]}
 */
export function listServices() {
  return [...services.keys()];
}

/**
 * Check if a service is registered.
 * @param {string} name
 * @returns {boolean}
 */
export function hasService(name) {
  return services.has(name);
}

/**
 * Reset the manager (for testing).
 */
export function resetManager() {
  services.clear();
}
