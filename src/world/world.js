// 场景：黄昏山中古寺庭院——天空、远山、石板庭院、禅院大殿（反宇飞檐）、石灯笼、香鼎、松林、草地、落叶、浮尘、体积光
import * as THREE from 'three';
import * as TX from '../core/textures.js';
import { Noise, rng } from '../core/noise.js';
import { taperTube, merge, smoothstep } from '../core/geo.js';
import { pbr } from '../characters/parts.js';

const NZ = new Noise(42);
export const SUN_DIR = new THREE.Vector3(-0.62, 0.36, -0.5).normalize();
export const ARENA_R = 16;

const skyVert = `varying vec3 vDir; void main(){ vDir = position; vec4 p = projectionMatrix * modelViewMatrix * vec4(position,1.0); gl_Position = p.xyww; }`;
const skyFrag = `
varying vec3 vDir; uniform vec3 uSun; uniform float uTime; uniform vec3 uFog;
float h21(vec2 p){ vec3 p3 = fract(vec3(p.xyx) * 0.1031); p3 += dot(p3, p3.yzx + 33.33); return fract((p3.x + p3.y) * p3.z); }
float n2(vec2 p){ vec2 i=floor(p), f=fract(p); f=f*f*(3.0-2.0*f);
  return mix(mix(h21(i),h21(i+vec2(1,0)),f.x), mix(h21(i+vec2(0,1)),h21(i+vec2(1,1)),f.x), f.y); }
float fbm(vec2 p){ float s=0.0,a=0.5; for(int i=0;i<6;i++){ s+=a*n2(p); p*=2.03; a*=0.5; } return s; }
void main(){
  vec3 d = normalize(vDir);
  float h = d.y;
  vec3 zen = vec3(0.10, 0.14, 0.22);
  vec3 hor = vec3(0.85, 0.58, 0.38);
  vec3 col = mix(hor, zen, pow(clamp(h, 0.0, 1.0), 0.45));
  float sd = max(dot(d, uSun), 0.0);
  col += vec3(1.0, 0.6, 0.3) * pow(sd, 6.0) * 0.6;
  col += vec3(1.0, 0.8, 0.55) * pow(sd, 60.0) * 1.5;
  col += vec3(1.0, 0.92, 0.8) * smoothstep(0.9992, 0.9996, sd) * 30.0;
  vec2 p = d.xz / (h + 0.18) * 0.9 + vec2(uTime * 0.003, uTime * 0.001);
  float c = fbm(p * 1.6);
  float cm = smoothstep(0.48, 0.82, c) * smoothstep(0.0, 0.3, h);
  vec3 cc = mix(vec3(0.22, 0.2, 0.24), vec3(1.0, 0.7, 0.45), pow(sd, 4.0) * 0.9 + 0.12 * c);
  col = mix(col, cc, cm * 0.75);
  col = mix(col, uFog, 1.0 - smoothstep(-0.05, 0.12, h));
  gl_FragColor = vec4(col, 1.0);
}`;

export function createSky(fogColor) {
  const mat = new THREE.ShaderMaterial({
    vertexShader: skyVert, fragmentShader: skyFrag, side: THREE.BackSide, depthWrite: false, fog: false,
    uniforms: { uSun: { value: SUN_DIR.clone() }, uTime: { value: 0 }, uFog: { value: fogColor.clone() } },
  });
  const m = new THREE.Mesh(new THREE.SphereGeometry(900, 48, 24), mat);
  m.frustumCulled = false;
  m.renderOrder = -10;
  return m;
}

function terrainHeight(x, z) {
  const r = Math.hypot(x, z);
  const t = smoothstep(ARENA_R + 3, ARENA_R + 40, r);
  return t * (NZ.fbm(x * 0.03 + 10, z * 0.03, 4) * 14 - 2) + smoothstep(ARENA_R + 1, ARENA_R + 6, r) * NZ.fbm(x * 0.2, z * 0.2, 3) * 0.5;
}

function windify(mat, amount = 0.05, heightAttr = 'uv') {
  mat.userData.time = { value: 0 };
  mat.onBeforeCompile = (sh) => {
    sh.uniforms.uTime = mat.userData.time;
    sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nuniform float uTime;')
      .replace('#include <begin_vertex>', `#include <begin_vertex>
        #ifdef USE_INSTANCING
          vec3 ip = vec3(instanceMatrix[3][0], instanceMatrix[3][1], instanceMatrix[3][2]);
        #else
          vec3 ip = vec3(0.0);
        #endif
        float wk = ${heightAttr === 'uv' ? 'uv.y * uv.y' : 'clamp(position.y, 0.0, 2.0)'};
        float ph = uTime * 1.6 + ip.x * 0.35 + ip.z * 0.27;
        transformed.x += (sin(ph) * 0.7 + sin(ph * 2.3) * 0.3) * ${amount.toFixed(3)} * wk;
        transformed.z += cos(ph * 0.8) * ${(amount * 0.6).toFixed(3)} * wk;`);
  };
  return mat;
}

