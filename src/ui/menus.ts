import type { Settings } from '../config/physics';
import { formatTime } from '../modes/race';
import { STR } from './strings';

export interface MenuCallbacks {
  onPlayFree(): void;
  onPlayRace(): void;
  onResume(): void;
  onRestart(): void;
  onMainMenu(): void;
  onSettingsChanged(s: Settings): void;
}

type Screen = 'main' | 'pause' | 'settings' | 'finish' | 'none';

export class Menus {
  private root = document.getElementById('menu-root')!;
  private settingsBackTo: Screen = 'main';
  private helpText = '';

  constructor(
    private settings: Settings,
    private cb: MenuCallbacks,
  ) {}

  setHelpText(t: string): void {
    this.helpText = t;
  }

  hide(): void {
    this.root.innerHTML = '';
    this.root.classList.add('hidden');
  }

  private screen(...children: HTMLElement[]): void {
    this.root.classList.remove('hidden');
    this.root.innerHTML = '';
    const div = document.createElement('div');
    div.className = 'menu-screen';
    for (const c of children) div.appendChild(c);
    this.root.appendChild(div);
  }

  private el(tag: string, cls: string, text?: string): HTMLElement {
    const e = document.createElement(tag);
    e.className = cls;
    if (text) e.textContent = text;
    return e;
  }

  private btn(text: string, cls: string, onClick: () => void): HTMLButtonElement {
    const b = document.createElement('button');
    b.className = `menu-btn ${cls}`;
    b.textContent = text;
    b.addEventListener('click', onClick);
    return b;
  }

  showMain(): void {
    this.screen(
      this.el('div', 'menu-title', STR.title),
      this.el('div', 'menu-sub', STR.subtitle),
      this.btn(STR.freeFlight, 'primary', () => this.cb.onPlayFree()),
      this.btn(STR.race, 'primary', () => this.cb.onPlayRace()),
      this.btn(STR.settings, '', () => this.showSettings('main')),
      this.el('div', 'help-text', this.helpText),
    );
  }

  showPause(): void {
    this.screen(
      this.el('div', 'menu-title', STR.paused),
      this.btn(STR.resume, 'primary', () => this.cb.onResume()),
      this.btn(STR.restart, '', () => this.cb.onRestart()),
      this.btn(STR.settings, '', () => this.showSettings('pause')),
      this.btn(STR.mainMenu, '', () => this.cb.onMainMenu()),
    );
  }

  showFinish(time: number, best: number | null, isNewBest: boolean): void {
    const bestLine = isNewBest
      ? STR.newBest
      : best !== null
        ? `${STR.best}: ${formatTime(best)}`
        : '';
    this.screen(
      this.el('div', 'menu-title', STR.raceFinished),
      this.el('div', 'finish-time', formatTime(time)),
      this.el('div', 'finish-best', bestLine),
      this.btn(STR.retry, 'primary', () => this.cb.onRestart()),
      this.btn(STR.mainMenu, '', () => this.cb.onMainMenu()),
    );
  }

  showSettings(backTo: Screen): void {
    this.settingsBackTo = backTo;
    const s = this.settings;

    const rows: HTMLElement[] = [
      this.el('div', 'menu-title', STR.settings),
      this.selectRow(STR.flightMode, [
        ['angle', STR.angle],
        ['acro', STR.acro],
      ], s.flightMode, (v) => (s.flightMode = v as Settings['flightMode'])),
      this.sliderRow(STR.sensitivity, 0.2, 3, 0.1, s.mouseSensitivity, (v) => (s.mouseSensitivity = v)),
      this.sliderRow(STR.fov, 90, 120, 1, s.fov, (v) => (s.fov = v)),
      this.sliderRow(STR.cameraTilt, 10, 45, 1, s.cameraTiltDeg, (v) => (s.cameraTiltDeg = v)),
      this.selectRow(STR.quality, [
        ['low', STR.qLow],
        ['medium', STR.qMedium],
        ['high', STR.qHigh],
      ], s.quality, (v) => (s.quality = v as Settings['quality'])),
      this.sliderRow(STR.volume, 0, 1, 0.05, s.volume, (v) => (s.volume = v)),
      this.selectRow(STR.controlScheme, [
        ['auto', STR.cAuto],
        ['desktop', STR.cDesktop],
        ['touch', STR.cTouch],
      ], s.controls, (v) => (s.controls = v as Settings['controls'])),
      this.btn(STR.back, 'primary', () => {
        this.cb.onSettingsChanged(this.settings);
        if (this.settingsBackTo === 'main') this.showMain();
        else if (this.settingsBackTo === 'pause') this.showPause();
        else this.hide();
      }),
    ];
    this.screen(...rows);
  }

  private sliderRow(
    label: string,
    min: number,
    max: number,
    step: number,
    value: number,
    onChange: (v: number) => void,
  ): HTMLElement {
    const row = this.el('div', 'setting-row');
    const lab = this.el('label', '', label);
    const input = document.createElement('input');
    input.type = 'range';
    input.min = String(min);
    input.max = String(max);
    input.step = String(step);
    input.value = String(value);
    const val = this.el('span', 'setting-value', this.fmtVal(value, step));
    input.addEventListener('input', () => {
      const v = Number(input.value);
      onChange(v);
      val.textContent = this.fmtVal(v, step);
      this.cb.onSettingsChanged(this.settings);
    });
    row.append(lab, input, val);
    return row;
  }

  private fmtVal(v: number, step: number): string {
    return step < 1 ? v.toFixed(step < 0.1 ? 2 : 1) : String(Math.round(v));
  }

  private selectRow(
    label: string,
    options: [string, string][],
    value: string,
    onChange: (v: string) => void,
  ): HTMLElement {
    const row = this.el('div', 'setting-row');
    const lab = this.el('label', '', label);
    const sel = document.createElement('select');
    for (const [val, text] of options) {
      const o = document.createElement('option');
      o.value = val;
      o.textContent = text;
      if (val === value) o.selected = true;
      sel.appendChild(o);
    }
    sel.addEventListener('change', () => {
      onChange(sel.value);
      this.cb.onSettingsChanged(this.settings);
    });
    row.append(lab, sel);
    return row;
  }
}
