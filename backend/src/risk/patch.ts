export type DiffLine = {
  kind: 'add' | 'del' | 'context';
  text: string;
  // Line number in the old file (del/context) and the new file (add/context).
  oldLine: number | null;
  newLine: number | null;
};

const HUNK_HEADER = /^@@ -(\d+)(?:,\d+)? \+(\d+)(?:,\d+)? @@/;

// Parses the unified diff GitHub returns per file (starts at the first @@ header).
export function parsePatch(patch: string): DiffLine[] {
  const lines: DiffLine[] = [];
  let oldLine = 0;
  let newLine = 0;

  for (const raw of patch.split('\n')) {
    const header = HUNK_HEADER.exec(raw);
    if (header !== null) {
      oldLine = Number(header[1]);
      newLine = Number(header[2]);
      continue;
    }
    const marker = raw[0];
    const text = raw.slice(1);
    if (marker === '+') {
      lines.push({ kind: 'add', text, oldLine: null, newLine: newLine++ });
    } else if (marker === '-') {
      lines.push({ kind: 'del', text, oldLine: oldLine++, newLine: null });
    } else if (marker === ' ') {
      lines.push({ kind: 'context', text, oldLine: oldLine++, newLine: newLine++ });
    }
    // Anything else ("\ No newline at end of file", trailing empty line) isn't a file line.
  }
  return lines;
}
