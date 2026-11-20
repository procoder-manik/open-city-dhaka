# Platforms: Mobile, Tablet, Laptop & Desktop

The game is **one web app that runs everywhere**: phone, tablet, laptop, desktop. It is not "desktop first with mobile later". Every phase is built and tested on both a phone and a PC.

## 1. Supported devices & targets

| Tier | Example devices | Preset | FPS target | Notes |
|---|---|---|---|---|
| Desktop / gaming laptop | GTX 1650+, RTX, Apple M1+ | High / Ultra | 60 (uncapped option) | WebGPU, shadows, SSAO, reflections |
| Normal laptop | Intel Iris Xe, Ryzen iGPU | Medium | 60 | |
| Tablet | iPad (A12+), Android tabs (SD 7xx+) | Medium / Mobile | 30–60 | Touch or keyboard/gamepad |
| Mid phone | iPhone 11+, Snapdragon 7-series, Helio G99, Exynos 1380 | Mobile | 30 stable | Most players in Bangladesh |
| Low phone | 3 GB RAM Android, Helio G85 class | Lite | 30 | Reduced density, short draw distance |

**Auto-detect** on first launch: GPU info + quick 3-second benchmark scene → picks a preset. Player can change it any time. **Dynamic resolution** keeps FPS stable on every tier.

## 2. Mobile play mode (PUBG / Free Fire style)

### 2.1 Orientation
- **Landscape (horizontal) full screen is the default**, like PUBG Mobile / Free Fire.
- **Portrait mode is optional** with a simplified HUD (useful for one-hand driving, rickshaw and delivery jobs, phone menus).
- If the device is in the "wrong" orientation and can't be locked, show a friendly "phone ghurao" (rotate) screen.

### 2.2 "Game Lock" mode (no accidental exits)
Tap **Play** → the game enters Game Lock:

| What it does | How (web API) | Android Chrome | iPhone Safari | iPad |
|---|---|---|---|---|
| True full screen (no address bar) | Fullscreen API | ✅ | ⚠️ not for games, use PWA | ✅ |
| Lock to landscape | `screen.orientation.lock()` | ✅ | ❌ (rotate overlay) | ⚠️ |
| Block pinch-zoom, double-tap zoom, text select, long-press menu | CSS `touch-action:none`, `user-select:none`, viewport meta, `contextmenu` prevent | ✅ | ✅ | ✅ |
| Block pull-to-refresh / bounce scroll | `overscroll-behavior:none`, fixed body | ✅ | ✅ | ✅ |
| Back button / back swipe doesn't kill the game | History trap (`popstate` → opens pause menu) + "leave game?" confirm | ✅ | ✅ (mostly) | ✅ |
| Screen stays on | Screen Wake Lock API | ✅ | ✅ (iOS 16.4+) | ✅ |
| Keep Esc / shortcuts inside the game (desktop) | Pointer Lock + Keyboard Lock API | ✅ Chromium | – | – |
| Safe area for notch/punch-hole | `env(safe-area-inset-*)` | ✅ | ✅ | ✅ |
| Lock HUD layout | Lock button in HUD editor so the buttons can't be dragged by mistake | ✅ | ✅ | ✅ |

Exiting Game Lock is always deliberate: **pause button → "Exit"**, never an accidental swipe.

### 2.3 Install as an app (PWA): important for iPhone
- "Add to Home Screen" / install prompt → opens **full screen, no browser bar**, own icon, splash screen. This is the best way to get true full screen on iPhone.
- `manifest.json`: `display: "fullscreen"` (fallback `standalone`), `orientation: "landscape"`, theme colours, icons.
- Service worker caches the engine + downloaded map chunks → second launch is near-instant and uses no data.

### 2.4 Touch controls (customisable, like PUBG's HUD layout editor)
| Control | Default placement |
|---|---|
| Movement joystick (floating, appears where thumb touches) | Left half |
| Camera look (drag anywhere on right half) | Right half |
| Fire button (+ optional left-side fire) | Right |
| Aim / scope, Jump, Crouch, Reload | Right cluster |
| Sprint (push joystick to edge = auto-sprint lock) | Joystick |
| Enter vehicle / Carjack (context button appears near vehicles) | Right-middle |
| Melee / Punch | Right cluster |
| Weapon wheel (tap weapon icon) | Top-right |
| Throw grenade (drag to aim arc) | Right |
| Map, Phone, Pause | Top |
| **In vehicle:** steering left/right OR tilt (gyro) OR joystick; gas, brake/reverse, handbrake, horn/bell, look-back, exit | Swapped layout |

Features:
- **HUD editor:** drag, resize and change opacity of every button; 3 saved layouts; reset to default.
- **Aim assist** stronger on touch (soft lock + slow-down near targets); optional **gyroscope aiming**.
- **Auto-fire** option (fires when crosshair is on enemy, like Free Fire's quick-fire setting).
- **Haptic feedback** on hits, crashes, gunshots (Vibration API, Android; iOS ignores).
- Multi-touch: move + look + shoot at the same time (pointer events, up to 5 touches).
- Text sizes and buttons scale by screen size (phone / tablet).

### 2.5 Other input
- Keyboard + mouse (desktop/laptop), with remapping.
- **Gamepad** (Xbox/PlayStation/Android Bluetooth controllers) on every device via Gamepad API.
- Tablet with keyboard → automatically switches to keyboard prompts; touch HUD hides when a gamepad/keyboard is used and returns on touch.

## 3. Mobile performance rules
| Area | Mobile / Lite rule |
|---|---|
| First download | ≤ 15 MB to playable (desktop ≤ 25 MB) |
| Memory | ≤ 600 MB (iOS Safari kills tabs above ~1–1.5 GB) |
| Rendering | Render at 0.6–0.85 resolution scale + sharpen; 1 shadow cascade or blob shadows; no SSAO/SSR; baked lighting in textures |
| Textures | KTX2 auto-transcodes to ASTC/ETC2 on phones; max 1K textures on Lite |
| World | Load radius 2 chunks; far skyline impostors; fewer cars/NPCs (density slider) |
| Characters | Crowd NPCs use baked vertex-animation textures (no skeleton cost) |
| Frame pacing | 30 FPS cap option; **Battery saver** mode; pause rendering when tab hidden |
| Heat | Watch frame time; auto-drop quality if the phone throttles |
| Data | **Low-data mode** (smaller textures, no voice, radio off) for mobile data users |
| Loading | Progressive: spawn player as soon as nearby chunks load, rest streams in |

## 4. Testing matrix (every phase)
- Real devices: 1 low Android, 1 mid Android, 1 iPhone, 1 iPad/Android tab, 1 low laptop, 1 gaming PC.
- Browsers: Chrome, Edge, Firefox, Safari, Samsung Internet.
- Automated: Playwright mobile emulation for UI + a perf benchmark scene that logs FPS per preset.
