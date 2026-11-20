import type { Metadata, Viewport } from 'next';
import { Hind_Siliguri } from 'next/font/google';
import { brand } from '@game/shared';
import { siteUrl } from '@/lib/siteUrl';
import { ServiceWorkerRegister } from '@/components/ServiceWorkerRegister';
import './globals.css';

const bangla = Hind_Siliguri({
  subsets: ['bengali', 'latin'],
  weight: ['400', '600', '700'],
  variable: '--font-bangla',
  display: 'swap',
});

const icon = `/${brand.logoDir}/icon.svg`;
const png = (f: string) => `/${brand.logoDir}/${f}`;
const description = `${brand.displayName} (${brand.nameBn}): ঢাকার মোহাম্মদপুরে ওপেন-ওয়ার্ল্ড অ্যাকশন-কমেডি। An open-world action-comedy set in Dhaka — play free in your browser on phone, tablet or PC.`;

export const metadata: Metadata = {
  title: {
    default: `${brand.displayName} — ${brand.tagline}`,
    template: `%s · ${brand.shortName}`,
  },
  metadataBase: new URL(siteUrl()),
  description,
  applicationName: brand.displayName,
  keywords: [
    'Bangla game',
    'বাংলা গেম',
    'Dhaka',
    'Mohammadpur',
    'open world',
    'browser game',
    brand.shortName,
  ],
  alternates: { canonical: '/' },
  icons: {
    icon: [
      { url: icon, type: 'image/svg+xml' },
      { url: png('icon-192.png'), sizes: '192x192', type: 'image/png' },
    ],
    apple: png('apple-touch-icon.png'),
  },
  appleWebApp: { capable: true, title: brand.shortName, statusBarStyle: 'black-translucent' },
  formatDetection: { telephone: false },
  openGraph: {
    title: brand.displayName,
    description: `${brand.tagline} · ${brand.taglineBn}`,
    type: 'website',
    locale: 'bn_BD',
    siteName: brand.displayName,
    images: [{ url: png('og.png'), width: 1200, height: 630, alt: brand.displayName }],
  },
  twitter: {
    card: 'summary_large_image',
    title: brand.displayName,
    description: brand.tagline,
    images: [png('og.png')],
  },
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
  viewportFit: 'cover',
  themeColor: '#120d0a',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="bn" className={bangla.variable}>
      <body>
        {children}
        <ServiceWorkerRegister />
      </body>
    </html>
  );
}
