import * as THREE from 'three';
import { terrainHeight } from '../world/terrain';
import { loadBestTime, saveBestTime } from '../core/settingsStore';

const RING_RADIUS = 3.2;

interface Gate {
  pos: THREE.Vector3;
  /** unit normal of the gate plane (direction of intended travel) */
  normal: THREE.Vector3;
  mesh: THREE.Mesh;
}

// Course: a loop of gates laid over the terrain. The next gate glows green
// with a floating arrow; passing is detected by crossing the gate plane
// within the ring radius.
export class RaceMode {
  gates: Gate[] = [];
  current = 0;
  time = 0;
  running = false;
  finished = false;
  bestTime: number | null = null;

  private group = new THREE.Group();
  private arrow: THREE.Mesh;
  private prevSide = 0;
  private matNext: THREE.MeshBasicMaterial;
  private matIdle: THREE.MeshBasicMaterial;
  private matDone: THREE.MeshBasicMaterial;

  constructor(scene: THREE.Scene) {
    this.matNext = new THREE.MeshBasicMaterial({ color: 0x37ff8b });
    this.matIdle = new THREE.MeshBasicMaterial({ color: 0x2a6cc8, transparent: true, opacity: 0.55 });
    this.matDone = new THREE.MeshBasicMaterial({ color: 0x555f6a, transparent: true, opacity: 0.3 });

    const layout = this.courseLayout();
    const ringGeo = new THREE.TorusGeometry(RING_RADIUS, 0.22, 10, 36);
    for (let i = 0; i < layout.length; i++) {
      const { pos } = layout[i];
      const nextPos = layout[(i + 1) % layout.length].pos;
      const prevPos = layout[(i - 1 + layout.length) % layout.length].pos;
      // orient the ring facing the average travel direction
      const dir = nextPos.clone().sub(prevPos);
      dir.y *= 0.3;
      dir.normalize();

      const mesh = new THREE.Mesh(ringGeo, this.matIdle);
      mesh.position.copy(pos);
      mesh.lookAt(pos.clone().add(dir));
      this.group.add(mesh);
      this.gates.push({ pos: pos.clone(), normal: dir.clone(), mesh });
    }
    scene.add(this.group);

    const arrowGeo = new THREE.ConeGeometry(0.7, 1.6, 6);
    this.arrow = new THREE.Mesh(arrowGeo, new THREE.MeshBasicMaterial({ color: 0x37ff8b }));
    this.arrow.rotation.x = Math.PI; // point down
    this.group.add(this.arrow);

    this.bestTime = loadBestTime();
    this.setVisible(false);
  }

  private courseLayout(): { pos: THREE.Vector3 }[] {
    // hand-tuned loop: down the valley, over the bridge area, around the hills
    const pts: [number, number, number][] = [
      // x, z, height above terrain
      [40, -40, 10],
      [90, -110, 12],
      [150, -60, 14],
      [170, 30, 12],
      [120, 110, 10],
      [40, 150, 12],
      [-60, 120, 10],
      [-140, 60, 14],
      [-160, -40, 12],
      [-110, -120, 10],
      [-30, -150, 12],
      [10, -90, 9],
    ];
    return pts.map(([x, z, h]) => ({
      pos: new THREE.Vector3(x, terrainHeight(x, z) + h, z),
    }));
  }

  setVisible(v: boolean): void {
    this.group.visible = v;
  }

  start(): void {
    this.current = 0;
    this.time = 0;
    this.running = true;
    this.finished = false;
    this.prevSide = 0;
    this.refreshMaterials();
    this.setVisible(true);
  }

  stop(): void {
    this.setVisible(false);
    this.running = false;
  }

  /** spawn point looking at the first gate */
  spawn(): { pos: THREE.Vector3; yaw: number } {
    const g0 = this.gates[0];
    const pos = g0.pos.clone().addScaledVector(g0.normal, -30);
    pos.y = terrainHeight(pos.x, pos.z) + 1; // start on the ground

    const yaw = Math.atan2(-(g0.pos.x - pos.x), -(g0.pos.z - pos.z));
    return { pos, yaw };
  }

  /** checkpoint to respawn at after a crash */
  checkpoint(): { pos: THREE.Vector3; yaw: number } {
    if (this.current === 0) return this.spawn();
    const prev = this.gates[this.current - 1];
    const next = this.gates[this.current % this.gates.length];
    const pos = prev.pos.clone().addScaledVector(prev.normal, 2);
    const yaw = Math.atan2(-(next.pos.x - pos.x), -(next.pos.z - pos.z));
    return { pos, yaw };
  }

  private refreshMaterials(): void {
    for (let i = 0; i < this.gates.length; i++) {
      this.gates[i].mesh.material =
        i < this.current ? this.matDone : i === this.current ? this.matNext : this.matIdle;
    }
  }

  /** returns 'gate' | 'finish' | null */
  update(dronePos: THREE.Vector3, dt: number): 'gate' | 'finish' | null {
    if (this.finished) return null;
    if (this.running) this.time += dt;

    const gate = this.gates[this.current];
    if (!gate) return null;

    // bob the arrow above the active gate
    this.arrow.position.set(
      gate.pos.x,
      gate.pos.y + RING_RADIUS + 1.6 + Math.sin(performance.now() * 0.004) * 0.35,
      gate.pos.z,
    );

    const rel = dronePos.clone().sub(gate.pos);
    const side = Math.sign(rel.dot(gate.normal));
    const distInPlane = rel.addScaledVector(gate.normal, -rel.dot(gate.normal)).length();
    const dist = dronePos.distanceTo(gate.pos);

    let result: 'gate' | 'finish' | null = null;
    if (
      this.prevSide < 0 &&
      side >= 0 &&
      distInPlane < RING_RADIUS + 0.5 &&
      dist < RING_RADIUS * 2.5
    ) {
      // crossed the plane inside the ring
      this.current++;
      if (this.current >= this.gates.length) {
        this.finished = true;
        this.running = false;
        if (this.bestTime === null || this.time < this.bestTime) {
          this.bestTime = this.time;
          saveBestTime(this.time);
        }
        result = 'finish';
      } else {
        result = 'gate';
      }
      this.refreshMaterials();
      this.prevSide = 0;
    } else {
      this.prevSide = dist < RING_RADIUS * 4 ? side : 0;
    }
    return result;
  }
}

export function formatTime(t: number): string {
  const m = Math.floor(t / 60);
  const s = t - m * 60;
  return `${m}:${s.toFixed(2).padStart(5, '0')}`;
}
