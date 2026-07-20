import * as THREE from 'three';
import { PHYSICS, type Settings } from './config/physics';
import { createPhysics, type Physics } from './core/physicsWorld';
import { createRenderer, type RenderContext } from './core/renderer';
import { loadSettings, saveSettings } from './core/settingsStore';
import { AudioEngine } from './audio/engine';
import { Drone } from './drone/drone';
import { FlightController } from './drone/flightController';
import { CameraRig } from './drone/cameraRig';
import { createInputState } from './input/inputState';
import { KeyboardMouseInput } from './input/keyboardMouse';
import { TouchSticksInput } from './input/touchSticks';
import { resolveControlScheme } from './input/detect';
import { createTerrain, terrainHeight } from './world/terrain';
import { createSky } from './world/sky';
import { createProps } from './world/props';
import { RaceMode } from './modes/race';
import { Hud } from './ui/hud';
import { Menus } from './ui/menus';
import { STR } from './ui/strings';

type GameState = 'menu' | 'flying' | 'paused' | 'finished';
type GameMode = 'free' | 'race';

const FREE_SPAWN = new THREE.Vector3(0, terrainHeight(0, 0) + 1, 0);

class Game {
  state: GameState = 'menu';
  mode: GameMode = 'free';

  private settings: Settings = loadSettings();
  private input = createInputState();
  private accumulator = 0;
  private lastTime = performance.now();
  private crashTimer = -1;
  private graceTimer = 0; // ignore impacts briefly after every spawn
  private statsVisible = false;
  private fpsFrames = 0;
  private fpsTime = 0;
  private prevBest: number | null = null;

  private kb: KeyboardMouseInput;
  private touch: TouchSticksInput;
  private scheme: 'desktop' | 'touch' = 'desktop';

  private rig: CameraRig;
  private controller: FlightController;
  private drone: Drone;
  private race: RaceMode;
  private hud = new Hud();
  private menus: Menus;
  private audio = new AudioEngine();
  private statsEl = document.getElementById('stats')!;

  constructor(
    private rc: RenderContext,
    private physics: Physics,
  ) {
    createSky(rc.scene);
    createTerrain(rc.scene, physics);
    createProps(rc.scene, physics);

    this.drone = new Drone(physics, rc.scene);
    this.controller = new FlightController(this.drone);
    this.rig = new CameraRig(rc.camera);
    this.race = new RaceMode(rc.scene);

    const canvas = rc.renderer.domElement;
    this.kb = new KeyboardMouseInput(canvas);
    this.touch = new TouchSticksInput(document.getElementById('touch-layer') as HTMLDivElement);

    this.menus = new Menus(this.settings, {
      onPlayFree: () => this.startGame('free'),
      onPlayRace: () => this.startGame('race'),
      onResume: () => this.resume(),
      onRestart: () => this.startGame(this.mode),
      onMainMenu: () => this.toMenu(),
      onSettingsChanged: (s) => this.applySettings(s),
    });

    this.hud.onReset = () => this.respawn(true);
    this.hud.onMenu = () => this.pause();

    // unlock audio on first interaction (mobile autoplay rules)
    const unlock = () => this.audio.unlock();
    window.addEventListener('pointerdown', unlock, { once: true });
    window.addEventListener('touchstart', unlock, { once: true });
    window.addEventListener('keydown', (e) => {
      if (e.code === 'KeyF') {
        this.statsVisible = !this.statsVisible;
        this.statsEl.classList.toggle('hidden', !this.statsVisible);
      }
    });

    window.addEventListener('resize', () => this.checkOrientation());
    window.addEventListener('orientationchange', () => this.checkOrientation());

    this.applySettings(this.settings);
    this.toMenu();
    this.drone.teleport(FREE_SPAWN, 0);

    requestAnimationFrame(this.frame);
  }

