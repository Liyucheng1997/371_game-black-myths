// 敌人：苍狼校卫——狼首、鬃毛、札甲、绛红袍、大刀，同一套程序化骨骼/毛发/布料系统
import * as THREE from 'three';
import { Rig } from '../anim/rig.js';
import { makeFur, furMesh } from '../core/fur.js';
import { limb, ellipsoid, deform, furAttrs, smoothNormals, smoothstep, gauss, extrude, band, merge } from '../core/geo.js';
import { materials, fistGeo, openHandGeo, pbr } from './parts.js';
import * as TX from '../core/textures.js';
import { Cloth, frayAlpha } from '../sim/cloth.js';

export const WOLF_SPEC = {
  hipsY: 1.08, spine: 0.13, chest: 0.2, neck: 0.29, neckZ: 0.07, head: 0.08, headZ: 0.04,
  clavX: 0.045, clavY: 0.24, clavZ: -0.035, shoulderX: 0.19,
  upperArm: 0.36, foreArm: 0.34, fist: 0.085,
  hipX: 0.12, hipDrop: 0.08, thigh: 0.48, shin: 0.47, ankleH: 0.09,
  weaponHandFollow: true,
};
const FB = [0.07, 0.068, 0.065];

function wolfHead() {
  const g = new THREE.SphereGeometry(1, 96, 64);
  const P = g.attributes.position;
  const dirs = [];
  const v = new THREE.Vector3();
  for (let i = 0; i < P.count; i++) {
    v.fromBufferAttribute(P, i).normalize();
    const n = v.clone(); dirs.push(n);
    const { x, y, z } = n;
    let px = x * 0.12, py = y * 0.118, pz = z * 0.13;
    const sn = gauss(x / 0.5, (y + 0.28) / 0.42) * smoothstep(0.1, 0.92, z);
    const tip = smoothstep(0.55, 1.0, z) * sn;
    pz += 0.19 * sn;
    px *= 1 - 0.5 * tip;
    py *= 1 - 0.35 * tip;
    py -= 0.03 * sn;
    // 眉骨
    const brow = Math.exp(-(((y - 0.25) / 0.12) ** 2)) * smoothstep(0.3, 0.8, z) * smoothstep(0.1, 0.4, Math.abs(x));
    pz += 0.025 * brow; py += 0.01 * brow;
    // 下颌
    if (y < -0.3) { px *= 0.9; }
    // 嘴裂
    const lip = Math.exp(-(((y + 0.42) / 0.04) ** 2)) * smoothstep(0.3, 0.8, z);
    px *= 1 - 0.08 * lip; py -= 0.004 * lip;
    // 颧骨外扩
    const ch = gauss((Math.abs(x) - 0.7) / 0.25, (y + 0.05) / 0.25) * smoothstep(-0.2, 0.4, z);
    px += Math.sign(x) * 0.02 * ch;
    P.setXYZ(i, px, 0.13 + py, 0.02 + pz);
  }
  smoothNormals(g);
  furAttrs(g, {
    len: (p, nn, i) => {
      const d = dirs[i];
      const snout = smoothstep(0.75, 0.98, d.z) * gauss(d.x / 0.5, (d.y + 0.28) / 0.42);
      return (1 - snout * 0.85) * (0.8 + 0.8 * smoothstep(0.3, 0.9, Math.abs(d.x)) * smoothstep(0.3, -0.5, d.z));
    },
    color: (p, nn, i) => {
      const d = dirs[i];
      const nose = smoothstep(0.93, 0.99, d.z) * gauss(d.x / 0.3, (d.y + 0.25) / 0.3);
      const lip = Math.exp(-(((d.y + 0.42) / 0.06) ** 2)) * smoothstep(0.3, 0.8, d.z);
      const k = 1 - Math.max(nose, lip) * 0.85;
      return FB.map((c) => c * k);
    },
  });
  return g;
}

function sabreGeo() {
  const s = new THREE.Shape();
  // 刃：x 为宽度方向（刃口在 -x），y 为长度
  s.moveTo(0.012, 0.13);
  s.lineTo(0.016, 0.8);
  s.quadraticCurveTo(0.014, 0.98, -0.04, 1.08);
  s.quadraticCurveTo(-0.07, 0.95, -0.07, 0.82);
  s.quadraticCurveTo(-0.055, 0.45, -0.045, 0.13);
  s.lineTo(0.012, 0.13);
  const blade = extrude(s, 0.004, 0.0025, 32);
  return blade;
}

// 大刀（也可挂到外部导入模型的手上）
export function buildSabre(M) {
  const mesh = (g, m) => new THREE.Mesh(g, m);
  const sabre = new THREE.Group();
  const steel = new THREE.MeshStandardMaterial({ color: 0xb8bcc0, metalness: 1, roughness: 0.22, envMapIntensity: 1.4 });
  sabre.add(mesh(sabreGeo(), steel));
  sabre.add(mesh(new THREE.CylinderGeometry(0.06, 0.06, 0.016, 24).translate(0, 0.12, 0), M.gold));
  sabre.add(mesh(new THREE.CylinderGeometry(0.02, 0.022, 0.26, 12), M.cord));
  sabre.add(mesh(new THREE.SphereGeometry(0.03, 12, 10).translate(0, -0.14, 0), M.gold));
  sabre.traverse((o) => { if (o.isMesh) { o.castShadow = true; o.userData.ghost = true; } });
  return sabre;
}

