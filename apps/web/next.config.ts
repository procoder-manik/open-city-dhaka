import type { NextConfig } from 'next';

const isProd = process.env.NODE_ENV === 'production';

/**
 * CSP: 'wasm-unsafe-eval' is required for the Rapier physics WASM.
 * TODO(P6): replace script 'unsafe-inline' with per-request nonces.
 */
const csp = [
  "default-src 'self'",
  "script-src 'self' 'unsafe-inline' 'wasm-unsafe-eval'",
  "worker-src 'self' blob:",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob:",
  "font-src 'self' data:",
  "connect-src 'self'",
  "media-src 'self' blob:",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "frame-ancestors 'none'",
  'upgrade-insecure-requests',
].join('; ');

const securityHeaders = [
  { key: 'X-Content-Type-Options', value: 'nosniff' },
  { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
  { key: 'X-Frame-Options', value: 'DENY' },
  {
    key: 'Permissions-Policy',
    value:
      'camera=(), microphone=(), geolocation=(), payment=(), fullscreen=(self), gamepad=(self), screen-wake-lock=(self)',
  },
  ...(isProd
    ? [
        { key: 'Content-Security-Policy', value: csp },
        { key: 'Strict-Transport-Security', value: 'max-age=63072000; includeSubDomains; preload' },
      ]
    : []),
];

const nextConfig: NextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  transpilePackages: ['@game/engine', '@game/shared', '@game/content'],
  // Native/WASM database drivers load at runtime from node_modules (not bundled).
  serverExternalPackages: ['@electric-sql/pglite', 'pg'],
  async headers() {
    return [
      {
        // Site-wide cross-origin isolation (→ SharedArrayBuffer for physics later).
        // Must cover worker/service-worker scripts too: an isolated page can only start
        // workers whose own responses carry COEP. 'credentialless' keeps CDN assets loadable.
        source: '/(.*)',
        headers: [
          ...securityHeaders,
          { key: 'Cross-Origin-Opener-Policy', value: 'same-origin' },
          { key: 'Cross-Origin-Embedder-Policy', value: 'credentialless' },
          { key: 'Cross-Origin-Resource-Policy', value: 'same-origin' },
        ],
      },
      {
        source: '/sw.js',
        headers: [
          { key: 'Cache-Control', value: 'no-cache, no-store, must-revalidate' },
          { key: 'Service-Worker-Allowed', value: '/' },
        ],
      },
    ];
  },
};

export default nextConfig;
