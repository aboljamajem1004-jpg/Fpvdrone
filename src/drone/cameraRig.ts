import * as THREE from 'three';
import type { Settings } from '../config/physics';
import type { Drone } from './drone';

const DEG = Math.PI / 180;

const _offset = new THREE.Vector3();
const _tiltQ = new THREE.Quaternion();
const _lookTarget = new THREE.Vector3();
const _flatQ = new THREE.Quaternion();
const _euler = new THREE.Euler();

export type CamMode = 'fpv' | 'chase';

export class CameraRig {
  mode: CamMode = 'fpv';
  private shake = 0; // 0..1, decays
  private chasePos = new THREE.Vector3();
  private initialized = false;

  constructor(private camera: THREE.PerspectiveCamera) {}

  toggle(): void {
    this.mode = this.mode === 'fpv' ? 'chase' : 'fpv';
    this.initialized = false;
  }

  kickShake(strength: number): void {
    this.shake = Math.min(1, this.shake + strength);
  }

  update(drone: Drone, settings: Settings, throttle: number, dt: number): void {
    if (this.camera.fov !== settings.fov) {
      this.camera.fov = settings.fov;
      this.camera.updateProjectionMatrix();
    }

    if (this.mode === 'fpv') {
      // camera locked to the frame, tilted up like a real FPV cam
      this.camera.position.copy(drone.renderPos);
      _tiltQ.setFromAxisAngle(
        new THREE.Vector3(1, 0, 0),
        settings.cameraTiltDeg * DEG,
      );
      this.camera.quaternion.copy(drone.renderRot).multiply(_tiltQ);
    } else {
      // chase cam: follow behind at drone yaw, smooth position
      _euler.setFromQuaternion(drone.renderRot, 'YXZ');
      _flatQ.setFromEuler(new THREE.Euler(0, _euler.y, 0));
      _offset.set(0, 1.6, 4.5).applyQuaternion(_flatQ);
      _offset.add(drone.renderPos);
      if (!this.initialized) {
        this.chasePos.copy(_offset);
        this.initialized = true;
      }
      this.chasePos.lerp(_offset, 1 - Math.exp(-8 * dt));
      this.camera.position.copy(this.chasePos);
      _lookTarget.copy(drone.renderPos);
      _lookTarget.y += 0.4;
      this.camera.lookAt(_lookTarget);
    }

    // subtle vibration with high throttle + crash shake
    const vib = throttle * 0.0035 + this.shake * 0.06;
    if (vib > 0.0001) {
      this.camera.position.x += (Math.random() - 0.5) * vib;
      this.camera.position.y += (Math.random() - 0.5) * vib;
      this.camera.position.z += (Math.random() - 0.5) * vib;
      _euler.set(
        (Math.random() - 0.5) * vib * 0.6,
        (Math.random() - 0.5) * vib * 0.6,
        (Math.random() - 0.5) * vib * 0.6,
      );
      this.camera.quaternion.multiply(_tiltQ.setFromEuler(_euler));
    }
    this.shake *= Math.exp(-3.5 * dt);
  }
}