export function buildWolf() {
  const rig = new Rig(WOLF_SPEC);
  const B = rig.bones;
  const M = materials();
  const fur = makeFur({ root: 0x161514, tip: 0x8f8a80, length: 0.022, shells: 16, gravity: 0.7 });
  const mane = makeFur({ root: 0x1d1b19, tip: 0xc9c2b4, length: 0.026, shells: 16, gravity: 0.9 });
  const furMats = [fur, mane];
  const lam = pbr(TX.lamellar(), { metal: true, repeat: [2, 2], side: THREE.DoubleSide });
  const robe = pbr(TX.clothRed(), { side: THREE.DoubleSide, alphaTest: 0.5, repeat: [1, 2] });
  robe.alphaMap = frayAlpha();
  const add = (bone, obj, pos, rot) => {
    if (pos) obj.position.set(pos[0], pos[1], pos[2]);
    if (rot) obj.rotation.set(rot[0], rot[1], rot[2]);
    B[bone].add(obj);
    obj.traverse((o) => { if (o.isMesh && !o.isInstancedMesh) { o.castShadow = true; o.receiveShadow = true; o.userData.ghost = true; } });
    return obj;
  };
  const mesh = (g, m) => new THREE.Mesh(g, m);
  const furPart = (g, f = fur, len = () => 1) => { furAttrs(g, { len, color: () => FB }); return furMesh(g, f); };

  // 躯干
  add('hips', mesh(ellipsoid(0.2, 0.14, 0.15), M.pants), [0, -0.02, -0.01]);
  add('spine', furPart(ellipsoid(0.18, 0.16, 0.145, 48, 32)), [0, 0.08, 0]);
  const chestG = deform(ellipsoid(0.25, 0.2, 0.17, 64, 44), (p) => {
    p.z -= 0.04 * smoothstep(0, -0.12, p.z) * gauss((p.y - 0.1) / 0.1);
    p.x *= 1 + 0.15 * smoothstep(0, 0.15, p.y);
  });
  chestG.translate(0, 0.13, 0);
  add('chest', furPart(chestG));
  const neckG = limb({ len: 0.16, radii: [[0, 0.1], [1, 0.085]] });
  neckG.rotateX(Math.PI);
  add('neck', furPart(neckG, fur, () => 1.3), [0, -0.04, 0]);
  // 鬃毛
  const maneG = new THREE.TorusGeometry(0.15, 0.085, 16, 40);
  maneG.rotateX(Math.PI / 2 - 0.5);
  maneG.scale(1.1, 1, 1);
  add('neck', furPart(maneG, mane, () => 2.6), [0, 0.02, -0.02]);
  // 头
  add('head', furPart(wolfHead(), fur));
  for (const sg of [1, -1]) {
    const ear = new THREE.ConeGeometry(0.04, 0.12, 16, 4);
    ear.scale(1, 1, 0.5);
    add('head', furPart(ear, fur, () => 0.7), [sg * 0.065, 0.25, -0.03], [-0.2, 0, -sg * 0.3]);
    const eye = mesh(new THREE.SphereGeometry(0.014, 20, 14), new THREE.MeshPhysicalMaterial({
      map: TX.eyeIris('wolf'), emissive: 0xffffff, emissiveMap: TX.eyeIris('wolf'), emissiveIntensity: 1.6, roughness: 0.1, clearcoat: 1,
    }));
    add('head', eye, [sg * 0.057, 0.15, 0.133], [0, sg * 0.35, 0]);
    // 獠牙
    for (let i = 0; i < 4; i++) {
      const t = new THREE.ConeGeometry(0.006 - i * 0.0008, 0.03 - i * 0.004, 6);
      t.rotateX(Math.PI);
      add('head', mesh(t, new THREE.MeshStandardMaterial({ color: 0xd8cbb0, roughness: 0.4 })), [sg * (0.03 - i * 0.004), 0.065, 0.22 + 0.06 - i * 0.022]);
    }
  }
  add('head', mesh(ellipsoid(0.022, 0.016, 0.02), new THREE.MeshPhysicalMaterial({ color: 0x080606, roughness: 0.2, clearcoat: 1 })), [0, 0.112, 0.335]);

  // 札甲胸铠 + 护肩
  const cuir = new THREE.SphereGeometry(1, 48, 24, -1.2, 2.4 + Math.PI, 0.55, 1.5);
  cuir.scale(0.27, 0.22, 0.19);
  cuir.translate(0, 0.12, 0);
  add('chest', mesh(cuir, lam));
  for (const [s, sg] of [['L', 1], ['R', -1]]) {
    const pd = new THREE.Group();
    for (let i = 0; i < 3; i++) {
      const g = new THREE.SphereGeometry(0.125 - i * 0.01, 32, 12, 0, Math.PI * 2, 0, 1.0);
      g.scale(1, 0.75, 0.95);
      const m = mesh(g, lam);
      m.position.set(sg * (0.01 + i * 0.014), -i * 0.05, 0);
      m.rotation.z = sg * (0.35 + i * 0.12) * -1;
      pd.add(m);
    }
    add('upperArm' + s, pd, [0, 0.035, 0]);
    add('upperArm' + s, furPart(ellipsoid(0.095, 0.1, 0.095, 40, 28)), [sg * 0.008, -0.035, 0]);
    add('upperArm' + s, furPart(limb({ len: 0.36, radii: [[0, 0.07], [0.35, 0.075], [1, 0.055]], sz: 0.92 })));
    add('foreArm' + s, furPart(limb({ len: 0.34, radii: [[0, 0.062], [0.25, 0.066], [1, 0.045]], sz: 0.9 })));
    const brP = [[0.072, -0.08], [0.076, -0.09], [0.07, -0.2], [0.06, -0.3], [0.056, -0.31]].map(([r, y]) => new THREE.Vector2(r, y));
    add('foreArm' + s, mesh(new THREE.LatheGeometry(brP, 32), lam));
    if (s === 'R') add('hand' + s, mesh(fistGeo(sg, WOLF_SPEC.fist, 1.15), M.skinDark));
    else add('hand' + s, mesh(openHandGeo(sg, 1.2, true), M.skinDark));
    // 腿
    add('thigh' + s, mesh(limb({ len: 0.5, radii: [[0, 0.12], [0.4, 0.11], [1, 0.075]], sz: 0.95 }), M.pants));
    add('shin' + s, furPart(limb({ len: 0.47, radii: [[0, 0.075], [0.3, 0.07], [1, 0.045]], sz: 0.95 })));
    const paw = merge([
      ellipsoid(0.058, 0.04, 0.12, 24, 16).translate(0, -0.055, 0.07),
      ...[0, 1, 2, 3].map((i) => new THREE.ConeGeometry(0.008, 0.035, 6).rotateX(Math.PI / 2).translate((i - 1.5) * 0.026, -0.075, 0.2)),
    ]);
    add('foot' + s, mesh(paw, M.skinDark));
  }
  // 腰带
  add('hips', mesh(band(0.215, 0.17, 0.09), Object.assign(M.leather.clone(), { side: THREE.DoubleSide })), [0, 0.06, 0]);
  add('hips', mesh(new THREE.CylinderGeometry(0.045, 0.045, 0.014, 32).rotateX(Math.PI / 2), M.gold), [0, 0.06, 0.172]);
  // 尾巴
  const tailG = limb({ len: 0.55, radii: [[0, 0.05], [0.4, 0.075], [1, 0.03]] });
  const tail = new THREE.Group();
  tail.add(furPart(tailG, mane, () => 2.3));
  add('hips', tail, [0, -0.02, -0.15], [0.9, 0, 0]);
  rig.tail = tail;

  const sabre = buildSabre(M);
  rig.weapon.add(sabre);

  // 布料：袍摆
  const colliders = [];
  for (const s of ['L', 'R']) {
    colliders.push({ bone: B['thigh' + s], off: new THREE.Vector3(0, -0.1, 0), r: 0.14 });
    colliders.push({ bone: B['thigh' + s], off: new THREE.Vector3(0, -0.28, 0.01), r: 0.125 });
    colliders.push({ bone: B['thigh' + s], off: new THREE.Vector3(0, -0.45, 0.01), r: 0.1 });
    colliders.push({ bone: B['shin' + s], off: new THREE.Vector3(0, -0.12, 0.01), r: 0.085 });
  }
  colliders.push({ bone: B.hips, off: new THREE.Vector3(0, -0.04, 0), r: 0.2 });
  const panel = (a0, a1, n, len, ny = 12) => {
    const anchors = [], outward = [];
    for (let i = 0; i < n; i++) {
      const a = a0 + (a1 - a0) * (i / (n - 1));
      anchors.push(new THREE.Vector3(Math.sin(a) * 0.23, 0.03, Math.cos(a) * 0.19));
      outward.push(new THREE.Vector3(Math.sin(a), 0, Math.cos(a)));
    }
    return new Cloth({ bone: B.hips, anchors, outward, length: len, ny, material: robe, colliders, restPull: 0.03, flare: 0.08 });
  };
  const cloths = [panel(-0.6, 0.6, 8, 0.62), panel(Math.PI - 0.7, Math.PI + 0.7, 9, 0.66), panel(0.6, 1.6, 5, 0.45), panel(-1.6, -0.6, 5, 0.45)];
  const sim = new THREE.Group();
  for (const c of cloths) sim.add(c.mesh);
  rig.root.traverse((o) => { if (o.isMesh) o.frustumCulled = false; });

  return { rig, sim, cloths, feathers: [], furMats, M, sabre, height: 2.15, radius: 0.5 };
}
