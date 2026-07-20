// Normalized control inputs shared by every input backend.
// pitch/roll/yaw ∈ [-1, 1], throttle ∈ [0, 1].
// Convention: pitch +1 = nose down (forward), roll +1 = right, yaw +1 = right.
export interface InputState {
  throttle: number;
  pitch: number;
  roll: number;
  yaw: number;
  resetRequested: boolean;
  menuRequested: boolean;
  toggleCamRequested: boolean;
}

export function createInputState(): InputState {
  return {
    throttle: 0,
    pitch: 0,
    roll: 0,
    yaw: 0,
    resetRequested: false,
    menuRequested: false,
    toggleCamRequested: false,
  };
}

export function clamp(v: number, min: number, max: number): number {
  return v < min ? min : v > max ? max : v;
}

// expo curve: keeps center soft, ends full. e ∈ [0,1]
export function applyExpo(x: number, e: number): number {
  return x * (1 - e) + x * x * x * e;
}
