import { PlatformError } from '../../shared/platform-schema.js';

export class AppError extends Error {
  constructor(code, status = 500, options = {}) {
    const cause = options?.cause ? { cause: options.cause } : undefined;
    super(code, cause);
    this.name = 'AppError';
    this.code = code;
    this.status = status;
    this.details = Array.isArray(options?.details) ? options.details : [];
  }
}

export function assert(condition, code, status = 400, details = []) {
  if (!condition) {
    throw new AppError(code, status, { details });
  }
}

export function errorResponse(error, requestId) {
  if (error instanceof AppError || error instanceof PlatformError) {
    return {
      status: error.status,
      body: {
        error: {
          code: error.code,
          requestId,
          ...(Array.isArray(error.details) && error.details.length
            ? { details: error.details }
            : {}),
        },
      },
    };
  }

  return {
    status: 500,
    body: { error: { code: 'INTERNAL_ERROR', requestId } },
  };
}
