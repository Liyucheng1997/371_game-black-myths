// 战斗逻辑：天命人控制器、狼校卫 AI、命中判定、受击/硬直/定身/完美闪身
import * as THREE from 'three';
import { WK, WF } from '../anim/clips.js';
import { segSeg } from './actor.js';
import { ARENA_R } from '../world/world.js';

const _v = new THREE.Vector3(), _w = new THREE.Vector3(), _c1 = new THREE.Vector3(), _c2 = new THREE.Vector3();
const _a = new THREE.Vector3(), _b = new THREE.Vector3(), _p = new THREE.Vector3(), _q = new THREE.Vector3();
const angTo = (from, to) => Math.atan2(to.x - from.x, to.z - from.z);
const wrap = (a) => Math.atan2(Math.sin(a), Math.cos(a));
const turn = (cur, tgt, max) => cur + THREE.MathUtils.clamp(wrap(tgt - cur), -max, max);
const smooth01 = (x) => { const t = Math.min(1, Math.max(0, x)); return t * t * (3 - 2 * t); };
const GOLD = new THREE.Color(1.0, 0.72, 0.25);

// 武器命中目标胶囊（对上一帧与本帧之间插值，防止高速挥击穿透）
export function weaponHit(att, tgt, out) {
  _p.copy(tgt.pos).y += 0.35;
  _q.copy(tgt.pos).y += tgt.height * 0.88;
  for (let i = 1; i <= 4; i++) {
    const s = i / 4;
    _a.lerpVectors(att.prevA, att.segA, s);
    _b.lerpVectors(att.prevB, att.segB, s);
    const d = segSeg(_a, _b, _p, _q, _c1, _c2);
    if (d < tgt.radius + 0.06) { out && out.copy(_c1); return true; }
  }
  return false;
}

export class Player {
  constructor(actor, G) {
    this.A = actor; this.G = G;
    this.A.height = 1.7; this.A.radius = 0.36;
    this.reset();
    actor.anim.onEvent = (e) => this.onEvent(e);
    actor.onPose = (P) => {
      const r = actor.rig;
      if (actor.b.gourdHand) {
        actor.b.gourdHand.visible = P.fx.gourd > 0.5;
        actor.b.gourdBelt.visible = P.fx.gourd <= 0.5;
      }
      if (r.handOpenL) {
        r.handOpenL.visible = P.fx.open > 0.5;
        r.handFistL.visible = P.fx.open <= 0.5;
      }
      if (r.tail) {
        const t = performance.now() * 0.001;
        r.tail.forEach((b, i) => { if (i > 0) { b.rotation.z = Math.sin(t * 2.1 - i * 0.7) * 0.16; b.rotation.x = -0.28 + Math.sin(t * 1.4 - i * 0.5) * 0.08; } });
      }
    };
  }
  reset() {
    this.hpMax = 340; this.hp = 340; this.mp = 100; this.st = 100; this.focus = 0;
    this.gourd = 4; this.spellCd = 0; this.stDelay = 0;
    this.state = 'move'; this.combo = -1; this.buf = { light: 0, dodge: 0 };
    this.hitIds = new Set(); this.chargeT = 0; this.chargeLvl = 0; this.dodgeT = 0;
    this.ghostT = 0; this.prevPhase = 0; this.hurtFlash = 0; this.heavyMul = 1;
    const A = this.A;
    A.pos.set(0, 0, 7); A.facing = Math.PI; A.vel.set(0, 0, 0);
    A.anim.stop(0.01);
    A.anim.ctx.speed = 0; A.anim.ctx.runW = 0;
  }
  get alive() { return this.state !== 'dead'; }
  get inv() { const c = this.A.anim.clip; return this.state === 'dodge' && c && this.A.anim.inWindow(c.iframes); }

  toMove(fade = 0.22) { this.state = 'move'; this.combo = -1; this.A.vel.set(0, 0, 0); this.A.anim.stop(fade); }

