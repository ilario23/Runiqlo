'use client';

import {useState} from 'react';
import Image from 'next/image';
import Link from 'next/link';
import {usePathname} from 'next/navigation';
import {useStravaAuth} from '@/contexts/StravaAuthContext';

interface AppHeaderProps {
  onRefresh?: () => Promise<void>;
}

const NAV_LINKS = [
  {
    href: '/',
    label: 'Dashboard',
    icon: (
      <svg width='15' height='15' viewBox='0 0 24 24' fill='none' stroke='currentColor' strokeWidth='2'>
        <rect x='3' y='3' width='7' height='7' rx='1' />
        <rect x='14' y='3' width='7' height='7' rx='1' />
        <rect x='3' y='14' width='7' height='7' rx='1' />
        <rect x='14' y='14' width='7' height='7' rx='1' />
      </svg>
    ),
    exact: true,
  },
  {
    href: '/activities',
    label: 'Activities',
    icon: (
      <svg width='15' height='15' viewBox='0 0 24 24' fill='none' stroke='currentColor' strokeWidth='2'>
        <polyline points='22 12 18 12 15 21 9 3 6 12 2 12' />
      </svg>
    ),
    exact: false,
  },
  {
    href: '/plan',
    label: 'Plan',
    icon: (
      <svg width='15' height='15' viewBox='0 0 24 24' fill='none' stroke='currentColor' strokeWidth='2'>
        <rect x='3' y='4' width='18' height='18' rx='2' ry='2' />
        <line x1='16' y1='2' x2='16' y2='6' />
        <line x1='8' y1='2' x2='8' y2='6' />
        <line x1='3' y1='10' x2='21' y2='10' />
      </svg>
    ),
    exact: false,
  },
  {
    href: '/coach',
    label: 'Coach',
    icon: (
      <svg width='15' height='15' viewBox='0 0 24 24' fill='none' stroke='currentColor' strokeWidth='2'>
        <path d='M12 2a2 2 0 0 1 2 2c0 .74-.4 1.39-1 1.73V7h1a7 7 0 0 1 7 7h1a1 1 0 0 1 1 1v3a1 1 0 0 1-1 1h-1v1a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-1H2a1 1 0 0 1-1-1v-3a1 1 0 0 1 1-1h1a7 7 0 0 1 7-7h1V5.73c-.6-.34-1-.99-1-1.73a2 2 0 0 1 2-2z' />
      </svg>
    ),
    exact: true,
  },
];

