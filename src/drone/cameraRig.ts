import * as THREE from 'three';
import { PHYSICS, type Settings } from '../config/physics';
import type { Drone } from './drone';

const DEG = Math.PI / 180;

const _offset = new THREE.Vector3();
const _tiltQ = new THREE.Quaternion();
const _lookTarget = new THREE.Vector3();
const _flatQ = new THREE.Quaternion();
const _euler = new THREE.Euler();
const _fwd = new THREE.Vector3();
const _xAxis = new THREE.Vector3(1, 0, 0);

export type CamMode = 'fpv' | 'chase';

export class CameraRig {
  mode: CamMode = 'fpv';
  private shake = 0; // 0..1, decays
  private chasePos = new THREE.Vector3();
  private initialized = false;
  private smoothTilt: number | null = null;
  private fpvProps: THREE.Group;
  private propSpinners: THREE.Group[] = [];

  constructor(private camera: THREE.PerspectiveCamera) {
    this.fpvProps = this.buildFpvProps();
    camera.add(this.fpvProps);
  }

  // FPV frame furniture like a real quad camera: spinning blade tips
  // slicing in from the left/right screen edges (front + rear props),
  // and the drone's nose wedge at the bottom center of the view.
  private buildFpvProps(): THREE.Group {
    const group = new THREE.Group();
    const bladeMat = new THREE.MeshBasicMaterial({
      color: 0x14171c,
      transparent: true,
      opacity: 0.8,
    });
    const bladeGeo = new THREE.BoxGeometry(0.26, 0.004, 0.02);
    bladeGeo.translate(0.13, 0, 0); // spin around one end
    const hubGeo = new THREE.CylinderGeometry(0.014, 0.014, 0.02, 8);

    // front pair (upper edges) + rear pair (lower edges), just outside
    // the frame so only the sweeping tips cross into view
    const mounts: [number, number, number, number][] = [
      // x, y, z, z-lean
      [-1.14, 0.0, -0.5, 0.22],
      [1.14, 0.0, -0.5, -0.22],
      [-1.24, -0.5, -0.56, 0.32],
      [1.24, -0.5, -0.56, -0.32],
    ];
    for (const [x, y, z, lean] of mounts) {
      const prop = new THREE.Group();
      const spinner = new THREE.Group();
      for (let b = 0; b < 3; b++) {
        const blade = new THREE.Mesh(bladeGeo, bladeMat);
        blade.rotation.y = (b / 3) * Math.PI * 2;
        spinner.add(blade);
      }
      spinner.add(new THREE.Mesh(hubGeo, bladeMat));
      prop.add(spinner);
      prop.position.set(x, y, z);
      prop.rotation.x = 1.5; // near edge-on: blades read as thin spikes
      prop.rotation.z = lean;
      group.add(prop);
      this.propSpinners.push(spinner);
    }

    // nose wedge (camera pod) rising from the bottom center
    const noseGeo = new THREE.ConeGeometry(0.09, 0.34, 4);
    noseGeo.rotateY(Math.PI / 4);
    const nose = new THREE.Mesh(
      noseGeo,
      new THREE.MeshLambertMaterial({ color: 0xb3ab9d }),
    );
    nose.scale.set(1.6, 1, 0.55);
    nose.position.set(0, -0.42, -0.62);
    nose.rotation.x = -1.25; // tip points up-forward into the view
    group.add(nose);

    group.visible = false;
    return group;
  }

  setPropsVisible(v: boolean): void {
    this.fpvProps.visible = v;
  }

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
      // Dive compensation: when the drone pitches past the normal tilt
      // limit (swooping onto a target), lower the camera tilt so the
      // ground/target stays smoothly in view instead of sliding off-screen.
      _fwd.set(0, 0, -1).applyQuaternion(drone.renderRot);
      const noseDownDeg = Math.asin(THREE.MathUtils.clamp(-_fwd.y, -1, 1)) / DEG;
      const comp = Math.max(0, noseDownDeg - PHYSICS.drone.maxTiltDeg + 5) * 0.8;
      const targetTilt = Math.max(-15, settings.cameraTiltDeg - comp);
      if (this.smoothTilt === null) this.smoothTilt = targetTilt;
      this.smoothTilt += (targetTilt - this.smoothTilt) * (1 - Math.exp(-6 * dt));

      this.camera.position.copy(drone.renderPos);
      _tiltQ.setFromAxisAngle(_xAxis, this.smoothTilt * DEG);
      this.camera.quaternion.copy(drone.renderRot).multiply(_tiltQ);

      // spin the visible props with throttle
      this.fpvProps.visible = true;
      const spin = (20 + throttle * 130) * dt;
      for (let i = 0; i < this.propSpinners.length; i++) {
        this.propSpinners[i].rotation.y += i % 2 === 0 ? spin : -spin;
      }
    } else {
      this.fpvProps.visible = false;
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
