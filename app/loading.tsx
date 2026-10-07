export default function Loading() {
  return <div role="status" aria-label="Loading Cinevo" className="space-y-8"><div className="h-5 w-48 animate-pulse rounded bg-[var(--surface-raised)]" /><div className="h-[420px] animate-pulse rounded-2xl bg-[var(--surface)]" /><div className="film-grid">{[0, 1, 2, 3].map(i => <div key={i} className="space-y-4"><div className="aspect-video animate-pulse rounded-xl bg-[var(--surface-raised)]" /><div className="h-4 w-2/3 animate-pulse rounded bg-[var(--surface-raised)]" /></div>)}</div><span className="sr-only">Loading stories…</span></div>;
}
