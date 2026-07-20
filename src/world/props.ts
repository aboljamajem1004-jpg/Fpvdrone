import * as THREE from 'three';
import type { Physics } from '../core/physicsWorld';
import { PHYSICS } from '../config/physics';
import { rand1 } from './noise';
import { terrainHeight } from './terrain';

const TREE_COUNT = 320;
const ROCK_COUNT = 90;
const HOUSE_COUNT = 8;

function scatter(i: number, seed: number): { x: number; z: number } {
  const s = PHYSICS.world.size * 0.86;
  return {
    x: (rand1(i * 2 + 1, seed) - 0.5) * s,
    z: (rand1(i * 2 + 2, seed) - 0.5) * s,
  };
}

export function createProps(scene: THREE.Scene, physics: Physics): void {
  const { RAPIER, world } = physics;
  const fixed = () => world.createRigidBody(RAPIER.RigidBodyDesc.fixed());
  const dummy = new THREE.Object3D();

  // ── Trees: instanced trunk + canopy, capsule-ish collider per tree ──
  const trunkGeo = new THREE.CylinderGeometry(0.25, 0.4, 3, 6);
  const trunkMat = new THREE.MeshLambertMaterial({ color: 0x6b4a2e });
  const canopyGeo = new THREE.ConeGeometry(2.2, 6, 7);
  const canopyMat = new THREE.MeshLambertMaterial({ color: 0x35682d });
  const trunks = new THREE.InstancedMesh(trunkGeo, trunkMat, TREE_COUNT);
  const canopies = new THREE.InstancedMesh(canopyGeo, canopyMat, TREE_COUNT);
  trunks.castShadow = canopies.castShadow = true;

  let placed = 0;
  for (let i = 0; i < TREE_COUNT * 2 && placed < TREE_COUNT; i++) {
    const { x, z } = scatter(i, 21);
    const y = terrainHeight(x, z);
    if (y > 18 || y < -12) continue; // no trees on peaks or in the lake-valley floor
    const s = 0.7 + rand1(i, 22) * 0.9;

    dummy.position.set(x, y + 1.5 * s, z);
    dummy.scale.setScalar(s);
    dummy.rotation.set(0, rand1(i, 23) * Math.PI * 2, 0);
    dummy.updateMatrix();
    trunks.setMatrixAt(placed, dummy.matrix);

    dummy.position.set(x, y + (3 + 3) * s * 0.9, z);
    dummy.updateMatrix();
    canopies.setMatrixAt(placed, dummy.matrix);

    const body = fixed();
    body.setTranslation({ x, y: y + 4 * s, z }, false);
    world.createCollider(RAPIER.ColliderDesc.cylinder(4 * s, 1.1 * s), body);
    placed++;
  }
  trunks.count = canopies.count = placed;
  scene.add(trunks, canopies);

  // ── Rocks: instanced, sphere colliders ──
  const rockGeo = new THREE.DodecahedronGeometry(1, 0);
  const rockMat = new THREE.MeshLambertMaterial({ color: 0x8d897f, flatShading: true });
  const rocks = new THREE.InstancedMesh(rockGeo, rockMat, ROCK_COUNT);
  rocks.castShadow = true;
  for (let i = 0; i < ROCK_COUNT; i++) {
    const { x, z } = scatter(i, 51);
    const y = terrainHeight(x, z);
    const s = 0.6 + rand1(i, 52) * 2.2;
    dummy.position.set(x, y + s * 0.35, z);
    dummy.scale.set(s, s * (0.7 + rand1(i, 53) * 0.5), s);
    dummy.rotation.set(rand1(i, 54) * 3, rand1(i, 55) * 3, rand1(i, 56) * 3);
    dummy.updateMatrix();
    rocks.setMatrixAt(i, dummy.matrix);
    if (s > 1.2) {
      const body = fixed();
      body.setTranslation({ x, y: y + s * 0.3, z }, false);
      world.createCollider(RAPIER.ColliderDesc.ball(s * 0.85), body);
    }
  }
  scene.add(rocks);

  // ── Houses: box + roof, box colliders ──
  const wallMat = new THREE.MeshLambertMaterial({ color: 0xcfc5ae });
  const roofMat = new THREE.MeshLambertMaterial({ color: 0x9a4f3a });
  for (let i = 0; i < HOUSE_COUNT; i++) {
    const { x, z } = scatter(i, 81);
    const y = terrainHeight(x, z);
    if (y > 10) continue;
    const w = 6 + rand1(i, 82) * 4;
    const d = 5 + rand1(i, 83) * 3;
    const h = 3.2;
    const rot = rand1(i, 84) * Math.PI;

    const house = new THREE.Group();
    const walls = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), wallMat);
    walls.position.y = h / 2;
    walls.castShadow = true;
    const roof = new THREE.Mesh(new THREE.ConeGeometry(Math.max(w, d) * 0.72, 2.4, 4), roofMat);
    roof.position.y = h + 1.2;
    roof.rotation.y = Math.PI / 4;
    roof.castShadow = true;
    house.add(walls, roof);
    house.position.set(x, y - 0.3, z);
    house.rotation.y = rot;
    scene.add(house);

    const body = fixed();
    body.setTranslation({ x, y: y + h / 2, z }, false);
    body.setRotation({ x: 0, y: Math.sin(rot / 2), z: 0, w: Math.cos(rot / 2) }, false);
    world.createCollider(RAPIER.ColliderDesc.cuboid(w / 2, h / 2 + 1.4, d / 2), body);
  }

  // ── Bridge across the central valley ──
  const bx = 0;
  const bz = 60;
  const by = terrainHeight(-70, bz) + 2;
  const deck = new THREE.Mesh(
    new THREE.BoxGeometry(150, 1.2, 8),
    new THREE.MeshLambertMaterial({ color: 0x7d6b52 }),
  );
  deck.position.set(bx, by, bz);
  deck.castShadow = true;
  scene.add(deck);
  const deckBody = fixed();
  deckBody.setTranslation({ x: bx, y: by, z: bz }, false);
  world.createCollider(RAPIER.ColliderDesc.cuboid(75, 0.6, 4), deckBody);

  const pillarGeo = new THREE.CylinderGeometry(1.2, 1.4, 1, 8);
  const pillarMat = new THREE.MeshLambertMaterial({ color: 0x6e5d47 });
  for (const px of [-50, 0, 50]) {
    const ground = terrainHeight(px, bz);
    const height = Math.max(2, by - ground);
    const p = new THREE.Mesh(pillarGeo, pillarMat);
    p.scale.y = height;
    p.position.set(px, ground + height / 2, bz);
    scene.add(p);
    const pb = fixed();
    pb.setTranslation({ x: px, y: ground + height / 2, z: bz }, false);
    world.createCollider(RAPIER.ColliderDesc.cylinder(height / 2, 1.3), pb);
  }
}