function latticeTex() {
  const c = document.createElement('canvas');
  c.width = 512; c.height = 512;
  const g = c.getContext('2d');
  g.fillStyle = '#2a0c08'; g.fillRect(0, 0, 512, 512);
  g.fillStyle = '#080404';
  for (let y = 0; y < 512; y += 32) for (let x = 0; x < 512; x += 32) g.fillRect(x + 5, y + 5, 22, 22);
  g.strokeStyle = '#5a1a10'; g.lineWidth = 3;
  for (let i = 0; i < 512; i += 64) { g.strokeRect(i + 2, 2, 60, 508); }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace; t.wrapS = t.wrapT = THREE.RepeatWrapping;
  return t;
}

function plaqueTex(text) {
  const c = document.createElement('canvas');
  c.width = 1024; c.height = 320;
  const g = c.getContext('2d');
  const gr = g.createLinearGradient(0, 0, 0, 320);
  gr.addColorStop(0, '#0d1a2a'); gr.addColorStop(1, '#06101c');
  g.fillStyle = gr; g.fillRect(0, 0, 1024, 320);
  g.strokeStyle = '#b08a3a'; g.lineWidth = 18; g.strokeRect(14, 14, 996, 292);
  g.font = 'bold 200px "KaiTi","STKaiti","Ma Shan Zheng",serif';
  g.textAlign = 'center'; g.textBaseline = 'middle';
  g.fillStyle = '#d8b25a'; g.shadowColor = '#000'; g.shadowBlur = 8;
  g.fillText(text, 512, 170);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

function steleTex() {
  const c = document.createElement('canvas');
  c.width = 256; c.height = 768;
  const g = c.getContext('2d');
  g.fillStyle = '#777'; g.fillRect(0, 0, 256, 768);
  g.font = 'bold 150px "KaiTi","STKaiti",serif';
  g.textAlign = 'center';
  g.fillStyle = '#222';
  ['黑', '風', '山'].forEach((ch, i) => g.fillText(ch, 128, 200 + i * 210));
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

// 反宇曲面屋顶（庑殿式，四角起翘）
function roofGeo(We, De, Wr, H, curl, seg = 28) {
  const pos = [], uv = [], idx = [];
  const face = (fn) => {
    const base = pos.length / 3;
    for (let j = 0; j <= seg; j++) for (let i = 0; i <= seg; i++) {
      const u = (i / seg) * 2 - 1, v = j / seg;
      const p = fn(u, v);
      pos.push(p[0], p[1], p[2]);
      uv.push((u * 0.5 + 0.5) * p[3], v * 3);
    }
    for (let j = 0; j < seg; j++) for (let i = 0; i < seg; i++) {
      const a = base + j * (seg + 1) + i, b = a + 1, c = a + seg + 1, d = c + 1;
      idx.push(a, b, c, b, d, c);
    }
  };
  const y = (u, v) => H * Math.pow(v, 1.7) + curl * Math.pow(Math.abs(u), 5) * (1 - v) * (1 - v);
  face((u, v) => [u * THREE.MathUtils.lerp(We / 2, Wr / 2, v), y(u, v), THREE.MathUtils.lerp(De / 2, 0, v), We / 3]);
  face((u, v) => [-u * THREE.MathUtils.lerp(We / 2, Wr / 2, v), y(u, v), -THREE.MathUtils.lerp(De / 2, 0, v), We / 3]);
  face((u, v) => [THREE.MathUtils.lerp(We / 2, Wr / 2, v), y(u, v), -u * THREE.MathUtils.lerp(De / 2, 0, v), De / 3]);
  face((u, v) => [-THREE.MathUtils.lerp(We / 2, Wr / 2, v), y(u, v), u * THREE.MathUtils.lerp(De / 2, 0, v), De / 3]);
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}

function pineTree(r, H) {
  const trunkPts = [];
  let x = 0, z = 0;
  const lean = [(r() - 0.5) * 0.25, (r() - 0.5) * 0.25];
  for (let i = 0; i <= 8; i++) {
    const t = i / 8;
    x += lean[0] * H / 8 + (r() - 0.5) * 0.35; z += lean[1] * H / 8 + (r() - 0.5) * 0.35;
    trunkPts.push(new THREE.Vector3(x, t * H, z));
  }
  const R0 = H * 0.022;
  const geos = [taperTube(trunkPts, (t) => R0 * (1 - t * 0.8) * (1 + 0.6 * Math.max(0, 0.08 - t) * 10), 10)];
  const pads = [];
  const nb = 7 + Math.floor(r() * 6);
  const curve = new THREE.CatmullRomCurve3(trunkPts);
  for (let b = 0; b < nb; b++) {
    const t = 0.38 + (b / nb) * 0.58 + r() * 0.04;
    const o = curve.getPointAt(Math.min(1, t));
    const ang = r() * Math.PI * 2;
    const L = H * (0.32 - t * 0.22) * (0.7 + r() * 0.6);
    const pts = [o.clone()];
    for (let k = 1; k <= 3; k++) {
      const s = k / 3;
      pts.push(new THREE.Vector3(o.x + Math.cos(ang) * L * s, o.y + L * 0.15 * s - L * 0.18 * s * s, o.z + Math.sin(ang) * L * s));
    }
    geos.push(taperTube(pts, (q) => R0 * 0.35 * (1 - q * 0.8), 6));
    for (let k = 1; k <= 3; k++) {
      const p = pts[k];
      pads.push({ p: p.clone().add(new THREE.Vector3(0, 0.15, 0)), s: (1.2 + r() * 0.9) * (H / 14) * (1.2 - k * 0.12), a: r() * Math.PI });
    }
  }
  pads.push({ p: trunkPts[8].clone(), s: 1.6 * H / 14, a: 0 });
  return { trunk: merge(geos), pads };
}

function padGeo() {
  // 三片交叉 + 一片水平的松针卡片，法线向外膨胀以获得蓬松光照
  const qs = [];
  for (let i = 0; i < 3; i++) {
    const q = new THREE.PlaneGeometry(2, 1.1, 2, 1);
    q.rotateY((i / 3) * Math.PI);
    qs.push(q);
  }
  const h = new THREE.PlaneGeometry(2.2, 2.2);
  h.rotateX(-Math.PI / 2);
  qs.push(h);
  const g = merge(qs);
  const p = g.attributes.position, n = g.attributes.normal, v = new THREE.Vector3();
  for (let i = 0; i < p.count; i++) {
    v.fromBufferAttribute(p, i);
    v.y += 0.6;
    v.normalize();
    n.setXYZ(i, v.x, v.y, v.z);
  }
  g.scale(1, 0.55, 1);
  return g;
}

function lanternGeo() {
  const parts = [];
  const lp = (pts, s = 16) => new THREE.LatheGeometry(pts.map(([r, y]) => new THREE.Vector2(r, y)), s);
  parts.push(lp([[0.0001, 0], [0.45, 0], [0.45, 0.12], [0.36, 0.2], [0.3, 0.22], [0.0001, 0.22]], 8));
  parts.push(new THREE.CylinderGeometry(0.13, 0.16, 1.0, 8).translate(0, 0.72, 0));
  parts.push(lp([[0.0001, 1.2], [0.36, 1.2], [0.38, 1.28], [0.0001, 1.28]], 6));
  parts.push(new THREE.ConeGeometry(0.62, 0.42, 6).translate(0, 1.92, 0));
  parts.push(new THREE.SphereGeometry(0.1, 8, 6).translate(0, 2.18, 0));
  const posts = [];
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * Math.PI * 2;
    posts.push(new THREE.BoxGeometry(0.07, 0.42, 0.07).translate(Math.cos(a) * 0.27, 1.49, Math.sin(a) * 0.27));
  }
  return { stone: merge([...parts, ...posts]), glow: new THREE.CylinderGeometry(0.22, 0.22, 0.38, 6).translate(0, 1.49, 0) };
}

export function createWorld(scene, renderer) {
  const fogColor = new THREE.Color(0x8a7a6c);
  scene.fog = new THREE.FogExp2(fogColor, 0.0085);
  const sky = createSky(fogColor);
  scene.add(sky);
  const updaters = [];
  const timeMats = [];

  // 环境光照：由天空生成 PMREM
  const envScene = new THREE.Scene();
  envScene.add(createSky(fogColor));
  const pm = new THREE.PMREMGenerator(renderer);
  const envRT = pm.fromScene(envScene, 0.03);
  scene.environment = envRT.texture;
  scene.environmentIntensity = 0.7;

  // 灯光
  const hemi = new THREE.HemisphereLight(0xa9b6c8, 0x4a3828, 0.75);
  scene.add(hemi);
  const sun = new THREE.DirectionalLight(0xffcf9e, 3.1);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  const sc = sun.shadow.camera;
  sc.left = -13; sc.right = 13; sc.top = 13; sc.bottom = -13; sc.near = 1; sc.far = 90;
  sun.shadow.bias = -0.0004;
  sun.shadow.normalBias = 0.025;
  scene.add(sun, sun.target);
  const rim = new THREE.DirectionalLight(0x8aa4c8, 0.6);
  rim.position.set(30, 20, 40);
  scene.add(rim);

  // 地形
  const groundSet = TX.groundDirt();
  const gMat = pbr(groundSet, { repeat: [90, 90] });
  const gGeo = new THREE.PlaneGeometry(520, 520, 220, 220);
  gGeo.rotateX(-Math.PI / 2);
  const gp = gGeo.attributes.position;
  for (let i = 0; i < gp.count; i++) gp.setY(i, terrainHeight(gp.getX(i), gp.getZ(i)));
  gGeo.computeVertexNormals();
  const ground = new THREE.Mesh(gGeo, gMat);
  ground.receiveShadow = true;
  scene.add(ground);

  // 庭院石板
  const stone = TX.stoneFloor();
  const aMat = pbr(stone, { repeat: [6, 6] });
  const arena = new THREE.Mesh(new THREE.CircleGeometry(ARENA_R + 0.6, 160), aMat);
  arena.rotation.x = -Math.PI / 2;
  arena.position.y = 0.012;
  arena.receiveShadow = true;
  scene.add(arena);
  // 庭院路面通往大殿
  const path = new THREE.Mesh(new THREE.PlaneGeometry(7, 8), pbr(stone, { repeat: [1.3, 1.5] }));
  path.rotation.x = -Math.PI / 2;
  path.position.set(0, 0.014, -19.5);
  path.receiveShadow = true;
  scene.add(path);
  // 边石
  const rockSet = TX.rock();
  const rockMat = pbr(rockSet, { repeat: [1, 1] });
  const curbN = 96;
  const curb = new THREE.InstancedMesh(new THREE.BoxGeometry(1.0, 0.3, 0.55, 2, 1, 1), rockMat, curbN);
  const R = rng(5);
  const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler(), sV = new THREE.Vector3(), pV = new THREE.Vector3();
  let ci = 0;
  for (let i = 0; i < curbN; i++) {
    const a = (i / curbN) * Math.PI * 2;
    if (Math.abs(Math.atan2(Math.sin(a + Math.PI / 2), Math.cos(a + Math.PI / 2))) < 0.2) continue;
    if (R() < 0.06) continue;
    pV.set(Math.cos(a) * (ARENA_R + 0.85), 0.06 + R() * 0.06, Math.sin(a) * (ARENA_R + 0.85));
    e.set((R() - 0.5) * 0.08, -a + Math.PI / 2 + (R() - 0.5) * 0.08, (R() - 0.5) * 0.12);
    q.setFromEuler(e);
    sV.set(1.06 + R() * 0.1, 0.8 + R() * 0.5, 1);
    curb.setMatrixAt(ci++, m4.compose(pV, q, sV));
  }
  curb.count = ci;
  curb.castShadow = curb.receiveShadow = true;
  scene.add(curb);

  // ─── 大殿 ───
  const temple = new THREE.Group();
  const wood = pbr(TX.lacquerWood(), { repeat: [1, 3] });
  const platMat = pbr(stone, { repeat: [4, 1] });
  const plat = new THREE.Mesh(new THREE.BoxGeometry(28, 1.4, 13), platMat);
  plat.position.set(0, 0.7, -28);
  temple.add(plat);
  for (let s = 0; s < 6; s++) {
    const h = 0.2333 * (s + 1);
    const st = new THREE.Mesh(new THREE.BoxGeometry(8 - s * 0.1, h, 0.42), platMat);
    st.position.set(0, h / 2, -19.6 - s * 0.38);
    temple.add(st);
  }
  const pillarG = new THREE.CylinderGeometry(0.36, 0.4, 6.5, 24);
  const baseG = new THREE.CylinderGeometry(0.58, 0.62, 0.32, 16);
  for (const x of [-11, -6.6, -2.2, 2.2, 6.6, 11]) {
    const p = new THREE.Mesh(pillarG, wood);
    p.position.set(x, 1.4 + 3.25, -22.6);
    temple.add(p);
    const b = new THREE.Mesh(baseG, rockMat);
    b.position.set(x, 1.56, -22.6);
    temple.add(b);
  }
  const beam = new THREE.Mesh(new THREE.BoxGeometry(25, 0.7, 0.6), wood);
  beam.position.set(0, 1.4 + 6.5 + 0.1, -22.6);
  temple.add(beam);
  const beam2 = beam.clone(); beam2.position.y += 0.9; beam2.scale.set(1.02, 0.6, 1.2);
  temple.add(beam2);
  // 斗拱
  const dg = new THREE.InstancedMesh(new THREE.BoxGeometry(0.45, 0.32, 0.9), wood, 60);
  let di = 0;
  for (let i = 0; i < 30; i++) for (let k = 0; k < 2; k++) {
    pV.set(-12 + i * (24 / 29), 8.5 + k * 0.35, -22.4 + k * 0.25);
    sV.set(1 - k * 0.2, 1, 1 + k * 0.4);
    dg.setMatrixAt(di++, m4.compose(pV, q.identity(), sV));
  }
  temple.add(dg);
  const wall = new THREE.Mesh(new THREE.BoxGeometry(23, 6.5, 0.35), new THREE.MeshStandardMaterial({ map: latticeTex(), roughness: 0.8 }));
  wall.material.map.repeat.set(6, 2);
  wall.position.set(0, 1.4 + 3.25, -25.2);
  temple.add(wall);
  const plaque = new THREE.Mesh(new THREE.PlaneGeometry(3.6, 1.12), new THREE.MeshStandardMaterial({ map: plaqueTex('觀音禪院'), roughness: 0.5, metalness: 0.2 }));
  plaque.position.set(0, 7.0, -22.25);
  temple.add(plaque);
  const roofSet = TX.roofTiles();
  const roofMat = pbr(roofSet, { repeat: [1, 1], side: THREE.DoubleSide });
  const roof = new THREE.Mesh(roofGeo(32, 17, 16, 5.6, 1.6), roofMat);
  roof.position.set(0, 9.0, -27.5);
  temple.add(roof);
  const ridge = new THREE.Mesh(new THREE.BoxGeometry(16.4, 0.7, 0.6), pbr(roofSet, { repeat: [4, 0.3], color: 0x666666 }));
  ridge.position.set(0, 9.0 + 5.75, -27.5);
  temple.add(ridge);
  for (const sg of [1, -1]) {
    const horn = new THREE.Mesh(new THREE.TorusGeometry(0.75, 0.16, 8, 16, Math.PI * 1.1), ridge.material);
    horn.position.set(sg * 8.2, 9.0 + 6.3, -27.5);
    horn.rotation.set(0, 0, sg > 0 ? -0.4 : Math.PI + 0.4);
    temple.add(horn);
  }
  temple.traverse((o) => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });
  scene.add(temple);

  // 石碑
  const stele = new THREE.Group();
  const sm = rockMat.clone(); sm.map = steleTex(); sm.color.set(0xb8b0a4);
  const slab = new THREE.Mesh(new THREE.BoxGeometry(1.1, 3.0, 0.32), [rockMat, rockMat, rockMat, rockMat, sm, rockMat]);
  slab.position.y = 1.9;
  const turtle = new THREE.Mesh(new THREE.SphereGeometry(0.9, 20, 12, 0, Math.PI * 2, 0, Math.PI / 2).scale(1, 0.55, 1.3), rockMat);
  turtle.position.y = 0.1;
  stele.add(slab, turtle);
  stele.position.set(-13.5, 0, -12.5);
  stele.rotation.y = 0.75;
  stele.traverse((o) => { if (o.isMesh) { o.castShadow = o.receiveShadow = true; } });
  scene.add(stele);

  // 石灯笼
  const lg = lanternGeo();
  const glowMat = new THREE.MeshStandardMaterial({ color: 0x000000, emissive: 0xffa040, emissiveIntensity: 3.5 });
  const lanterns = [];
  const lAngles = [-2.35, -0.95, 0.95, 2.35, -0.25, 0.25, Math.PI - 0.35, Math.PI + 0.35, Math.PI / 2 + 0.6, -Math.PI / 2 - 0.6];
  for (const a of lAngles) {
    const g = new THREE.Group();
    const s = new THREE.Mesh(lg.stone, rockMat);
    s.castShadow = s.receiveShadow = true;
    const gl = new THREE.Mesh(lg.glow, glowMat);
    g.add(s, gl);
    g.position.set(Math.sin(a) * (ARENA_R + 2.2), 0, Math.cos(a) * (ARENA_R + 2.2));
    scene.add(g);
    lanterns.push(g);
  }
  const lampLights = [];
  for (const x of [-4.6, 4.6]) {
    const l = new THREE.PointLight(0xff9a40, 9, 12, 2);
    l.position.set(x, 1.5, -18.2);
    scene.add(l);
    lampLights.push(l);
    const g = new THREE.Group();
    const s = new THREE.Mesh(lg.stone, rockMat); s.castShadow = true;
    g.add(s, new THREE.Mesh(lg.glow, glowMat));
    g.position.set(x, 0, -18.2);
    scene.add(g);
  }

  // 香鼎
  const bronze = new THREE.MeshStandardMaterial({ color: 0x5a4a2c, metalness: 0.85, roughness: 0.55, normalMap: rockSet.normalMap });
  const ding = new THREE.Group();
  const bowl = new THREE.Mesh(new THREE.LatheGeometry([[0.0001, 0], [0.7, 0.05], [0.95, 0.4], [1.0, 0.85], [1.08, 0.95], [1.02, 1.0], [0.9, 0.98]].map(([r, y]) => new THREE.Vector2(r, y)), 32), bronze);
  bowl.position.y = 0.7;
  ding.add(bowl);
  for (let i = 0; i < 3; i++) {
    const a = (i / 3) * Math.PI * 2;
    const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.13, 0.09, 0.9, 10), bronze);
    leg.position.set(Math.cos(a) * 0.6, 0.45, Math.sin(a) * 0.6);
    ding.add(leg);
  }
  for (const sg of [1, -1]) {
    const hd = new THREE.Mesh(new THREE.TorusGeometry(0.28, 0.06, 8, 16, Math.PI), bronze);
    hd.position.set(sg * 0.85, 1.75, 0);
    hd.rotation.y = Math.PI / 2;
    ding.add(hd);
  }
  const ember = new THREE.Mesh(new THREE.CircleGeometry(0.9, 24), new THREE.MeshStandardMaterial({ color: 0x110500, emissive: 0xff5010, emissiveIntensity: 2 }));
  ember.rotation.x = -Math.PI / 2; ember.position.y = 1.5;
  ding.add(ember);
  ding.position.set(0, 0, -18.6);
  ding.traverse((o) => { if (o.isMesh) { o.castShadow = o.receiveShadow = true; } });
  scene.add(ding);
  const dingLight = new THREE.PointLight(0xff6020, 6, 8, 2);
  dingLight.position.set(0, 2.2, -18.6);
  scene.add(dingLight);

  // ─── 松林 ───
  const barkMat = pbr(TX.bark(), { repeat: [2, 1] });
  const needleMat = windify(new THREE.MeshStandardMaterial({
    map: TX.pineCard(), alphaTest: 0.42, side: THREE.DoubleSide, color: 0x9aa488, roughness: 0.9,
  }), 0.12, 'pos');
  timeMats.push(needleMat);
  const trunks = [], padsAll = [];
  const TR = rng(77);
  const place = (x, z, H) => {
    const t = pineTree(TR, H);
    const y = terrainHeight(x, z) - 0.2;
    t.trunk.translate(x, y, z);
    trunks.push(t.trunk);
    for (const p of t.pads) padsAll.push({ p: p.p.add(new THREE.Vector3(x, y, z)), s: p.s, a: p.a });
  };
  for (let i = 0; i < 46; i++) {
    const a = TR() * Math.PI * 2, r = ARENA_R + 6 + TR() * 30;
    const x = Math.sin(a) * r, z = Math.cos(a) * r;
    if (z < -18 && Math.abs(x) < 17) continue;
    place(x, z, 10 + TR() * 9);
  }
  for (const [x, z] of [[-17, -24], [17, -25], [-19, -30], [19, -31], [-22, -18], [23, -17]]) place(x, z, 16 + TR() * 4);
  for (let i = 0; i < 70; i++) {
    const a = TR() * Math.PI * 2, r = 60 + TR() * 70;
    place(Math.sin(a) * r, Math.cos(a) * r, 14 + TR() * 12);
  }
  const trunkMesh = new THREE.Mesh(merge(trunks), barkMat);
  trunkMesh.castShadow = trunkMesh.receiveShadow = true;
  scene.add(trunkMesh);
  const pads = new THREE.InstancedMesh(padGeo(), needleMat, padsAll.length);
  padsAll.forEach((p, i) => {
    q.setFromEuler(e.set(0, p.a, 0));
    sV.set(p.s, p.s, p.s);
    pads.setMatrixAt(i, m4.compose(p.p, q, sV));
  });
  pads.castShadow = true; pads.receiveShadow = true;
  scene.add(pads);

  // 岩石
  const rockGeos = [0, 1, 2].map((k) => {
    const g = new THREE.IcosahedronGeometry(1, 4);
    const p = g.attributes.position, v = new THREE.Vector3();
    for (let i = 0; i < p.count; i++) {
      v.fromBufferAttribute(p, i);
      const d = 1 + (NZ.fbm(v.x * 1.3 + k * 7, v.y * 1.3 + v.z * 0.9, 4) - 0.5) * 0.7 + NZ.ridged(v.x * 3 + k, v.z * 3 + v.y, 3) * 0.12;
      v.multiplyScalar(d);
      v.y *= 0.7;
      p.setXYZ(i, v.x, v.y, v.z);
    }
    g.computeVertexNormals();
    return g;
  });
  rockGeos.forEach((g, k) => {
    const im = new THREE.InstancedMesh(g, rockMat, 14);
    for (let i = 0; i < 14; i++) {
      const a = TR() * Math.PI * 2, r = ARENA_R + 2.5 + TR() * 18;
      const x = Math.sin(a) * r, z = Math.cos(a) * r;
      const s = 0.4 + TR() * TR() * 2.2;
      pV.set(x, terrainHeight(x, z) - s * 0.25, z);
      q.setFromEuler(e.set(TR() * 0.4, TR() * 6, TR() * 0.4));
      sV.set(s * (0.8 + TR() * 0.6), s, s * (0.8 + TR() * 0.6));
      im.setMatrixAt(i, m4.compose(pV, q, sV));
    }
    im.castShadow = im.receiveShadow = true;
    scene.add(im);
  });

  // 远山：水墨层叠剪影（按距离分层，越远越淡）
  const mtnVS = 'varying vec3 vW; void main(){ vec4 w = modelMatrix * vec4(position,1.0); vW = w.xyz; gl_Position = projectionMatrix * viewMatrix * w; }';
  const mtnFS = `varying vec3 vW; uniform vec3 uCol; uniform vec3 uFog; uniform float uTop;
    float h21(vec2 p){ vec3 p3 = fract(vec3(p.xyx) * 0.1031); p3 += dot(p3, p3.yzx + 33.33); return fract((p3.x + p3.y) * p3.z); }
    float n2(vec2 p){ vec2 i=floor(p), f=fract(p); f=f*f*(3.0-2.0*f); return mix(mix(h21(i),h21(i+vec2(1,0)),f.x), mix(h21(i+vec2(0,1)),h21(i+vec2(1,1)),f.x), f.y); }
    void main(){ float h = clamp(vW.y / uTop, 0.0, 1.0);
      float tex = n2(vW.xz * 0.05 + vW.y * 0.03) * 0.5 + n2(vW.xz * 0.2) * 0.5;
      vec3 c = mix(uFog, uCol, smoothstep(0.0, 0.85, h) * (0.85 + 0.15 * tex));
      gl_FragColor = vec4(c, 1.0); }`;
  const layers = [
    { R: 170, col: 0x22252a, H: [25, 75], f: 5, seed: 1 },
    { R: 280, col: 0x3d4147, H: [50, 120], f: 4, seed: 2 },
    { R: 430, col: 0x67676a, H: [90, 190], f: 3, seed: 3 },
  ];
  layers.forEach((L, li) => {
    const mat = new THREE.ShaderMaterial({ vertexShader: mtnVS, fragmentShader: mtnFS, fog: false, side: THREE.DoubleSide, depthWrite: true,
      uniforms: { uCol: { value: new THREE.Color(L.col) }, uFog: { value: fogColor.clone() }, uTop: { value: L.H[1] } } });
    const N = 512, pos = [], idx = [];
    for (let i = 0; i <= N; i++) {
      const a = (i / N) * Math.PI * 2;
      const cx = Math.cos(a) * L.f, cz = Math.sin(a) * L.f;
      const ridge = NZ.ridged(cx + L.seed * 10, cz + L.seed * 7, 5);
      const h = L.H[0] + (L.H[1] - L.H[0]) * Math.pow(ridge, 1.6);
      const x = Math.sin(a) * L.R, z = Math.cos(a) * L.R;
      pos.push(x, -15, z, x, h, z);
      if (i < N) { const k = i * 2; idx.push(k, k + 1, k + 2, k + 1, k + 3, k + 2); }
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setIndex(idx);
    const m = new THREE.Mesh(g, mat);
    m.frustumCulled = false;
    m.renderOrder = -5 + li;
    scene.add(m);
  });

  // ─── 草 ───
  const blade = new THREE.PlaneGeometry(0.07, 0.55, 1, 4);
  blade.translate(0, 0.275, 0);
  {
    const p = blade.attributes.position, n = blade.attributes.normal;
    for (let i = 0; i < p.count; i++) {
      const y = p.getY(i) / 0.55;
      p.setX(i, p.getX(i) * (1 - y * 0.85));
      p.setZ(i, y * y * 0.12);
      n.setXYZ(i, 0, 1, 0.3);
    }
  }
  const grassMat = windify(new THREE.MeshStandardMaterial({ side: THREE.DoubleSide, roughness: 0.95, color: 0xffffff }), 0.09, 'uv');
  timeMats.push(grassMat);
  const GN = 26000;
  const grass = new THREE.InstancedMesh(blade, grassMat, GN);
  const col = new THREE.Color();
  let gi = 0;
  for (let i = 0; i < GN * 3 && gi < GN; i++) {
    const a = TR() * Math.PI * 2, r = ARENA_R + 0.9 + Math.pow(TR(), 1.6) * 30;
    const x = Math.sin(a) * r, z = Math.cos(a) * r;
    if (z < -17.5 && z > -35 && Math.abs(x) < 15) continue;
    if (Math.abs(x) < 3.8 && z < -15 && z > -23) continue;
    const clump = NZ.fbm(x * 0.15, z * 0.15, 3);
    if (TR() > clump * 1.6) continue;
    pV.set(x, terrainHeight(x, z), z);
    q.setFromEuler(e.set((TR() - 0.5) * 0.4, TR() * Math.PI * 2, (TR() - 0.5) * 0.4));
    const s = 0.5 + TR() * 0.9;
    sV.set(s, s * (0.6 + clump), s);
    grass.setMatrixAt(gi, m4.compose(pV, q, sV));
    const dry = TR();
    col.setRGB(0.22 + dry * 0.25, 0.25 + dry * 0.12, 0.08 + dry * 0.04);
    grass.setColorAt(gi, col);
    gi++;
  }
  grass.count = gi;
  grass.receiveShadow = true;
  scene.add(grass);

  // ─── 落叶 ───
  const LN = 240;
  const leafMat = new THREE.MeshStandardMaterial({ map: TX.leafTex(), alphaTest: 0.5, side: THREE.DoubleSide, roughness: 0.8 });
  const leaves = new THREE.InstancedMesh(new THREE.PlaneGeometry(0.13, 0.13), leafMat, LN);
  const LD = [];
  for (let i = 0; i < LN; i++) LD.push({ p: new THREE.Vector3((TR() - 0.5) * 50, TR() * 14, (TR() - 0.5) * 50), r: new THREE.Euler(TR() * 6, TR() * 6, TR() * 6), sp: 0.5 + TR() * 1.5, rest: 0, ph: TR() * 6 });
  leaves.castShadow = true;
  scene.add(leaves);

  // ─── 浮尘光点 ───
  const DN = 600;
  const dGeo = new THREE.BufferGeometry();
  const dPos = new Float32Array(DN * 3);
  for (let i = 0; i < DN; i++) { dPos[i * 3] = (TR() - 0.5) * 40; dPos[i * 3 + 1] = TR() * 8; dPos[i * 3 + 2] = (TR() - 0.5) * 40; }
  dGeo.setAttribute('position', new THREE.BufferAttribute(dPos, 3));
  const dust = new THREE.Points(dGeo, new THREE.PointsMaterial({
    map: TX.glowTex(), size: 0.06, color: 0xffd8a0, transparent: true, opacity: 0.6, depthWrite: false, blending: THREE.AdditiveBlending,
  }));
  scene.add(dust);

  // ─── 体积光柱 ───
  const rayMat = new THREE.ShaderMaterial({
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide, fog: false,
    uniforms: { uTime: { value: 0 }, uOp: { value: 0.07 } },
    vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }',
    fragmentShader: `varying vec2 vUv; uniform float uTime; uniform float uOp;
      void main(){ float e = smoothstep(0.0,0.35,vUv.x)*(1.0-smoothstep(0.65,1.0,vUv.x));
        float f = smoothstep(0.0,0.25,vUv.y)*(1.0-smoothstep(0.5,1.0,vUv.y));
        float fl = 0.75 + 0.25*sin(vUv.x*20.0 + uTime*0.5);
        gl_FragColor = vec4(vec3(1.0,0.78,0.5)*e*f*fl*uOp, 1.0); }`,
  });
  timeMats.push({ userData: { time: rayMat.uniforms.uTime } });
  for (let i = 0; i < 7; i++) {
    const ray = new THREE.Mesh(new THREE.PlaneGeometry(2 + TR() * 3, 40), rayMat);
    const c = new THREE.Vector3((TR() - 0.5) * 34, 0, -8 - TR() * 22);
    ray.position.copy(c).addScaledVector(SUN_DIR, 18);
    ray.lookAt(ray.position.clone().add(new THREE.Vector3(0, 0, 1)));
    ray.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), SUN_DIR);
    ray.rotateY(TR() * Math.PI);
    scene.add(ray);
  }

  // 每帧更新
  const shadowTarget = new THREE.Vector3();
  const wind = new THREE.Vector3();
  let time = 0;
  function update(dt, focus) {
    time += dt;
    sky.material.uniforms.uTime.value = time;
    for (const m of timeMats) m.userData.time.value = time;
    wind.set(2.5 + Math.sin(time * 0.4) * 1.5 + Math.sin(time * 1.7) * 0.8, 0, 1.2 + Math.cos(time * 0.3));
    // 阴影相机跟随焦点并贴合纹素，防止抖动
    shadowTarget.copy(focus);
    const texel = 26 / 2048;
    shadowTarget.x = Math.round(shadowTarget.x / texel) * texel;
    shadowTarget.z = Math.round(shadowTarget.z / texel) * texel;
    sun.target.position.copy(shadowTarget);
    sun.position.copy(shadowTarget).addScaledVector(SUN_DIR, 45);
    // 灯火摇曳
    const fl = 0.85 + Math.sin(time * 13) * 0.06 + Math.sin(time * 7.3) * 0.09;
    for (const l of lampLights) l.intensity = 9 * fl;
    dingLight.intensity = 6 * (0.8 + Math.sin(time * 9.1) * 0.1 + Math.sin(time * 4.3) * 0.1);
    glowMat.emissiveIntensity = 3.2 * fl;
    // 落叶
    for (let i = 0; i < LN; i++) {
      const L = LD[i];
      if (L.p.y <= 0.03) {
        L.rest += dt;
        if (L.rest > 4) { L.p.set(focus.x + (TR() - 0.5) * 40, 10 + TR() * 6, focus.z + (TR() - 0.5) * 40); L.rest = 0; }
      } else {
        L.ph += dt * 2;
        L.p.y -= L.sp * dt * 0.6;
        L.p.x += (wind.x * 0.25 + Math.sin(L.ph) * 0.6) * dt;
        L.p.z += (wind.z * 0.25 + Math.cos(L.ph * 0.7) * 0.5) * dt;
        L.r.x += dt * 2.1 * L.sp; L.r.y += dt * 1.3;
        if (L.p.y < 0.03) { L.p.y = 0.02; L.r.x = -Math.PI / 2; L.r.y = 0; }
      }
      q.setFromEuler(L.r);
      sV.set(1, 1, 1);
      leaves.setMatrixAt(i, m4.compose(L.p, q, sV));
    }
    leaves.instanceMatrix.needsUpdate = true;
    // 浮尘
    for (let i = 0; i < DN; i++) {
      dPos[i * 3] += Math.sin(time * 0.3 + i) * 0.003 + wind.x * 0.0008;
      dPos[i * 3 + 1] += Math.sin(time * 0.5 + i * 1.7) * 0.002;
      if (dPos[i * 3] > focus.x + 20) dPos[i * 3] -= 40;
      if (dPos[i * 3] < focus.x - 20) dPos[i * 3] += 40;
    }
    dGeo.attributes.position.needsUpdate = true;
  }

  return { update, wind, sun, sky, terrainHeight, dingPos: new THREE.Vector3(0, 1.6, -18.6) };
}
