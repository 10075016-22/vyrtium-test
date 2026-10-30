import type { z } from 'zod';
import { AppError } from './errors.js';

export function parseBody<T extends z.ZodType>(schema: T, body: unknown): z.infer<T> {
  const result = schema.safeParse(body);
  if (!result.success) {
    throw new AppError(
      400,
      'VALIDATION_ERROR',
      'Request body is invalid',
      result.error.issues.map((issue) => ({
        field: issue.path.join('.') || 'body',
        message: issue.message,
      })),
    );
  }
  return result.data;
}