  faceTarget(wish) {
    const E = this.G.enemy;
    if (E && E.alive && E.A.pos.distanceTo(this.A.pos) < 6.5) this.A.facing = angTo(this.A.pos, E.A.pos);
    else if (wish.lengthSq() > 0.04) this.A.facing = Math.atan2(wish.x, wish.z);
  }
  startAttack(k, wish) {
    this.state = 'attack'; this.combo = k; this.hitIds.clear();
    this.buf.light = 0;
    this.faceTarget(wish);
    this.A.anim.play(WK.COMBO[k], { fade: k === 0 ? 0.09 : 0.05, speed: 1.08 });
    this.useSt(k === 3 ? 14 : 9);
    this.whooshed = -1;
  }
  startCharge() {
    this.state = 'charge'; this.chargeT = 0; this.chargeLvl = 0;
    this.A.anim.play(WK.HC, { fade: 0.15 });
  }
  startHeavy() {
    this.state = 'heavy'; this.hitIds.clear();
    this.faceTarget(_w.set(0, 0, 0));
    this.heavyMul = 1 + this.chargeLvl * 0.6;
    this.heavyFocus = this.focus;
    this.A.anim.play(WK.HS, { fade: 0.05 });
    this.useSt(18);
    this.G.sound.whoosh(1.4, 0.7);
  }
  startDodge(wish) {
    this.state = 'dodge'; this.buf.dodge = 0; this.dodgeT = 0; this.ghostT = 0;
    if (wish.lengthSq() > 0.04) this.A.facing = Math.atan2(wish.x, wish.z);
    else this.A.facing = wrap(this.A.facing + Math.PI) * 0 + this.A.facing; // 原地向前闪
    this.A.anim.play(WK.DG, { fade: 0.05 });
    this.useSt(22);
    this.G.sound.whoosh(0.8, 1.6);
    this.G.fx.dust(this.A.pos, 6, 0.3, [0.4, 0.37, 0.33], 0.5);
  }
  useSt(n) { this.st = Math.max(0, this.st - n); this.stDelay = 0.7; }

  onEvent(e) {
    const G = this.G;
    if (e.type === 'impact') {
      const tip = this.A.segB.clone(); tip.y = 0;
      if (this.state === 'heavy') {
        const lvl = this.chargeLvl;
        G.fx.shockwave(tip, 0.6 + lvl * 0.35);
        G.shake(0.35 + lvl * 0.15, 0.5);
        G.sound.boom(0.7 + lvl * 0.15);
        G.post.radial = 0.6 + lvl * 0.2;
        G.post.flash = 0.12;
        const E = G.enemy;
        if (E && E.alive && !this.hitIds.has('aoe')) {
          const d = E.A.pos.distanceTo(tip);
          if (d < 2.2 + lvl * 0.5 && !this.hitIds.size) {
            this.hitIds.add('aoe');
            G.damageEnemy(E, this.heavyDamage() * 0.7, 'heavy', E.A.pos.clone().setY(1.0), 40 + lvl * 15);
          }
        }
        this.focus = 0;
      } else {
        G.fx.dust(tip, 10, 0.4, [0.42, 0.38, 0.33], 0.6);
        G.fx.sparks(tip.setY(0.08), new THREE.Vector3(0, 1, 0), 14);
        G.shake(0.15, 0.25);
        G.sound.hit(0.6);
      }
    } else if (e.type === 'heal') {
      this.hp = Math.min(this.hpMax, this.hp + this.hpMax * 0.38);
      G.fx.goldDust(this.A.pos.clone().setY(1.0), 40, 0.8, 1.2);
      G.sound.gulp();
      G.toast('回 春');
    } else if (e.type === 'cast') {
      G.castImmobilize();
    }
  }
  heavyDamage() { return 52 * this.heavyMul + this.heavyFocus * 38; }