export default function AppHeader({onRefresh}: AppHeaderProps) {
  const pathname = usePathname();
  const [refreshing, setRefreshing] = useState(false);
  const {athlete} = useStravaAuth();
  const initials = athlete
    ? `${athlete.firstname?.[0] ?? ''}${athlete.lastname?.[0] ?? ''}`.toUpperCase()
    : undefined;

  const isActive = (href: string, exact: boolean) =>
    exact ? pathname === href : pathname === href || pathname.startsWith(href + '/');

  const handleRefresh = async () => {
    if (!onRefresh) return;
    setRefreshing(true);
    try {
      await onRefresh();
    } finally {
      setRefreshing(false);
    }
  };

  return (
    <>
      {/* ── Top bar ──────────────────────────────────────────────────────────── */}
      <header
        className='fixed top-0 left-0 right-0 z-50 h-14 flex items-center px-5 backdrop-blur-xl bg-black/70'
        style={{boxShadow: '0 1px 0 rgba(255,255,255,0.07), 0 1px 12px rgba(0,0,0,0.4)'}}
      >
        {/* Logo */}
        <div className='flex items-center gap-2 mr-8'>
          <Image src='/mylogo.png' alt='Runiqlo' width={28} height={28} className='w-7 h-7 flex-shrink-0' />
          <span className='font-semibold text-sm text-white tracking-wide hidden sm:inline' style={{letterSpacing: '0.06em'}}>
            RUNIQLO
          </span>
        </div>

        {/* Nav links — desktop only; mobile uses bottom bar */}
        <nav className='hidden md:flex items-center gap-1 flex-1'>
          {NAV_LINKS.map(({href, label, icon, exact}) => {
            const active = isActive(href, exact);
            return (
              <Link
                key={href}
                href={href}
                aria-current={active ? 'page' : undefined}
                className={`flex items-center gap-1.5 px-3 py-2 text-xs font-semibold tracking-wide uppercase transition-colors cursor-pointer relative ${
                  active ? 'text-white' : 'hover:text-white/70'
                }`}
                style={{
                  color: active ? 'var(--color-text-1)' : 'var(--color-text-2)',
                  borderBottom: active ? '2px solid #fc4c02' : '2px solid transparent',
                }}
              >
                <span style={{color: active ? 'rgba(255,255,255,0.7)' : 'var(--color-text-2)'}}>{icon}</span>
                <span>{label}</span>
              </Link>
            );
          })}
        </nav>

        {/* Actions */}
        <div className='flex items-center gap-2 ml-auto md:ml-0'>
          {/* Sync status + refresh — only when refresh prop provided */}
          {onRefresh && (
            <button
              onClick={handleRefresh}
              disabled={refreshing}
              className='relative w-8 h-8 rounded-lg flex items-center justify-center bg-white/[0.06] hover:bg-white/[0.10] cursor-pointer disabled:opacity-50 transition-colors'
              aria-label='Refresh data'
            >
              <svg
                width='14'
                height='14'
                viewBox='0 0 24 24'
                fill='none'
                stroke='currentColor'
                strokeWidth='2'
                className={`text-white/60 ${refreshing ? 'animate-spin' : ''}`}
              >
                <path d='M23 4v6h-6M1 20v-6h6' />
                <path d='M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15' />
              </svg>
              <span
                className={`absolute top-1 right-1 w-1.5 h-1.5 rounded-full ${
                  refreshing ? 'bg-accent-yellow dot-breathe' : 'bg-accent-green'
                }`}
              />
            </button>
          )}

          {athlete && (
            <Link
              href='/profile'
              className='hidden md:flex items-center gap-2 px-2 py-1 rounded-lg transition-colors cursor-pointer hover:bg-white/[0.05]'
            >
              {athlete.profile_medium ? (
                <Image
                  src={athlete.profile_medium}
                  alt={`${athlete.firstname} ${athlete.lastname}`}
                  width={28}
                  height={28}
                  className='w-7 h-7 rounded-full object-cover flex-shrink-0'
                  unoptimized
                />
              ) : (
                <div className='w-7 h-7 rounded-full bg-white/[0.08] border border-white/[0.12] flex items-center justify-center flex-shrink-0'>
                  <span className='text-[10px] font-bold text-white/75 leading-none tracking-wide'>{initials}</span>
                </div>
              )}
              <span className='text-sm font-medium text-white/70 leading-none'>{athlete.firstname}</span>
            </Link>
          )}

          <Link
            href='/settings'
            className='w-8 h-8 rounded-lg flex items-center justify-center transition-colors cursor-pointer hover:bg-white/[0.07]'
            style={{color: pathname === '/settings' ? 'var(--color-text-1)' : 'var(--color-text-2)'}}
            aria-label='Settings'
          >
            <svg width='15' height='15' viewBox='0 0 24 24' fill='none' stroke='currentColor' strokeWidth='2'>
              <circle cx='12' cy='12' r='3' />
              <path d='M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z' />
            </svg>
          </Link>
        </div>
      </header>

      {/* ── Mobile bottom tab bar ─────────────────────────────────────────────── */}
      <nav
        className='md:hidden fixed bottom-0 left-0 right-0 z-50 grid grid-cols-5 backdrop-blur-xl bg-black/85'
        style={{
          height: 'calc(56px + env(safe-area-inset-bottom))',
          paddingBottom: 'env(safe-area-inset-bottom)',
          borderTop: '1px solid rgba(255,255,255,0.08)',
        }}
      >
        {NAV_LINKS.map(({href, label, icon, exact}) => {
          const active = isActive(href, exact);
          return (
            <Link
              key={href}
              href={href}
              aria-current={active ? 'page' : undefined}
              className={`relative flex flex-col items-center justify-center gap-1 transition-colors cursor-pointer ${
                active ? 'text-white' : 'text-white/40 hover:text-white/65'
              }`}
            >
              <span className={`transition-colors ${active ? 'text-white' : 'text-white/35'}`}>{icon}</span>
              <span className='text-[10px] font-medium'>{label}</span>
              {active && (
                <span className='absolute bottom-2.5 left-1/2 -translate-x-1/2 w-1 h-1 rounded-full bg-brand' />
              )}
            </Link>
          );
        })}
        {/* Profile tab — visible on mobile only */}
        <Link
          href='/profile'
          aria-current={pathname === '/profile' ? 'page' : undefined}
          className={`relative flex flex-col items-center justify-center gap-1 transition-colors cursor-pointer ${
            pathname === '/profile' ? 'text-white' : 'text-white/40 hover:text-white/65'
          }`}
        >
          {athlete?.profile_medium ? (
            <span className={`w-[15px] h-[15px] rounded-full overflow-hidden flex-shrink-0 ${pathname === '/profile' ? 'ring-1 ring-white/70' : 'ring-1 ring-white/20'}`}>
              <img src={athlete.profile_medium} alt="" className="w-full h-full object-cover" />
            </span>
          ) : (
            <svg width='15' height='15' viewBox='0 0 24 24' fill='none' stroke='currentColor' strokeWidth='2'>
              <path d='M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2' />
              <circle cx='12' cy='7' r='4' />
            </svg>
          )}
          <span className='text-[10px] font-medium'>Profile</span>
          {pathname === '/profile' && (
            <span className='absolute bottom-2.5 left-1/2 -translate-x-1/2 w-1 h-1 rounded-full bg-brand' />
          )}
        </Link>
      </nav>
    </>
  );
}
