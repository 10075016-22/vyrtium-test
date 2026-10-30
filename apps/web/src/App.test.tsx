import { render, screen } from '@testing-library/react';
import { App } from './App';

describe('App', () => {
  it('renders the brand heading', () => {
    render(<App />);
    expect(screen.getByRole('heading', { name: 'Orbita' })).toBeInTheDocument();
  });
});