  hurt(dmg, from) {
    if (!this.alive || this.state === 'win') return false;
    if (this.inv) {
      if (this.A.anim.time < 0.2 && !this.perfectT) { this.perfectT = 1; this.G.perfectDodge(); }
      return false;
    }
    this.hp -= dmg;
    this.hurtFlash = 1;
    this.G.post.hurt = 0.8;
    const superArmor = this.state === 'heavy' && this.A.anim.time < 0.4;
    if (this.hp <= 0) {
      this.hp = 0; this.state = 'dead';
      this.A.anim.play(WK.DEATH, { fade: 0.1 });
      this.G.onPlayerDeath();
    } else if (!superArmor) {
      this.state = 'hit';
      if (from) this.A.facing = angTo(this.A.pos, from);
      this.A.anim.play(WK.HIT, { fade: 0.04 });
    }
    return true;
  }

  update(dt, I, cam) {
    const A = this.A, an = A.anim, G = this.G;
    this.buf.light = Math.max(0, this.buf.light - dt);
    this.buf.dodge = Math.max(0, this.buf.dodge - dt);
    if (I.light) this.buf.light = 0.4;
    if (I.dodge) this.buf.dodge = 0.3;
    this.spellCd = Math.max(0, this.spellCd - dt);
    this.stDelay -= dt;
    if (this.stDelay <= 0 && this.state !== 'charge') this.st = Math.min(100, this.st + 34 * dt);
    this.mp = Math.min(100, this.mp + 2.2 * dt);
    this.hurtFlash = Math.max(0, this.hurtFlash - dt * 2);
    if (this.perfectT) this.perfectT = Math.max(0, this.perfectT - dt);

    const fwd = _v.set(Math.sin(cam.yaw), 0, Math.cos(cam.yaw));
    const right = _w.set(-Math.cos(cam.yaw), 0, Math.sin(cam.yaw));
    const wish = new THREE.Vector3().addScaledVector(fwd, I.my).addScaledVector(right, I.mx);
    if (wish.lengthSq() > 1) wish.normalize();
    const canAct = this.alive && this.state !== 'win';

    switch (this.state) {
      case 'move': {
        const moving = wish.lengthSq() > 0.02;
        const sprint = I.sprint && moving && this.st > 3;
        const target = moving ? (sprint ? 7.2 : 4.4) : 0;
        const cur = Math.hypot(A.vel.x, A.vel.z);
        const tv = wish.clone().normalize().multiplyScalar(target);
        if (!moving) tv.set(0, 0, 0);
        A.vel.lerp(tv, 1 - Math.exp(-dt * (moving ? 9 : 12)));
        const prevF = A.facing;
        if (moving) A.facing = turn(A.facing, Math.atan2(wish.x, wish.z), dt * 11);
        A.pos.addScaledVector(A.vel, dt);
        if (sprint) { this.st -= 16 * dt; this.stDelay = 0.4; }
        const sp = Math.hypot(A.vel.x, A.vel.z);
        const ctx = an.ctx;
        ctx.speed = sp; ctx.runW = smooth01(sp / 2.0);
        const stride = Math.min(1.25, 0.35 + sp * 0.13);
        ctx.phase = (ctx.phase + dt * sp * 0.38 / stride) % 1;
        ctx.lean = THREE.MathUtils.lerp(ctx.lean, -wrap(A.facing - prevF) / Math.max(dt, 1e-3) * 0.04, 0.2);
        const ph = ctx.phase;
        if ((this.prevPhase < 0.5 && ph >= 0.5) || ph < this.prevPhase) {
          if (sp > 1) { G.sound.step(Math.min(0.5, sp / 12)); if (sprint) G.fx.dust(A.pos, 2, 0.2, [0.4, 0.37, 0.33], 0.35); }
        }
        this.prevPhase = ph;
        if (!canAct) break;
        if (this.buf.dodge && this.st >= 12) this.startDodge(wish);
        else if (this.buf.light) this.startAttack(0, wish);
        else if (I.heavyDown) this.startCharge();
        else if (I.spell) this.trySpell();
        else if (I.drink) this.tryDrink();
        break;
      }
      case 'attack': {
        const c = an.clip;
        this.rootMotion(an.motion(), dt);
        this.checkHits(c, [22, 24, 34, 20][this.combo]);
        if (this.buf.light && an.inWindow(c.combo) && this.combo < 3) { this.startAttack(this.combo + 1, wish); break; }
        if (an.time > c.cancel && this.buf.dodge && this.st >= 12) { this.startDodge(wish); break; }
        if (an.time > c.cancel && I.heavyDown) { this.startCharge(); break; }
        if (an.time > c.cancel + 0.12 && wish.lengthSq() > 0.1) { this.toMove(0.25); break; }
        if (an.done) this.toMove(0.3);
        break;
      }
      case 'charge': {
        this.chargeT += dt;
        const lvl = Math.min(3, Math.floor(this.chargeT / 0.55));
        if (lvl > this.chargeLvl) {
          this.chargeLvl = lvl;
          G.sound.charge(lvl);
          G.fx.goldDust(A.segB, 18, 0.3, 2);
          G.toast(['', '一 段', '二 段', '三 段'][lvl]);
        }
        if (Math.random() < dt * 30) G.fx.goldDust(A.pos.clone().setY(0.6 + Math.random()), 1, 0.9, 1.5);
        if (wish.lengthSq() > 0.04) A.facing = turn(A.facing, Math.atan2(wish.x, wish.z), dt * 4);
        if (!I.heavyHeld) this.startHeavy();
        break;
      }
      case 'heavy': {
        this.rootMotion(an.motion(), dt);
        this.checkHits(an.clip, this.heavyDamage(), 'heavy');
        if (an.time > an.clip.cancel && this.buf.dodge && this.st >= 12) { this.startDodge(wish); break; }
        if (an.time > an.clip.cancel + 0.1 && wish.lengthSq() > 0.1) { this.toMove(0.3); break; }
        if (an.done) this.toMove(0.3);
        break;
      }
      case 'dodge': {
        this.dodgeT += dt;
        this.rootMotion(an.motion(), dt, true);
        this.ghostT -= dt;
        if (this.ghostT <= 0 && an.time < 0.3) { G.fx.ghost(A.root, A.b.sim); this.ghostT = 0.07; }
        if (an.time > an.clip.cancel && this.buf.light) { this.startAttack(0, wish); break; }
        if (an.time > an.clip.cancel && wish.lengthSq() > 0.1) { this.toMove(0.2); break; }
        if (an.done) this.toMove(0.2);
        break;
      }
      case 'hit': {
        this.rootMotion(an.motion(), dt, true);
        if (an.time > 0.35 && this.buf.dodge && this.st >= 12) { this.startDodge(wish); break; }
        if (an.done) this.toMove(0.2);
        break;
      }
      case 'drink':
      case 'spell': {
        if (an.done) this.toMove(0.25);
        break;
      }
      default: break;
    }
    // 约束在场地内并避免与敌人重叠
    const r = Math.hypot(A.pos.x, A.pos.z);
    if (r > ARENA_R + 6) A.pos.multiplyScalar((ARENA_R + 6) / r);
    const E = G.enemy;
    if (E && E.alive) {
      _a.subVectors(A.pos, E.A.pos); _a.y = 0;
      const d = _a.length(), m = A.radius + E.A.radius;
      if (d < m && d > 1e-4) A.pos.addScaledVector(_a.normalize(), m - d);
    }
    A.pos.y = 0;
    // 蓄力金光
    const glow = this.state === 'charge' ? 0.15 + this.chargeLvl * 0.25 : (this.state === 'heavy' && an.time < 0.35 ? 0.6 : 0);
    A.tint(GOLD, glow + this.hurtFlash * 0);
    // 棍影拖尾
    const tr = G.fx.trail('wk', 0xffb84a);
    const c = an.clip;
    tr.active = (this.state === 'attack' || this.state === 'heavy') && c && c.hit.some((w) => an.time >= w[0] - 0.06 && an.time <= w[1] + 0.04);
    _a.lerpVectors(A.segA, A.segB, 0.62);
    tr.update(dt, _a, A.segB);
    if (tr.active && this.whooshed !== this.combo && this.state === 'attack') { this.whooshed = this.combo; G.sound.whoosh(1, 1 + this.combo * 0.1); }
  }

