import { QualityPresetsSchema, type QualityPresets } from '@game/shared';
import rawPresets from './presets.json';

/** Graphics quality presets, validated at load. Edit presets.json to tune. */
export const qualityPresets: QualityPresets = QualityPresetsSchema.parse(rawPresets);
