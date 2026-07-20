import { formatTime } from '../modes/race';
import { STR } from './strings';

export class Hud {
  private root = document.getElementById('hud')!;
  private throttleFill = document.getElementById('throttle-fill')!;
  private speedEl = document.getElementById('hud-speed')!;
  private altEl = document.getElementById('hud-alt')!;
  private raceEl = document.getElementById('hud-race')!;
  private raceTimeEl = document.getElementById('race-time')!;
  private raceGateEl = document.getElementById('race-gate')!;
  private raceBestEl = document.getElementById('race-best')!;
  private msgEl = document.getElementById('hud-msg')!;
  private osdEl = document.getElementById('osd')!;
  private btnReset = document.getElementById('btn-reset') as HTMLButtonElement;
  private btnMenu = document.getElementById('btn-menu') as HTMLButtonElement;
  private msgTimer = 0;

  onReset: (() => void) | null = null;
  onMenu: (() => void) | null = null;

  constructor() {
    this.btnReset.addEventListener('click', () => this.onReset?.());
    this.btnMenu.addEventListener('click', () => this.onMenu?.());
  }

  show(touchMode: boolean): void {
    this.root.classList.remove('hidden');
    this.btnReset.classList.toggle('hidden', !touchMode);
    this.btnMenu.classList.toggle('hidden', !touchMode);
  }

  hide(): void {
    this.root.classList.add('hidden');
  }

  setRaceVisible(v: boolean): void {
    this.raceEl.classList.toggle('hidden', !v);
  }

  setOsdVisible(v: boolean): void {
    this.osdEl.classList.toggle('hidden', !v);
  }

  update(throttle: number, speedMs: number, altitude: number): void {
    this.throttleFill.style.height = `${(throttle * 100).toFixed(0)}%`;
    this.speedEl.textContent = `${(speedMs * 3.6).toFixed(0)} km/h`;
    this.altEl.textContent = `${altitude.toFixed(0)} m`;
    if (this.msgTimer > 0) {
      this.msgTimer -= 1 / 60;
      if (this.msgTimer <= 0) this.msgEl.style.opacity = '0';
    }
  }

  updateRace(time: number, gate: number, total: number, best: number | null): void {
    this.raceTimeEl.textContent = formatTime(time);
    this.raceGateEl.textContent = `${STR.gate} ${Math.min(gate + 1, total)}/${total}`;
    this.raceBestEl.textContent = best !== null ? `${STR.best}: ${formatTime(best)}` : '';
  }

  flash(text: string, seconds = 1.4, color = '#e8eef5'): void {
    this.msgEl.textContent = text;
    this.msgEl.style.color = color;
    this.msgEl.style.opacity = '1';
    this.msgTimer = seconds;
  }
}
