export class ApiError extends Error {
  constructor(code, requestId) {
    super(code);
    this.name = 'ApiError';
    this.code = code;
    this.requestId = requestId;
  }
}

const pendingReads = new Map();

export function api(path, options = {}) {
  const method = options.method ?? 'GET';
  if (method !== 'GET') {
    pendingReads.clear();
    return requestApi(path, options).finally(() => pendingReads.clear());
  }

  const key = JSON.stringify([path, options.headers ?? {}]);
  if (pendingReads.has(key)) return pendingReads.get(key);
  const pending = requestApi(path, options).finally(() => {
    if (pendingReads.get(key) === pending) pendingReads.delete(key);
  });
  pendingReads.set(key, pending);
  return pending;
}

async function requestApi(path, options) {
  const headers = { accept: 'application/json', ...options.headers };
  const request = {
    method: options.method ?? 'GET',
    credentials: 'same-origin',
    cache: 'no-store',
    headers,
  };

  if (options.body !== undefined) {
    headers['content-type'] = 'application/json';
    request.body = JSON.stringify(options.body);
  }

  if (options.csrfToken) {
    headers['x-csrf-token'] = options.csrfToken;
  }

  let response;
  try {
    response = await fetch(path, request);
  } catch {
    throw new ApiError('NETWORK_ERROR');
  }

  const contentType = response.headers.get('content-type') ?? '';
  const payload = contentType.includes('application/json') ? await response.json() : null;

  if (!response.ok) {
    throw new ApiError(
      payload?.error?.code ?? 'INTERNAL_ERROR',
      payload?.error?.requestId ?? response.headers.get('x-request-id'),
    );
  }

  return payload;
}
