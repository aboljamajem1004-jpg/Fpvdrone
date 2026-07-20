import * as THREE from 'three';
import { PHYSICS, type Settings } from '../config/physics';
import { applyExpo, clamp, type InputState } from '../input/inputState';
import { terrainHeight } from '../world/terrain';
import type { Drone } from './drone';

const DEG = Math.PI / 180;

const _q = new THREE.Quaternion();
const _up = new THREE.Vector3();
const _thrust = new THREE.Vector3();
const _v = new THREE.Vector3();
const _angvel = new THREE.Vector3();
const _localAngvel = new THREE.Vector3();
const _torque = new THREE.Vector3();
const _qInv = new THREE.Quaternion();
const _qDesired = new THREE.Quaternion();
const _qErr = new THREE.Quaternion();
const _axis = new THREE.Vector3();
const _euler = new THREE.Euler();

// Applies thrust, torque and drag to the drone body each fixed step.
// Two flight modes:
//   angle — stick = tilt angle, auto-levels (PD on attitude), with hover
//           assist: centered throttle holds altitude, low stick lands.
//           Pushing pitch past dive.threshold unlocks extra tilt to swoop.
//   acro  — stick = rotation rate, raw throttle, no assists.
export class FlightController {
  /** true while the drone is resting on the ground with throttle low */
  landed = false;
  private sPitch = 0; // smoothed sticks (right-stick feel)
  private sRoll = 0;

  constructor(private drone: Drone) {}

  reset(): void {
    this.landed = false;
    this.sPitch = 0;
    this.sRoll = 0;
  }

  update(input: InputState, settings: Settings): void {
    const d = PHYSICS.drone;
    const dt = PHYSICS.fixedDt;
    const body = this.drone.body;
    const angleMode = settings.flightMode !== 'acro';

    const r = body.rotation();
    _q.set(r.x, r.y, r.z, r.w);
    _up.set(0, 1, 0).applyQuaternion(_q);
    const lv = body.linvel();

    // ── Thrust ──
    let thrustN: number;
    if (angleMode) {
      // hover assist: throttle stick maps to a vertical-velocity target
      const t = body.translation();
      const alt = t.y - terrainHeight(t.x, t.z);
      const stick = input.throttle - 0.5;
      const targetVy =
        stick > 0 ? stick * 2 * d.hover.maxClimbRate : stick * 2 * d.hover.maxDescendRate;

      if (this.landed) {
        if (input.throttle > 0.62) this.landed = false;
      } else if (alt < 0.4 && targetVy < -0.3 && Math.abs(lv.y) < 1.2) {
        this.landed = true; // touched down — cut motors until stick goes up
      }

      if (this.landed) {
        thrustN = 0;
      } else {
        // tilt compensation keeps altitude steady while leaning
        const cosTilt = Math.max(0.35, _up.y);
        const aCmd = -PHYSICS.gravity + d.hover.velGain * (targetVy - lv.y);
        thrustN = clamp((d.mass * aCmd) / cosTilt, 0, d.maxThrust);
      }
    } else {
      thrustN = Math.pow(input.throttle, d.thrustExpo) * d.maxThrust;
      this.landed = false;
    }
    _thrust.copy(_up).multiplyScalar(thrustN);
    body.addForce({ x: _thrust.x, y: _thrust.y, z: _thrust.z }, true);

    // ── Aerodynamic drag ──
    _v.set(lv.x, lv.y, lv.z);
    const sp = _v.length();
    if (sp > 0.001) {
      const mag = d.dragLinear * sp + d.dragQuadratic * sp * sp;
      _v.normalize().multiplyScalar(-mag);
      body.addForce({ x: _v.x, y: _v.y, z: _v.z }, true);
    }

    // ── Rotation control ──
    const av = body.angvel();
    _angvel.set(av.x, av.y, av.z);
    _qInv.copy(_q).invert();
    _localAngvel.copy(_angvel).applyQuaternion(_qInv);

    // inertia scale for a small quad (approx) so gains stay intuitive
    const inertia = 0.01;

    if (!angleMode) {
      const e = d.rateExpo;
      // commanded local rates (rad/s). Local axes: +X pitch-up, +Y yaw-left, +Z roll-left
      const targetPitch = -applyExpo(input.pitch, e) * d.maxRateDeg.pitch * DEG;
      const targetYaw = -applyExpo(input.yaw, e) * d.maxRateDeg.yaw * DEG;
      const targetRoll = -applyExpo(input.roll, e) * d.maxRateDeg.roll * DEG;

      _torque.set(
        (targetPitch - _localAngvel.x) * d.rateGain * inertia,
        (targetYaw - _localAngvel.y) * d.rateGain * inertia,
        (targetRoll - _localAngvel.z) * d.rateGain * inertia,
      );
      _torque.applyQuaternion(_q); // to world space
      body.addTorque({ x: _torque.x, y: _torque.y, z: _torque.z }, true);
    } else {
      // ── Angle mode ──
      // soft-centered, low-passed right stick for a smooth feel
      const k = 1 - Math.exp(-d.stickSmoothing * dt);
      this.sPitch += (applyExpo(input.pitch, d.angleExpo) - this.sPitch) * k;
      this.sRoll += (applyExpo(input.roll, d.angleExpo) - this.sRoll) * k;

      const maxTilt = d.maxTiltDeg * DEG;

      // progressive dive: past the threshold, forward pitch unlocks extra tilt
      const p = this.sPitch;
      let pitchTilt: number;
      if (p > d.dive.threshold) {
        const extra = ((p - d.dive.threshold) / (1 - d.dive.threshold)) * d.dive.extraTiltDeg * DEG;
        pitchTilt = d.dive.threshold * maxTilt + extra;
      } else {
        pitchTilt = p * maxTilt;
      }
      const rollTilt = this.sRoll * maxTilt;

      // current yaw from the drone's orientation
      _euler.setFromQuaternion(_q, 'YXZ');
      const yaw = _euler.y;

      // desired attitude: yaw kept, pitch/roll from stick
      _euler.set(-pitchTilt, yaw, -rollTilt, 'YXZ');
      _qDesired.setFromEuler(_euler);

      // attitude error → torque (PD)
      _qErr.copy(_qDesired).multiply(_qInv);
      if (_qErr.w < 0) {
        _qErr.x *= -1;
        _qErr.y *= -1;
        _qErr.z *= -1;
        _qErr.w *= -1;
      }
      const angle = 2 * Math.acos(Math.min(1, Math.abs(_qErr.w)));
      const s = Math.sqrt(1 - _qErr.w * _qErr.w);
      if (s > 1e-4) {
        _axis.set(_qErr.x / s, _qErr.y / s, _qErr.z / s);
      } else {
        _axis.set(0, 0, 0);
      }

      _torque
        .copy(_axis)
        .multiplyScalar(angle * d.angleP * inertia)
        .addScaledVector(_angvel, -d.angleD * inertia);

      // yaw command as a rate on top of attitude hold
      const yawRate = -input.yaw * d.angleYawRateDeg * DEG;
      _torque.addScaledVector(_up, (yawRate - _localAngvel.y) * 6 * inertia);

      body.addTorque({ x: _torque.x, y: _torque.y, z: _torque.z }, true);
    }
  }
}
