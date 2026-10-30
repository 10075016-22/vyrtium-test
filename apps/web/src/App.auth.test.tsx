import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { App } from './App';
import { SESSION_STORAGE_KEY } from './auth/session';
import { apiError, balance, emptyPage, fakeApi, json, storeSession } from './test/fakeApi';

const BALANCE_ROUTES = {
  'GET /balances/me': () => json(balance('150.25')),
  'GET /balances/me/transactions?page=1&pageSize=10': () => json(emptyPage),
};

async function fillLogin(email: string, password: string) {
  const user = userEvent.setup();
  if (email) await user.type(screen.getByLabelText('Email'), email);
  if (password) await user.type(screen.getByLabelText('Contraseña'), password);
  await user.click(screen.getByRole('button', { name: 'Ingresar' }));
}

describe('login', () => {
  it('shows an understandable message for invalid credentials, not an HTTP code', async () => {
    fakeApi({ 'POST /auth/login': () => apiError(401, 'INVALID_CREDENTIALS', 'Invalid email or password') });
    render(<App />);

    await fillLogin('ana@orbita.test', 'wrong');

    expect(await screen.findByRole('alert')).toHaveTextContent('El email o la contraseña no son correctos.');
    expect(screen.queryByText(/401/)).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Ingresar' })).toBeEnabled();
  });

  it('validates the fields before calling the API', async () => {
    const api = fakeApi({});
    render(<App />);

    await fillLogin('not-an-email', '');

    expect(screen.getByText(/Ingresa un email válido/)).toBeInTheDocument();
    expect(screen.getByText('Ingresa tu contraseña.')).toBeInTheDocument();
    expect(screen.getByLabelText('Email')).toHaveAttribute('aria-invalid', 'true');
    expect(api.calls).toHaveLength(0);
  });

  it('disables browser autocomplete on the login form and its inputs', () => {
    fakeApi({});
    render(<App />);

    expect(screen.getByLabelText('Email')).toHaveAttribute('autocomplete', 'off');
    expect(screen.getByLabelText('Contraseña')).toHaveAttribute('autocomplete', 'off');
    expect(screen.getByLabelText('Email').closest('form')).toHaveAttribute('autocomplete', 'off');
  });

  it('asks for the email when it is empty', async () => {
    fakeApi({});
    render(<App />);
    await fillLogin('', 'secret');
    expect(screen.getByText('Ingresa tu email.')).toBeInTheDocument();
  });

  it('explains when the API is unreachable', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('Failed to fetch')));
    render(<App />);

    await fillLogin('ana@orbita.test', 'secret');

    expect(await screen.findByRole('alert')).toHaveTextContent('No pudimos conectar con el servidor');
  });

  it('logs in, shows the balance and persists the session', async () => {
    const api = fakeApi({
      'POST /auth/login': () => json({ accessToken: 'jwt-1', tokenType: 'Bearer', expiresIn: 1800 }),
      ...BALANCE_ROUTES,
    });
    render(<App />);

    await fillLogin(' ana@orbita.test ', 'Orbita-Ana-2026');

    expect(await screen.findByText('$150.25')).toBeInTheDocument();
    expect(api.callsTo('POST', '/auth/login')[0]?.body).toEqual({
      email: 'ana@orbita.test',
      password: 'Orbita-Ana-2026',
    });
    expect(api.callsTo('GET', '/balances/me')[0]?.headers.Authorization).toBe('Bearer jwt-1');
    expect(JSON.parse(localStorage.getItem(SESSION_STORAGE_KEY) ?? '{}')).toMatchObject({
      token: 'jwt-1',
      email: 'ana@orbita.test',
    });
  });
});

describe('demo users', () => {
  it('lists two test users and fills the form with their credentials', async () => {
    const api = fakeApi({
      'POST /auth/login': () => json({ accessToken: 'jwt-luis', tokenType: 'Bearer', expiresIn: 1800 }),
      ...BALANCE_ROUTES,
    });
    const user = userEvent.setup();
    render(<App />);

    const section = screen.getByRole('region', { name: 'Usuarios de prueba' });
    expect(section).toHaveTextContent('ana@orbita.test');
    expect(section).toHaveTextContent('luis@orbita.test');

    await user.click(screen.getByRole('button', { name: 'Usar credenciales de prueba de Luis' }));
    expect(screen.getByLabelText('Email')).toHaveValue('luis@orbita.test');
    expect(screen.getByLabelText('Contraseña')).toHaveValue('Orbita-Luis-2026');
    expect(api.calls).toHaveLength(0);

    await user.click(screen.getByRole('button', { name: 'Ingresar' }));
    expect(await screen.findByText('$150.25')).toBeInTheDocument();
    expect(api.callsTo('POST', '/auth/login')[0]?.body).toEqual({
      email: 'luis@orbita.test',
      password: 'Orbita-Luis-2026',
    });
  });

  it('clears previous validation errors when credentials are loaded', async () => {
    fakeApi({});
    render(<App />);

    await fillLogin('', '');
    expect(screen.getByText('Ingresa tu email.')).toBeInTheDocument();

    await userEvent.setup().click(screen.getByRole('button', { name: 'Usar credenciales de prueba de Ana' }));
    expect(screen.queryByText('Ingresa tu email.')).not.toBeInTheDocument();
    expect(screen.getByLabelText('Email')).toHaveValue('ana@orbita.test');
  });
});

describe('session', () => {
  it('survives a reload: a stored session opens the balance screen directly', async () => {
    storeSession();
    fakeApi(BALANCE_ROUTES);
    render(<App />);

    expect(await screen.findByText('$150.25')).toBeInTheDocument();
    expect(screen.getByText('ana@orbita.test')).toBeInTheDocument();
  });

  it('drops an expired stored session and explains why, without calling the API', () => {
    storeSession({ expiresAt: Date.now() - 1000 });
    const api = fakeApi({});
    render(<App />);

    expect(screen.getByRole('heading', { name: 'Inicia sesión' })).toBeInTheDocument();
    expect(screen.getByRole('status')).toHaveTextContent('Tu sesión expiró');
    expect(api.calls).toHaveLength(0);
    expect(localStorage.getItem(SESSION_STORAGE_KEY)).toBeNull();
  });

  it.each([
    ['TOKEN_EXPIRED', 'Tu sesión expiró'],
    ['INVALID_TOKEN', 'Tu sesión ya no es válida'],
  ])('returns to login with an explanation when the API answers 401 %s', async (code, message) => {
    storeSession();
    fakeApi({
      'GET /balances/me': () => apiError(401, code),
      'GET /balances/me/transactions?page=1&pageSize=10': () => apiError(401, code),
    });
    render(<App />);

    expect(await screen.findByRole('heading', { name: 'Inicia sesión' })).toBeInTheDocument();
    expect(screen.getByRole('status')).toHaveTextContent(message);
    expect(localStorage.getItem(SESSION_STORAGE_KEY)).toBeNull();
  });

  it('logs out on demand and clears the stored session', async () => {
    storeSession();
    fakeApi(BALANCE_ROUTES);
    render(<App />);
    await screen.findByText('$150.25');

    await userEvent.setup().click(screen.getByRole('button', { name: 'Cerrar sesión' }));

    expect(screen.getByRole('heading', { name: 'Inicia sesión' })).toBeInTheDocument();
    expect(screen.queryByRole('status')).not.toBeInTheDocument();
    expect(localStorage.getItem(SESSION_STORAGE_KEY)).toBeNull();
  });
});
