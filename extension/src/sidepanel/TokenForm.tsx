import { useState, type FormEvent } from 'react';

const NEW_TOKEN_URL = 'https://github.com/settings/personal-access-tokens/new';

export function TokenForm({ onSave }: { onSave: (token: string) => Promise<void> }) {
  const [value, setValue] = useState('');

  function submit(event: FormEvent) {
    event.preventDefault();
    const token = value.trim();
    if (token !== '') void onSave(token);
  }

  return (
    <form onSubmit={submit} className="space-y-3">
      <p>PR Lens reads pull requests through the GitHub API with your own token.</p>
      <ol className="list-decimal space-y-1 pl-5 text-gray-600">
        <li>
          Create a{' '}
          <a href={NEW_TOKEN_URL} target="_blank" rel="noreferrer" className="text-blue-600 underline">
            fine-grained token
          </a>
          .
        </li>
        <li>Under repository access, pick "Public repositories". No extra permissions are needed.</li>
        <li>Paste it below. It's stored only in this browser.</li>
      </ol>
      <input
        type="password"
        value={value}
        onChange={(e) => setValue(e.target.value)}
        placeholder="github_pat_..."
        autoComplete="off"
        className="w-full rounded border border-gray-300 px-2 py-1.5 font-mono text-xs"
      />
      <button type="submit" className="rounded bg-gray-900 px-3 py-1.5 text-white disabled:opacity-40" disabled={value.trim() === ''}>
        Save token
      </button>
    </form>
  );
}
