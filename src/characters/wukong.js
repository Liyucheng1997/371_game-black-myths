// 天命人（Destined One）——全部程序化建模：雕刻头部、壳层毛发、金冠凤翅、翎羽、虎皮裙布料、护臂、念珠、金箍棒
import * as THREE from 'three';
import { Rig } from '../anim/rig.js';
import { makeFur, furMesh } from '../core/fur.js';
import { limb, ellipsoid, deform, furAttrs, smoothNormals, smoothstep, gauss, extrude, band, merge, setColor } from '../core/geo.js';
import { materials, fistGeo, openHandGeo, staffMesh, gourdMesh, pbr } from './parts.js';
import * as TX from '../core/textures.js';
import { Cloth, frayAlpha } from '../sim/cloth.js';
import { Feather } from '../sim/feather.js';

export const WUKONG_SPEC = {
  hipsY: 0.92, spine: 0.11, chest: 0.16, neck: 0.25, neckZ: 0.025, head: 0.07, headZ: 0.012,
  clavX: 0.035, clavY: 0.205, clavZ: -0.025, shoulderX: 0.145,
  upperArm: 0.3, foreArm: 0.28, fist: 0.075,
  hipX: 0.095, hipDrop: 0.075, thigh: 0.4, shin: 0.385, ankleH: 0.075,
};

const FUR_BASE = [0.45, 0.33, 0.21];

// ───────── 头部雕刻（单位球 → 猴首） ─────────
const HC = new THREE.Vector3(0, 0.105, 0.012);
function headShape(n, out) {
  const x = n.x, y = n.y, z = n.z;
  let px = x * 0.106, py = y * 0.12, pz = z * 0.114;
  if (y > 0) py *= 0.95;
  if (z < 0) pz *= 1.07;
  const muz = gauss(x / 0.5, (y + 0.42) / 0.36) * smoothstep(0.0, 0.75, z);
  pz += 0.05 * muz; py -= 0.008 * muz; px *= 1 - 0.12 * muz;
  const brow = Math.exp(-(((y - 0.2) / 0.12) ** 2)) * smoothstep(0.3, 0.85, z) * (1 - 0.4 * Math.exp(-((x / 0.1) ** 2)));
  pz += 0.026 * brow; py += 0.008 * brow;
  const eL = gauss((x - 0.35) / 0.16, (y - 0.02) / 0.13), eR = gauss((x + 0.35) / 0.16, (y - 0.02) / 0.13);
  pz -= 0.024 * (eL + eR) * smoothstep(0.4, 0.9, z);
  const ch = gauss((Math.abs(x) - 0.6) / 0.2, (y + 0.15) / 0.2) * smoothstep(0.1, 0.6, z);
  px += Math.sign(x) * 0.012 * ch; pz += 0.006 * ch;
  const nose = gauss(x / 0.12, (y + 0.22) / 0.09) * smoothstep(0.6, 0.95, z);
  pz += 0.009 * nose;
  const nos = gauss((Math.abs(x) - 0.07) / 0.035, (y + 0.3) / 0.035) * smoothstep(0.6, 0.95, z);
  pz -= 0.006 * nos;
  const mouth = Math.exp(-(((y + 0.56) / 0.035) ** 2)) * smoothstep(0.45, 0.9, z) * Math.exp(-((x / 0.42) ** 2));
  pz -= 0.007 * mouth;
  const chin = smoothstep(-0.55, -0.95, y);
  px *= 1 - 0.3 * chin; pz += 0.01 * chin * smoothstep(0.3, 0.9, z);
  return out.set(HC.x + px, HC.y + py, HC.z + pz);
}
function faceMask(n) {
  const { x, y, z } = n;
  const front = smoothstep(0.2, 0.55, z);
  const r = Math.hypot(x / 0.62, (y + 0.22) / 0.62);
  let m = front * (1 - smoothstep(0.75, 1.0, r));
  m -= Math.exp(-((x / 0.14) ** 2)) * smoothstep(0.0, 0.25, y) * 1.5;
  m -= smoothstep(0.2, 0.3, y);
  return Math.min(1, Math.max(0, m * 1.4));
}

