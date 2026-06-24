'use client';

import {useState} from 'react';
import Image from 'next/image';
import Link from 'next/link';
import {usePathname, useRouter} from 'next/navigation';
import {useStravaAuth} from '@/contexts/StravaAuthContext';
import {InteractiveMenu, type InteractiveMenuItem} from '@/components/ui/modern-mobile-menu';
import {
  LayoutDashboard, Activity, Bot, Route, Settings as SettingsIcon,
  CalendarRange, LineChart, RefreshCw,
} from 'lucide-react';

interface AppHeaderProps {
  onRefresh?: () => Promise<void>;
}

/* ── Desktop nav rail ──────────────────────────────────────────────────────── */
const RAIL_ITEMS = [
  {href: '/', label: 'Briefing', icon: LayoutDashboard, exact: true},
  {href: '/activities', label: 'Activities', icon: Activity, exact: false},
  {href: '/fitness', label: 'Fitness', icon: LineChart, exact: false},
  {href: '/plan', label: 'Plan', icon: CalendarRange, exact: false},
  {href: '/coach', label: 'Coach', icon: Bot, exact: false},
  {href: '/segments', label: 'Segments', icon: Route, exact: false},
];

/* ── Mobile bottom nav (keeps Fitness + Plan as separate tabs) ──────────────── */
const MOBILE_NAV_ITEMS: (InteractiveMenuItem & {href: string; exact: boolean})[] = [
  {label: 'dashboard', icon: LayoutDashboard, href: '/', exact: true},
  {label: 'activities', icon: Activity, href: '/activities', exact: false},
  {label: 'fitness', icon: LineChart, href: '/fitness', exact: false},
  {label: 'plan', icon: CalendarRange, href: '/plan', exact: false},
  {label: 'coach', icon: Bot, href: '/coach', exact: true},
];

/* Route → status-bar title/subtitle. */
function statusMeta(pathname: string): {title: string; sub: string} {
  if (pathname === '/') return {title: 'Briefing', sub: 'DASHBOARD'};
  if (pathname.startsWith('/activities/')) return {title: 'Activity Analysis', sub: 'DETAIL'};
  if (pathname.startsWith('/activities')) return {title: 'Activities', sub: 'LOG'};
  if (pathname.startsWith('/segments/')) return {title: 'Segment', sub: 'EFFORT HISTORY'};
  if (pathname.startsWith('/segments')) return {title: 'Segments', sub: 'AGGREGATED EFFORTS'};
  if (pathname.startsWith('/coach')) return {title: 'Coach', sub: 'AI TRAINING DIRECTOR'};
  if (pathname.startsWith('/profile')) return {title: 'Profile', sub: 'ATHLETE'};
  if (pathname.startsWith('/settings')) return {title: 'Settings', sub: 'PREFERENCES'};
  if (pathname.startsWith('/fitness')) return {title: 'Fitness', sub: 'TRAINING LOAD'};
  if (pathname.startsWith('/plan')) return {title: 'Plan', sub: 'PERIODIZATION'};
  return {title: 'Runiqlo', sub: ''};
}