  private applySettings(s: Settings): void {
    this.settings = s;
    saveSettings(s);
    this.rc.applyQuality(s.quality);
    this.audio.setVolume(s.volume);
    this.kb.sensitivity = s.mouseSensitivity;
    const hover = s.flightMode === 'angle';
    this.kb.hoverMode = hover;
    this.touch.hoverMode = hover;
    this.scheme = resolveControlScheme(s);
    this.menus.setHelpText(this.scheme === 'touch' ? STR.helpTouch : STR.helpDesktop);
    this.checkOrientation();
  }

  private checkOrientation(): void {
    const overlay = document.getElementById('rotate-overlay')!;
    const portrait = window.innerHeight > window.innerWidth;
    const needLandscape = this.scheme === 'touch' && this.state === 'flying';
    overlay.classList.toggle('hidden', !(needLandscape && portrait));
  }

  private startGame(mode: GameMode): void {
    this.mode = mode;
    this.audio.unlock();

    if (mode === 'race') {
      this.race.start();
      this.prevBest = this.race.bestTime;
      const { pos, yaw } = this.race.spawn();
      this.drone.teleport(pos, yaw);
    } else {
      this.race.stop();
      this.drone.teleport(FREE_SPAWN, 0);
    }

    this.kb.resetThrottle();
    this.touch.resetThrottle();
    this.controller.reset();
    this.crashTimer = -1;
    this.graceTimer = 1.5;
    this.menus.hide();
    this.hud.show(this.scheme === 'touch');
    this.hud.setRaceVisible(mode === 'race');
    if (this.scheme === 'desktop') this.kb.activate();
    else this.touch.activate();
    this.state = 'flying';
    this.checkOrientation();
    this.hud.flash(STR.go, 1, '#37ff8b');
  }

  private pause(): void {
    if (this.state !== 'flying') return;
    this.state = 'paused';
    this.kb.deactivate();
    this.touch.deactivate();
    this.hud.hide();
    this.menus.showPause();
    this.checkOrientation();
  }

  private resume(): void {
    this.menus.hide();
    this.hud.show(this.scheme === 'touch');
    if (this.scheme === 'desktop') this.kb.activate();
    else this.touch.activate();
    this.state = 'flying';
    this.lastTime = performance.now();
    this.checkOrientation();
  }

  private toMenu(): void {
    this.state = 'menu';
    this.kb.deactivate();
    this.touch.deactivate();
    this.race.stop();
    this.hud.hide();
    this.menus.showMain();
    this.checkOrientation();
  }

  private finishRace(): void {
    this.state = 'finished';
    this.kb.deactivate();
    this.touch.deactivate();
    this.hud.hide();
    this.audio.finish();
    const isNewBest = this.prevBest === null || this.race.time < this.prevBest;
    this.menus.showFinish(this.race.time, this.race.bestTime, isNewBest);
  }

  private respawn(manual = false): void {
    const cp =
      this.mode === 'race'
        ? this.race.checkpoint()
        : { pos: FREE_SPAWN.clone(), yaw: 0 };
    this.drone.teleport(cp.pos, cp.yaw);
    this.kb.resetThrottle();
    this.touch.resetThrottle();
    this.controller.reset();
    this.crashTimer = -1;
    this.graceTimer = 1.5;
    if (!manual) this.rig.kickShake(0.3);
  }

  private crash(): void {
    if (this.crashTimer >= 0 || this.graceTimer > 0) return;
    this.crashTimer = PHYSICS.drone.respawnDelay;
    this.rig.kickShake(1);
    this.audio.crash();
    this.hud.flash(STR.crashed, 1, '#ff5533');
  }

  private stepPhysics(): void {
    this.controller.update(this.input, this.settings);
    this.physics.world.step(this.physics.eventQueue);
    this.drone.body.resetForces(false);
    this.drone.body.resetTorques(false);

    // crash on hard contacts
    const droneHandle = this.drone.collider.handle;
    this.physics.eventQueue.drainContactForceEvents((e) => {
      if (e.collider1() === droneHandle || e.collider2() === droneHandle) {
        if (e.totalForceMagnitude() > PHYSICS.drone.crashForce) this.crash();
      }
    });

    this.drone.snapshot();

    // out-of-bounds guard
    const p = this.drone.body.translation();
    if (
      Math.hypot(p.x, p.z) > PHYSICS.world.boundsRadius ||
      p.y < PHYSICS.world.minY ||
      p.y > 500
    ) {
      this.respawn();
    }
  }

