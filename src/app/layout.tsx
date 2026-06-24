import type {Metadata, Viewport} from 'next';
import {Space_Grotesk, IBM_Plex_Mono} from 'next/font/google';
import Script from 'next/script';
import './globals.css';
import {Providers} from './providers';

// Applied before hydration so the persisted theme/accent paint without a flash.
const THEME_INIT = `(function(){try{var s=JSON.parse(localStorage.getItem('strava-coach-settings')||'{}');var t=s.theme==='light'?'light':'dark';document.documentElement.setAttribute('data-theme',t);var A={lime:['#c6f833','#a6d420','rgba(198,248,51,0.20)','#0a0d11'],amber:['#f2a33c','#d9871f','rgba(242,163,60,0.20)','#0a0d11'],cyan:['#3fd6e0','#1fb4be','rgba(63,214,224,0.20)','#06181a'],coral:['#ff6b5a','#e64c3b','rgba(255,107,90,0.20)','#1a0a08']};var a=A[s.accent]||A.lime,r=document.documentElement.style;r.setProperty('--accent',a[0]);r.setProperty('--accent-2',a[1]);r.setProperty('--accent-glow',a[2]);r.setProperty('--accent-ink',a[3]);}catch(e){}})();`;

// Sans: UI chrome, headlines, labels — Space Grotesk
const spaceGrotesk = Space_Grotesk({
  variable: '--font-sans',
  subsets: ['latin'],
  weight: ['400', '500', '600', '700'],
});

// Mono: all numerals + telemetry readouts — IBM Plex Mono (tabular)
const plexMono = IBM_Plex_Mono({
  variable: '--font-mono',
  subsets: ['latin'],
  weight: ['400', '500', '600'],
});

export const metadata: Metadata = {
  title: 'Runiqlo',
  description: 'Your personal training dashboard',
  manifest: '/manifest.json',
  appleWebApp: {
    capable: true,
    statusBarStyle: 'default',
    title: 'Runiqlo',
  },
  icons: {
    icon: [
      {url: '/icon-192.png', sizes: '192x192', type: 'image/png'},
      {url: '/icon-512.png', sizes: '512x512', type: 'image/png'},
    ],
    apple: [{url: '/icon-192.png', sizes: '192x192', type: 'image/png'}],
  },
};

export const viewport: Viewport = {
  themeColor: '#000000',
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover',
};

export default function RootLayout({children}: {children: React.ReactNode}) {
  return (
    <html
      lang="en"
      data-theme="dark"
      data-density="compact"
      suppressHydrationWarning
      className={`${spaceGrotesk.variable} ${plexMono.variable} h-full antialiased`}
    >
      <body
        className="min-h-full"
        style={{background: 'var(--bg)', color: 'var(--text)'}}
      >
        <Script id="theme-init" strategy="beforeInteractive" dangerouslySetInnerHTML={{__html: THEME_INIT}} />
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
