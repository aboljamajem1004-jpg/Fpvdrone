import RAPIER from '@dimforge/rapier3d-compat';
import { PHYSICS } from '../config/physics';

export type Rapier = typeof RAPIER;

export interface Physics {
  RAPIER: Rapier;
  world: RAPIER.World;
  eventQueue: RAPIER.EventQueue;
}

export async function createPhysics(): Promise<Physics> {
  await RAPIER.init();
  const world = new RAPIER.World({ x: 0, y: PHYSICS.gravity, z: 0 });
  world.timestep = PHYSICS.fixedDt;
  const eventQueue = new RAPIER.EventQueue(true);
  return { RAPIER, world, eventQueue };
}
