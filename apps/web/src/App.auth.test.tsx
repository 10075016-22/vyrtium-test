import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { App } from './App';
import { apiError, balance, emptyPage, fakeApi, json, storeSession } from './test/fakeApi';

const BALANCE_ROUTES = {
  'GET /balances/me': () => json(balance('150.25')),
  'GET /balances/me/transactions?page=1&pageSize=10': () => json(emptyPage),
};

/** Login endpoint that "sets the cookie" so the following /auth/me sees the user. */
function loginRoute(user = { id: 'u_123', email: 'ana@orbita.test' }) {
  return () => {
    storeSession(user);
    return json({ accessToken: 'jwt-in-cookie', tokenType: 'Bearer', expiresIn: 1800 });
  };
}

async function renderLogin() {
  render(<App />);
  await screen.findByRole('heading', { name: 'Inicia sesión' });
}

async function fillLogin(email: string, password: string) {
  const user = userEvent.setup();
  if (email) await user.type(screen.getByLabelText('Email'), email);
  if (password) await user.type(screen.getByLabelText('Contraseña'), password);
  await user.click(screen.getByRole('button', { name: 'Ingresar' }));
}

describe('login', () => {
  it('shows an understandable message for invalid credentials, not an HTTP code', async () => {
    fakeApi({ 'POST /auth/login': () => apiError(401, 'INVALID_CREDENTIALS', 'Invalid email or password') });
    await renderLogin();

    await fillLogin('ana@orbita.test', 'wrong');

    expect(await screen.findByRole('alert')).toHaveTextContent('El email o la contraseña no son correctos.');
    expect(screen.queryByText(/401/)).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Ingresar' })).toBeEnabled();
  });

  it('validates the fields before calling the API', async () => {
    const api = fakeApi({});
    await renderLogin();
    const callsBefore = api.calls.length;

    await fillLogin('not-an-email', '');

    expect(screen.getByText(/Ingresa un email válido/)).toBeInTheDocument();
    expect(screen.getByText('Ingresa tu contraseña.')).toBeInTheDocument();
    expect(screen.getByLabelText('Email')).toHaveAttribute('aria-invalid', 'true');
    expect(api.calls).toHaveLength(callsBefore);
  });

  it('disables browser autocomplete on the login form and its inputs', async () => {
    fakeApi({});
    await renderLogin();

    expect(screen.getByLabelText('Email')).toHaveAttribute('autocomplete', 'off');
    expect(screen.getByLabelText('Contraseña')).toHaveAttribute('autocomplete', 'off');
    expect(screen.getByLabelText('Email').closest('form')).toHaveAttribute('autocomplete', 'off');
  });

  it('asks for the email when it is empty', async () => {
    fakeApi({});
    await renderLogin();
    await fillLogin('', 'secret');
    expect(screen.getByText('Ingresa tu email.')).toBeInTheDocument();
  });

  it('explains when the API is unreachable', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('Failed to fetch')));
    await renderLogin();

    await fillLogin('ana@orbita.test', 'secret');

    expect(await screen.findByRole('alert')).toHaveTextContent('No pudimos conectar con el servidor');
  });

  it('logs in with the session cookie and never stores the token in the browser', async () => {
    const api = fakeApi({ 'POST /auth/login': loginRoute(), ...BALANCE_ROUTES });
    await renderLogin();

    await fillLogin(' ana@orbita.test ', 'Orbita-Ana-2026');

    expect(await screen.findByText('$150.25')).toBeInTheDocument();
    expect(screen.getByText('ana@orbita.test')).toBeInTheDocument();
    expect(api.callsTo('POST', '/auth/login')[0]?.body).toEqual({
      email: 'ana@orbita.test',
      password: 'Orbita-Ana-2026',
    });
    // Every request carries the cookie; none carries the token.
    expect(api.calls.every((call) => call.credentials === 'include')).toBe(true);
    expect(api.calls.some((call) => 'Authorization' in call.headers)).toBe(false);
    expect(localStorage.length).toBe(0);
    expect(sessionStorage.length).toBe(0);
  });
});

