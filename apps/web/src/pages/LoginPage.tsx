import { useState, type SubmitEvent } from 'react';
import { LoaderCircle, LogIn, UserRound } from 'lucide-react';
import { DEMO_USERS } from '../auth/demoUsers';
import { useAuth } from '../auth/useAuth';
import { Alert } from '../components/Alert';
import { Brand } from '../components/Brand';
import { messageFor } from '../lib/errorMessages';
import { button, card, field, fieldError, icon, input, label } from '../ui/classes';

interface FieldErrors {
  email?: string;
  password?: string;
}

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function validate(email: string, password: string): FieldErrors {
  const errors: FieldErrors = {};
  if (!email) errors.email = 'Ingresa tu email.';
  else if (!EMAIL_PATTERN.test(email)) errors.email = 'Ingresa un email válido, por ejemplo ana@orbita.test.';
  if (!password) errors.password = 'Ingresa tu contraseña.';
  return errors;
}

export function LoginPage() {
  const { login, notice } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(event: SubmitEvent<HTMLFormElement>) {
    event.preventDefault();
    if (submitting) return;

    const trimmedEmail = email.trim();
    const errors = validate(trimmedEmail, password);
    setFieldErrors(errors);
    setFormError(null);
    if (errors.email || errors.password) return;

    setSubmitting(true);
    try {
      await login(trimmedEmail, password);
    } catch (err) {
      setFormError(messageFor(err));
      setSubmitting(false);
    }
  }

  return (
    <main className="grid min-h-dvh place-items-center p-4">
      <div className={`${card} grid w-full max-w-[420px] gap-4`}>
        <Brand />
        <h1 className="mt-2 text-[1.75rem] leading-tight font-bold">Inicia sesión</h1>
        <p className="text-muted">Consulta tu saldo y administra tus fondos en USD.</p>

        {notice && (
          <Alert kind="info" role="status">
            {notice}
          </Alert>
        )}
        {formError && (
          <Alert kind="error" role="alert">
            {formError}
          </Alert>
        )}

        <form className="grid gap-4" onSubmit={(e) => void handleSubmit(e)} noValidate autoComplete="off">
          <div className={field}>
            <label htmlFor="email" className={label}>
              Email
            </label>
            <input
              id="email"
              name="email"
              spellCheck={false}
              type="email"
              autoComplete="off"
              inputMode="email"
              className={input}
              value={email}
              onChange={(e) => {
                setEmail(e.target.value);
              }}
              aria-invalid={fieldErrors.email ? true : undefined}
              aria-describedby={fieldErrors.email ? 'email-error' : undefined}
            />
            {fieldErrors.email && (
              <p id="email-error" className={fieldError}>
                {fieldErrors.email}
              </p>
            )}
          </div>

          <div className={field}>
            <label htmlFor="password" className={label}>
              Contraseña
            </label>
            <input
              id="password"
              name="password"
              type="password"
              autoComplete="off"
              className={input}
              value={password}
              onChange={(e) => {
                setPassword(e.target.value);
              }}
              aria-invalid={fieldErrors.password ? true : undefined}
              aria-describedby={fieldErrors.password ? 'password-error' : undefined}
            />
            {fieldErrors.password && (
              <p id="password-error" className={fieldError}>
                {fieldErrors.password}
              </p>
            )}
          </div>

          <button type="submit" className={`${button.primary} w-full`} disabled={submitting}>
            {submitting ? (
              <LoaderCircle className={`${icon} animate-spin`} aria-hidden="true" />
            ) : (
              <LogIn className={icon} aria-hidden="true" />
            )}
            {submitting ? 'Ingresando…' : 'Ingresar'}
          </button>
        </form>

        <section
          className="grid gap-2 border-t border-dashed border-white/16 pt-4"
          aria-labelledby="demo-users-title"
        >
          <h2 id="demo-users-title" className="text-[0.9375rem] font-semibold">
            Usuarios de prueba
          </h2>
          <p className="text-sm text-muted">Credenciales de demostración. Elige una para completar el formulario.</p>
          <ul className="grid gap-2">
            {DEMO_USERS.map((user) => (
              <li
                key={user.email}
                className="flex items-center gap-3 rounded-[10px] border border-white/9 bg-field py-2 pr-2 pl-3"
              >
                <UserRound className={`${icon} text-brand`} aria-hidden="true" />
                <div className="grid min-w-0 flex-1">
                  <span className="font-semibold">{user.name}</span>
                  <span className="truncate text-sm text-muted">{user.email}</span>
                </div>
                <button
                  type="button"
                  className={button.compact}
                  aria-label={`Usar credenciales de prueba de ${user.name}`}
                  disabled={submitting}
                  onClick={() => {
                    setEmail(user.email);
                    setPassword(user.password);
                    setFieldErrors({});
                    setFormError(null);
                  }}
                >
                  Usar
                </button>
              </li>
            ))}
          </ul>
        </section>
      </div>
    </main>
  );
}