function buildHead() {
  const g = new THREE.SphereGeometry(1, 96, 72);
  const P = g.attributes.position;
  const dirs = [];
  const v = new THREE.Vector3(), o = new THREE.Vector3();
  for (let i = 0; i < P.count; i++) {
    v.fromBufferAttribute(P, i).normalize();
    dirs.push(v.clone());
    headShape(v, o);
    P.setXYZ(i, o.x, o.y, o.z);
  }
  smoothNormals(g);
  furAttrs(g, {
    len: (p, nn, i) => {
      const d = dirs[i];
      const m = faceMask(d);
      const side = smoothstep(0.4, 0.85, Math.abs(d.x)) * (1 - smoothstep(0.2, 0.6, d.y));
      return (1 - m) * (0.75 + 0.7 * side + 0.25 * smoothstep(0.2, 0.9, d.y));
    },
    color: (p, nn, i) => {
      const d = dirs[i];
      const m = faceMask(d);
      const eye = Math.max(gauss((d.x - 0.35) / 0.22, (d.y - 0.03) / 0.18), gauss((d.x + 0.35) / 0.22, (d.y - 0.03) / 0.18));
      const muz = gauss(d.x / 0.4, (d.y + 0.35) / 0.3);
      const lip = Math.exp(-(((d.y + 0.56) / 0.04) ** 2)) * Math.exp(-((d.x / 0.4) ** 2));
      let c = [0.66, 0.47, 0.41];
      c = c.map((k, j) => k * (1 - eye * 0.45) + ([0.86, 0.68, 0.6][j] - k) * muz * 0.5);
      c = c.map((k) => k * (1 - lip * 0.7));
      // 鼻孔、人中、鼻梁皱纹、眼下纹
      const nostril = gauss((Math.abs(d.x) - 0.075) / 0.035, (d.y + 0.3) / 0.03) * smoothstep(0.6, 0.95, d.z);
      const philtrum = Math.exp(-((d.x / 0.03) ** 2)) * smoothstep(-0.5, -0.38, d.y) * (1 - smoothstep(-0.36, -0.32, d.y));
      const bridge = Math.exp(-((d.x / 0.12) ** 2)) * smoothstep(-0.2, 0.05, d.y) * (1 - smoothstep(0.05, 0.15, d.y)) * (0.5 + 0.5 * Math.sin(d.y * 140));
      const under = Math.max(gauss((d.x - 0.33) / 0.15, (d.y + 0.1) / 0.03), gauss((d.x + 0.33) / 0.15, (d.y + 0.1) / 0.03));
      const dark = Math.min(1, nostril * 0.95 + philtrum * 0.3 + bridge * 0.35 + under * 0.4);
      c = c.map((k) => k * (1 - dark));
      return c.map((k, j) => FUR_BASE[j] + (k - FUR_BASE[j]) * m);
    },
  });
  return { geo: g, eyeL: headShape(new THREE.Vector3(0.35, 0.035, 0.936).normalize(), new THREE.Vector3()), eyeR: headShape(new THREE.Vector3(-0.35, 0.035, 0.936).normalize(), new THREE.Vector3()) };
}

