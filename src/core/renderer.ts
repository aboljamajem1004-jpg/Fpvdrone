import * as THREE from 'three';
import type { Quality } from '../config/physics';

export interface RenderContext {
  renderer: THREE.WebGLRenderer;
  scene: THREE.Scene;
  camera: THREE.PerspectiveCamera;
  sun: THREE.DirectionalLight;
  applyQuality(q: Quality): void;
}

export function createRenderer(canvas: HTMLCanvasElement): RenderContext {
  const renderer = new THREE.WebGLRenderer({
    canvas,
    antialias: true,
    powerPreference: 'high-performance',
  });
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;

  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x87b5e0);
  scene.fog = new THREE.Fog(0x9cc0e0, 150, 700);

  const camera = new THREE.PerspectiveCamera(105, 1, 0.05, 1200);

  const sun = new THREE.DirectionalLight(0xfff2df, 2.6);
  sun.position.set(180, 260, 120);
  scene.add(sun);
  scene.add(new THREE.AmbientLight(0xbfd4ea, 0.75));
  const hemi = new THREE.HemisphereLight(0xa8c8ea, 0x5a6b4a, 0.5);
  scene.add(hemi);

  const isMobileScreen = Math.min(screen.width, screen.height) < 900;

  function applyQuality(q: Quality): void {
    const cap = isMobileScreen ? 1.5 : 2;
    const ratio =
      q === 'low' ? 1 : q === 'medium' ? Math.min(devicePixelRatio, isMobileScreen ? 1.25 : 1.5) : Math.min(devicePixelRatio, cap);
    renderer.setPixelRatio(ratio);

    const shadows = q === 'high' && !isMobileScreen;
    renderer.shadowMap.enabled = shadows;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    sun.castShadow = shadows;
    if (shadows) {
      sun.shadow.mapSize.set(2048, 2048);
      sun.shadow.camera.left = -250;
      sun.shadow.camera.right = 250;
      sun.shadow.camera.top = 250;
      sun.shadow.camera.bottom = -250;
      sun.shadow.camera.far = 800;
      sun.shadow.bias = -0.0004;
    }
    resize();
  }

  function resize(): void {
    const w = window.innerWidth;
    const h = window.innerHeight;
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
  }
  window.addEventListener('resize', resize);
  resize();

  return { renderer, scene, camera, sun, applyQuality };
}