  private frame = (now: number): void => {
    requestAnimationFrame(this.frame);
    const dtRaw = (now - this.lastTime) / 1000;
    this.lastTime = now;
    const dt = Math.min(dtRaw, 0.1); // clamp tab-switch spikes

    // fps counter
    this.fpsFrames++;
    this.fpsTime += dtRaw;
    if (this.fpsTime >= 0.5 && this.statsVisible) {
      this.statsEl.textContent = `${Math.round(this.fpsFrames / this.fpsTime)} FPS`;
      this.fpsFrames = 0;
      this.fpsTime = 0;
    } else if (this.fpsTime >= 0.5) {
      this.fpsFrames = 0;
      this.fpsTime = 0;
    }

    if (this.state === 'flying') {
      // gather input
      this.input.resetRequested = false;
      this.input.menuRequested = false;
      this.input.toggleCamRequested = false;
      if (this.scheme === 'desktop') this.kb.update(this.input, dt);
      else this.touch.update(this.input, dt);

      if (this.input.menuRequested) {
        this.pause();
        return;
      }
      if (this.input.resetRequested) this.respawn(true);
      if (this.input.toggleCamRequested) this.rig.toggle();

      if (this.graceTimer > 0) this.graceTimer -= dt;

      // crashed drones tumble with zero input until respawn
      const crashed = this.crashTimer >= 0;
      if (crashed) {
        this.crashTimer -= dt;
        this.input.throttle = 0; // hover assist reads this as full-descend
        this.input.pitch = 0;
        this.input.roll = 0;
        this.input.yaw = 0;
        if (this.crashTimer < 0) this.respawn();
      }

      // fixed-step physics with accumulator
      this.accumulator += dt;
      const step = PHYSICS.fixedDt;
      let steps = 0;
      while (this.accumulator >= step && steps < 5) {
        this.stepPhysics();
        this.accumulator -= step;
        steps++;
      }
      if (steps === 5) this.accumulator = 0;

      const alpha = this.accumulator / step;
      // motors are cut while resting on the ground (hover-assist landing)
      const effThrottle = this.controller.landed ? 0 : this.input.throttle;
      this.drone.interpolate(alpha, effThrottle, dt);
      this.rig.update(this.drone, this.settings, effThrottle, dt);
      // own airframe is invisible from the FPV camera (it sits inside it)
      this.drone.mesh.visible = this.rig.mode === 'chase';

      // HUD
      const pos = this.drone.renderPos;
      const ground = terrainHeight(pos.x, pos.z);
      this.hud.update(this.input.throttle, this.drone.speed(), Math.max(0, pos.y - ground));

      // race logic
      if (this.mode === 'race' && !this.race.finished) {
        const result = this.race.update(pos, dt);
        if (result === 'gate') {
          this.audio.gate();
          this.hud.flash(`${STR.gate} ${this.race.current}/${this.race.gates.length}`, 0.8, '#37ff8b');
        } else if (result === 'finish') {
          this.finishRace();
        }
        this.hud.updateRace(
          this.race.time,
          this.race.current,
          this.race.gates.length,
          this.race.bestTime,
        );
      }

      this.audio.update(effThrottle, this.drone.speed(), !crashed);
    } else {
      // menu background: slow orbit around the world
      const t = now * 0.00005;
      const r = 260;
      this.rc.camera.position.set(Math.cos(t) * r, 90, Math.sin(t) * r);
      this.rc.camera.lookAt(0, 0, 0);
      this.rig.setPropsVisible(false);
      this.audio.update(0, 0, false);
    }

    this.rc.renderer.render(this.rc.scene, this.rc.camera);
  };
}

async function boot(): Promise<void> {
  const canvas = document.getElementById('game-canvas') as HTMLCanvasElement;
  const rc = createRenderer(canvas);
  const physics = await createPhysics();
  new Game(rc, physics);
}

void boot();
