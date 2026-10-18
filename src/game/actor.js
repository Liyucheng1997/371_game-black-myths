// 角色运行时：模型 + 动画播放器 + 次级物理 + 武器线段 + 状态染色
import * as THREE from 'three';
import { Animator } from '../anim/clips.js';

export class Actor {
  constructor(built, idle, loco, scene, weaponSeg) {
    this.b = built;
    this.rig = built.rig;
    this.root = built.rig.root;
    scene.add(this.root);
    scene.add(built.sim);
    this.anim = new Animator(idle, loco);
    this.facing = 0;
    this.vel = new THREE.Vector3();
    this.wl = weaponSeg.map((y) => new THREE.Vector3(0, y, 0));
    this.segA = new THREE.Vector3(); this.segB = new THREE.Vector3();
    this.prevA = new THREE.Vector3(); this.prevB = new THREE.Vector3();
    this.mats = new Set();
    const collect = (o) => {
      if (!o.isMesh) return;
      const ms = Array.isArray(o.material) ? o.material : [o.material];
      ms.forEach((m) => m.emissive && this.mats.add(m));
    };
    this.root.traverse(collect);
    built.sim.traverse(collect);
    for (const f of built.furMats) { this.mats.add(f.shellMat); this.mats.add(f.baseMat); }
    this.orig = new Map();
    for (const m of this.mats) this.orig.set(m, { c: m.emissive.clone(), i: m.emissiveIntensity });
    this.tintK = 0;
    this.frozen = false;
  }
  get pos() { return this.root.position; }
  forward(out = new THREE.Vector3()) { return out.set(Math.sin(this.facing), 0, Math.cos(this.facing)); }

  update(dt, wind) {
    this.root.rotation.y = this.facing;
    const P = this.anim.update(dt);
    this.onPose && this.onPose(P, dt);
    this.rig.apply(P);
    this.prevA.copy(this.segA); this.prevB.copy(this.segB);
    this.weaponSeg(this.segA, this.segB);
    const w = wind || new THREE.Vector3();
    for (const c of this.b.cloths) { c.frozen = this.frozen; c.update(dt, w); }
    for (const f of this.b.feathers) { f.frozen = this.frozen; f.update(dt, w); }
    for (const f of this.b.furMats) f.uniforms.uWind.value.set(w.x * 0.03, 0, w.z * 0.03);
    return P;
  }
  weaponSeg(a, b) {
    const m = this.rig.weapon.matrixWorld;
    a.copy(this.wl[0]).applyMatrix4(m);
    b.copy(this.wl[1]).applyMatrix4(m);
  }
  resetSim() {
    this.root.rotation.y = this.facing;
    this.rig.apply(this.anim.update(0));
    this.weaponSeg(this.segA, this.segB);
    this.prevA.copy(this.segA); this.prevB.copy(this.segB);
    for (const c of this.b.cloths) c.reset();
    for (const f of this.b.feathers) f.reset();
  }
  tint(color, k) {
    if (Math.abs(k - this.tintK) < 1e-3) return;
    this.tintK = k;
    for (const m of this.mats) {
      const o = this.orig.get(m);
      m.emissive.copy(o.c).lerp(color, Math.min(1, k));
      m.emissiveIntensity = THREE.MathUtils.lerp(o.i, 1, Math.min(1, k)) * (k > 0 ? Math.max(1, k) : 1);
    }
  }
}

// 线段-线段最近距离，返回距离并写入两线段上的最近点
const _d1 = new THREE.Vector3(), _d2 = new THREE.Vector3(), _r = new THREE.Vector3();
export function segSeg(p1, q1, p2, q2, c1, c2) {
  _d1.subVectors(q1, p1); _d2.subVectors(q2, p2); _r.subVectors(p1, p2);
  const a = _d1.dot(_d1), e = _d2.dot(_d2), f = _d2.dot(_r);
  let s, t;
  const c = _d1.dot(_r), b = _d1.dot(_d2), den = a * e - b * b;
  s = den > 1e-8 ? THREE.MathUtils.clamp((b * f - c * e) / den, 0, 1) : 0;
  t = (b * s + f) / e;
  if (t < 0) { t = 0; s = THREE.MathUtils.clamp(-c / a, 0, 1); }
  else if (t > 1) { t = 1; s = THREE.MathUtils.clamp((b - c) / a, 0, 1); }
  c1.copy(p1).addScaledVector(_d1, s);
  c2.copy(p2).addScaledVector(_d2, t);
  return c1.distanceTo(c2);
}
