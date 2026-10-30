import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { App } from './App';
import { apiError, balance, emptyPage, fakeApi, json, page, storeSession } from './test/fakeApi';

const firstPage = page(
  [
    { id: 'a', type: 'withdrawal', amount: '10.00', balanceAfter: '90.00' },
    { id: 'b', type: 'gateway_credit', amount: '200.00', balanceAfter: '100.00' },
  ],
  { page: 1, pageSize: 10, total: 6, totalPages: 2 },
);
const secondPage = page([{ id: 'c', type: 'deposit', amount: '1.00', balanceAfter: '1.00' }], {
  page: 2,
  pageSize: 10,
  total: 6,
  totalPages: 2,
});

describe('balance screen states', () => {
  it('shows loading placeholders before data arrives', () => {
    storeSession();
    vi.stubGlobal('fetch', vi.fn(() => new Promise(() => undefined)));
    render(<App />);

    expect(screen.getByLabelText('Cargando saldo')).toBeInTheDocument();
    expect(screen.getByLabelText('Cargando movimientos')).toBeInTheDocument();
  });

  it('shows an empty state for a user without movements', async () => {
    storeSession();
    fakeApi({
      'GET /balances/me': () => json(balance('0.00')),
      'GET /balances/me/transactions?page=1&pageSize=10': () => json(emptyPage),
    });
    render(<App />);

    expect(await screen.findByText('Aún no tienes movimientos')).toBeInTheDocument();
    expect(screen.getByText('$0.00')).toBeInTheDocument();
    expect(screen.queryByRole('navigation', { name: /Paginación/ })).not.toBeInTheDocument();
  });

  it('lists movements newest first with signs and labels, and paginates', async () => {
    storeSession();
    fakeApi({
      'GET /balances/me': () => json(balance('90.00')),
      'GET /balances/me/transactions?page=1&pageSize=10': () => json(firstPage),
      'GET /balances/me/transactions?page=2&pageSize=10': () => json(secondPage),
    });
    const user = userEvent.setup();
    render(<App />);

    expect(await screen.findByText('Pago aprobado')).toBeInTheDocument();
    expect(screen.getByText('−$10.00')).toBeInTheDocument();
    expect(screen.getByText('+$200.00')).toBeInTheDocument();
    expect(screen.getByText('Página 1 de 2')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Anterior' })).toBeDisabled();

    await user.click(screen.getByRole('button', { name: 'Siguiente' }));
    expect(await screen.findByText('+$1.00')).toBeInTheDocument();
    expect(screen.getByText('Página 2 de 2')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Siguiente' })).toBeDisabled();

    await user.click(screen.getByRole('button', { name: 'Anterior' }));
    expect(await screen.findByText('Pago aprobado')).toBeInTheDocument();
  });

  it('shows an error state with retry when the API is down, instead of a blank screen', async () => {
    storeSession();
    let apiUp = false;
    fakeApi({
      'GET /balances/me': () => {
        if (!apiUp) throw new TypeError('Failed to fetch');
        return json(balance('42.00'));
      },
      'GET /balances/me/transactions?page=1&pageSize=10': () => {
        if (!apiUp) throw new TypeError('Failed to fetch');
        return json(emptyPage);
      },
    });
    const user = userEvent.setup();
    render(<App />);

    expect(await screen.findByText('No se pudo cargar tu saldo')).toBeInTheDocument();
    expect(screen.getByText('No se pudieron cargar tus movimientos')).toBeInTheDocument();
    expect(screen.getAllByText(/No pudimos conectar con el servidor/)).toHaveLength(2);

    apiUp = true;
    const [retryBalance, retryHistory] = screen.getAllByRole('button', { name: 'Reintentar' });
    if (!retryBalance || !retryHistory) throw new Error('retry buttons missing');
    await user.click(retryBalance);
    await user.click(retryHistory);

    expect(await screen.findByText('$42.00')).toBeInTheDocument();
    expect(await screen.findByText('Aún no tienes movimientos')).toBeInTheDocument();
  });

  it('falls back to a generic message for unexpected API errors', async () => {
    storeSession();
    fakeApi({
      'GET /balances/me': () => new Response('<html>Bad gateway</html>', { status: 502 }),
      'GET /balances/me/transactions?page=1&pageSize=10': () => apiError(500, 'INTERNAL_ERROR'),
    });
    render(<App />);

    await waitFor(() => {
      expect(screen.getAllByText('Ocurrió un error inesperado. Inténtalo de nuevo en unos minutos.')).toHaveLength(2);
    });
  });
});
