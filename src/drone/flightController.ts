import * as THREE from 'three';
import { PHYSICS, type Settings } from '../config/physics';
import { applyExpo, type InputState } from '../input/inputState';
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
//   angle — stick = tilt angle, auto-levels (PD on attitude)
//   acro  — stick = rotation rate, no auto-level (P on angular velocity)
export class FlightController {
  constructor(private drone: Drone) {}

  update(input: InputState, settings: Settings): void {
    const d = PHYSICS.drone;
    const body = this.drone.body;

    const r = body.rotation();
    _q.set(r.x, r.y, r.z, r.w);

    // ── Thrust along local +Y ──
    const throttle = Math.pow(input.throttle, d.thrustExpo);
    _up.set(0, 1, 0).applyQuaternion(_q);
    _thrust.copy(_up).multiplyScalar(throttle * d.maxThrust);
    body.addForce({ x: _thrust.x, y: _thrust.y, z: _thrust.z }, true);

    // ── Aerodynamic drag ──
    const lv = body.linvel();
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

    if (settings.flightMode === 'acro') {
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
      // current yaw from the drone's forward projected on the ground
      _euler.setFromQuaternion(_q, 'YXZ');
      const yaw = _euler.y;

      const maxTilt = d.maxTiltDeg * DEG;
      const desiredPitch = input.pitch * maxTilt; // + = nose down (forward)
      const desiredRoll = input.roll * maxTilt; // + = right wing down

      // desired attitude: yaw kept, pitch/roll from stick
      _euler.set(-desiredPitch, yaw, -desiredRoll, 'YXZ');
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
      _up.set(0, 1, 0).applyQuaternion(_q);
      _torque.addScaledVector(_up, (yawRate - _localAngvel.y) * 6 * inertia);

      body.addTorque({ x: _torque.x, y: _torque.y, z: _torque.z }, true);
    }
  }
}
