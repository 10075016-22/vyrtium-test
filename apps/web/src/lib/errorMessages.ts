import { ApiError } from './api';

// User-facing copy (Spanish). Keyed by the API's stable error codes, never by HTTP status text.
const MESSAGES: Record<string, string> = {
  INVALID_CREDENTIALS: 'El email o la contraseña no son correctos.',
  TOKEN_EXPIRED: 'Tu sesión expiró. Inicia sesión de nuevo para continuar.',
  INVALID_TOKEN: 'Tu sesión ya no es válida. Inicia sesión de nuevo para continuar.',
  MISSING_TOKEN: 'Tu sesión ya no es válida. Inicia sesión de nuevo para continuar.',
  INSUFFICIENT_FUNDS: 'No tienes saldo suficiente para este retiro.',
  AMOUNT_LIMIT_EXCEEDED: 'El monto máximo por operación es 10,000.00 USD.',
  INVALID_AMOUNT: 'El monto debe ser mayor a 0 y tener máximo 2 decimales.',
  UNSUPPORTED_CURRENCY: 'Solo se aceptan operaciones en USD.',
  IDEMPOTENCY_KEY_REUSED: 'Esta operación ya se había registrado con otros datos. Inténtalo de nuevo.',
  VALIDATION_ERROR: 'Revisa los datos ingresados e inténtalo de nuevo.',
  NETWORK_ERROR: 'No pudimos conectar con el servidor. Revisa tu conexión e inténtalo de nuevo.',
};

const FALLBACK = 'Ocurrió un error inesperado. Inténtalo de nuevo en unos minutos.';

export function messageFor(error: unknown): string {
  if (error instanceof ApiError) return MESSAGES[error.code] ?? FALLBACK;
  return FALLBACK;
}
