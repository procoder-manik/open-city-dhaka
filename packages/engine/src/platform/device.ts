export type FormFactor = 'phone' | 'tablet' | 'desktop';

export interface DeviceInfo {
  /** phone/tablet = primary input is a finger; desktop = mouse (even if a touchscreen exists). */
  formFactor: FormFactor;
  /** Device has a touchscreen at all. */
  touch: boolean;
  /** GPU renderer string if the browser exposes it (may be empty). */
  gpu: string;
  /** Approximate RAM in GB (Chromium only), null if unknown. */
  memoryGb: number | null;
  cores: number;
  webgpu: boolean;
  ios: boolean;
  standalone: boolean;
  pixelRatio: number;
}

function readGpuString(): string {
  try {
    const canvas = document.createElement('canvas');
    const gl = canvas.getContext('webgl2') ?? canvas.getContext('webgl');
    if (!gl) return '';
    const ext = gl.getExtension('WEBGL_debug_renderer_info');
    const value = ext ? gl.getParameter(ext.UNMASKED_RENDERER_WEBGL) : gl.getParameter(gl.RENDERER);
    gl.getExtension('WEBGL_lose_context')?.loseContext();
    return typeof value === 'string' ? value : '';
  } catch {
    return '';
  }
}

export function detectDevice(): DeviceInfo {
  const nav = navigator as Navigator & { deviceMemory?: number; standalone?: boolean };
  const ua = nav.userAgent;
  const touch = 'ontouchstart' in window || nav.maxTouchPoints > 0;
  const ios = /iPad|iPhone|iPod/.test(ua) || (ua.includes('Macintosh') && nav.maxTouchPoints > 1);
  // Primary pointer decides the layout: touch laptops still count as desktop until touched.
  const coarse = window.matchMedia?.('(pointer: coarse)').matches ?? false;
  const shortSide = Math.min(screen.width, screen.height);
  const formFactor: FormFactor =
    !coarse && !ios ? 'desktop' : shortSide >= 600 || /iPad|Tablet/.test(ua) ? 'tablet' : 'phone';
  const standalone =
    window.matchMedia?.('(display-mode: fullscreen)').matches ||
    window.matchMedia?.('(display-mode: standalone)').matches ||
    nav.standalone === true;

  return {
    formFactor,
    touch,
    gpu: readGpuString(),
    memoryGb: typeof nav.deviceMemory === 'number' ? nav.deviceMemory : null,
    cores: nav.hardwareConcurrency || 4,
    webgpu: 'gpu' in nav,
    ios,
    standalone,
    pixelRatio: window.devicePixelRatio || 1,
  };
}
