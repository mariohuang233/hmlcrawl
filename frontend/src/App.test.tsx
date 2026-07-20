import React from 'react';
import { render, screen } from '@testing-library/react';
import App from './App';

test('renders the electricity dashboard heading', () => {
  render(<App />);
  expect(screen.getByRole('heading', { name: /一二布布的电量监控/ })).toBeInTheDocument();
});
