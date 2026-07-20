import { clamp, type InputState } from './inputState';

interface Stick {
  pointerId: number | null;
  originX: number;
  originY: number;
  dx: number; // -1..1
  dy: number; // -1..1
  base: HTMLDivElement;
  knob: HTMLDivElement;
}

const STICK_RADIUS = 60; // px of travel for full deflection

// Floating dual virtual sticks:
//  left half  → throttle (vertical, sticky) + yaw (horizontal, springs back)
//  right half → pitch (vertical) + roll (horizontal), both spring back
export class TouchSticksInput {
  private layer: HTMLDivElement;
  private left: Stick;
  private right: Stick;
  private throttle = 0;
  enabled = false;
  /** hover-assist mode: left stick vertical maps directly (center = hold) */
  hoverMode = false;

  constructor(layer: HTMLDivElement) {
    this.layer = layer;
    this.left = this.makeStick();
    this.right = this.makeStick();

    layer.addEventListener('touchstart', this.onTouchStart, { passive: false });
    layer.addEventListener('touchmove', this.onTouchMove, { passive: false });
    layer.addEventListener('touchend', this.onTouchEnd, { passive: false });
    layer.addEventListener('touchcancel', this.onTouchEnd, { passive: false });
  }

  private makeStick(): Stick {
    const base = document.createElement('div');
    base.className = 'stick-base hidden';
    const knob = document.createElement('div');
    knob.className = 'stick-knob';
    base.appendChild(knob);
    this.layer.appendChild(base);
    return { pointerId: null, originX: 0, originY: 0, dx: 0, dy: 0, base, knob };
  }

  activate(): void {
    this.enabled = true;
    this.layer.classList.remove('hidden');
  }

  deactivate(): void {
    this.enabled = false;
    this.layer.classList.add('hidden');
    this.releaseStick(this.left);
    this.releaseStick(this.right);
  }

  private onTouchStart = (e: TouchEvent) => {
    if (!this.enabled) return;
    e.preventDefault();
    for (const t of Array.from(e.changedTouches)) {
      const isLeft = t.clientX < window.innerWidth / 2;
      const stick = isLeft ? this.left : this.right;
      if (stick.pointerId !== null) continue; // that half already has a finger
      stick.pointerId = t.identifier;
      stick.originX = t.clientX;
      stick.originY = t.clientY;
      stick.dx = 0;
      stick.dy = 0;
      stick.base.style.left = `${t.clientX}px`;
      stick.base.style.top = `${t.clientY}px`;
      stick.base.classList.remove('hidden');
      stick.knob.style.transform = 'translate(-50%, -50%)';
    }
  };

  private onTouchMove = (e: TouchEvent) => {
    if (!this.enabled) return;
    e.preventDefault();
    for (const t of Array.from(e.changedTouches)) {
      const stick =
        this.left.pointerId === t.identifier
          ? this.left
          : this.right.pointerId === t.identifier
            ? this.right
            : null;
      if (!stick) continue;
      const dx = t.clientX - stick.originX;
      const dy = t.clientY - stick.originY;
      stick.dx = clamp(dx / STICK_RADIUS, -1, 1);
      stick.dy = clamp(dy / STICK_RADIUS, -1, 1);
      const px = stick.dx * STICK_RADIUS;
      const py = stick.dy * STICK_RADIUS;
      stick.knob.style.transform = `translate(calc(-50% + ${px}px), calc(-50% + ${py}px))`;
    }
  };

  private onTouchEnd = (e: TouchEvent) => {
    if (!this.enabled) return;
    e.preventDefault();
    for (const t of Array.from(e.changedTouches)) {
      if (this.left.pointerId === t.identifier) this.releaseStick(this.left);
      if (this.right.pointerId === t.identifier) this.releaseStick(this.right);
    }
  };

  private releaseStick(s: Stick): void {
    s.pointerId = null;
    s.dx = 0;
    s.dy = 0;
    s.base.classList.add('hidden');
  }

  update(out: InputState, dt: number): void {
    if (!this.enabled) return;

    if (this.hoverMode) {
      // direct mapping: finger up = climb, down = descend, released = hold
      out.throttle =
        this.left.pointerId !== null ? clamp(0.5 - this.left.dy * 0.55, 0, 1) : 0.5;
    } else {
      // acro: left stick vertical drives throttle as a rate (push up =
      // spool up), so throttle holds its value when the finger lifts.
      if (this.left.pointerId !== null) {
        this.throttle = clamp(this.throttle + -this.left.dy * 1.6 * dt, 0, 1);
      }
      out.throttle = this.throttle;
    }
    out.yaw = this.left.pointerId !== null ? this.left.dx : 0;
    out.pitch = this.right.pointerId !== null ? -this.right.dy : 0; // push up = forward
    out.roll = this.right.pointerId !== null ? this.right.dx : 0;
  }

  resetThrottle(): void {
    this.throttle = 0;
  }
}
