import '@testing-library/jest-dom/vitest';
import { cleanup } from '@testing-library/react';
import { afterEach, vi } from 'vitest';
import { resetSession } from './fakeApi';

// jsdom lacks Pointer Capture; sonner calls it when a toast (or its action button) is pressed.
const elementProto: Partial<Pick<Element, 'setPointerCapture' | 'releasePointerCapture' | 'hasPointerCapture'>> =
  Element.prototype;
elementProto.setPointerCapture ??= () => undefined;
elementProto.releasePointerCapture ??= () => undefined;
elementProto.hasPointerCapture ??= () => false;

afterEach(() => {
  cleanup();
  localStorage.clear();
  resetSession();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});