  rootMotion(v, dt, free = false) {
    if (!v) return;
    const A = this.A, f = A.forward(_b);
    const E = this.G.enemy;
    if (!free && E && E.alive && v > 0) {
      const d = E.A.pos.distanceTo(A.pos);
      if (d < A.radius + E.A.radius + 0.5) return;
    }
    A.pos.addScaledVector(f, v * dt);
  }

  checkHits(c, dmg, kind = 'light') {
    const E = this.G.enemy;
    if (!E || !E.alive || !c) return;
    for (let i = 0; i < c.hit.length; i++) {
      const w = c.hit[i];
      if (this.hitIds.has(i) || this.A.anim.time < w[0] || this.A.anim.time > w[1]) continue;
      if (weaponHit(this.A, E.A, _c2)) {
        this.hitIds.add(i);
        const d = dmg * w[2] * (0.92 + Math.random() * 0.16);
        if (kind === 'light') this.focus = Math.min(4, this.focus + (this.combo === 3 ? 0.26 : 0.17));
        this.G.damageEnemy(E, d, kind, _c2.clone(), kind === 'heavy' ? 45 + this.chargeLvl * 18 + this.heavyFocus * 10 : 9);
      }
    }
  }
  trySpell() {
    if (this.mp < 35 || this.spellCd > 0) { this.G.toast(this.spellCd > 0 ? '法 术 未 复' : '法 力 不 足'); return; }
    this.mp -= 35; this.spellCd = 14;
    this.state = 'spell';
    this.faceTarget(_w.set(0, 0, 0));
    this.A.anim.play(WK.SPELL, { fade: 0.1 });
  }
  tryDrink() {
    if (this.gourd <= 0) { this.G.toast('葫 芦 已 空'); return; }
    this.gourd--;
    this.state = 'drink';
    this.A.vel.set(0, 0, 0);
    this.A.anim.play(WK.DRINK, { fade: 0.15 });
  }
}

