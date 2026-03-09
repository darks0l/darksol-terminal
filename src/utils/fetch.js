import fetch from 'node-fetch';

/**
 * Fetch JSON safely — handles HTML error pages, non-JSON responses,
 * and invalid JSON gracefully instead of crashing with cryptic errors.
 */
export async function fetchJSON(url, options = {}) {
  const resp = await fetch(url, options);
  const contentType = resp.headers.get('content-type') || '';
  const text = await resp.text();

  if (!contentType.includes('application/json') && !contentType.includes('text/json')) {
    const preview = text.substring(0, 60).replace(/\n/g, ' ');
    throw new Error(
      `Expected JSON but got ${contentType.split(';')[0] || 'unknown'} (HTTP ${resp.status}). ` +
      `Response: "${preview}..."`
    );
  }

  try {
    return JSON.parse(text);
  } catch {
    const preview = text.substring(0, 60).replace(/\n/g, ' ');
    throw new Error(`Invalid JSON (HTTP ${resp.status}): "${preview}..."`);
  }
}

export default fetchJSON;
