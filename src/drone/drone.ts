import * as THREE from 'three';
import type RAPIER from '@dimforge/rapier3d-compat';
import type { Physics } from '../core/physicsWorld';
import { PHYSICS } from '../config/physics';

// Rigid body + low-poly quad mesh. Rendering interpolates between the two
// most recent physics transforms (fixed 60 Hz step, variable render rate).
export class Drone {
  body: RAPIER.RigidBody;
  collider: RAPIER.Collider;
  mesh: THREE.Group;
  props: THREE.Mesh[] = [];

  private prevPos = new THREE.Vector3();
  private currPos = new THREE.Vector3();
  private prevRot = new THREE.Quaternion();
  private currRot = new THREE.Quaternion();

  /** interpolated render transform, updated by interpolate() */
  renderPos = new THREE.Vector3();
  renderRot = new THREE.Quaternion();

  constructor(physics: Physics, scene: THREE.Scene) {
    const { RAPIER, world } = physics;
    const d = PHYSICS.drone;

    const bodyDesc = RAPIER.RigidBodyDesc.dynamic()
      .setTranslation(0, 2, 0)
      .setLinearDamping(d.linearDamping)
      .setAngularDamping(d.angularDamping)
      .setCcdEnabled(true);
    this.body = world.createRigidBody(bodyDesc);

    const colDesc = RAPIER.ColliderDesc.cuboid(d.size.x, d.size.y, d.size.z)
      .setMass(d.mass)
      .setFriction(0.6)
      .setRestitution(0.25)
      .setActiveEvents(RAPIER.ActiveEvents.CONTACT_FORCE_EVENTS)
      .setContactForceEventThreshold(20);
    this.collider = world.createCollider(colDesc, this.body);

    this.mesh = this.buildMesh();
    scene.add(this.mesh);
    this.snapshot();
    this.snapshot();
  }

  private buildMesh(): THREE.Group {
    const g = new THREE.Group();
    const frameMat = new THREE.MeshLambertMaterial({ color: 0x23272e });
    const accentMat = new THREE.MeshLambertMaterial({ color: 0xff5533 });
    const propMat = new THREE.MeshBasicMaterial({
      color: 0x99a4b0,
      transparent: true,
      opacity: 0.45,
      side: THREE.DoubleSide,
    });

    const bodyBox = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.07, 0.24), frameMat);
    g.add(bodyBox);
    const canopy = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.05, 0.1), accentMat);
    canopy.position.set(0, 0.05, -0.04);
    g.add(canopy);

    const armGeo = new THREE.BoxGeometry(0.34, 0.02, 0.03);
    for (const sign of [1, -1]) {
      const arm = new THREE.Mesh(armGeo, frameMat);
      arm.rotation.y = sign * Math.PI * 0.25;
      g.add(arm);
    }

    const propGeo = new THREE.CircleGeometry(0.08, 12);
    propGeo.rotateX(-Math.PI / 2);
    for (const [px, pz] of [
      [0.13, 0.13],
      [-0.13, 0.13],
      [0.13, -0.13],
      [-0.13, -0.13],
    ]) {
      const prop = new THREE.Mesh(propGeo, propMat);
      prop.position.set(px, 0.03, pz);
      g.add(prop);
      this.props.push(prop);
    }
    return g;
  }

  /** call right after each physics step */
  snapshot(): void {
    this.prevPos.copy(this.currPos);
    this.prevRot.copy(this.currRot);
    const t = this.body.translation();
    const r = this.body.rotation();
    this.currPos.set(t.x, t.y, t.z);
    this.currRot.set(r.x, r.y, r.z, r.w);
  }

  /** alpha ∈ [0,1] — blend between last two physics states for rendering */
  interpolate(alpha: number, throttle: number, dt: number): void {
    this.renderPos.lerpVectors(this.prevPos, this.currPos, alpha);
    this.renderRot.slerpQuaternions(this.prevRot, this.currRot, alpha);
    this.mesh.position.copy(this.renderPos);
    this.mesh.quaternion.copy(this.renderRot);
    const spin = (8 + throttle * 80) * dt;
    for (let i = 0; i < this.props.length; i++) {
      this.props[i].rotation.y += i % 2 === 0 ? spin : -spin;
    }
  }

  speed(): number {
    const v = this.body.linvel();
    return Math.hypot(v.x, v.y, v.z);
  }

  teleport(pos: THREE.Vector3, yawRad: number): void {
    this.body.setTranslation({ x: pos.x, y: pos.y, z: pos.z }, true);
    this.body.setRotation(
      { x: 0, y: Math.sin(yawRad / 2), z: 0, w: Math.cos(yawRad / 2) },
      true,
    );
    this.body.setLinvel({ x: 0, y: 0, z: 0 }, true);
    this.body.setAngvel({ x: 0, y: 0, z: 0 }, true);
    this.body.resetForces(true);
    this.body.resetTorques(true);
    this.snapshot();
    this.snapshot();
  }
}
