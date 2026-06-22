/**
 * Root route-level loading fallback. Shown during streaming/navigation before
 * a segment's data resolves. Kept minimal — individual pages render their own
 * richer skeletons once mounted.
 */
export default function Loading() {
  return (
    <div
      className="flex min-h-[60vh] items-center justify-center"
      role="status"
      aria-live="polite"
    >
      <span className="sr-only">Loading…</span>
      <span
        aria-hidden="true"
        className="h-6 w-6 animate-spin rounded-full border-2 border-current border-t-transparent opacity-40"
      />
    </div>
  );
}
