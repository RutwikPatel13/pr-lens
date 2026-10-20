import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { applyTheme } from '../lib/theme';
import { App } from './App';
import './index.css';

// Follow the OS theme from the first paint; useTheme then applies any saved preference.
applyTheme('system');

const root = document.getElementById('root');
if (root === null) throw new Error('Side panel is missing its #root element');

createRoot(root).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
