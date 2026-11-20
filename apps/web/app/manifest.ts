import type { MetadataRoute } from 'next';
import { brand } from '@game/shared';

export default function manifest(): MetadataRoute.Manifest {
  const icon = `/${brand.logoDir}/icon.svg`;
  return {
    id: '/',
    name: brand.displayName,
    short_name: brand.shortName,
    description: brand.tagline,
    start_url: '/play?source=pwa',
    scope: '/',
    display: 'fullscreen',
    display_override: ['fullscreen', 'standalone'],
    orientation: 'landscape',
    background_color: '#120d0a',
    theme_color: '#120d0a',
    categories: ['games', 'entertainment'],
    lang: 'bn',
    icons: [
      { src: icon, sizes: 'any', type: 'image/svg+xml', purpose: 'any' },
      { src: icon, sizes: 'any', type: 'image/svg+xml', purpose: 'maskable' },
    ],
  };
}
