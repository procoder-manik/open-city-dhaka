/** Kept dependency-free: imported by both the store and the scene (no import cycles). */
/** Player preferences (saved by the app per device). */
export interface GamePrefs {
  /** Vibrate on shots, hits and crashes (phones that support it). */
  haptics: boolean;
  /** Touch: fire automatically when the crosshair is on a cop. */
  autoFire: boolean;
  /** Cap at 30 FPS and lower resolution to save battery. */
  batterySaver: boolean;
  /** Keyboard: A/D turn, W/S forward/back, camera follows behind (no mouse needed). */
  easyControls: boolean;
}

export const DEFAULT_PREFS: GamePrefs = {
  haptics: true,
  autoFire: true,
  batterySaver: false,
  easyControls: true,
};
