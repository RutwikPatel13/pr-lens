import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import '../sidepanel/index.css';
import { Settings } from '../sidepanel/Settings';

const root = document.getElementById('root');
if (root === null) throw new Error('Options page is missing its #root element');

// The same settings as the side panel, reachable from chrome://extensions → Details → Extension options.
createRoot(root).render(
  <StrictMode>
    <main className="mx-auto max-w-md space-y-4 p-6 font-sans text-sm text-gray-900">
      <h1 className="text-base font-semibold">PR Lens settings</h1>
      <Settings />
    </main>
  </StrictMode>,
);
