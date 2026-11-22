/** Game code reads actions, never raw keys — so keyboard, touch and gamepad all work. */
export const ACTIONS = [
  'jump',
  'sprint',
  'crouch',
  'interact',
  'fire',
  'aim',
  'reload',
  'melee',
  'pause',
  'horn',
  'weapon',
  'throw',
  'talk',
] as const;
export type Action = (typeof ACTIONS)[number];

export type InputDevice = 'keyboard' | 'touch' | 'gamepad';

export interface Vec2 {
  x: number;
  y: number;
}
