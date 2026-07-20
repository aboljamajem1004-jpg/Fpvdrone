import { clamp, type InputState } from './inputState';

// Keyboard + mouse backend.
//  W/S      → throttle up/down
//  Mouse    → pitch / yaw (Pointer Lock)
//  A/D      → roll
//  R        → reset, ESC → menu (handled by browser exiting pointer lock)
//  C        → toggle chase cam
export class KeyboardMouseInput {
  private keys = new Set<string>();
  private mousePitch = 0; // accumulated, decays toward 0? no — direct stick emulation
  private mouseYaw = 0;
  private throttle = 0;
  sensitivity = 1;
  enabled = false;
  /** hover-assist mode: throttle springs back to center (hold altitude) */
  hoverMode = false;

  private canvas: HTMLCanvasElement;
  private onKeyDown = (e: KeyboardEvent) => {
    if (!this.enabled) return;
    this.keys.add(e.code);
    if (e.code === 'KeyR') this.resetFlag = true;
    if (e.code === 'KeyC') this.camFlag = true;
    if (e.code === 'Escape') this.menuFlag = true;
  };
  private onKeyUp = (e: KeyboardEvent) => this.keys.delete(e.code);
  private onMouseMove = (e: MouseEvent) => {
    if (!this.enabled || document.pointerLockElement !== this.canvas) return;
    const k = 0.0022 * this.sensitivity;
    this.mouseYaw = clamp(this.mouseYaw + e.movementX * k, -1, 1);
    this.mousePitch = clamp(this.mousePitch + e.movementY * k, -1, 1);
  };
  private onPointerLockChange = () => {
    if (document.pointerLockElement !== this.canvas && this.enabled) {
      // user pressed ESC → surface as menu request
      this.menuFlag = true;
    }
  };

  private resetFlag = false;
  private menuFlag = false;
  private camFlag = false;

  constructor(canvas: HTMLCanvasElement) {
    this.canvas = canvas;
    window.addEventListener('keydown', this.onKeyDown);
    window.addEventListener('keyup', this.onKeyUp);
    window.addEventListener('mousemove', this.onMouseMove);
    document.addEventListener('pointerlockchange', this.onPointerLockChange);
  }

  activate(): void {
    this.enabled = true;
    this.keys.clear();
    this.mousePitch = 0;
    this.mouseYaw = 0;
    this.canvas.requestPointerLock?.();
  }

  deactivate(): void {
    this.enabled = false;
    this.keys.clear();
    if (document.pointerLockElement === this.canvas) document.exitPointerLock();
  }

  /** Mouse sticks re-center over time so releasing the mouse levels out. */
  update(out: InputState, dt: number): void {
    if (!this.enabled) return;

    const throttleRate = 1.4; // full range in ~0.7 s
    const w = this.keys.has('KeyW');
    const s = this.keys.has('KeyS');
    if (w) this.throttle += throttleRate * dt;
    if (s) this.throttle -= throttleRate * dt;
    if (this.hoverMode && !w && !s) {
      // spring back to center = hold altitude
      this.throttle += (0.5 - this.throttle) * Math.min(1, 6 * dt);
    }
    this.throttle = clamp(this.throttle, 0, 1);

    // mouse "stick" springs back toward center
    const recenter = Math.exp(-6 * dt);
    this.mousePitch *= recenter;
    this.mouseYaw *= recenter;

    let roll = 0;
    if (this.keys.has('KeyA')) roll -= 1;
    if (this.keys.has('KeyD')) roll += 1;

    out.throttle = this.throttle;
    out.pitch = -this.mousePitch; // mouse up (negative movementY) = nose down/forward
    out.yaw = this.mouseYaw;
    out.roll = roll;

    if (this.resetFlag) {
      out.resetRequested = true;
      this.resetFlag = false;
    }
    if (this.menuFlag) {
      out.menuRequested = true;
      this.menuFlag = false;
    }
    if (this.camFlag) {
      out.toggleCamRequested = true;
      this.camFlag = false;
    }
  }

  resetThrottle(): void {
    this.throttle = this.hoverMode ? 0.5 : 0;
    this.mousePitch = 0;
    this.mouseYaw = 0;
  }
}
