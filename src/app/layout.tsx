import type {Metadata, Viewport} from 'next';
import {Geist, JetBrains_Mono, Newsreader} from 'next/font/google';
import './globals.css';
import {Providers} from './providers';

// Sans: small uppercase labels, nav, UI chrome (Helvetica-ish)
const geistSans = Geist({
  variable: '--font-geist-sans',
  subsets: ['latin'],
});

// Mono: all numerals (tabular)
const jetbrainsMono = JetBrains_Mono({
  variable: '--font-geist-mono',
  subsets: ['latin'],
  weight: ['400', '500', '600'],
});

// Display/serif face: Newsreader italic for editorial headlines & body
const newsreader = Newsreader({
  variable: '--font-display',
  subsets: ['latin'],
  style: ['normal', 'italic'],
  weight: ['200', '300', '400', '500', '600', '700'],
});

export const metadata: Metadata = {
  title: 'Runiqlo',
  description: 'Your personal training dashboard',
  manifest: '/manifest.json',
};

export const viewport: Viewport = {
  themeColor: '#f2ede2',
};

export default function RootLayout({children}: {children: React.ReactNode}) {
  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${jetbrainsMono.variable} ${newsreader.variable} h-full antialiased`}
    >
      <body
        className="min-h-full"
        style={{background: 'var(--color-paper)', color: 'var(--color-ink)'}}
      >
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
