// ── All flight-feel numbers live here ──────────────────────────────
// Tweak these first when the drone feels wrong.

export const PHYSICS = {
  gravity: -9.81,
  fixedDt: 1 / 60, // physics step (Hz)

  drone: {
    mass: 0.6, // kg
    // half-extents of the collision box (m)
    size: { x: 0.18, y: 0.06, z: 0.18 },

    maxThrust: 25, // N  (thrust/weight ≈ 4.2)
    // small idle thrust so hover sits around ~0.24 throttle
    thrustExpo: 1.0, // 1 = linear throttle response

    // Acro (rate) mode: full stick = this many deg/s
    maxRateDeg: { pitch: 720, roll: 720, yaw: 400 },
    rateExpo: 0.6, // 0 = linear, 1 = very soft center
    // P-gain driving angular velocity toward the commanded rate
    rateGain: 22,

    // Angle mode
    maxTiltDeg: 35, // stick fully deflected = this lean angle
    angleP: 60, // attitude error → torque
    angleD: 8, // damping against angular velocity
    angleYawRateDeg: 220, // yaw stick rate in angle mode
    angleExpo: 0.3, // soft center on the pitch/roll stick (angle mode)
    stickSmoothing: 9, // low-pass rate on pitch/roll input (higher = snappier)

    // Dive: pushing pitch past the threshold unlocks extra forward tilt
    // so you can swoop onto a target; camera compensates to keep the
    // ground in view (see cameraRig).
    dive: {
      threshold: 0.85, // stick fraction where extra tilt starts
      extraTiltDeg: 28, // added on top of maxTiltDeg at full stick
    },

    // Hover assist (angle mode): throttle stick centered = hold altitude,
    // up = climb, down = descend/land. Acro mode keeps raw throttle.
    hover: {
      maxClimbRate: 6, // m/s at full stick up
      maxDescendRate: 3, // m/s at full stick down (gentle enough to land)
      velGain: 3.2, // vertical-velocity error → acceleration
    },

    // Aerodynamic drag: F = -(linear*v + quadratic*|v|*v)
    dragLinear: 0.1,
    dragQuadratic: 0.02,

    angularDamping: 1.2, // rapier body angular damping (stops residual spin)
    linearDamping: 0.0,

    // impact force (N) above which the drone counts as crashed
    // (high enough that a gentle assisted landing never triggers it)
    crashForce: 150,
    respawnDelay: 1.0, // seconds
  },

  world: {
    size: 1000, // terrain is size × size meters
    boundsRadius: 620, // beyond this we respawn the drone
    minY: -20,
  },
} as const;

export type Quality = 'low' | 'medium' | 'high';

export interface Settings {
  flightMode: 'angle' | 'acro';
  mouseSensitivity: number; // 0.2 .. 3
  fov: number; // 100..115
  cameraTiltDeg: number; // 20..35
  quality: Quality;
  volume: number; // 0..1
  controls: 'auto' | 'desktop' | 'touch';
}

export const DEFAULT_SETTINGS: Settings = {
  flightMode: 'angle',
  mouseSensitivity: 1.0,
  fov: 105,
  cameraTiltDeg: 25,
  quality: 'medium',
  volume: 0.7,
  controls: 'auto',
};