// ═══════════ 狼校卫 AI ═══════════
export class Wolf {
  constructor(actor, G) {
    this.A = actor; this.G = G;
    actor.height = 2.1; actor.radius = 0.5;
    actor.anim.onEvent = (e) => this.onEvent(e);
    this.reset();
  }
  reset() {
    this.hpMax = 1500; this.hp = 1500; this.poise = 0;
    this.state = 'dormant'; this.t = 0; this.cool = 1.5; this.hitIds = new Set();
    this.freezeT = 0; this.phase2 = false; this.nextAtk = null; this.flinchCd = 0;
    const A = this.A;
    A.pos.set(0, 0, -6); A.facing = 0;
    A.anim.stop(0.01); A.anim.speed = 1; A.frozen = false;
    A.tint(GOLD, 0);
  }
  get alive() { return this.state !== 'dead'; }

  onEvent(e) {
    const G = this.G;
    if (e.type === 'impact') {
      const tip = this.A.segB.clone(); tip.y = 0;
      G.fx.shockwave(tip, 0.6);
      G.shake(0.3, 0.4);
      G.sound.boom(0.7);
      const P = G.player;
      if (P.A.pos.distanceTo(tip) < 2.4 && !this.hitIds.has('aoe')) { this.hitIds.add('aoe'); P.hurt(20, this.A.pos); }
    } else if (e.type === 'roar') {
      G.sound.roar();
      G.shake(0.25, 1.0);
      G.post.radial = 0.5;
    }
  }

  attack(clip) {
    this.state = 'attack'; this.hitIds.clear(); this.cur = clip; this.glinted = false;
    this.A.anim.play(clip, { fade: 0.15, speed: this.phase2 ? 1.12 : 1 });
  }

