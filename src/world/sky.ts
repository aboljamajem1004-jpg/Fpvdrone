import * as THREE from 'three';

// Simple gradient dome — cheap and fog-friendly.
export function createSky(scene: THREE.Scene): void {
  const geo = new THREE.SphereGeometry(900, 24, 12);
  const mat = new THREE.ShaderMaterial({
    side: THREE.BackSide,
    depthWrite: false,
    fog: false,
    uniforms: {
      topColor: { value: new THREE.Color(0x3f7ac2) },
      horizonColor: { value: new THREE.Color(0xbcd8ee) },
    },
    vertexShader: /* glsl */ `
      varying vec3 vDir;
      void main() {
        vDir = normalize(position);
        vec4 mv = modelViewMatrix * vec4(position, 1.0);
        gl_Position = projectionMatrix * mv;
      }
    `,
    fragmentShader: /* glsl */ `
      uniform vec3 topColor;
      uniform vec3 horizonColor;
      varying vec3 vDir;
      void main() {
        float t = clamp(vDir.y * 1.6 + 0.15, 0.0, 1.0);
        gl_FragColor = vec4(mix(horizonColor, topColor, pow(t, 0.7)), 1.0);
      }
    `,
  });
  const dome = new THREE.Mesh(geo, mat);
  dome.frustumCulled = false;
  scene.add(dome);
}
