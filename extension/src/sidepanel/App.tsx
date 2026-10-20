import { useActivePr } from './useActivePr';

export function App() {
  const pr = useActivePr();

  return (
    <main className="p-4 font-sans text-sm text-gray-900">
      <h1 className="mb-3 text-base font-semibold">PR Lens</h1>
      {pr === null ? (
        <p className="text-gray-500">Open a GitHub pull request to see its analysis.</p>
      ) : (
        <p>
          <span className="text-gray-500">
            {pr.owner}/{pr.repo}
          </span>{' '}
          <span className="font-semibold">#{pr.number}</span>
        </p>
      )}
    </main>
  );
}
