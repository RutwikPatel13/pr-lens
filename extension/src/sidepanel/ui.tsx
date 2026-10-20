import type { ReactNode } from 'react';
import type { Severity } from '@pr-lens/shared';

export function Section({ title, children, aside }: { title: string; children: ReactNode; aside?: ReactNode }) {
  return (
    <section className="flex flex-col gap-2.5 border-b border-line p-4">
      <div className="flex items-baseline justify-between gap-2">
        <h2 className="m-0 text-xs font-semibold text-muted">{title}</h2>
        {aside}
      </div>
      {children}
    </section>
  );
}

const SEVERITY_CLASS: Record<Severity, string> = {
  high: 'bg-high-bg text-high-fg border-high-line',
  medium: 'bg-medium-bg text-medium-fg border-medium-line',
  low: 'bg-low-bg text-low-fg border-low-line',
};

const SEVERITY_LABEL: Record<Severity, string> = { high: 'High', medium: 'Medium', low: 'Low' };

export function SeverityBadge({ severity }: { severity: Severity }) {
  return (
    <span className={`rounded-full border px-1.5 text-[11px] font-semibold ${SEVERITY_CLASS[severity]}`}>
      {SEVERITY_LABEL[severity]}
    </span>
  );
}

export function SeverityCount({ severity, count }: { severity: Severity; count: number }) {
  return (
    <span className={`rounded-md border px-2 py-0.5 text-xs font-semibold ${SEVERITY_CLASS[severity]}`}>
      {count} {severity}
    </span>
  );
}

export function AiTag() {
  return (
    <span className="h-4 flex-none rounded border border-line px-1 text-[10px] leading-4 font-semibold text-muted" title="Written by the LLM">
      AI
    </span>
  );
}

export function Code({ children }: { children: ReactNode }) {
  return <code className="rounded bg-inset px-1 py-px font-mono text-xs">{children}</code>;
}

const iconProps = {
  width: 16,
  height: 16,
  viewBox: '0 0 24 24',
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 2,
  strokeLinecap: 'round' as const,
  strokeLinejoin: 'round' as const,
  'aria-hidden': true,
};

export function LensIcon() {
  return (
    <svg {...iconProps}>
      <circle cx="11" cy="11" r="7" />
      <path d="M21 21l-4.3-4.3" />
    </svg>
  );
}

export function SettingsIcon() {
  return (
    <svg {...iconProps}>
      <circle cx="12" cy="12" r="3" />
      <path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z" />
    </svg>
  );
}

export function BackIcon() {
  return (
    <svg {...iconProps}>
      <path d="M19 12H5M11 18l-6-6 6-6" />
    </svg>
  );
}

export function FileIcon() {
  return (
    <svg {...iconProps} width={14} height={14}>
      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
      <path d="M14 2v6h6" />
    </svg>
  );
}

export const buttonClass =
  'rounded-md border border-line bg-control px-2.5 py-1 text-xs text-fg hover:bg-subtle disabled:opacity-50 cursor-pointer';
