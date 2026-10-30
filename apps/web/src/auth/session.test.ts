import { vi } from 'vitest';
import { clearSession, loadSession, saveSession, SESSION_STORAGE_KEY } from './session';

describe('session storage', () => {
  const session = { token: 't', email: 'ana@orbita.test', expiresAt: 123 };

  it('round-trips a session', () => {
    saveSession(session);
    expect(loadSession()).toEqual(session);
    clearSession();
    expect(loadSession()).toBeNull();
  });

  it.each([
    ['corrupted JSON', '{not json'],
    ['a wrong shape', JSON.stringify({ token: 1 })],
    ['null', 'null'],
  ])('ignores %s', (_case, raw) => {
    localStorage.setItem(SESSION_STORAGE_KEY, raw);
    expect(loadSession()).toBeNull();
  });

  it('keeps working when storage is unavailable', () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('blocked');
    });
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('blocked');
    });
    vi.spyOn(Storage.prototype, 'removeItem').mockImplementation(() => {
      throw new Error('blocked');
    });

    expect(loadSession()).toBeNull();
    expect(() => {
      saveSession(session);
    }).not.toThrow();
    expect(() => {
      clearSession();
    }).not.toThrow();
  });
});