export default function AppHeader({onRefresh}: AppHeaderProps) {
  const pathname = usePathname();
  const router = useRouter();
  const [refreshing, setRefreshing] = useState(false);
  const {athlete} = useStravaAuth();

  const isActive = (href: string, exact: boolean) =>
    exact ? pathname === href : pathname === href || pathname.startsWith(href + '/');

  const mobileActiveIndex = MOBILE_NAV_ITEMS.findIndex(({href, exact}) => isActive(href, exact));
  const initials = athlete
    ? `${athlete.firstname?.[0] ?? ''}${athlete.lastname?.[0] ?? ''}`.toUpperCase()
    : undefined;
  const meta = statusMeta(pathname);

  const handleRefresh = async () => {
    if (!onRefresh) return;
    setRefreshing(true);
    try {
      await onRefresh();
    } finally {
      setRefreshing(false);
    }
  };

  const AthleteAvatar = ({size = 30}: {size?: number}) =>
    athlete?.profile_medium ? (
      <Image
        src={athlete.profile_medium}
        alt={`${athlete.firstname} ${athlete.lastname}`}
        width={size}
        height={size}
        className="rounded-full object-cover flex-shrink-0"
        style={{width: size, height: size, border: '1px solid var(--line-2)'}}
        unoptimized
      />
    ) : (
      <div
        className="rounded-full flex items-center justify-center flex-shrink-0"
        style={{width: size, height: size, background: 'var(--panel-3)', border: '1px solid var(--line-2)'}}
      >
        <span className="mono" style={{fontSize: 11, color: 'var(--text)', fontWeight: 600}}>
          {initials ?? 'SR'}
        </span>
      </div>
    );

  return (
    <>
      {/* ── Desktop: left nav rail ─────────────────────────────────────────── */}
      <nav
        className="hidden md:flex fixed top-0 left-0 bottom-0 z-50 flex-col items-center"
        style={{
          width: 'var(--rail-w)',
          background: 'var(--bg-2)',
          borderRight: '1px solid var(--line)',
          padding: '14px 0',
          gap: 4,
        }}
      >
        <Link
          href="/"
          className="grid place-items-center"
          style={{
            width: 34, height: 34, borderRadius: 8, background: 'var(--accent)',
            marginBottom: 18, boxShadow: '0 0 16px var(--accent-glow)',
          }}
          aria-label="Runiqlo home"
        >
          <span className="mono" style={{fontWeight: 700, fontSize: 16, color: 'var(--accent-ink)'}}>R</span>
        </Link>

        {RAIL_ITEMS.map(({href, label, icon: Icon, exact}) => {
          const active = isActive(href, exact);
          return (
            <Link
              key={href}
              href={href}
              title={label}
              aria-current={active ? 'page' : undefined}
              className="grid place-items-center relative transition-colors"
              style={{
                width: 44, height: 44, borderRadius: 9,
                border: '1px solid ' + (active ? 'var(--line-2)' : 'transparent'),
                background: active ? 'var(--panel-2)' : 'transparent',
                color: active ? 'var(--accent)' : 'var(--dim)',
              }}
            >
              <Icon size={19} strokeWidth={1.7} />
              {active && (
                <span
                  style={{position: 'absolute', left: -1, top: 11, bottom: 11, width: 2, background: 'var(--accent)', borderRadius: 2}}
                />
              )}
            </Link>
          );
        })}

        <div style={{flex: 1}} />
        <span style={{width: 28, height: 1, background: 'var(--line)', margin: '4px 0'}} />
        {(() => {
          const active = pathname.startsWith('/settings');
          return (
            <Link
              href="/settings"
              title="Settings"
              aria-current={active ? 'page' : undefined}
              className="grid place-items-center relative transition-colors"
              style={{
                width: 44, height: 44, borderRadius: 9,
                border: '1px solid ' + (active ? 'var(--line-2)' : 'transparent'),
                background: active ? 'var(--panel-2)' : 'transparent',
                color: active ? 'var(--accent)' : 'var(--dim)',
              }}
            >
              <SettingsIcon size={19} strokeWidth={1.7} />
              {active && <span style={{position: 'absolute', left: -1, top: 11, bottom: 11, width: 2, background: 'var(--accent)', borderRadius: 2}} />}
            </Link>
          );
        })()}
      </nav>

      {/* ── Desktop: top status bar ────────────────────────────────────────── */}
      <header
        className="hidden md:flex items-center fixed top-0 right-0 z-40"
        style={{
          left: 'var(--rail-w)', height: 52, padding: '0 22px', gap: 18,
          background: 'var(--bg)', borderBottom: '1px solid var(--line)',
        }}
      >
        <div className="flex flex-col min-w-0">
          <div style={{fontSize: 15, fontWeight: 600, letterSpacing: '-0.01em', lineHeight: 1.1, color: 'var(--text)'}}>
            {meta.title}
          </div>
          {meta.sub && <div className="lbl" style={{marginTop: 2}}>{meta.sub}</div>}
        </div>
        <div style={{flex: 1}} />

        {onRefresh && (
          <button
            onClick={handleRefresh}
            disabled={refreshing}
            className="grid place-items-center cursor-pointer disabled:opacity-50 transition-colors"
            style={{width: 32, height: 32, borderRadius: 9, border: '1px solid var(--line)', color: 'var(--dim)'}}
            aria-label="Refresh data"
          >
            <RefreshCw size={14} strokeWidth={1.8} className={refreshing ? 'animate-spin' : ''} />
          </button>
        )}

        {athlete && (
          <Link href="/profile" className="flex items-center gap-2.5" aria-label="Profile">
            <AthleteAvatar size={30} />
          </Link>
        )}
      </header>

      {/* ── Mobile: top brand bar ──────────────────────────────────────────── */}
      <header
        className="md:hidden fixed top-0 left-0 right-0 z-50 flex items-center px-4"
        style={{height: 52, background: 'var(--bg)', borderBottom: '1px solid var(--line)'}}
      >
        <Link href="/" className="flex items-center gap-2" aria-label="Runiqlo home">
          <span className="grid place-items-center" style={{width: 26, height: 26, borderRadius: 7, background: 'var(--accent)', boxShadow: '0 0 12px var(--accent-glow)'}}>
            <span className="mono" style={{fontWeight: 700, fontSize: 13, color: 'var(--accent-ink)'}}>R</span>
          </span>
          <span style={{fontWeight: 600, fontSize: 15, color: 'var(--text)', letterSpacing: '-0.01em'}}>{meta.title}</span>
        </Link>
        <div style={{flex: 1}} />
        {onRefresh && (
          <button
            onClick={handleRefresh}
            disabled={refreshing}
            className="grid place-items-center cursor-pointer disabled:opacity-50 mr-1"
            style={{width: 32, height: 32, borderRadius: 9, border: '1px solid var(--line)', color: 'var(--dim)'}}
            aria-label="Refresh data"
          >
            <RefreshCw size={14} strokeWidth={1.8} className={refreshing ? 'animate-spin' : ''} />
          </button>
        )}
        <Link href="/settings" className="grid place-items-center" style={{width: 32, height: 32, color: pathname.startsWith('/settings') ? 'var(--accent)' : 'var(--dim)'}} aria-label="Settings">
          <SettingsIcon size={17} strokeWidth={1.8} />
        </Link>
        {athlete && (
          <Link href="/profile" className="ml-1" aria-label="Profile">
            <AthleteAvatar size={28} />
          </Link>
        )}
      </header>

      {/* ── Mobile: bottom tab bar ─────────────────────────────────────────── */}
      <div className="md:hidden fixed bottom-0 left-0 right-0 z-50" style={{background: 'var(--bg-2)', borderTop: '1px solid var(--line)'}}>
        <InteractiveMenu
          items={MOBILE_NAV_ITEMS}
          activeIndex={mobileActiveIndex >= 0 ? mobileActiveIndex : 0}
          onItemClick={(i) => router.push(MOBILE_NAV_ITEMS[i].href)}
          accentColor="var(--accent)"
        />
      </div>
    </>
  );
}