// 凤翅（侧翼）形状：x 向后，y 向上
function wingShape() {
  const s = new THREE.Shape();
  s.moveTo(0, -0.012);
  s.bezierCurveTo(0.02, 0.03, 0.07, 0.085, 0.165, 0.118);
  s.bezierCurveTo(0.13, 0.095, 0.125, 0.085, 0.13, 0.072);
  s.quadraticCurveTo(0.11, 0.07, 0.105, 0.05);
  s.quadraticCurveTo(0.085, 0.048, 0.08, 0.028);
  s.quadraticCurveTo(0.06, 0.025, 0.055, 0.008);
  s.quadraticCurveTo(0.03, 0.004, 0.025, -0.012);
  s.lineTo(0, -0.012);
  return s;
}
// 额前如意火焰纹
function crestShape() {
  const s = new THREE.Shape();
  s.moveTo(-0.034, 0);
  s.bezierCurveTo(-0.04, 0.02, -0.02, 0.03, -0.012, 0.024);
  s.bezierCurveTo(-0.022, 0.045, -0.006, 0.058, 0, 0.072);
  s.bezierCurveTo(0.006, 0.058, 0.022, 0.045, 0.012, 0.024);
  s.bezierCurveTo(0.02, 0.03, 0.04, 0.02, 0.034, 0);
  s.quadraticCurveTo(0, 0.008, -0.034, 0);
  return s;
}

