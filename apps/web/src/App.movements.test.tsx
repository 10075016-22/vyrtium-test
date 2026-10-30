import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { App } from './App';
import { apiError, balance, deferred, emptyPage, fakeApi, json, page, storeSession } from './test/fakeApi';

const movement = (type: string, amount: string, after: string) =>
  json(
    {
      transaction: { id: `txn_${amount}`, type, amount, balanceAfter: after, currency: 'USD', createdAt: '2026-10-29T12:00:00.000Z' },
      balance: balance(after),
    },
    201,
  );

function baseRoutes(currentBalance = '100.00') {
  return {
    'GET /balances/me': () => json(balance(currentBalance)),
    'GET /balances/me/transactions?page=1&pageSize=10': () => json(emptyPage),
  };
}

async function renderReady() {
  storeSession();
  render(<App />);
  await screen.findByText('$100.00');
  return userEvent.setup();
}

const submitButton = () => screen.getByRole('button', { name: /^(Depositar|Retirar|Procesando…)$/ });

describe('movement form', () => {
  it.each([
    ['letters and symbols', 'abc$%-+e', ''],
    ['repeated commas (the first is the decimal point)', '100,,,,5', '100.5'],
    ['a third decimal', '10.123', '10.12'],
    ['a second decimal point', '1.2.3', '1.23'],
    ['more than 5 integer digits', '1000000000', '10,000'],
    ['leading zeros', '0005', '5'],
    ['thousands', '1234.5', '1,234.5'],
    ['a comma typed as decimal separator', '10,5', '10.5'],
  ])('masks the amount while typing: %s', async (_case, typed, shown) => {
    fakeApi(baseRoutes());
    const user = await renderReady();

    await user.type(screen.getByLabelText('Monto (USD)'), typed);

    expect(screen.getByLabelText('Monto (USD)')).toHaveValue(shown);
  });

  it('warns about the 10,000.00 limit while typing and clears the warning when corrected', async () => {
    const api = fakeApi(baseRoutes());
    const user = await renderReady();
    const input = screen.getByLabelText('Monto (USD)');

    await user.type(input, '22300');
    expect(input).toHaveValue('22,300');
    expect(input).toHaveAttribute('aria-invalid', 'true');
    expect(screen.getByText('El monto máximo por operación es 10,000.00 USD.')).toBeInTheDocument();

    await user.clear(input);
    await user.type(input, '2230');
    expect(input).not.toHaveAttribute('aria-invalid');
    expect(screen.queryByText('El monto máximo por operación es 10,000.00 USD.')).not.toBeInTheDocument();
    expect(api.callsTo('POST', '/balances')).toHaveLength(0);
  });

  it('does not nag about incomplete input while typing', async () => {
    fakeApi(baseRoutes());
    const user = await renderReady();

    await user.type(screen.getByLabelText('Monto (USD)'), '0.');
    expect(screen.getByLabelText('Monto (USD)')).not.toHaveAttribute('aria-invalid');
  });

  it('sends the unmasked, normalized amount', async () => {
    const api = fakeApi({ ...baseRoutes(), 'POST /balances/me/deposits': () => movement('deposit', '1234.50', '1334.50') });
    const user = await renderReady();

    await user.type(screen.getByLabelText('Monto (USD)'), '1234,5');
    await user.click(submitButton());

    await screen.findByText(/Depósito realizado/);
    expect(api.callsTo('POST', '/balances/me/deposits')[0]?.body).toEqual({ amount: '1234.50', currency: 'USD' });
  });

  it('keeps the caret on the edited digit when the mask regroups thousands', async () => {
    fakeApi(baseRoutes());
    const user = await renderReady();
    const input = screen.getByLabelText<HTMLInputElement>('Monto (USD)');

    await user.type(input, '1234');
    expect(input).toHaveValue('1,234');
    input.setSelectionRange(1, 1); // right after the "1"
    await user.type(input, '9', { initialSelectionStart: 1, initialSelectionEnd: 1 });

    expect(input).toHaveValue('19,234');
    expect(input.selectionStart).toBe(2);
  });

  it.each(['0', '0.00', '10001', 'abc', ''])('rejects %j before sending: no request leaves the browser', async (value) => {
    const api = fakeApi(baseRoutes());
    const user = await renderReady();

    if (value) await user.type(screen.getByLabelText('Monto (USD)'), value);
    await user.click(submitButton());

    expect(screen.getByLabelText('Monto (USD)')).toHaveAttribute('aria-invalid', 'true');
    expect(screen.getByText(/monto/i, { selector: '#amount-error' })).toBeInTheDocument();
    expect(api.callsTo('POST', '/balances')).toHaveLength(0);
  });

  it('deposits, shows the result and refreshes balance and history', async () => {
    let current = '100.00';
    const api = fakeApi({
      'GET /balances/me': () => json(balance(current)),
      'GET /balances/me/transactions?page=1&pageSize=10': () =>
        json(
          current === '100.00'
            ? emptyPage
            : page([{ id: 'txn_50.50', type: 'deposit', amount: '50.50', balanceAfter: '150.50' }], {
                page: 1,
                pageSize: 10,
                total: 1,
                totalPages: 1,
              }),
        ),
      'POST /balances/me/deposits': () => {
        current = '150.50';
        return movement('deposit', '50.50', '150.50');
      },
    });
    const user = await renderReady();

    await user.type(screen.getByLabelText('Monto (USD)'), '50.5');
    await user.click(submitButton());

    expect(await screen.findByText('Depósito realizado por $50.50')).toBeInTheDocument();
    expect(screen.getByText('Nuevo saldo: $150.50')).toBeInTheDocument();
    expect(await screen.findByText('$150.50')).toBeInTheDocument();
    const newRow = (await screen.findByText('+$50.50')).closest('li');
    expect(newRow).toHaveAttribute('data-new', 'true');
    expect(screen.getByLabelText('Monto (USD)')).toHaveValue('');

    const [post] = api.callsTo('POST', '/balances/me/deposits');
    expect(post?.body).toEqual({ amount: '50.50', currency: 'USD' });
    expect(post?.headers['Idempotency-Key']).toMatch(/^[0-9a-f-]{36}$/);
    expect(post?.headers.Authorization).toBe('Bearer stored-token');
  });

  it('disables the button while sending and a double click creates a single request', async () => {
    const pending = deferred<Response>();
    const api = fakeApi({ ...baseRoutes(), 'POST /balances/me/deposits': () => pending.promise });
    const user = await renderReady();

    await user.type(screen.getByLabelText('Monto (USD)'), '10');
    await user.dblClick(submitButton());

    expect(submitButton()).toBeDisabled();
    expect(submitButton()).toHaveTextContent('Procesando…');
    expect(api.callsTo('POST', '/balances/me/deposits')).toHaveLength(1);

    pending.resolve(movement('deposit', '10.00', '110.00'));
    await waitFor(() => {
      expect(submitButton()).toBeEnabled();
    });
  });

  it('reuses the Idempotency-Key when retrying after a network failure, and uses a new one for the next operation', async () => {
    let attempts = 0;
    const api = fakeApi({
      ...baseRoutes(),
      'POST /balances/me/deposits': () => {
        attempts += 1;
        if (attempts === 1) throw new TypeError('Failed to fetch');
        return movement('deposit', '20.00', '120.00');
      },
    });
    const user = await renderReady();
    const amount = screen.getByLabelText('Monto (USD)');

    await user.type(amount, '20');
    await user.click(submitButton());
    expect(await screen.findByText(/la operación no se duplicará/)).toBeInTheDocument();

    await user.click(submitButton());
    await screen.findByText(/Depósito realizado/);

    await user.type(amount, '20');
    await user.click(submitButton());
    await waitFor(() => {
      expect(api.callsTo('POST', '/balances/me/deposits')).toHaveLength(3);
    });

    const keys = api.callsTo('POST', '/balances/me/deposits').map((c) => c.headers['Idempotency-Key']);
    expect(keys[1]).toBe(keys[0]);
    expect(keys[2]).not.toBe(keys[1]);
  });

  it('also keeps the key after a 5xx, but generates a new one if the user changes the amount', async () => {
    let attempts = 0;
    const api = fakeApi({
      ...baseRoutes(),
      'POST /balances/me/deposits': () => {
        attempts += 1;
        return attempts === 1 ? apiError(500, 'INTERNAL_ERROR') : movement('deposit', '30.00', '130.00');
      },
    });
    const user = await renderReady();
    const amount = screen.getByLabelText('Monto (USD)');

    await user.type(amount, '25');
    await user.click(submitButton());
    expect(await screen.findByText(/Ocurrió un error inesperado/)).toBeInTheDocument();

    await user.clear(amount);
    await user.type(amount, '30');
    await user.click(submitButton());
    await screen.findByText(/Depósito realizado/);

    const keys = api.callsTo('POST', '/balances/me/deposits').map((c) => c.headers['Idempotency-Key']);
    expect(keys[1]).not.toBe(keys[0]);
  });

  it('shows API business errors in plain language and treats them as final', async () => {
    const api = fakeApi({
      ...baseRoutes(),
      'POST /balances/me/withdrawals': () => apiError(422, 'INSUFFICIENT_FUNDS', 'Insufficient funds'),
    });
    const user = await renderReady();

    await user.click(screen.getByRole('radio', { name: 'Retirar' }));
    await user.type(screen.getByLabelText('Monto (USD)'), '500');
    await user.click(submitButton());
    expect(await screen.findByText('No tienes saldo suficiente para este retiro.')).toBeInTheDocument();

    await user.click(submitButton());
    await waitFor(() => {
      expect(api.callsTo('POST', '/balances/me/withdrawals')).toHaveLength(2);
    });
    const keys = api.callsTo('POST', '/balances/me/withdrawals').map((c) => c.headers['Idempotency-Key']);
    expect(keys[1]).not.toBe(keys[0]);
    expect(screen.getByText('$100.00')).toBeInTheDocument();
  });

  it('shows a new result in place of the previous toast instead of stacking them', async () => {
    let attempts = 0;
    fakeApi({
      ...baseRoutes(),
      'POST /balances/me/deposits': () => {
        attempts += 1;
        return attempts === 1 ? apiError(422, 'AMOUNT_LIMIT_EXCEEDED') : movement('deposit', '10.00', '110.00');
      },
    });
    const user = await renderReady();

    await user.type(screen.getByLabelText('Monto (USD)'), '10');
    await user.click(submitButton());
    expect(await screen.findByText('El monto máximo por operación es 10,000.00 USD.')).toBeInTheDocument();

    await user.click(submitButton());
    expect(await screen.findByText('Depósito realizado por $10.00')).toBeInTheDocument();
    await waitFor(() => {
      expect(screen.queryByText('El monto máximo por operación es 10,000.00 USD.')).not.toBeInTheDocument();
    });
  });

  it('retries from the toast action with the same Idempotency-Key', async () => {
    let attempts = 0;
    const api = fakeApi({
      ...baseRoutes(),
      'POST /balances/me/deposits': () => {
        attempts += 1;
        if (attempts === 1) throw new TypeError('Failed to fetch');
        return movement('deposit', '15.00', '115.00');
      },
    });
    const user = await renderReady();

    await user.type(screen.getByLabelText('Monto (USD)'), '15');
    await user.click(submitButton());
    await user.click(await screen.findByRole('button', { name: 'Reintentar' }));

    expect(await screen.findByText('Depósito realizado por $15.00')).toBeInTheDocument();
    const keys = api.callsTo('POST', '/balances/me/deposits').map((c) => c.headers['Idempotency-Key']);
    expect(keys).toHaveLength(2);
    expect(keys[1]).toBe(keys[0]);
  });
});
