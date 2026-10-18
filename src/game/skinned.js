// 外部蒙皮角色运行时：AnimationMixer 驱动，接口与程序化 Actor/Animator 一致，可直接复用战斗逻辑
import * as THREE from 'three';
import { Actor } from './actor.js';

// 配置里的动作名 → 程序化动作库中的剪辑名（沿用其命中窗口、连招窗口、无敌帧、位移曲线）
export const WK_KEYS = { attack1: 'A1', attack2: 'A2', attack3: 'A3', attack4: 'A4', charge: 'HC', heavy: 'HS', dodge: 'DG', hit: 'HIT', drink: 'DRINK', spell: 'SPELL', death: 'DEATH', victory: 'WIN' };
export const WF_KEYS = { slash1: 'S1', slash2: 'S2', leap: 'LEAP', spin: 'SPIN', hit: 'WHIT', stagger: 'STAG', death: 'WDEATH', roar: 'ROAR' };
const FALLBACK = {
  A2: ['A1'], A3: ['A2', 'A1'], A4: ['A3', 'A1'], HS: ['A3', 'A1'], WIN: [], DEATH: ['HIT'],
  S2: ['S1'], SPIN: ['S2', 'S1'], LEAP: ['S1'], STAG: ['WHIT'], WDEATH: ['STAG', 'WHIT'],
};

// 把程序化剪辑的时间元数据按真实动画时长缩放；配置可逐项覆盖（单位：秒）
function deriveMeta(meta, dur, ov = {}) {
  const k = dur / meta.dur;
  return {
    name: meta.name, dur, loop: false, keys: meta.keys,
    hit: ov.hit || meta.hit.map((w) => [w[0] * k, w[1] * k, w[2]]),
    combo: ov.combo || (meta.combo ? meta.combo.map((t) => t * k) : null),
    cancel: ov.cancel ?? meta.cancel * k,
    iframes: ov.iframes || (meta.iframes ? meta.iframes.map((t) => t * k) : null),
    events: (ov.events || meta.events.map((e) => ({ ...e, t: e.t * k }))).slice().sort((a, b) => a.t - b.t),
    motion: ov.motion || meta.motion.map((m) => [m[0] * k, m[1] * k, m[2] / k]),
    meta: { ...meta.meta, ...(meta.meta.tele != null ? { tele: meta.meta.tele * k } : {}) },
  };
}

const toward = (v, t, d) => (v < t ? Math.min(t, v + d) : Math.max(t, v - d));
const sm = (x) => { const t = Math.min(1, Math.max(0, x)); return t * t * (3 - 2 * t); };

export class SkinnedAnimator {
  constructor(mixer, clips, metas, keymap, runSpeed = 4.4, sprintSpeed = 7.2) {
    this.mixer = mixer;
    this.ctx = { speed: 0, phase: 0, runW: 0, lean: 0 };
    this.speed = 1; this.time = 0; this.clip = null; this.done = false; this.onEvent = null;
    this.runSpeed = runSpeed; this.sprintSpeed = sprintSpeed;
    const loop = (key) => {
      const c = clips[key];
      if (!c) return null;
      const a = mixer.clipAction(c.clip);
      a.setLoop(THREE.LoopRepeat, Infinity);
      a.play();
      a.setEffectiveWeight(0);
      return a;
    };
    this.idle = loop('idle');
    this.run = loop('run') || loop('walk');
    this.sprint = loop('sprint');
    this.by = {};
    for (const [key, name] of Object.entries(keymap)) {
      const c = clips[key];
      if (c && metas[name]) this.by[name] = { action: mixer.clipAction(c.clip), meta: deriveMeta(metas[name], c.clip.duration, c.cfg) };
    }
    this.metas = metas;
    this.shots = [];
    this.locoW = 1; this.locoTarget = 1; this.locoRate = 5;
  }
  resolve(meta) {
    if (this.by[meta.name]) return this.by[meta.name];
    for (const fb of FALLBACK[meta.name] || []) {
      const e = this.by[fb];
      if (e) return { action: e.action, meta: deriveMeta(meta, e.action.getClip().duration) };
    }
    return { action: null, meta };
  }
  play(meta, { fade = 0.1, speed = 1 } = {}) {
    if (!meta) return this.stop(fade);
    const r = this.resolve(meta);
    const rate = 1 / Math.max(0.02, fade);
    for (const s of this.shots) { s.target = 0; s.rate = rate; }
    if (r.action) {
      const a = r.action;
      a.reset();
      a.setLoop(THREE.LoopOnce, 1);
      a.clampWhenFinished = true;
      a.timeScale = 1;
      a.play();
      let e = this.shots.find((s) => s.action === a);
      if (!e) { e = { action: a, w: 0 }; this.shots.push(e); }
      else e.w = Math.min(e.w, 0.3);
      e.target = 1; e.rate = rate;
      this.locoTarget = 0;
    } else this.locoTarget = 1;
    this.locoRate = rate;
    this.clip = r.meta; this.time = 0; this.speed = speed; this.done = false;
  }
  stop(fade = 0.2) {
    const rate = 1 / Math.max(0.02, fade);
    for (const s of this.shots) { s.target = 0; s.rate = rate; }
    this.locoTarget = 1; this.locoRate = rate;
    this.clip = null; this.done = false; this.speed = this.speed === 0 ? 0 : 1;
  }
  update(dt) {
    const sdt = dt * this.speed;
    if (this.clip) {
      const prev = this.time;
      this.time += sdt;
      for (const e of this.clip.events) if (e.t > prev && e.t <= this.time && this.onEvent) this.onEvent(e, this.clip);
      if (this.time >= this.clip.dur) { this.time = this.clip.dur; this.done = true; }
    }
    for (let i = this.shots.length - 1; i >= 0; i--) {
      const s = this.shots[i];
      s.w = toward(s.w, s.target, dt * s.rate);
      s.action.setEffectiveWeight(s.w);
      if (s.w <= 0 && s.target === 0) { s.action.stop(); this.shots.splice(i, 1); }
    }
    this.locoW = toward(this.locoW, this.locoTarget, dt * this.locoRate);
    const sp = this.ctx.speed, rw = this.ctx.runW;
    const spW = this.sprint ? sm((sp - this.runSpeed * 1.1) / (this.sprintSpeed - this.runSpeed * 1.1)) : 0;
    const L = this.locoW;
    if (this.idle) this.idle.setEffectiveWeight(L * (this.run ? 1 - rw : 1));
    if (this.run) { this.run.setEffectiveWeight(L * rw * (1 - spW)); this.run.timeScale = Math.min(1.8, Math.max(0.55, sp / this.runSpeed)); }
    if (this.sprint) { this.sprint.setEffectiveWeight(L * rw * spW); this.sprint.timeScale = Math.min(1.5, Math.max(0.7, sp / this.sprintSpeed)); }
    this.mixer.update(this.clip ? sdt : dt * (this.speed === 0 ? 0 : 1));
    return null;
  }
  motion() {
    const c = this.clip;
    if (!c) return 0;
    let v = 0;
    for (const m of c.motion) if (this.time >= m[0] && this.time < m[1]) v += m[2];
    return v;
  }
  inWindow(w) { return w && this.time >= w[0] && this.time <= w[1]; }
}

