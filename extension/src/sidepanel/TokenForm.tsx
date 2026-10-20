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
    <form onSubmit={submit} className="flex flex-col gap-3">
      <p className="m-0">PR Lens reads pull requests through the GitHub API with your own token.</p>
      <ol className="m-0 flex flex-col gap-1 pl-5 text-muted">
        <li>
          Create a{' '}
          <a href={NEW_TOKEN_URL} target="_blank" rel="noreferrer" className="text-accent hover:underline">
            fine-grained token
          </a>
          .
        </li>
        <li>Under repository access, pick "Public repositories". No extra permissions are needed.</li>
        <li>Paste it below. It's stored only in this browser.</li>
      </ol>
      <label className="flex flex-col gap-1 text-xs font-semibold text-muted">
        GitHub token
        <input
          type="password"
          value={value}
          onChange={(e) => setValue(e.target.value)}
          placeholder="github_pat_..."
          autoComplete="off"
          className="rounded-md border border-line bg-canvas px-2 py-1.5 font-mono text-xs font-normal text-fg"
        />
      </label>
      <button
        type="submit"
        disabled={value.trim() === ''}
        className="self-start cursor-pointer rounded-md bg-open px-3 py-1.5 text-xs font-semibold text-white disabled:cursor-default disabled:opacity-50"
      >
        Save token
      </button>
    </form>
  );
}
