import Link from 'next/link';

/** 404 boundary for unmatched routes and notFound() calls. */
export default function NotFound() {
  return (
    <div className="flex min-h-[60vh] flex-col items-center justify-center gap-4 px-6 text-center">
      <h1 className="text-lg font-medium tracking-tight">Page not found</h1>
      <p className="max-w-sm text-sm" style={{color: 'var(--text-soft, #5a564d)'}}>
        That route doesn&apos;t exist. It may have moved or never been here.
      </p>
      <Link
        href="/"
        className="rounded-full px-5 py-2 text-sm"
        style={{background: 'var(--text)', color: 'var(--bg)'}}
      >
        Back to dashboard
      </Link>
    </div>
  );
}
