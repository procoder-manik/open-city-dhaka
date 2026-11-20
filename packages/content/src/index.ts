import {
  DialogueFileSchema,
  QualityPresetsSchema,
  VehicleDefsSchema,
  type DialogueFile,
  type QualityPresets,
  type VehicleDef,
} from '@game/shared';
import rawDialogue from './dialogue.json';
import rawPresets from './presets.json';
import rawVehicles from './vehicles.json';

/** Graphics quality presets, validated at load. Edit presets.json to tune. */
export const qualityPresets: QualityPresets = QualityPresetsSchema.parse(rawPresets);

/** Drivable vehicles, validated at load. Edit vehicles.json to tune handling. */
export const vehicleDefs: VehicleDef[] = VehicleDefsSchema.parse(rawVehicles);

/** All spoken lines (Bangla + English meaning). Edit dialogue.json to add more. */
export const dialogue: DialogueFile = DialogueFileSchema.parse(rawDialogue);

export function getVehicleDef(id: string): VehicleDef {
  const def = vehicleDefs.find((v) => v.id === id);
  if (!def) throw new Error(`Unknown vehicle: ${id}`);
  return def;
}
