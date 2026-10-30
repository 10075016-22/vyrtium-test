import type { z } from 'zod';
import { AppError } from './errors.js';

function parse<T extends z.ZodType>(schema: T, input: unknown, message: string, root: string): z.infer<T> {
  const result = schema.safeParse(input);
  if (!result.success) {
    throw new AppError(
      400,
      'VALIDATION_ERROR',
      message,
      result.error.issues.map((issue) => ({
        field: issue.path.join('.') || root,
        message: issue.message,
      })),
    );
  }
  return result.data;
}

export function parseBody<T extends z.ZodType>(schema: T, body: unknown): z.infer<T> {
  return parse(schema, body, 'Request body is invalid', 'body');
}

export function parseQuery<T extends z.ZodType>(schema: T, query: unknown): z.infer<T> {
  return parse(schema, query, 'Query parameters are invalid', 'query');
}
