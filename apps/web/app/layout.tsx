import type { Metadata, Viewport } from 'next';
import { Hind_Siliguri } from 'next/font/google';
import { brand } from '@game/shared';
import { ServiceWorkerRegister } from '@/components/ServiceWorkerRegister';
import './globals.css';

const bangla = Hind_Siliguri({
  subsets: ['bengali', 'latin'],
  weight: ['400', '600', '700'],
  variable: '--font-bangla',
  display: 'swap',
});

const icon = `/${brand.logoDir}/icon.svg`;

export const metadata: Metadata = {
  title: {
    default: `${brand.displayName} — ${brand.tagline}`,
    template: `%s · ${brand.shortName}`,
  },
  description: `${brand.displayName}: an open-world action-comedy set in Dhaka. Play free in your browser on phone, tablet or PC.`,
  applicationName: brand.displayName,
  icons: { icon, apple: icon },
  appleWebApp: { capable: true, title: brand.shortName, statusBarStyle: 'black-translucent' },
  formatDetection: { telephone: false },
  openGraph: {
    title: brand.displayName,
    description: brand.tagline,
    type: 'website',
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