  hurt(dmg, kind, poiseDmg) {
    if (!this.alive) return;
    this.hp -= dmg;
    this.poise += poiseDmg;
    if (this.hp <= 0) {
      this.hp = 0; this.state = 'dead';
      this.A.frozen = false; this.A.anim.speed = 1; this.A.tint(GOLD, 0);
      this.A.anim.play(WF.DEATH, { fade: 0.1 });
      this.G.onEnemyDeath();
      return;
    }
    if (this.state === 'frozen') return;
    if (!this.phase2 && this.hp < this.hpMax * 0.5) {
      this.phase2 = true;
      this.state = 'roar'; this.A.anim.play(WF.ROAR, { fade: 0.15 });
      this.G.toast('狼 校 卫 · 狂 怒');
      return;
    }
    if (this.poise >= 100) {
      this.poise = 0;
      this.state = 'stagger';
      this.A.anim.play(WF.STAG, { fade: 0.08 });
      this.G.toast('破 绽');
      return;
    }
    const cc = this.A.anim.clip;
    const inWindup = this.state === 'attack' && cc && cc.hit[0] && this.A.anim.time < (cc.hit[0][0] - 0.05);
    if (this.state !== 'attack' || (kind === 'heavy' && inWindup)) {
      if (this.flinchCd <= 0 || kind === 'heavy') {
        this.state = 'hit';
        this.flinchCd = 1.2;
        this.A.anim.play(WF.HIT, { fade: 0.05 });
      }
    }
  }

  immobilize(dur) {
    if (!this.alive) return false;
    this.state = 'frozen'; this.freezeT = dur;
    this.A.anim.speed = 0; this.A.frozen = true;
    return true;
  }

