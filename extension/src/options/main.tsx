import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { applyTheme } from '../lib/theme';
import '../sidepanel/index.css';
import { Settings } from '../sidepanel/Settings';
import { useTheme } from '../sidepanel/useTheme';

// Follow the OS theme from the first paint; useTheme then applies any saved preference.
applyTheme('system');

const root = document.getElementById('root');
if (root === null) throw new Error('Options page is missing its #root element');

// The same settings as the side panel, reachable from chrome://extensions → Details → Extension options.
function OptionsPage() {
  useTheme();
  return (
    <main className="mx-auto max-w-md py-6">
      <h1 className="m-0 px-4 pb-2 text-base font-semibold">PR Lens settings</h1>
      <Settings />
    </main>
  );
}

createRoot(root).render(
  <StrictMode>
    <OptionsPage />
  </StrictMode>,
);
