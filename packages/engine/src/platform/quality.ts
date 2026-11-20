import type { QualityTier } from '@game/shared';
import type { DeviceInfo } from './device';

const SOFTWARE_GPU = /swiftshader|llvmpipe|software|basic render/i;
const STRONG_DESKTOP_GPU = /rtx|gtx 1[06-9]|gtx 16|radeon rx|radeon pro|apple m\d|arc a\d|quadro/i;
const STRONG_MOBILE_GPU =
  /apple|adreno \(tm\) (7[3-9]\d|8\d\d)|mali-g7[1-9]|mali-g[0-9]{3}|immortalis/i;

/**
 * Pick a starting quality tier from device info. The player can always override it,
 * and dynamic resolution keeps frame rate stable within the tier.
 */
export function pickQualityTier(
  d: Pick<DeviceInfo, 'formFactor' | 'gpu' | 'memoryGb' | 'cores'>,
): QualityTier {
  if (SOFTWARE_GPU.test(d.gpu)) return 'lite';

  if (d.formFactor === 'phone') {
    if ((d.memoryGb !== null && d.memoryGb <= 3) || d.cores <= 4) return 'lite';
    return 'mobile';
  }

  if (d.formFactor === 'tablet') {
    if (d.memoryGb !== null && d.memoryGb <= 3) return 'lite';
    return STRONG_MOBILE_GPU.test(d.gpu) && d.cores >= 8 ? 'medium' : 'mobile';
  }

  if (STRONG_DESKTOP_GPU.test(d.gpu)) return 'high';
  if (d.memoryGb !== null && d.memoryGb <= 4) return 'mobile';
  return 'medium';
}