export function buildWukong() {
  const rig = new Rig(WUKONG_SPEC);
  const B = rig.bones;
  const M = materials();
  const fur = makeFur({ root: 0x5a4028, tip: 0xc9a06a, length: 0.0125, shells: 20, gravity: 0.5 });
  const furLight = makeFur({ root: 0x4a3420, tip: 0xe6c690, length: 0.018, shells: 18, gravity: 0.6 });
  const furMats = [fur, furLight];
  const allMeshes = [];
  const add = (bone, obj, pos, rot) => {
    if (pos) obj.position.set(pos[0], pos[1], pos[2]);
    if (rot) obj.rotation.set(rot[0], rot[1], rot[2]);
    B[bone].add(obj);
    obj.traverse((o) => {
      if (o.isMesh && !o.isInstancedMesh) { o.castShadow = true; o.receiveShadow = true; o.userData.ghost = o.userData.ghost ?? true; }
      if (o.isMesh) allMeshes.push(o);
    });
    return obj;
  };
  const mesh = (g, m) => new THREE.Mesh(g, m);
  const furPart = (g, f = fur, opts = {}) => {
    furAttrs(g, { len: opts.len || (() => 1), color: opts.color || (() => FUR_BASE), cellScale: opts.cell || 1 });
    return furMesh(g, f);
  };

  // ───── 躯干 ─────
  add('hips', mesh(ellipsoid(0.165, 0.12, 0.128), M.pants), [0, -0.02, -0.005]);
  add('spine', furPart(ellipsoid(0.13, 0.12, 0.105, 48, 32)), [0, 0.07, 0.006]);
  const chestG = deform(ellipsoid(0.172, 0.15, 0.12, 64, 44), (p) => {
    const front = smoothstep(0.0, 0.1, p.z);
    p.z += 0.024 * front * (gauss((p.x - 0.075) / 0.07, (p.y - 0.025) / 0.06) + gauss((p.x + 0.075) / 0.07, (p.y - 0.025) / 0.06));
    p.z -= 0.022 * smoothstep(0.0, -0.1, p.z) * gauss((p.y - 0.06) / 0.08);
    p.x *= 1 + 0.12 * smoothstep(0.0, 0.12, p.y);
  });
  chestG.translate(0, 0.1, -0.005);
  const trap = ellipsoid(0.14, 0.06, 0.09, 48, 24);
  trap.translate(0, 0.2, -0.025);
  add('chest', furPart(merge([chestG, trap])), [0, 0, 0]);
  const neckG = limb({ len: 0.12, radii: [[0, 0.07], [1, 0.064]] });
  neckG.rotateX(Math.PI);
  add('neck', furPart(neckG, fur, { len: () => 1.1 }), [0, -0.02, 0]);

  // ───── 头部 ─────
  const head = buildHead();
  const headBase = new THREE.MeshStandardMaterial({
    vertexColors: true, roughness: 0.5, normalMap: TX.skin().normalMap.clone(), normalScale: new THREE.Vector2(1.1, 1.1),
  });
  headBase.normalMap.repeat.set(4, 3);
  headBase.normalMap.needsUpdate = true;
  add('head', furMesh(head.geo, fur, { baseMat: headBase }));
  // 颊毛（标志性的鬓毛）
  const ruff = new THREE.TorusGeometry(0.098, 0.03, 14, 48, Math.PI * 1.36);
  ruff.rotateZ(Math.PI * 0.82);
  ruff.scale(1.15, 1.0, 0.65);
  ruff.rotateX(-0.2);
  ruff.translate(0, 0.088, 0.03);
  add('head', furPart(ruff, furLight, { len: () => 2.1 }));
  // 头顶毛簇
  const tuft = ellipsoid(0.07, 0.03, 0.08, 32, 16);
  tuft.translate(0, 0.205, -0.01);
  add('head', furPart(tuft, fur, { len: () => 1.6 }));
  // 眼睛
  const eyeMat = new THREE.MeshPhysicalMaterial({
    map: TX.eyeIris('brown'), roughness: 0.06, clearcoat: 1, clearcoatRoughness: 0.03,
    emissive: 0xffffff, emissiveMap: TX.eyeIris('brown'), emissiveIntensity: 0.12,
  });
  const lidMat = new THREE.MeshStandardMaterial({ color: 0x120c0a, roughness: 0.7 });
  for (const [e, sg] of [[head.eyeL, 1], [head.eyeR, -1]]) {
    const eye = mesh(new THREE.SphereGeometry(0.0158, 32, 20), eyeMat);
    eye.position.copy(e).add(new THREE.Vector3(-sg * 0.002, 0, -0.0085));
    eye.rotation.y = sg * 0.12;
    B.head.add(eye);
    const lid = mesh(new THREE.SphereGeometry(0.0163, 24, 10, 0, Math.PI * 2, 0, Math.PI * 0.42), lidMat);
    lid.position.copy(eye.position);
    lid.rotation.set(0.5, 0, sg * 0.18);
    B.head.add(lid);
    const low = mesh(new THREE.SphereGeometry(0.016, 24, 8, 0, Math.PI * 2, Math.PI * 0.72, Math.PI * 0.28), lidMat);
    low.position.copy(eye.position);
    low.rotation.set(0.2, 0, 0);
    B.head.add(low);
    // 耳朵
    const ear = mesh(deform(ellipsoid(0.012, 0.03, 0.024, 16, 12), (p) => { if (p.x * sg > 0) p.x -= 0.006 * sg * (1 - Math.abs(p.y) / 0.03); }), M.skinDark);
    add('head', ear, [sg * 0.106, 0.1, -0.016], [0, sg * 0.35, sg * -0.15]);
  }

  // ───── 金冠 · 凤翅 ─────
  const crown = new THREE.Group();
  const bandMesh = mesh(band(0.117, 0.124, 0.024), M.gold);
  bandMesh.material = M.gold.clone();
  bandMesh.material.side = THREE.DoubleSide;
  crown.add(bandMesh);
  const rim = mesh(new THREE.TorusGeometry(1, 0.004 / 0.125, 6, 64).rotateX(Math.PI / 2).scale(0.119, 0.125, 0.126), M.goldPlain);
  rim.position.y = 0.013;
  const rim2 = rim.clone(); rim2.position.y = -0.013;
  crown.add(rim, rim2);
  const crest = mesh(extrude(crestShape(), 0.006, 0.0015), M.goldPlain);
  crest.position.set(0, 0.006, 0.127);
  crest.rotation.x = -0.25;
  crown.add(crest);
  const gem = mesh(new THREE.IcosahedronGeometry(0.008, 1), M.gem);
  gem.position.set(0, 0.024, 0.134);
  crown.add(gem);
  for (const sg of [1, -1]) {
    const w = mesh(extrude(wingShape(), 0.004, 0.0012), M.goldPlain);
    w.rotation.set(0, Math.PI / 2, sg * 0.0);
    w.position.set(sg * 0.122, 0.0, 0.03);
    w.rotation.x = -0.15;
    w.rotation.z = sg * 0.25;
    crown.add(w);
    const mount = mesh(new THREE.CylinderGeometry(0.006, 0.009, 0.035, 12), M.goldPlain);
    mount.position.set(sg * 0.088, 0.05, -0.02);
    mount.rotation.z = -sg * 0.3;
    crown.add(mount);
    const ball = mesh(new THREE.SphereGeometry(0.009, 12, 10), M.gem);
    ball.position.set(sg * 0.083, 0.035, -0.02);
    crown.add(ball);
  }
  add('head', crown, [0, 0.165, 0.008], [0.12, 0, 0]);

  // ───── 翎羽（两根雉尾） ─────
  const featherMat = new THREE.MeshStandardMaterial({
    map: TX.feather().map, normalMap: TX.feather().normalMap, alphaTest: 0.5, side: THREE.DoubleSide, roughness: 0.65,
  });
  const feathers = [];
  crown.updateMatrix();
  for (const sg of [1, -1]) {
    const pts = [], sides = [];
    const p = new THREE.Vector3(sg * 0.08, 0.225, -0.012);
    const d = new THREE.Vector3(sg * 0.32, 1, -0.02).normalize();
    const seg = 1.15 / 17;
    const qBend = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), -0.082);
    const qOut = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 0, 1), -sg * 0.012);
    for (let i = 0; i < 18; i++) {
      pts.push(p.clone());
      const side = new THREE.Vector3().crossVectors(d, new THREE.Vector3(0.35 * sg, 0, 1).normalize()).normalize();
      sides.push(side);
      p.addScaledVector(d, seg);
      d.applyQuaternion(qBend).applyQuaternion(qOut);
    }
    feathers.push(new Feather({
      bone: B.head, points: pts, sides, material: featherMat,
      width: (t) => 0.036 * (0.45 + 0.55 * smoothstep(0, 0.12, t)) * (1 - 0.75 * smoothstep(0.82, 1, t)),
    }));
  }

  // ───── 手臂 ─────
  for (const [s, sg] of [['L', 1], ['R', -1]]) {
    add('upperArm' + s, furPart(ellipsoid(0.066, 0.075, 0.066, 40, 28)), [sg * 0.006, -0.03, 0]);
    add('upperArm' + s, furPart(limb({ len: 0.3, radii: [[0, 0.05], [0.35, 0.055], [0.75, 0.043], [1, 0.039]], sz: 0.92 })));
    add('foreArm' + s, furPart(limb({ len: 0.28, radii: [[0, 0.044], [0.2, 0.049], [0.7, 0.037], [1, 0.032]], sz: 0.9 })));
    // 棉布缠腕
    add('foreArm' + s, mesh(limb({ len: 0.2, radii: [[0, 0.049], [0.4, 0.046], [1, 0.039]], capTop: false }), M.bandage), [0, -0.06, 0]);
    const wrap = limb({ len: 0.05, radii: [[0, 0.043], [1, 0.04]], capTop: false });
    add('foreArm' + s, mesh(wrap, M.bandage), [0, -0.235, 0]);
    // 拳与张开手（施法时切换）
    const fistM = mesh(fistGeo(sg, WUKONG_SPEC.fist), M.skinDark);
    add('hand' + s, fistM);
    if (s === 'L') {
      const open = mesh(openHandGeo(sg), M.skinDark);
      open.visible = false;
      add('hand' + s, open);
      rig.handOpenL = open; rig.handFistL = fistM;
    }
  }
  // ───── 腿 ─────
  for (const [s, sg] of [['L', 1], ['R', -1]]) {
    const th = deform(limb({ len: 0.42, radii: [[0, 0.108], [0.35, 0.1], [0.85, 0.072], [1, 0.066]], sz: 0.95 }), (p) => {
      const a = Math.atan2(p.x, p.z);
      const k = 1 + 0.05 * Math.sin(a * 5 + p.y * 22) * smoothstep(-0.02, -0.15, p.y);
      p.x *= k; p.z *= k;
    });
    add('thigh' + s, mesh(th, M.pants));
    add('shin' + s, mesh(limb({ len: 0.385, radii: [[0, 0.068], [0.25, 0.064], [0.75, 0.047], [1, 0.042]], sz: 0.95 }), M.bandage));
    // 猴足
    const foot = deform(ellipsoid(0.048, 0.034, 0.112, 32, 20), (p) => {
      if (p.y < -0.018) p.y = -0.018 + (p.y + 0.018) * 0.3;
      p.x *= 1 + 0.25 * smoothstep(0, 0.1, p.z);
    });
    foot.translate(0, -0.048, 0.06);
    const toes = [];
    for (let i = 0; i < 4; i++) {
      const t = new THREE.CapsuleGeometry(0.0105, 0.03, 4, 8);
      t.rotateX(Math.PI / 2 + 0.25);
      t.translate(sg * (-0.006 - i * 0.017), -0.062, 0.18 - i * 0.006);
      toes.push(t);
    }
    const big = new THREE.CapsuleGeometry(0.013, 0.035, 4, 8);
    big.rotateX(Math.PI / 2); big.rotateY(sg * 0.5);
    big.translate(sg * 0.04, -0.06, 0.14);
    add('foot' + s, mesh(merge([foot, ...toes, big]), M.skinDark));
    add('foot' + s, mesh(limb({ len: 0.06, radii: [[0, 0.046], [1, 0.05]], capTop: false }), M.bandage), [0, 0.02, 0]);
  }

  // ───── 腰带 / 绳结 / 鎏金带扣 ─────
  add('hips', mesh(band(0.178, 0.148, 0.075), Object.assign(M.leather.clone(), { side: THREE.DoubleSide })), [0, 0.07, 0]);
  const rope = mesh(new THREE.TorusGeometry(1, 0.075, 8, 64).rotateX(Math.PI / 2).scale(0.184, 0.16, 0.154), M.bandage);
  add('hips', rope, [0, 0.036, 0]);
  const buckle = mesh(new THREE.CylinderGeometry(0.036, 0.036, 0.012, 32).rotateX(Math.PI / 2), M.gold);
  add('hips', buckle, [0, 0.07, 0.152]);
  const knot = mesh(new THREE.TorusKnotGeometry(0.018, 0.007, 48, 8), M.bandage);
  add('hips', knot, [0.09, 0.03, 0.135]);
  // 腰间葫芦
  const gourdBelt = gourdMesh(M);
  add('hips', gourdBelt, [-0.185, 0.02, -0.06], [0.1, 0, -0.18]);
  const gourdHand = gourdMesh(M);
  gourdHand.children[0].position.y = -0.02;
  gourdHand.visible = false;
  add('handL', gourdHand, [0, -0.075, 0.02], [Math.PI, 0, 0]);

  // ───── 斜挎绶带 + 念珠 ─────
  const beads = [];
  const beadG = new THREE.SphereGeometry(1, 14, 10);
  for (let i = 0; i < 26; i++) {
    const a = (i / 26) * Math.PI * 2;
    const front = Math.cos(a);
    const r = i === 0 ? 0.024 : 0.016;
    const g = beadG.clone().scale(r, r, r);
    g.translate(Math.sin(a) * 0.165, 0.2 - 0.1 * (front * 0.5 + 0.5) - (i === 0 ? 0.012 : 0), Math.cos(a) * (front > 0 ? 0.172 : 0.14) - 0.01);
    beads.push(g);
  }
  add('chest', mesh(merge(beads), M.bead));
  const tassel = mesh(new THREE.ConeGeometry(0.014, 0.08, 10), M.cord);
  add('chest', tassel, [0, 0.055, 0.175], [Math.PI, 0, 0]);

  B.head.scale.setScalar(1.12);
  // ───── 细长猴尾（程序化摆动） ─────
  const tail = [];
  let tp = B.hips, tpos = [0, -0.05, -0.12];
  for (let i = 0; i < 6; i++) {
    const tb = new THREE.Object3D();
    tb.position.set(tpos[0], tpos[1], tpos[2]);
    tp.add(tb);
    const r0 = 0.019 - i * 0.0018, r1 = r0 - 0.0018;
    const seg = furPart(limb({ len: 0.13, radii: [[0, r0], [1, r1]], seg: 14, rings: 8 }), fur, { len: () => (i === 5 ? 2.2 : 1.1) });
    seg.traverse((o) => { if (o.isMesh && !o.isInstancedMesh) o.castShadow = true; });
    tb.add(seg);
    tb.rotation.x = i === 0 ? 1.15 : -0.28;
    tail.push(tb);
    tp = tb; tpos = [0, -0.125, 0];
  }
  rig.tail = tail;

  // ───── 金箍棒 ─────
  const staff = staffMesh(M, 1.9);
  rig.weapon.add(staff);
  staff.traverse((o) => { if (o.isMesh) allMeshes.push(o); });

  // ───── 布料：虎皮裙 + 后摆 ─────
  const fray = frayAlpha();
  const tiger = pbr(TX.tigerSkin(), { side: THREE.DoubleSide, alphaMap: fray, alphaTest: 0.5, repeat: [1, 1] });
  tiger.alphaMap = fray;
  const dark = pbr(TX.clothDark(), { side: THREE.DoubleSide, alphaTest: 0.5, repeat: [1, 2] });
  dark.alphaMap = fray;
  const colliders = [];
  for (const s of ['L', 'R']) {
    colliders.push({ bone: B['thigh' + s], off: new THREE.Vector3(0, -0.08, 0), r: 0.125 });
    colliders.push({ bone: B['thigh' + s], off: new THREE.Vector3(0, -0.22, 0.01), r: 0.112 });
    colliders.push({ bone: B['thigh' + s], off: new THREE.Vector3(0, -0.36, 0.01), r: 0.09 });
    colliders.push({ bone: B['shin' + s], off: new THREE.Vector3(0, -0.08, 0.01), r: 0.078 });
  }
  colliders.push({ bone: B.hips, off: new THREE.Vector3(0, -0.04, 0), r: 0.17 });
  const panel = (a0, a1, n, len, mat, ny = 10, rx = 0.19, rz = 0.16, y = 0.03) => {
    const anchors = [], outward = [];
    for (let i = 0; i < n; i++) {
      const a = a0 + (a1 - a0) * (i / (n - 1));
      anchors.push(new THREE.Vector3(Math.sin(a) * rx, y, Math.cos(a) * rz));
      outward.push(new THREE.Vector3(Math.sin(a), 0, Math.cos(a)));
    }
    return new Cloth({ bone: B.hips, anchors, outward, length: len, ny, material: mat, colliders, restPull: 0.03, flare: 0.07 });
  };
  const cloths = [
    panel(-0.62, 0.62, 8, 0.44, tiger),
    panel(Math.PI - 0.65, Math.PI + 0.65, 8, 0.42, tiger),
    panel(0.5, 2.62, 9, 0.32, tiger),
    panel(-2.62, -0.5, 9, 0.32, tiger),
    panel(Math.PI + 0.25, Math.PI + 0.55, 4, 0.72, dark, 14, 0.2, 0.17, 0.06),
  ];

  // 标记
  rig.root.traverse((o) => { if (o.isMesh) o.frustumCulled = false; });
  const sim = new THREE.Group();
  for (const c of cloths) sim.add(c.mesh);
  for (const f of feathers) sim.add(f.mesh);

  return {
    rig, sim, cloths, feathers, furMats, M, staff,
    gourdBelt, gourdHand, height: 1.75, radius: 0.38,
    allMeshes: () => { const a = []; rig.root.traverse((o) => o.isMesh && a.push(o)); sim.traverse((o) => o.isMesh && a.push(o)); return a; },
  };
}