  update(dt) {
    const A = this.A, an = A.anim, G = this.G, P = G.player;
    this.t += dt;
    this.flinchCd -= dt;
    this.poise = Math.max(0, this.poise - dt * 6);
    const toP = _v.subVectors(P.A.pos, A.pos); toP.y = 0;
    const d = toP.length();
    const aim = Math.atan2(toP.x, toP.z);
    const ctx = an.ctx;
    const locomote = (speed, faceRate = 6) => {
      A.facing = turn(A.facing, aim, dt * faceRate);
      const f = A.forward(_b);
      const cur = ctx.speed;
      ctx.speed = THREE.MathUtils.lerp(cur, speed, 1 - Math.exp(-dt * 6));
      A.pos.addScaledVector(f, ctx.speed * dt);
      ctx.runW = smooth01(ctx.speed / 2.2);
      const stride = Math.min(1.5, 0.45 + ctx.speed * 0.14);
      ctx.phase = (ctx.phase + dt * ctx.speed * 0.38 / stride) % 1;
      if (Math.random() < dt * ctx.speed * 0.6) G.sound.step(0.25);
    };
    switch (this.state) {
      case 'dormant':
        locomote(0, 0);
        if (d < 11 || this.t > 6) { this.state = 'roar'; an.play(WF.ROAR, { fade: 0.3 }); G.showBoss(); }
        break;
      case 'roar':
        A.facing = turn(A.facing, aim, dt * 3);
        if (an.done) { this.state = 'think'; an.stop(0.3); this.cool = 0.4; }
        break;
      case 'think': {
        this.cool -= dt;
        if (!P.alive) { locomote(0, 2); break; }
        if (d > 8.5) locomote(this.phase2 ? 6.2 : 5.4);
        else if (d > 3.1) {
          locomote(this.cool > 0 ? 1.7 : 3.2);
          if (this.cool <= 0 && d > 4.2 && Math.random() < dt * 1.4) this.attack(WF.LEAP);
        } else {
          locomote(0, 5);
          if (this.cool <= 0) {
            const r = Math.random();
            this.attack(r < 0.6 ? WF.S1 : WF.SPIN);
            this.nextAtk = r < 0.6 && Math.random() < (this.phase2 ? 0.85 : 0.55) ? WF.S2 : null;
          }
        }
        break;
      }
      case 'attack': {
        const c = an.clip || this.cur;
        const strike = c.hit[0] ? c.hit[0][0] : c.dur * 0.5;
        if (an.time < strike - 0.1) A.facing = turn(A.facing, aim, dt * 5);
        if (!this.glinted && an.time >= (c.meta.tele ?? strike - 0.2)) {
          this.glinted = true;
          G.fx.glint(A.segB.clone().lerp(A.segA, 0.3), [3.2, 2.2, 1.2]);
          G.sound.clang(0.25);
        }
        const v = an.motion();
        if (v && d > A.radius + P.A.radius + 0.35) A.pos.addScaledVector(A.forward(_b), v * dt);
        for (let i = 0; i < c.hit.length; i++) {
          const w = c.hit[i];
          if (this.hitIds.has(i) || an.time < w[0] || an.time > w[1]) continue;
          if (P.alive && weaponHit(A, P.A, _c2)) {
            this.hitIds.add(i);
            if (P.hurt(c.meta.dmg * (this.phase2 ? 1.15 : 1), A.pos)) {
              G.fx.blood(_c2, A.forward(_b));
              G.fx.sparks(_c2, null, 8, [2, 0.6, 0.3], 4);
              G.sound.hit(1);
              G.shake(0.3, 0.3);
              G.hitStop(0.07);
            }
          }
        }
        if (an.done || (an.time > c.dur - 0.25 && this.nextAtk)) {
          if (this.nextAtk) { const n = this.nextAtk; this.nextAtk = null; this.attack(n); }
          else { this.state = 'think'; an.stop(0.3); this.cool = (this.phase2 ? 0.5 : 0.9) + Math.random() * 0.8; }
        }
        break;
      }
      case 'hit':
      case 'stagger': {
        const v = an.motion();
        if (v) A.pos.addScaledVector(A.forward(_b), v * dt);
        if (an.done) { this.state = 'think'; an.stop(0.25); this.cool = this.state === 'stagger' ? 0.2 : 0.35; }
        break;
      }
      case 'frozen': {
        this.freezeT -= dt;
        if (Math.random() < dt * 20) G.fx.goldDust(A.pos.clone().setY(0.3 + Math.random() * 1.8), 1, 0.9, 0.4);
        if (this.freezeT <= 0) {
          A.anim.speed = this.phase2 ? 1.12 : 1; A.frozen = false;
          this.state = this.cur && an.clip && an.clip.name === this.cur.name && !an.done ? 'attack' : 'think';
          if (this.state === 'think') an.stop(0.2);
          G.fx.goldDust(A.pos.clone().setY(1.2), 40, 1.2, 1.5);
          G.sound.shimmer();
        }
        break;
      }
      default: break;
    }
    const tg = this.state === 'frozen' ? 0.55 + Math.sin(this.t * 6) * 0.08 : 0;
    A.tint(GOLD, tg);
    // 场地约束
    const r = Math.hypot(A.pos.x, A.pos.z);
    if (r > ARENA_R + 4) A.pos.multiplyScalar((ARENA_R + 4) / r);
    A.pos.y = 0;
    // 尾巴摆动
    if (A.rig.tail && !A.frozen) A.rig.tail.rotation.set(0.9 + Math.sin(this.t * 2.2) * 0.12, Math.sin(this.t * 1.7) * 0.35, 0);
    const tr = G.fx.trail('wf', 0xd0d8ff);
    const c = an.clip;
    tr.active = this.state === 'attack' && c && c.hit.some((w) => an.time >= w[0] - 0.05 && an.time <= w[1] + 0.05);
    _a.lerpVectors(A.segA, A.segB, 0.15);
    tr.update(dt, _a, A.segB);
    if (tr.active && !this.whooshT) { this.whooshT = 1; G.sound.whoosh(1.2, 0.8); }
    if (!tr.active) this.whooshT = 0;
  }
}