describe('demo users', () => {
  it('lists two test users and fills the form with their credentials', async () => {
    const api = fakeApi({
      'POST /auth/login': loginRoute({ id: 'u_456', email: 'luis@orbita.test' }),
      ...BALANCE_ROUTES,
    });
    const user = userEvent.setup();
    await renderLogin();
    const callsBefore = api.calls.length;

    const section = screen.getByRole('region', { name: 'Usuarios de prueba' });
    expect(section).toHaveTextContent('ana@orbita.test');
    expect(section).toHaveTextContent('luis@orbita.test');

    await user.click(screen.getByRole('button', { name: 'Usar credenciales de prueba de Luis' }));
    expect(screen.getByLabelText('Email')).toHaveValue('luis@orbita.test');
    expect(screen.getByLabelText('Contraseña')).toHaveValue('Orbita-Luis-2026');
    expect(api.calls).toHaveLength(callsBefore);

    await user.click(screen.getByRole('button', { name: 'Ingresar' }));
    expect(await screen.findByText('$150.25')).toBeInTheDocument();
    expect(screen.getByText('luis@orbita.test')).toBeInTheDocument();
  });

  it('clears previous validation errors when credentials are loaded', async () => {
    fakeApi({});
    await renderLogin();

    await fillLogin('', '');
    expect(screen.getByText('Ingresa tu email.')).toBeInTheDocument();

    await userEvent.setup().click(screen.getByRole('button', { name: 'Usar credenciales de prueba de Ana' }));
    expect(screen.queryByText('Ingresa tu email.')).not.toBeInTheDocument();
    expect(screen.getByLabelText('Email')).toHaveValue('ana@orbita.test');
  });
});

describe('session', () => {
  it('shows a neutral loading state while checking the session', () => {
    vi.stubGlobal('fetch', vi.fn(() => new Promise(() => undefined)));
    render(<App />);

    expect(screen.getByRole('status')).toHaveTextContent('Verificando tu sesión…');
    expect(screen.queryByRole('heading', { name: 'Inicia sesión' })).not.toBeInTheDocument();
  });

  it('survives a reload: a valid cookie opens the balance screen directly', async () => {
    storeSession();
    fakeApi(BALANCE_ROUTES);
    render(<App />);

    expect(await screen.findByText('$150.25')).toBeInTheDocument();
    expect(screen.getByText('ana@orbita.test')).toBeInTheDocument();
  });

  it('shows the login without a notice when there is simply no session', async () => {
    fakeApi({});
    await renderLogin();
    expect(screen.queryByRole('status')).not.toBeInTheDocument();
  });

  it('shows the login without a notice when the API is unreachable on load', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('Failed to fetch')));
    await renderLogin();
    expect(screen.queryByRole('status')).not.toBeInTheDocument();
  });

  it.each([
    ['TOKEN_EXPIRED', 'Tu sesión expiró'],
    ['INVALID_TOKEN', 'Tu sesión ya no es válida'],
  ])('explains on load why the stored cookie was rejected (%s)', async (code, message) => {
    fakeApi({ 'GET /auth/me': () => apiError(401, code) });
    await renderLogin();
    expect(screen.getByRole('status')).toHaveTextContent(message);
  });

  it.each([
    ['TOKEN_EXPIRED', 'Tu sesión expiró'],
    ['INVALID_TOKEN', 'Tu sesión ya no es válida'],
  ])('returns to login with an explanation when a later call answers 401 %s', async (code, message) => {
    storeSession();
    const api = fakeApi({
      'GET /balances/me': () => apiError(401, code),
      'GET /balances/me/transactions?page=1&pageSize=10': () => apiError(401, code),
    });
    render(<App />);

    expect(await screen.findByRole('heading', { name: 'Inicia sesión' })).toBeInTheDocument();
    expect(screen.getByRole('status')).toHaveTextContent(message);
    // The server is asked to drop the rejected cookie too.
    expect(api.callsTo('POST', '/auth/logout').length).toBeGreaterThan(0);
  });

  it('logs out on demand: asks the API to delete the HttpOnly cookie', async () => {
    storeSession();
    const api = fakeApi(BALANCE_ROUTES);
    render(<App />);
    await screen.findByText('$150.25');

    await userEvent.setup().click(screen.getByRole('button', { name: 'Cerrar sesión' }));

    expect(screen.getByRole('heading', { name: 'Inicia sesión' })).toBeInTheDocument();
    expect(screen.queryByRole('status')).not.toBeInTheDocument();
    expect(api.callsTo('POST', '/auth/logout')).toHaveLength(1);
  });

  it('still leaves the app signed out if the logout request fails', async () => {
    storeSession();
    fakeApi({ ...BALANCE_ROUTES, 'POST /auth/logout': () => Promise.reject(new TypeError('Failed to fetch')) });
    render(<App />);
    await screen.findByText('$150.25');

    await userEvent.setup().click(screen.getByRole('button', { name: 'Cerrar sesión' }));
    expect(screen.getByRole('heading', { name: 'Inicia sesión' })).toBeInTheDocument();
  });
});
