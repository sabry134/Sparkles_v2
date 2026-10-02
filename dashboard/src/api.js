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
  let payload = null;

  if (contentType.includes('application/json')) {
    try {
      payload = await response.json();
    } catch {
      payload = null;
    }
  }

  if (!response.ok) {
    const requestId =
      payload?.error?.requestId ?? response.headers.get('x-request-id') ?? undefined;
    const code =
      payload?.error?.code ??
      (response.status >= 500 && !requestId ? 'NETWORK_ERROR' : 'INTERNAL_ERROR');
    throw new ApiError(code, requestId);
  }

  return payload;
}
