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
      <svg
        width='15'
        height='15'
        viewBox='0 0 24 24'
        fill='none'
        stroke='currentColor'
        strokeWidth='2'
      >
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
      <svg
        width='15'
        height='15'
        viewBox='0 0 24 24'
        fill='none'
        stroke='currentColor'
        strokeWidth='2'
      >
        <polyline points='22 12 18 12 15 21 9 3 6 12 2 12' />
      </svg>
    ),
    exact: false,
  },
  {
    href: '/segments',
    label: 'Segments',
    icon: (
      <svg
        width='15'
        height='15'
        viewBox='0 0 24 24'
        fill='none'
        stroke='currentColor'
        strokeWidth='2'
      >
        <path d='M4 15s1-1 4-1 5 2 8 2 4-1 4-1V3s-1 1-4 1-5-2-8-2-4 1-4 1z' />
        <line x1='4' y1='22' x2='4' y2='15' />
      </svg>
    ),
    exact: true,
  },
  {
    href: '/coach',
    label: 'Coach',
    icon: (
      <svg
        width='15'
        height='15'
        viewBox='0 0 24 24'
        fill='none'
        stroke='currentColor'
        strokeWidth='2'
      >
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
    exact
      ? pathname === href
      : pathname === href || pathname.startsWith(href + '/');

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
    <header className='fixed top-0 left-0 right-0 z-50 h-14 flex items-center px-5 backdrop-blur-xl bg-black/70 border-b border-white/[0.07]'>
      {/* Logo */}
      <div className='flex items-center gap-2 mr-6'>
        <Image
          src='/mylogo.png'
          alt='Runiqlo'
          width={28}
          height={28}
          className='w-7 h-7 flex-shrink-0'
        />
        <span className='font-semibold text-sm text-white tracking-tight hidden sm:inline'>
          Runiqlo
        </span>
      </div>

      {/* Nav links */}
      <nav className='flex items-center gap-1 flex-1'>
        {NAV_LINKS.map(({href, label, icon, exact}) => {
          const active = isActive(href, exact);
          return (
            <Link
              key={href}
              href={href}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium transition-all cursor-pointer ${
                active
                  ? 'text-white bg-white/[0.08] border border-white/[0.10]'
                  : 'text-white/45 hover:text-white/70 hover:bg-white/[0.06] border border-transparent'
              }`}
            >
              <span className={active ? 'text-white/75' : 'text-white/35'}>
                {icon}
              </span>
              <span className='hidden sm:inline'>{label}</span>
            </Link>
          );
        })}
      </nav>

      {/* Actions */}
      <div className='flex items-center gap-2'>
        <button
          onClick={onRefresh ? handleRefresh : undefined}
          disabled={!onRefresh || refreshing}
          className={`w-8 h-8 rounded-lg flex items-center justify-center transition-colors ${
            onRefresh
              ? 'bg-white/[0.06] hover:bg-white/[0.10] cursor-pointer disabled:opacity-40'
              : 'invisible'
          }`}
          aria-label='Refresh data'
        >
          <svg
            width='15'
            height='15'
            viewBox='0 0 24 24'
            fill='none'
            stroke='currentColor'
            strokeWidth='2'
            className={`text-white/60 ${refreshing ? 'animate-spin' : ''}`}
          >
            <path d='M23 4v6h-6M1 20v-6h6' />
            <path d='M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15' />
          </svg>
        </button>

        {athlete && (
          <Link
            href='/profile'
            className={`hidden md:flex items-center gap-2 px-2 py-1 rounded-lg transition-colors cursor-pointer ${
              pathname === '/profile'
                ? 'bg-white/[0.08] border border-white/[0.10]'
                : 'hover:bg-white/[0.06] border border-transparent'
            }`}
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
                <span className='text-[10px] font-bold text-white/75 leading-none tracking-wide'>
                  {initials}
                </span>
              </div>
            )}
            <span className='text-sm font-medium text-white/70 leading-none'>
              {athlete.firstname}
            </span>
          </Link>
        )}

        <Link
          href='/settings'
          className={`w-8 h-8 rounded-lg flex items-center justify-center transition-colors cursor-pointer ${
            pathname === '/settings'
              ? 'bg-white/[0.08] border border-white/[0.10] text-white/75'
              : 'bg-white/[0.06] hover:bg-white/[0.10] text-white/60 border border-transparent'
          }`}
          aria-label='Settings'
        >
          <svg
            width='15'
            height='15'
            viewBox='0 0 24 24'
            fill='none'
            stroke='currentColor'
            strokeWidth='2'
          >
            <circle cx='12' cy='12' r='3' />
            <path d='M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z' />
          </svg>
        </Link>
      </div>
    </header>
  );
}
