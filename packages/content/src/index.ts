import {
  QualityPresetsSchema,
  VehicleDefsSchema,
  type QualityPresets,
  type VehicleDef,
} from '@game/shared';
import rawPresets from './presets.json';
import rawVehicles from './vehicles.json';

/** Graphics quality presets, validated at load. Edit presets.json to tune. */
export const qualityPresets: QualityPresets = QualityPresetsSchema.parse(rawPresets);

/** Drivable vehicles, validated at load. Edit vehicles.json to tune handling. */
export const vehicleDefs: VehicleDef[] = VehicleDefsSchema.parse(rawVehicles);

export function getVehicleDef(id: string): VehicleDef {
  const def = vehicleDefs.find((v) => v.id === id);
  if (!def) throw new Error(`Unknown vehicle: ${id}`);
  return def;
}
