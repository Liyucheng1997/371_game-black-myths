// 角色共享部件：材质工厂、拳（握持）几何、如意金箍棒、葫芦
import * as THREE from 'three';
import * as TX from '../core/textures.js';
import { merge, ellipsoid, smoothNormals } from '../core/geo.js';

export function pbr(set, { repeat = [1, 1], color = 0xffffff, metal = false, ...opts } = {}) {
  const clone = (t) => {
    if (!t) return null;
    const c = t.clone();
    c.repeat.set(repeat[0], repeat[1]);
    c.needsUpdate = true;
    return c;
  };
  const m = new THREE.MeshStandardMaterial({
    map: clone(set.map), normalMap: clone(set.normalMap), roughnessMap: clone(set.roughnessMap),
    metalnessMap: metal ? clone(set.metalnessMap || set.roughnessMap) : null,
    color, roughness: 1, metalness: metal ? 1 : 0, ...opts,
  });
  return m;
}

export function materials() {
  return {
    gold: pbr(TX.goldEngraved(), { metal: true, repeat: [2, 1], envMapIntensity: 1.3 }),
    goldPlain: new THREE.MeshStandardMaterial({ color: 0xd9a54a, metalness: 1, roughness: 0.28, envMapIntensity: 1.3 }),
    iron: pbr(TX.darkIron(), { metal: true, repeat: [1, 8] }),
    pants: pbr(TX.clothDark(), { repeat: [2, 2] }),
    clothRed: pbr(TX.clothRed(), { repeat: [3, 1], side: THREE.DoubleSide }),
    leather: pbr(TX.leather(), { repeat: [3, 1] }),
    bandage: pbr(TX.bandage(), { repeat: [2, 2] }),
    skinDark: pbr(TX.skin(), { repeat: [2, 2], color: 0x2a201c }),
    bead: new THREE.MeshPhysicalMaterial({ color: 0x3a2214, roughness: 0.32, clearcoat: 0.7, clearcoatRoughness: 0.3 }),
    gourd: new THREE.MeshPhysicalMaterial({ color: 0xa8571c, roughness: 0.35, clearcoat: 1.0, clearcoatRoughness: 0.15 }),
    cord: new THREE.MeshStandardMaterial({ color: 0x8a1410, roughness: 0.8 }),
    gem: new THREE.MeshPhysicalMaterial({ color: 0xb01818, roughness: 0.05, metalness: 0, clearcoat: 1, emissive: 0x400404, transmission: 0.2 }),
  };
}

// 握拳：手腕在原点，沿 -Y 延伸；手指环绕局部 X 轴，环心 (0,-fist,0.008)
export function fistGeo(side = 1, fist = 0.075, s = 1) {
  const parts = [];
  const palm = ellipsoid(0.042 * s, 0.05 * s, 0.027 * s, 20, 14);
  palm.translate(0, -0.042 * s, 0.004);
  parts.push(palm);
  const widths = [0.011, 0.012, 0.012, 0.0105];
  const xs = [-0.027, -0.009, 0.009, 0.026];
  for (let i = 0; i < 4; i++) {
    const r = 0.029 * s, tube = widths[i] * s;
    const tor = new THREE.TorusGeometry(r, tube, 8, 14, Math.PI * 1.45);
    tor.rotateZ(Math.PI * 0.55);
    tor.rotateY(Math.PI / 2);
    tor.translate(xs[i] * side * s, -fist + (i === 0 || i === 3 ? 0.004 : 0), 0.008);
    parts.push(tor);
  }
  // 拇指压在食指上
  const th = new THREE.CapsuleGeometry(0.0115 * s, 0.03 * s, 4, 8);
  th.rotateZ(Math.PI / 2 + side * 0.4);
  th.translate(-side * 0.012 * s, -fist + 0.01, 0.034 * s);
  parts.push(th);
  const g = merge(parts);
  smoothNormals(g);
  return g;
}

// 自由张开的手（施法 / 狼爪）
export function openHandGeo(side = 1, s = 1, claws = false) {
  const parts = [];
  const palm = ellipsoid(0.042 * s, 0.05 * s, 0.022 * s, 20, 14);
  palm.translate(0, -0.045 * s, 0);
  parts.push(palm);
  const xs = [-0.027, -0.009, 0.009, 0.026];
  for (let i = 0; i < 4; i++) {
    const f = new THREE.CapsuleGeometry(0.0095 * s, 0.05 * s, 4, 8);
    f.rotateX(0.35);
    f.translate(xs[i] * side * s, -0.115 * s, 0.012 * s);
    parts.push(f);
    if (claws) {
      const c = new THREE.ConeGeometry(0.006 * s, 0.03 * s, 6);
      c.rotateX(Math.PI + 0.6);
      c.translate(xs[i] * side * s, -0.16 * s, 0.03 * s);
      parts.push(c);
    }
  }
  const th = new THREE.CapsuleGeometry(0.011 * s, 0.035 * s, 4, 8);
  th.rotateZ(side * 0.7);
  th.translate(-side * 0.045 * s, -0.06 * s, 0.015 * s);
  parts.push(th);
  const g = merge(parts);
  smoothNormals(g);
  return g;
}

// 如意金箍棒：中段乌铁，两端鎏金箍
export function staffMesh(M, len = 1.9) {
  const g = new THREE.Group();
  const shaftLen = len - 0.3;
  const shaft = new THREE.Mesh(new THREE.CylinderGeometry(0.0205, 0.0205, shaftLen, 24, 1, true), M.iron);
  shaft.castShadow = true;
  g.add(shaft);
  const h = len / 2;
  const prof = [
    [0.0205, h - 0.19], [0.026, h - 0.175], [0.026, h - 0.155], [0.0235, h - 0.15], [0.0235, h - 0.105],
    [0.0275, h - 0.1], [0.0275, h - 0.078], [0.0235, h - 0.073], [0.0235, h - 0.03], [0.0262, h - 0.025],
    [0.0255, h - 0.008], [0.016, h - 0.001], [0.0001, h],
  ].map(([r, y]) => new THREE.Vector2(r, y));
  const capG = new THREE.LatheGeometry(prof, 32);
  const top = new THREE.Mesh(capG, M.gold);
  const bot = new THREE.Mesh(capG.clone().rotateX(Math.PI), M.gold);
  top.castShadow = bot.castShadow = true;
  g.add(top, bot);
  g.traverse((o) => { if (o.isMesh) o.userData.ghost = true; });
  return g;
}

export function gourdMesh(M) {
  const prof = [
    [0.0001, 0], [0.03, 0.004], [0.055, 0.025], [0.062, 0.055], [0.056, 0.085], [0.036, 0.11], [0.024, 0.122],
    [0.03, 0.14], [0.04, 0.165], [0.038, 0.19], [0.026, 0.21], [0.014, 0.222], [0.013, 0.24], [0.016, 0.245], [0.0001, 0.25],
  ].map(([r, y]) => new THREE.Vector2(r, y));
  const g = new THREE.Group();
  const body = new THREE.Mesh(new THREE.LatheGeometry(prof, 28), M.gourd);
  body.castShadow = true;
  g.add(body);
  const cord = new THREE.Mesh(new THREE.TorusGeometry(0.026, 0.004, 6, 24), M.cord);
  cord.rotation.x = Math.PI / 2;
  cord.position.y = 0.122;
  g.add(cord);
  const tassel = new THREE.Mesh(new THREE.ConeGeometry(0.01, 0.07, 8), M.cord);
  tassel.position.set(0.03, 0.09, 0);
  g.add(tassel);
  g.position.y = -0.125;
  const w = new THREE.Group();
  w.add(g);
  return w;
}
