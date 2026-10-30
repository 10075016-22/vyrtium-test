import type { ErrorRequestHandler, RequestHandler } from 'express';

export type ErrorCode =
  | 'VALIDATION_ERROR'
  | 'INVALID_JSON'
  | 'INVALID_CREDENTIALS'
  | 'MISSING_TOKEN'
  | 'INVALID_TOKEN'
  | 'TOKEN_EXPIRED'
  | 'NOT_FOUND'
  | 'PAYLOAD_TOO_LARGE'
  | 'INTERNAL_ERROR'
  | 'INVALID_AMOUNT'
  | 'AMOUNT_LIMIT_EXCEEDED'
  | 'UNSUPPORTED_CURRENCY'
  | 'INSUFFICIENT_FUNDS'
  | 'IDEMPOTENCY_KEY_REQUIRED'
  | 'IDEMPOTENCY_KEY_INVALID'
  | 'IDEMPOTENCY_KEY_REUSED';

export interface ErrorDetail {
  field: string;
  message: string;
}

export interface ErrorBody {
  error: {
    code: ErrorCode;
    message: string;
    details?: ErrorDetail[];
  };
}

export class AppError extends Error {
  constructor(
    readonly status: number,
    readonly code: ErrorCode,
    message: string,
    readonly details?: ErrorDetail[],
  ) {
    super(message);
    this.name = 'AppError';
  }
}

export function toBody(error: AppError): ErrorBody {
  return {
    error: {
      code: error.code,
      message: error.message,
      ...(error.details ? { details: error.details } : {}),
    },
  };
}

// body-parser errors carry an HTTP status and a `type` discriminator.
function isBodyParserError(err: unknown): err is { status: number; type: string } {
  return typeof err === 'object' && err !== null && 'type' in err && 'status' in err;
}

function normalize(err: unknown): AppError {
  if (err instanceof AppError) return err;
  if (isBodyParserError(err)) {
    if (err.type === 'entity.parse.failed') {
      return new AppError(400, 'INVALID_JSON', 'Request body is not valid JSON');
    }
    if (err.type === 'entity.too.large') {
      return new AppError(413, 'PAYLOAD_TOO_LARGE', 'Request body is too large');
    }
  }
  return new AppError(500, 'INTERNAL_ERROR', 'Unexpected error');
}

export const notFoundHandler: RequestHandler = (req, _res, next) => {
  next(new AppError(404, 'NOT_FOUND', `Route ${req.method} ${req.path} not found`));
};

export const errorHandler: ErrorRequestHandler = (err: unknown, _req, res, _next) => {
  const appError = normalize(err);
  if (appError.status >= 500) {
    // Full error stays in server logs; the client only gets the generic body.
    console.error(err);
  }
  res.status(appError.status).json(toBody(appError));
};
