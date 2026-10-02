export class AppError extends Error {
  constructor(code, status = 500, options = {}) {
    super(code, options);
    this.name = 'AppError';
    this.code = code;
    this.status = status;
  }
}

export function assert(condition, code, status = 400) {
  if (!condition) {
    throw new AppError(code, status);
  }
}

export function errorResponse(error, requestId) {
  if (error instanceof AppError) {
    return {
      status: error.status,
      body: { error: { code: error.code, requestId } },
    };
  }

  return {
    status: 500,
    body: { error: { code: 'INTERNAL_ERROR', requestId } },
  };
}
