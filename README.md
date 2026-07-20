# SkyRush FPV

A 3D FPV drone game that runs entirely in the browser — no download, no install, no server.

Fly a racing quad from the first-person camera view across an open 1×1 km world. Works on
desktop (keyboard + mouse) and mobile (dual virtual touch sticks) from the same URL.

## Play modes

- **Free Flight** — open-world flying, no objective
- **Race** — a 12-gate course with a timer; best time is saved locally

## Controls

### Desktop
| Input | Action |
|---|---|
| `W` / `S` | Throttle up / down |
| Mouse | Pitch & yaw (pointer lock) |
| `A` / `D` | Roll |
| `R` | Reset to checkpoint |
| `C` | Toggle FPV / chase camera |
| `F` | Toggle FPS counter |
| `ESC` | Pause menu |

### Mobile
Floating dual sticks (appear where you touch, landscape required):
- **Left stick** — throttle (vertical) + yaw (horizontal)
- **Right stick** — pitch (vertical) + roll (horizontal)

## Flight modes

- **Angle** (default) — stick = tilt angle, auto-levels. Beginner friendly.
- **Acro** — stick = rotation rate, no auto-level. Real FPV feel.

Switch in Settings, along with mouse sensitivity, FOV, camera tilt, graphics
quality, and volume.

## Tech

- [Three.js](https://threejs.org/) — WebGL rendering
- [Rapier](https://rapier.rs/) (`@dimforge/rapier3d-compat`) — rigid-body physics at a fixed 60 Hz step with render interpolation
- TypeScript + Vite — no UI frameworks, plain HTML/CSS for menus and HUD
- Web Audio API — fully procedural sound (motor whine, wind, SFX), no audio assets

All flight-feel numbers live in [`src/config/physics.ts`](src/config/physics.ts) — tweak
them there.

## Development

```bash
npm install
npm run dev      # local dev server
npm run build    # production build → dist/
npm run preview  # serve the production build
```

The build is a fully static site (relative asset paths), so `dist/` can be dropped onto
GitHub Pages, Render, or any static host as-is.
