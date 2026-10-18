// 壳层毛发（Shell Fur）：基础网格 + 多层沿法线外扩的实例化壳，片元中按毛囊哈希裁剪出锥形发丝
// 每个部件只需 2 次 draw call（基础网格 + 1 次实例化绘制全部壳层）
import * as THREE from 'three';

export function makeFur({ root = 0x1e1712, tip = 0x7a6852, length = 0.018, shells = 16, gravity = 0.55, roughness = 0.88 } = {}) {
  const uniforms = {
    uLength: { value: length },
    uShells: { value: shells },
    uGravity: { value: gravity },
    uRoot: { value: new THREE.Color(root) },
    uTip: { value: new THREE.Color(tip) },
    uWind: { value: new THREE.Vector3() },
  };
  const shellMat = new THREE.MeshStandardMaterial({
    roughness, metalness: 0, alphaToCoverage: true, color: 0xffffff,
  });
  shellMat.onBeforeCompile = (sh) => {
    Object.assign(sh.uniforms, uniforms);
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', `#include <common>
        uniform float uLength; uniform float uShells; uniform float uGravity; uniform vec3 uWind;
        attribute float aFur; attribute vec2 aFurUv;
        varying vec2 vFurUv; varying float vFurH; varying float vFurAmt;`)
      .replace('#include <begin_vertex>', `#include <begin_vertex>
        float furH = (float(gl_InstanceID) + 1.0) / uShells;
        vFurH = furH; vFurUv = aFurUv; vFurAmt = aFur;
        mat3 invR = transpose(mat3(modelMatrix));
        vec3 gdir = normalize(invR * vec3(0.0, -1.0, 0.0));
        vec3 wdir = invR * uWind;
        float L = uLength * aFur;
        vec3 Nf = normalize(objectNormal);
        vec3 gv = gdir * uGravity + wdir;
        vec3 gt = gv - Nf * dot(gv, Nf) * 0.75;
        transformed += Nf * furH * L * 0.8 + gt * pow(furH, 1.5) * L * 1.35;`);
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', `#include <common>
        uniform vec3 uRoot; uniform vec3 uTip;
        varying vec2 vFurUv; varying float vFurH; varying float vFurAmt;
        float furHash(vec2 p) { p = fract(p * vec2(123.34, 456.21)); p += dot(p, p + 45.32); return fract(p.x * p.y); }`)
      .replace('#include <color_fragment>', `#include <color_fragment>
        {
          vec2 cell = floor(vFurUv);
          vec2 f = fract(vFurUv) - 0.5;
          float r1 = furHash(cell);
          vec2 jit = vec2(furHash(cell + 11.3), furHash(cell + 27.1)) - 0.5;
          f -= jit * 0.4;
          float len = mix(0.55, 1.0, r1);
          float t = vFurH / len;
          if (vFurAmt < 0.06 || t > 1.0) discard;
          float rad = 0.8 * (1.0 - pow(t, 1.35));
          float a = 1.0 - smoothstep(rad * 0.3, rad, length(f));
          if (a < 0.05) discard;
          diffuseColor.a = a;
          float r2 = furHash(cell + 3.1);
          vec3 fc = mix(uRoot, uTip, smoothstep(0.05, 1.0, t));
          fc *= mix(0.55, 1.0, pow(vFurH, 0.8)) * (0.85 + 0.25 * r2);
          fc *= r2 > 0.93 ? 1.25 : 1.0;
          diffuseColor.rgb = fc;
        }`);
  };
  shellMat.customProgramCacheKey = () => 'shellfur-v1';
  const baseMat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.95, metalness: 0, vertexColors: true });
  return { shellMat, baseMat, uniforms, shells };
}

// 生成毛发网格组：基础网格 + 实例化壳层
export function furMesh(geo, fur, { baseMat } = {}) {
  const g = new THREE.Group();
  const base = new THREE.Mesh(geo, baseMat || fur.baseMat);
  base.castShadow = true; base.receiveShadow = true;
  base.userData.ghost = true;
  const shells = new THREE.InstancedMesh(geo, fur.shellMat, fur.shells);
  shells.frustumCulled = false;
  shells.receiveShadow = true;
  shells.castShadow = false;
  g.add(base, shells);
  g.userData.base = base;
  return g;
}