const STUB_POSE = { fx: { gourd: 0, open: 0, glow: 0 } };

export class SkinnedActor {
  constructor(loaded, metas, keymap, scene, runSpeed) {
    this.loaded = loaded;
    this.skinned = true;
    this.root = new THREE.Object3D();
    this.root.add(loaded.root);
    scene.add(this.root);
    this.b = { sim: new THREE.Group(), cloths: [], feathers: [], furMats: [] };
    scene.add(this.b.sim);
    const map = loaded.analysis.map;
    this.rig = {
      root: this.root, model: loaded.root,
      weapon: loaded.weapon ? loaded.weapon.obj : new THREE.Object3D(),
      bones: { handL: map.LeftHand || this.root, handR: map.RightHand || this.root, head: map.Head || this.root },
      tail: null,
    };
    if (!loaded.weapon) this.root.add(this.rig.weapon);
    this.wl = loaded.weapon ? loaded.weapon.seg : [new THREE.Vector3(), new THREE.Vector3(0, 0.01, 0)];
    this.mixer = new THREE.AnimationMixer(loaded.root);
    this.anim = new SkinnedAnimator(this.mixer, loaded.clips, metas, keymap, runSpeed);
    this.facing = 0;
    this.vel = new THREE.Vector3();
    this.segA = new THREE.Vector3(); this.segB = new THREE.Vector3();
    this.prevA = new THREE.Vector3(); this.prevB = new THREE.Vector3();
    this.mats = new Set();
    this.root.traverse((o) => {
      if (!o.isMesh) return;
      (Array.isArray(o.material) ? o.material : [o.material]).forEach((m) => m.emissive && this.mats.add(m));
    });
    this.orig = new Map();
    for (const m of this.mats) this.orig.set(m, { c: m.emissive.clone(), i: m.emissiveIntensity });
    this.tintK = 0;
    this.frozen = false;
  }
  get pos() { return this.root.position; }
  forward(out = new THREE.Vector3()) { return out.set(Math.sin(this.facing), 0, Math.cos(this.facing)); }
  update(dt) {
    this.root.rotation.y = this.facing;
    this.anim.update(dt);
    this.onPose && this.onPose(STUB_POSE, dt);
    this.root.updateMatrixWorld(true);
    this.prevA.copy(this.segA); this.prevB.copy(this.segB);
    this.weaponSeg(this.segA, this.segB);
    return STUB_POSE;
  }
  weaponSeg(a, b) {
    const m = this.rig.weapon.matrixWorld;
    a.copy(this.wl[0]).applyMatrix4(m);
    b.copy(this.wl[1]).applyMatrix4(m);
  }
  resetSim() {
    this.root.rotation.y = this.facing;
    this.anim.update(0);
    this.root.updateMatrixWorld(true);
    this.weaponSeg(this.segA, this.segB);
    this.prevA.copy(this.segA); this.prevB.copy(this.segB);
  }
}
SkinnedActor.prototype.tint = Actor.prototype.tint;
