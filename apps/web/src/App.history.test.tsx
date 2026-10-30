import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { App } from './App';
import { apiError, balance, emptyPage, fakeApi, json, page, storeSession } from './test/fakeApi';

type Row = { id: string; type: string; amount: string; balanceAfter: string };

// 23 deposits, newest first: amounts 23.00 down to 1.00.
const ALL: Row[] = Array.from({ length: 23 }, (_, i) => {
  const n = 23 - i;
  return { id: `t${String(n)}`, type: 'deposit', amount: `${String(n)}.00`, balanceAfter: `${String(n)}.00` };
});

const nav = () => screen.getByRole('navigation', { name: 'Paginación de movimientos' });

function historyRoutes(rows: Row[]) {
  const routes: Record<string, () => Response> = {};
  for (const size of [5, 10]) {
    const totalPages = Math.ceil(rows.length / size);
    for (let p = 1; p <= Math.max(totalPages, 1); p++) {
      routes[`GET /balances/me/transactions?page=${String(p)}&pageSize=${String(size)}`] = () =>
        json(page(rows.slice((p - 1) * size, p * size), { page: p, pageSize: size, total: rows.length, totalPages }));
    }
  }
  return routes;
}

describe('balance screen states', () => {
  it('shows loading placeholders before data arrives', async () => {
    storeSession();
    const never = () => new Promise<Response>(() => undefined);
    fakeApi({ 'GET /balances/me': never, 'GET /balances/me/transactions?page=1&pageSize=10': never });
    render(<App />);

    expect(await screen.findByLabelText('Cargando saldo')).toBeInTheDocument();
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
    expect(screen.queryByRole('navigation', { name: 'Paginación de movimientos' })).not.toBeInTheDocument();
  });

  it('lists movements newest first with signs and labels', async () => {
    storeSession();
    fakeApi({
      'GET /balances/me': () => json(balance('90.00')),
      'GET /balances/me/transactions?page=1&pageSize=10': () =>
        json(
          page([
            { id: 'a', type: 'withdrawal', amount: '10.00', balanceAfter: '90.00' },
            { id: 'b', type: 'gateway_credit', amount: '200.00', balanceAfter: '100.00' },
          ]),
        ),
    });
    render(<App />);

    expect(await screen.findByText('Pago aprobado')).toBeInTheDocument();
    expect(screen.getByText('−$10.00')).toBeInTheDocument();
    expect(screen.getByText('+$200.00')).toBeInTheDocument();
    expect(screen.getByRole('navigation', { name: 'Paginación de movimientos' })).toHaveTextContent('1–2 de 2');
    // A single page needs no page buttons.
    expect(screen.queryByRole('button', { name: 'Página siguiente' })).not.toBeInTheDocument();
  });

  it('navigates with page numbers, previous and next', async () => {
    storeSession();
    fakeApi({ 'GET /balances/me': () => json(balance('276.00')), ...historyRoutes(ALL) });
    const user = userEvent.setup();
    render(<App />);

    expect(await screen.findByText('+$23.00')).toBeInTheDocument();
    expect(nav()).toHaveTextContent('1–10 de 23');
    expect(screen.getByRole('button', { name: 'Página 1' })).toHaveAttribute('aria-current', 'page');
    expect(screen.getByRole('button', { name: 'Página anterior' })).toBeDisabled();

    await user.click(screen.getByRole('button', { name: 'Página 3' }));
    expect(await screen.findByText('+$3.00')).toBeInTheDocument();
    expect(nav()).toHaveTextContent('21–23 de 23');
    expect(screen.getByRole('button', { name: 'Página siguiente' })).toBeDisabled();

    await user.click(screen.getByRole('button', { name: 'Página anterior' }));
    expect(await screen.findByText('+$13.00')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Página 2' })).toHaveAttribute('aria-current', 'page');

    await user.click(screen.getByRole('button', { name: 'Página siguiente' }));
    expect(await screen.findByText('+$3.00')).toBeInTheDocument();
  });

  it('changes the page size and goes back to page 1', async () => {
    storeSession();
    fakeApi({ 'GET /balances/me': () => json(balance('276.00')), ...historyRoutes(ALL) });
    const user = userEvent.setup();
    render(<App />);

    await user.click(await screen.findByRole('button', { name: 'Página 2' }));
    expect(await screen.findByText('+$13.00')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: '5 por página' }));

    await waitFor(() => {
      expect(nav()).toHaveTextContent('1–5 de 23');
    });
    expect(screen.getByRole('button', { name: '5 por página' })).toHaveAttribute('aria-pressed', 'true');
    const list = screen.getAllByRole('list').find((el) => within(el).queryByText('+$23.00'));
    expect(list && within(list).getAllByRole('listitem')).toHaveLength(5);
    expect(screen.getByRole('button', { name: 'Página 1' })).toHaveAttribute('aria-current', 'page');
    // 5 pages of 5: every page number fits without gaps.
    expect(screen.getByRole('button', { name: 'Página 5' })).toBeInTheDocument();
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
