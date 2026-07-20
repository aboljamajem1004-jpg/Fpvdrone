import * as THREE from 'three';
import type { Physics } from '../core/physicsWorld';
import { PHYSICS } from '../config/physics';
import { fbm } from './noise';

const SEED = 1337;
const SEGMENTS = 128; // grid resolution for both visual mesh and collider

/** Terrain height at world (x, z) — analytic, so props & rings can sample it. */
export function terrainHeight(x: number, z: number): number {
  const s = PHYSICS.world.size;
  const nx = x / s + 0.5;
  const nz = z / s + 0.5;
  // rolling hills + a broad valley through the middle
  const hills = fbm(nx * 6, nz * 6, 4, SEED) * 46;
  const valley = Math.exp(-Math.pow((nx - 0.5) * 4.2, 2)) * -18;
  const bowl = Math.max(0, (Math.hypot(nx - 0.5, nz - 0.5) - 0.42) * 160); // raise edges
  return hills + valley + bowl - 14;
}

export function createTerrain(scene: THREE.Scene, physics: Physics): void {
  const size = PHYSICS.world.size;
  const geo = new THREE.PlaneGeometry(size, size, SEGMENTS, SEGMENTS);
  geo.rotateX(-Math.PI / 2);

  const pos = geo.attributes.position as THREE.BufferAttribute;
  const colors = new Float32Array(pos.count * 3);
  const grass = new THREE.Color(0x5e8c4a);
  const grassDry = new THREE.Color(0x7a9455);
  const rock = new THREE.Color(0x8a8578);
  const snow = new THREE.Color(0xd8dde2);
  const tmp = new THREE.Color();

  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i);
    const z = pos.getZ(i);
    const h = terrainHeight(x, z);
    pos.setY(i, h);

    // color by height with slight noise breakup
    const n = fbm(x * 0.02 + 50, z * 0.02 + 50, 2, SEED + 7);
    if (h > 26) tmp.copy(snow);
    else if (h > 14) tmp.copy(rock).lerp(snow, (h - 14) / 24);
    else tmp.copy(grass).lerp(grassDry, n);
    colors[i * 3] = tmp.r;
    colors[i * 3 + 1] = tmp.g;
    colors[i * 3 + 2] = tmp.b;
  }
  geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  geo.computeVertexNormals();

  const mat = new THREE.MeshLambertMaterial({ vertexColors: true });
  const mesh = new THREE.Mesh(geo, mat);
  mesh.receiveShadow = true;
  scene.add(mesh);

  // physics: trimesh collider straight from the render geometry
  const vertices = new Float32Array(pos.array);
  const indices = new Uint32Array(geo.index!.array);
  const body = physics.world.createRigidBody(physics.RAPIER.RigidBodyDesc.fixed());
  physics.world.createCollider(
    physics.RAPIER.ColliderDesc.trimesh(vertices, indices).setFriction(0.9),
    body,
  );
}
