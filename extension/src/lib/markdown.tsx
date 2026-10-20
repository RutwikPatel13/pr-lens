import type { ReactNode } from 'react';

// The small Markdown subset model answers and review comments use: paragraphs, bullet and
// numbered lists, headings (shown bold), fenced code, `code`, **bold** and links. It builds
// React elements, so text from the model or a PR never becomes HTML.

const INLINE = /(`[^`]+`|\*\*[^*]+\*\*|\[[^\]]+\]\(https?:\/\/[^)\s]+\))/g;

function inline(text: string, keyPrefix: string): ReactNode[] {
  return text.split(INLINE).map((part, i) => {
    const key = `${keyPrefix}-${i}`;
    if (part.startsWith('`') && part.endsWith('`') && part.length > 2) {
      return (
        <code key={key} className="rounded bg-inset px-1 py-px font-mono text-xs">
          {part.slice(1, -1)}
        </code>
      );
    }
    if (part.startsWith('**') && part.endsWith('**') && part.length > 4) {
      return <strong key={key}>{part.slice(2, -2)}</strong>;
    }
    const link = /^\[([^\]]+)\]\((https?:\/\/[^)\s]+)\)$/.exec(part);
    if (link !== null) {
      return (
        <a key={key} href={link[2]} target="_blank" rel="noreferrer" className="text-accent hover:underline">
          {link[1]?.replace(/`/g, '')}
        </a>
      );
    }
    return part;
  });
}

type Block = { kind: 'p' | 'ul' | 'ol' | 'h' | 'code'; lines: string[] };

function blocks(text: string): Block[] {
  const out: Block[] = [];
  let current: Block | null = null;
  let inFence = false;
  for (const raw of text.replace(/\r/g, '').split('\n')) {
    if (raw.trim().startsWith('```')) {
      if (inFence) {
        inFence = false;
        current = null;
      } else {
        inFence = true;
        current = { kind: 'code', lines: [] };
        out.push(current);
      }
      continue;
    }
    if (inFence && current !== null) {
      current.lines.push(raw);
      continue;
    }
    const line = raw.trim();
    if (line === '') {
      current = null;
      continue;
    }
    const kind: Block['kind'] = /^[-*] /.test(line) ? 'ul' : /^\d+[.)] /.test(line) ? 'ol' : /^#{1,6} /.test(line) ? 'h' : 'p';
    const content = line.replace(/^([-*]|\d+[.)]|#{1,6}) /, '');
    if (current !== null && current.kind === kind && kind !== 'h') {
      current.lines.push(content);
    } else {
      current = { kind, lines: [content] };
      out.push(current);
    }
  }
  return out;
}

export function Markdown({ text }: { text: string }) {
  return (
    <div className="flex flex-col gap-2">
      {blocks(text).map((block, i) => {
        const key = `b${i}`;
        if (block.kind === 'code') {
          return (
            <pre key={key} className="m-0 overflow-x-auto rounded-md bg-inset p-2 font-mono text-xs">
              {block.lines.join('\n')}
            </pre>
          );
        }
        if (block.kind === 'ul' || block.kind === 'ol') {
          const List = block.kind;
          return (
            <List key={key} className={`m-0 flex flex-col gap-1 pl-5 ${block.kind === 'ul' ? 'list-disc' : 'list-decimal'}`}>
              {block.lines.map((line, j) => (
                <li key={j}>{inline(line, `${key}-${j}`)}</li>
              ))}
            </List>
          );
        }
        if (block.kind === 'h') {
          return (
            <p key={key} className="m-0 font-semibold">
              {inline(block.lines.join(' '), key)}
            </p>
          );
        }
        return (
          <p key={key} className="m-0">
            {inline(block.lines.join(' '), key)}
          </p>
        );
      })}
    </div>
  );
}
