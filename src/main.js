// 入口：渲染器、后处理、加载流程、主循环、输入、相机、HUD、鉴赏模式
import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';
import * as TX from './core/textures.js';
import { createWorld } from './world/world.js';
import { buildWukong } from './characters/wukong.js';
import { buildWolf } from './characters/wolf.js';
import { WK, WF, WK_IDLE, WF_IDLE, wkLocomotion, wfLocomotion } from './anim/clips.js';
import { Actor } from './game/actor.js';
import { Player, Wolf } from './game/game.js';
import { FX } from './fx/fx.js';
import { Sound } from './audio/audio.js';
import { loadAssetConfig, loadCharacter } from './assets/loader.js';
import { SkinnedActor, WK_KEYS, WF_KEYS } from './game/skinned.js';

const $ = (id) => document.getElementById(id);
const tick = () => new Promise((r) => setTimeout(r, 16));
const loadStep = async (pct, text) => { $('load-fill').style.width = pct + '%'; $('load-text').textContent = text; await tick(); await tick(); };

// ─── 渲染器 ───
const canvas = $('gl');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: false, powerPreference: 'high-performance', stencil: false });
const DPR = Math.min(window.devicePixelRatio, 1.5);
renderer.setPixelRatio(DPR);
renderer.setSize(innerWidth, innerHeight);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.05;
renderer.outputColorSpace = THREE.SRGBColorSpace;

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(48, innerWidth / innerHeight, 0.05, 2000);
camera.position.set(0, 2, 12);

const rt = new THREE.WebGLRenderTarget(innerWidth * DPR, innerHeight * DPR, { type: THREE.HalfFloatType, samples: 4 });
const composer = new EffectComposer(renderer, rt);
composer.addPass(new RenderPass(scene, camera));
const bloom = new UnrealBloomPass(new THREE.Vector2(innerWidth, innerHeight), 0.42, 0.55, 0.9);
composer.addPass(bloom);
composer.addPass(new OutputPass());
const grade = new ShaderPass({
  uniforms: {
    tDiffuse: { value: null }, uTime: { value: 0 }, uRadial: { value: 0 }, uFlash: { value: 0 }, uHurt: { value: 0 },
    uDesat: { value: 0 }, uCenter: { value: new THREE.Vector2(0.5, 0.5) }, uBars: { value: 0 }, uGold: { value: 0 },
  },
  vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }',
  fragmentShader: `
    uniform sampler2D tDiffuse; uniform float uTime, uRadial, uFlash, uHurt, uDesat, uBars, uGold; uniform vec2 uCenter;
    varying vec2 vUv;
    float h(vec2 p){ return fract(sin(dot(p, vec2(12.9898,78.233))) * 43758.5453); }
    void main(){
      vec2 uv = vUv; vec2 dc = uv - uCenter;
      vec3 col;
      if (uRadial > 0.002) {
        col = vec3(0.0);
        for (int i = 0; i < 12; i++) { float s = 1.0 - uRadial * 0.06 * float(i) / 11.0; col += texture2D(tDiffuse, uCenter + dc * s).rgb; }
        col /= 12.0;
      } else col = texture2D(tDiffuse, uv).rgb;
      vec2 sc = uv - 0.5;
      float ca = 0.004 * dot(sc, sc);
      col.r = mix(col.r, texture2D(tDiffuse, uv + sc * ca).r, 0.6);
      col.b = mix(col.b, texture2D(tDiffuse, uv - sc * ca).b, 0.6);
      float l = dot(col, vec3(0.2126, 0.7152, 0.0722));
      col = mix(col, col * vec3(0.9, 0.98, 1.06), (1.0 - l) * 0.4);
      col = mix(col, col * vec3(1.06, 1.0, 0.9), l * 0.35);
      col = (col - 0.5) * 1.07 + 0.5;
      col = mix(col, vec3(l), uDesat);
      col = mix(col, vec3(l) * vec3(1.25, 1.0, 0.55), uGold * 0.35);
      float vig = 1.0 - smoothstep(0.3, 0.95, length(sc * vec2(1.0, 0.8)));
      col *= mix(0.62, 1.0, vig);
      col = mix(col, vec3(0.45, 0.02, 0.01), uHurt * (1.0 - vig) * 0.75);
      col += uFlash * vec3(1.0, 0.92, 0.75);
      col += (h(uv * 1000.0 + uTime) - 0.5) * 0.035;
      float bar = step(uv.y, uBars) + step(1.0 - uBars, uv.y);
      col = mix(col, vec3(0.0), bar);
      gl_FragColor = vec4(clamp(col, 0.0, 1.0), 1.0);
    }`,
});
composer.addPass(grade);

addEventListener('resize', () => {
  camera.aspect = innerWidth / innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(innerWidth, innerHeight);
  composer.setSize(innerWidth, innerHeight);
  bloom.setSize(innerWidth, innerHeight);
});

// ─── 输入 ───
function lockPointer() { try { const p = canvas.requestPointerLock(); if (p && p.catch) p.catch(() => {}); } catch (e) { /* 需要用户手势 */ } }
const keys = new Set();
const I = { mx: 0, my: 0, sprint: false, light: false, dodge: false, heavyDown: false, heavyHeld: false, spell: false, drink: false, lock: false };
let mouseDX = 0, mouseDY = 0, wheel = 0, dragging = false;
addEventListener('keydown', (e) => {
  if (e.repeat) return;
  keys.add(e.code);
  if (e.code === 'Space') { I.dodge = true; e.preventDefault(); }
  if (e.code === 'Digit1' || e.code === 'KeyF') I.spell = true;
  if (e.code === 'KeyR') I.drink = true;
  if (e.code === 'KeyQ') I.lock = true;
  if (e.code === 'KeyJ') I.light = true;
  if (e.code === 'KeyK') { I.heavyDown = true; I.heavyHeld = true; }
  if (e.code === 'Enter') onEnter();
  if (e.code === 'Escape') onEscape();
  if (e.code === 'KeyH') $('help').classList.toggle('hidden');
});
addEventListener('keyup', (e) => { keys.delete(e.code); if (e.code === 'KeyK') I.heavyHeld = false; });
canvas.addEventListener('mousedown', (e) => {
  if (mode === 'game') {
    if (document.pointerLockElement !== canvas) { lockPointer(); return; }
    if (e.button === 0) I.light = true;
    if (e.button === 2) { I.heavyDown = true; I.heavyHeld = true; }
    if (e.button === 1) I.lock = true;
  } else dragging = true;
});
addEventListener('mouseup', (e) => { if (e.button === 2) I.heavyHeld = false; dragging = false; });
addEventListener('contextmenu', (e) => e.preventDefault());
addEventListener('mousemove', (e) => {
  if (document.pointerLockElement === canvas || dragging) { mouseDX += e.movementX; mouseDY += e.movementY; }
});
addEventListener('wheel', (e) => { wheel += Math.sign(e.deltaY); }, { passive: true });

function readInput() {
  I.mx = (keys.has('KeyD') ? 1 : 0) - (keys.has('KeyA') ? 1 : 0);
  I.my = (keys.has('KeyW') ? 1 : 0) - (keys.has('KeyS') ? 1 : 0);
  I.sprint = keys.has('ShiftLeft') || keys.has('ShiftRight');
}
function clearEdges() { I.light = I.dodge = I.heavyDown = I.spell = I.drink = I.lock = false; }

// ─── 相机 ───
const cam = {
  yaw: Math.PI, pitch: 0.2, dist: 4.4, target: new THREE.Vector3(0, 1.4, 7), lock: false,
  shakeA: 0, shakeT: 0, fovKick: 0,
  update(dt, P, E) {
    this.yaw -= mouseDX * 0.0024; this.pitch += mouseDY * 0.0018;
    this.pitch = THREE.MathUtils.clamp(this.pitch, -0.35, 1.05);
    this.dist = THREE.MathUtils.clamp(this.dist + wheel * 0.4, 2.4, 8);
    const tgt = P.A.pos.clone().add(new THREE.Vector3(0, 1.42, 0));
    if (this.lock && E && E.alive) {
      const d = E.A.pos.clone().sub(P.A.pos); d.y = 0;
      const want = Math.atan2(d.x, d.z);
      this.yaw += Math.atan2(Math.sin(want - this.yaw), Math.cos(want - this.yaw)) * (1 - Math.exp(-dt * 6));
      this.pitch += (0.18 - this.pitch) * (1 - Math.exp(-dt * 3));
      tgt.addScaledVector(d.normalize(), 0.6);
    }
    this.target.lerp(tgt, 1 - Math.exp(-dt * 9));
    const cp = Math.cos(this.pitch);
    const pos = this.target.clone().add(new THREE.Vector3(-Math.sin(this.yaw) * cp, Math.sin(this.pitch), -Math.cos(this.yaw) * cp).multiplyScalar(this.dist));
    pos.add(new THREE.Vector3(-Math.cos(this.yaw), 0, Math.sin(this.yaw)).multiplyScalar(0.3));
    pos.y = Math.max(0.25, pos.y);
    this.shakeT = Math.max(0, this.shakeT - dt);
    const k = this.shakeA * (this.shakeT > 0 ? 1 : 0) * Math.min(1, this.shakeT * 3);
    camera.position.copy(pos).add(new THREE.Vector3((Math.random() - 0.5) * k * 0.25, (Math.random() - 0.5) * k * 0.25, (Math.random() - 0.5) * k * 0.25));
    const look = this.target.clone().add(new THREE.Vector3(-Math.cos(this.yaw), 0, Math.sin(this.yaw)).multiplyScalar(0.3));
    camera.lookAt(look);
    this.fovKick *= Math.exp(-dt * 4);
    camera.fov = 48 + this.fovKick * 8;
    camera.updateProjectionMatrix();
  },
};

// ─── 游戏 API（供角色控制器调用）───
const sound = new Sound();
const G = {
  scene, camera, sound, fx: null, player: null, enemy: null,
  post: { radial: 0, flash: 0, hurt: 0, desat: 0, bars: 0, gold: 0 },
  time: 1, hitStopT: 0, slowT: 0, slowK: 1,
  shake(a, t) { cam.shakeA = Math.max(cam.shakeA * (cam.shakeT > 0 ? 1 : 0), a); cam.shakeT = Math.max(cam.shakeT, t); },
  hitStop(t) { this.hitStopT = Math.max(this.hitStopT, t); },
  slowMo(k, t) { this.slowK = k; this.slowT = t; },
  toast(text) {
    const el = $('toast'); el.textContent = text; el.style.opacity = 1;
    clearTimeout(this._tt); this._tt = setTimeout(() => (el.style.opacity = 0), 1100);
  },
  showBoss() { $('boss').style.opacity = 1; },
  damageEnemy(E, dmg, kind, at, poise) {
    dmg = Math.round(dmg * (E.state === 'stagger' ? 1.3 : 1) * (E.state === 'frozen' ? 1.15 : 1));
    E.hurt(dmg, kind, poise);
    const heavy = kind === 'heavy';
    const dir = at.clone().sub(this.player.A.pos).setY(0).normalize();
    this.fx.sparks(at, dir, heavy ? 50 : 22, heavy ? [4, 2.6, 1.2] : [3, 2.1, 1], heavy ? 9 : 6);
    this.fx.blood(at, dir, heavy ? 22 : 10);
    this.fx.goldDust(at, heavy ? 14 : 5, 0.3, 1);
    sound.hit(heavy ? 1.3 : 0.85);
    if (heavy) sound.clang(0.6);
    this.hitStop(heavy ? 0.13 : 0.06);
    this.shake(heavy ? 0.45 : 0.14, heavy ? 0.35 : 0.15);
    if (heavy) { this.post.radial = 0.9; cam.fovKick = 0.6; }
    damageNumber(at, dmg, heavy);
  },
  castImmobilize() {
    const E = this.enemy, P = this.player;
    sound.bell();
    const hand = P.A.rig.bones.handL.getWorldPosition(new THREE.Vector3());
    this.fx.goldDust(hand, 30, 0.2, 1.5);
    this.post.flash = 0.08;
    if (E.alive && E.A.pos.distanceTo(P.A.pos) < 10) {
      if (E.immobilize(4.5)) {
        this.fx.sigil(E.A.pos, 4.5);
        this.toast('定 ！');
        this.post.gold = 1;
      }
    } else this.toast('无 人 可 定');
  },
  perfectDodge() {
    this.slowMo(0.25, 0.55);
    sound.shimmer();
    this.post.gold = 0.8;
    this.player.focus = Math.min(4, this.player.focus + 0.6);
    this.toast('识 破');
  },
  onPlayerDeath() {
    this.slowMo(0.35, 1.5);
    setTimeout(() => showMsg('身 死 道 消', '按 Enter 再 战'), 1600);
    this.over = true;
  },
  onEnemyDeath() {
    this.slowMo(0.2, 1.8);
    this.post.radial = 1;
    sound.boom(1.2);
    this.shake(0.5, 0.8);
    setTimeout(() => {
      if (this.player.alive) { this.player.state = 'win'; this.player.A.anim.play(WK.WIN, { fade: 0.4 }); }
      showMsg('得 胜', '苍 狼 校 卫 · 伏 诛　　按 Enter 再 战');
      $('boss').style.opacity = 0;
    }, 1700);
    this.over = true;
  },
};

function showMsg(t, sub) { const m = $('msg'); m.innerHTML = t + (sub ? `<small>${sub}</small>` : ''); m.classList.add('show'); }
function hideMsg() { $('msg').classList.remove('show'); }

const dmgList = [];
function damageNumber(p, v, crit) {
  const el = document.createElement('div');
  el.className = 'dn' + (crit ? ' crit' : '');
  el.textContent = v;
  el.style.fontSize = (crit ? 26 : 18) + 'px';
  $('dmg').appendChild(el);
  dmgList.push({ el, p: p.clone().add(new THREE.Vector3((Math.random() - 0.5) * 0.4, 0.2, 0)), t: 0 });
}
function updateDamageNumbers(dt) {
  for (let i = dmgList.length - 1; i >= 0; i--) {
    const d = dmgList[i];
    d.t += dt;
    d.p.y += dt * 0.6;
    const s = d.p.clone().project(camera);
    d.el.style.left = ((s.x * 0.5 + 0.5) * innerWidth) + 'px';
    d.el.style.top = ((-s.y * 0.5 + 0.5) * innerHeight) + 'px';
    d.el.style.opacity = Math.max(0, 1 - Math.max(0, d.t - 0.5) / 0.5) * (s.z < 1 ? 1 : 0);
    if (d.t > 1) { d.el.remove(); dmgList.splice(i, 1); }
  }
}

// ─── HUD ───
function setBar(id, v, ghost = true) {
  const el = $(id);
  el.querySelector('.fill').style.width = (v * 100).toFixed(1) + '%';
  if (ghost) { const g = el.querySelector('.ghost'); if (g) g.style.width = (v * 100).toFixed(1) + '%'; }
}
function updateHUD() {
  const P = G.player, E = G.enemy;
  setBar('hp', P.hp / P.hpMax); setBar('mp', P.mp / 100); setBar('st', P.st / 100);
  setBar('bhp', E.hp / E.hpMax); setBar('bpo', E.poise / 100, false);
  const pips = document.querySelectorAll('.pip');
  pips.forEach((p, i) => {
    const f = Math.max(0, Math.min(1, P.focus - i));
    p.querySelector('i').style.height = (f * 100) + '%';
    p.classList.toggle('full', f >= 1);
  });
  $('gourd-n').textContent = P.gourd;
  document.querySelector('#slot-spell .cd').style.height = (P.spellCd / 14 * 100) + '%';
  const lm = $('lockmark');
  if (cam.lock && E.alive) {
    const s = E.A.pos.clone().setY(1.35).project(camera);
    lm.style.display = 'block';
    lm.style.left = ((s.x * 0.5 + 0.5) * innerWidth) + 'px';
    lm.style.top = ((-s.y * 0.5 + 0.5) * innerHeight) + 'px';
  } else lm.style.display = 'none';
}

// ─── 模式 ───
let mode = 'loading';
let world, player, enemy, wkActor, wfActor;
let showClip = null, showActor = null, showTimer = 0;
const orbit = { yaw: 0.5, pitch: 0.15, dist: 3.6, target: new THREE.Vector3(0, 1.0, 0), auto: true };

function startGame() {
  mode = 'game';
  if ($('asset-panel')) $('asset-panel').classList.add('hidden');
  sound.init();
  $('title').classList.add('hidden');
  $('showcase').classList.add('hidden'); $('sc-hint').classList.add('hidden');
  $('hud').classList.remove('hidden');
  $('boss').style.opacity = 0;
  hideMsg();
  wfActor.root.visible = true; wfActor.b.sim.visible = true;
  player.reset(); enemy.reset();
  wkActor.resetSim(); wfActor.resetSim();
  cam.yaw = Math.PI; cam.pitch = 0.2; cam.target.set(0, 1.4, 7);
  G.over = false; G.slowT = 0; G.time = 1;
  lockPointer();
}
function startShowcase() {
  mode = 'show';
  sound.init();
  $('title').classList.add('hidden'); $('hud').classList.add('hidden');
  $('showcase').classList.remove('hidden'); $('sc-hint').classList.remove('hidden');
  hideMsg();
  player.reset(); enemy.reset();
  wkActor.pos.set(0, 0, 0); wkActor.facing = 0.3;
  wfActor.pos.set(2.6, 0, -1.2); wfActor.facing = -0.5;
  wkActor.resetSim(); wfActor.resetSim();
  showActor = wkActor; showClip = null;
  buildShowcaseUI();
  if (document.pointerLockElement) document.exitPointerLock();
}
function toTitle() {
  mode = 'title';
  if ($('asset-panel')) $('asset-panel').classList.add('hidden');
  $('hud').classList.add('hidden'); $('showcase').classList.add('hidden'); $('sc-hint').classList.add('hidden');
  $('title').classList.remove('hidden');
  hideMsg();
  player.reset(); enemy.reset();
  wkActor.pos.set(0, 0, 0); wkActor.facing = 0.4;
  wfActor.pos.set(1.8, 0, -7); wfActor.facing = 0;
  wkActor.resetSim(); wfActor.resetSim();
  if (document.pointerLockElement) document.exitPointerLock();
}
function onEnter() { if (mode === 'game' && G.over) startGame(); }
function onEscape() { if (mode === 'game' || mode === 'show') toTitle(); }
$('btn-start').onclick = startGame;
$('btn-show').onclick = startShowcase;

function buildShowcaseUI() {
  const box = $('showcase');
  box.innerHTML = '<h3>形神鉴赏</h3>';
  const wkList = [['待机', null], ['奔跑', 'run'], ['疾跑', 'sprint'], ['轻棍 · 一', WK.A1], ['轻棍 · 二', WK.A2], ['轻棍 · 三', WK.A3], ['轻棍 · 四', WK.A4],
    ['蓄力劈棍', 'heavy'], ['闪身', WK.DG], ['饮葫芦', WK.DRINK], ['定身法', WK.SPELL], ['受击', WK.HIT], ['得胜', WK.WIN]];
  const wfList = [['狼 · 待机', null], ['狼 · 奔袭', 'run'], ['狼 · 劈斩', WF.S1], ['狼 · 横斩', WF.S2], ['狼 · 跃斩', WF.LEAP], ['狼 · 旋斩', WF.SPIN], ['狼 · 长啸', WF.ROAR], ['狼 · 倒地', WF.STAG]];
  const mk = (label, clip, actor) => {
    const b = document.createElement('button');
    b.textContent = label;
    b.onclick = () => {
      box.querySelectorAll('button').forEach((x) => x.classList.remove('on'));
      b.classList.add('on');
      showActor = actor; showClip = clip; showTimer = 0;
      orbit.target.copy(actor.pos).setY(actor === wfActor ? 1.25 : 1.0);
      orbit.dist = actor === wfActor ? 4.6 : 3.6;
      playShow();
    };
    box.appendChild(b);
  };
  wkList.forEach(([l, c]) => mk(l, c, wkActor));
  box.appendChild(Object.assign(document.createElement('div'), { className: 'sep' }));
  wfList.forEach(([l, c]) => mk(l, c, wfActor));
  box.appendChild(Object.assign(document.createElement('div'), { className: 'sep' }));
  const rot = document.createElement('button');
  rot.textContent = '自动旋转：开';
  rot.onclick = () => { orbit.auto = !orbit.auto; rot.textContent = '自动旋转：' + (orbit.auto ? '开' : '关'); };
  box.appendChild(rot);
  buildAssetPanel();
}

function buildAssetPanel() {
  let panel = $('asset-panel');
  if (!panel) {
    panel = document.createElement('div');
    panel.id = 'asset-panel';
    document.body.appendChild(panel);
  }
  panel.classList.remove('hidden');
  panel.innerHTML = '';
  const tg = document.createElement('button');
  tg.textContent = '资产诊断';
  const pre = document.createElement('pre');
  pre.textContent = assetLines.length ? assetLines.join('\n') : '未加载外部资产：public/assets/assets.json 不存在，当前使用程序化模型。\n参考 public/assets/使用说明.md';
  pre.style.display = 'none';
  tg.onclick = () => { pre.style.display = pre.style.display === 'none' ? 'block' : 'none'; };
  panel.append(tg, pre);
  const W = wkActor.skinned && wkActor.loaded.weapon && wkActor.loaded.weapon.inner ? wkActor.loaded.weapon : null;
  if (!W) return;
  const box = document.createElement('div');
  box.className = 'wtune';
  box.innerHTML = '<b>武器挂点调校（天命人）</b>';
  const D = 180 / Math.PI;
  const g = W.obj, inner = W.inner;
  const fields = [
    ['位置 X(cm)', () => inner.position.x * 100, (v) => (inner.position.x = v / 100)],
    ['位置 Y(cm)', () => inner.position.y * 100, (v) => (inner.position.y = v / 100)],
    ['位置 Z(cm)', () => inner.position.z * 100, (v) => (inner.position.z = v / 100)],
    ['旋转 X(°)', () => inner.rotation.x * D, (v) => (inner.rotation.x = v / D)],
    ['旋转 Y(°)', () => inner.rotation.y * D, (v) => (inner.rotation.y = v / D)],
    ['旋转 Z(°)', () => inner.rotation.z * D, (v) => (inner.rotation.z = v / D)],
    ['握点偏移(cm)', () => g.position.y * 100, (v) => (g.position.y = v / 100)],
  ];
  const out = document.createElement('pre');
  const dump = () => {
    const r = (x) => Math.round(x * 1000) / 1000;
    out.textContent = JSON.stringify({ weapon: { type: W.type, offset: inner.position.toArray().map(r), rotation: [inner.rotation.x, inner.rotation.y, inner.rotation.z].map((x) => r(x * D)), slide: r(g.position.y) } }, null, 0);
  };
  for (const [label, get, set] of fields) {
    const row = document.createElement('label');
    const inp = document.createElement('input');
    inp.type = 'number'; inp.step = label.includes('°') ? '5' : '0.5'; inp.value = get().toFixed(1);
    inp.oninput = () => { const v = parseFloat(inp.value); if (!isNaN(v)) { set(v); dump(); } };
    row.append(label, inp);
    box.appendChild(row);
  }
  const cp = document.createElement('button');
  cp.textContent = '复制到剪贴板（粘进 assets.json 的 player）';
  cp.onclick = () => navigator.clipboard && navigator.clipboard.writeText(out.textContent.slice(1, -1));
  dump();
  box.append(out, cp);
  panel.appendChild(box);
}
function playShow() {
  const A = showActor, c = showClip;
  for (const a of [wkActor, wfActor]) { a.anim.ctx.speed = 0; a.anim.ctx.runW = 0; }
  if (c === null) { A.anim.stop(0.25); return; }
  if (c === 'run' || c === 'sprint') { A.anim.stop(0.25); return; }
  if (c === 'heavy') { A.anim.play(WK.HC, { fade: 0.2 }); showTimer = 0; return; }
  A.anim.play(c, { fade: 0.15 });
}
function updateShowcase(dt) {
  if (window.__camLock) { /* 调试：锁定镜头 */ }
  else if (dragging) { orbit.yaw -= mouseDX * 0.006; orbit.pitch = THREE.MathUtils.clamp(orbit.pitch + mouseDY * 0.004, -0.3, 1.2); }
  else if (orbit.auto) orbit.yaw += dt * 0.25;
  if (!window.__camLock) orbit.dist = THREE.MathUtils.clamp(orbit.dist + wheel * 0.25, 1.2, 40);
  const cp = Math.cos(orbit.pitch);
  camera.position.set(orbit.target.x + Math.sin(orbit.yaw) * cp * orbit.dist, orbit.target.y + Math.sin(orbit.pitch) * orbit.dist, orbit.target.z + Math.cos(orbit.yaw) * cp * orbit.dist);
  camera.lookAt(orbit.target);
  camera.fov = 40; camera.updateProjectionMatrix();
  for (const A of [wkActor, wfActor]) {
    const isShow = A === showActor;
    const c = isShow ? showClip : null;
    const ctx = A.anim.ctx;
    if (c === 'run' || c === 'sprint') {
      const sp = c === 'run' ? 4.4 : 7.2;
      ctx.speed = sp; ctx.runW = 1;
      const stride = A === wkActor ? Math.min(1.25, 0.35 + sp * 0.13) : Math.min(1.5, 0.45 + sp * 0.14);
      ctx.phase = (ctx.phase + dt * sp * 0.38 / stride) % 1;
    }
    if (isShow && c === 'heavy') {
      showTimer += dt;
      const cn = A.anim.clip && A.anim.clip.name;
      if (cn === 'HC' && showTimer > 1.2) { A.anim.play(WK.HS, { fade: 0.05 }); showTimer = 0; }
      else if (cn === 'HS' && A.anim.done) { showTimer += 0; if (showTimer > 0.6) { A.anim.play(WK.HC, { fade: 0.25 }); showTimer = 0; } }
    } else if (isShow && c && typeof c === 'object' && A.anim.done) {
      showTimer += dt;
      if (showTimer > 0.7) { A.anim.play(c, { fade: 0.2 }); showTimer = 0; }
    }
    A.update(dt, world.wind);
    A.tint(new THREE.Color(1, 0.7, 0.25), A === wkActor && A.anim.clip && A.anim.clip.name === 'HC' ? 0.4 : 0);
  }
  for (const A of [wkActor, wfActor]) {
    // 展示时将根位移重置，避免走出画面
    if (A === wkActor) A.pos.set(0, 0, 0); else A.pos.set(2.6, 0, -1.2);
  }
}

// ─── 资产诊断日志 ───
const assetLines = [];
function assetLog(line) { assetLines.push(line); console.log('[assets]', line); }

// ─── 加载 ───
async function boot() {
  await loadStep(5, '研 磨 石 板');
  TX.stoneFloor(); TX.groundDirt();
  await loadStep(18, '炼 制 金 铁');
  TX.goldEngraved(); TX.darkIron(); TX.lamellar(); TX.rock();
  await loadStep(30, '织 造 布 帛');
  TX.clothDark(); TX.clothRed(); TX.tigerSkin(); TX.leather(); TX.bandage(); TX.skin(); TX.feather(); TX.bark(); TX.lacquerWood(); TX.roofTiles();
  await loadStep(45, '堆 山 造 寺');
  world = createWorld(scene, renderer);
  await loadStep(62, '塑 天 命 人 之 形');
  // 外部资产（public/assets/assets.json 或 #selftest 合成资产），失败则回退程序化模型
  let cfg = null;
  if (location.hash.includes('selftest')) cfg = await (await import('./assets/selftest.js')).makeSelfTestConfig(assetLog);
  else cfg = await loadAssetConfig();
  if (cfg && cfg.__error) assetLog(cfg.__error);
  const tryLoad = async (c, kind, keys, run) => {
    if (!c || c.enabled === false) return null;
    try {
      const L = await loadCharacter(c, kind, assetLog);
      return new SkinnedActor(L, kind === 'player' ? WK : WF, keys, scene, run);
    } catch (e) {
      console.error(e);
      assetLog(`✗ ${kind === 'player' ? '天命人' : '敌人'}模型加载失败，已回退程序化模型：${e.message}`);
      return null;
    }
  };
  wkActor = await tryLoad(cfg && cfg.player, 'player', WK_KEYS, cfg?.player?.runSpeed || 4.4);
  if (!wkActor) wkActor = new Actor(buildWukong(), WK_IDLE, wkLocomotion, scene, [-0.25, 0.95]);
  await loadStep(76, '召 苍 狼 校 卫');
  wfActor = await tryLoad(cfg && cfg.enemy, 'enemy', WF_KEYS, cfg?.enemy?.runSpeed || 5.4);
  if (!wfActor) wfActor = new Actor(buildWolf(), WF_IDLE, wfLocomotion, scene, [0.13, 1.08]);
  $('asset-mode').textContent = '角色：' + (wkActor.skinned ? '外部模型' : '程序化模型') + ' · 敌人：' + (wfActor.skinned ? '外部模型' : '程序化模型') + (assetLines.some((l) => /[✗⚠]/.test(l)) ? ' · 有资产警告，见鉴赏模式「资产诊断」' : '');
  G.fx = new FX(scene, camera);
  player = new Player(wkActor, G); enemy = new Wolf(wfActor, G);
  G.player = player; G.enemy = enemy;
  await loadStep(88, '编 译 着 色 器');
  toTitle();
  wkActor.update(0.016, world.wind); wfActor.update(0.016, world.wind);
  renderer.compile(scene, camera);
  composer.render();
  await loadStep(100, '天 命 已 至');
  $('loading').classList.add('hidden');
  $('title').classList.remove('hidden');
  if (location.hash === '#show') startShowcase();
  if (location.hash === '#game') startGame();
  last = performance.now();
  requestAnimationFrame(loop);
}

// ─── 主循环 ───
let last = 0, fpsAcc = 0, fpsN = 0, titleT = 0;
function loop(now) {
  requestAnimationFrame(loop);
  const dt = Math.max(0, Math.min(0.05, (now - last) / 1000));
  last = now;
  frame(dt, now);
}
// 调试：手动步进若干帧（页面隐藏时 rAF 暂停）
function step(n = 60, dt = 1 / 60, cb) {
  for (let i = 0; i < n; i++) { last += dt * 1000; frame(dt, last); cb && cb(i); }
}
function frame(dt, now) {
  fpsAcc += dt; fpsN++;
  if (fpsAcc > 0.5) { $('fps').textContent = Math.round(fpsN / fpsAcc) + ' fps'; fpsAcc = 0; fpsN = 0; }
  readInput();

  // 时间缩放：顿帧 + 慢动作
  let k = 1;
  if (G.hitStopT > 0) { G.hitStopT -= dt; k = 0.04; }
  if (G.slowT > 0) { G.slowT -= dt; k *= G.slowK; }
  const gdt = dt * k;

  if (mode === 'game') {
    if (I.lock) cam.lock = !cam.lock;
    player.update(gdt, I, cam);
    enemy.update(gdt);
    wkActor.update(gdt, world.wind);
    wfActor.update(gdt, world.wind);
    cam.update(dt, player, enemy);
    updateHUD();
  } else if (mode === 'show') {
    updateShowcase(dt);
  } else if (mode === 'title') {
    titleT += dt;
    wkActor.update(dt, world.wind); wfActor.update(dt, world.wind);
    const a = 0.6 + Math.sin(titleT * 0.08) * 0.5;
    camera.position.set(Math.sin(a) * 3.4, 1.25 + Math.sin(titleT * 0.13) * 0.15, Math.cos(a) * 3.4);
    camera.lookAt(0, 1.15, 0);
    camera.fov = 40; camera.updateProjectionMatrix();
  }
  G.fx.update(gdt);
  updateDamageNumbers(dt);
  const focus = mode === 'game' ? player.A.pos : wkActor.pos;
  world.update(gdt, focus);

  // 后处理参数
  const P = G.post;
  P.radial *= Math.exp(-dt * 5); P.flash *= Math.exp(-dt * 10); P.hurt *= Math.exp(-dt * 2.5); P.gold *= Math.exp(-dt * 1.5);
  const lowHp = mode === 'game' ? Math.max(0, 0.25 - player.hp / player.hpMax) * 2 : 0;
  P.desat += (((mode === 'game' && !player.alive) ? 0.8 : lowHp * 0.5) - P.desat) * (1 - Math.exp(-dt * 2));
  P.bars += (((mode === 'game' && G.over) || mode === 'title' ? 0.07 : 0) - P.bars) * (1 - Math.exp(-dt * 2));
  const u = grade.uniforms;
  u.uTime.value = now * 0.001 % 100; u.uRadial.value = P.radial; u.uFlash.value = P.flash; u.uHurt.value = P.hurt + lowHp * 0.4;
  u.uDesat.value = P.desat; u.uBars.value = P.bars; u.uGold.value = P.gold;
  const cp = (mode === 'game' ? player.A.pos : wkActor.pos).clone().setY(1.2).project(camera);
  if (cp.z > 1) cp.set(0, 0, 0);
  u.uCenter.value.set(THREE.MathUtils.clamp(cp.x * 0.5 + 0.5, 0.15, 0.85), THREE.MathUtils.clamp(cp.y * 0.5 + 0.5, 0.15, 0.85));
  G.fx.glow.mat.uniforms.uScale.value = G.fx.smoke.mat.uniforms.uScale.value = innerHeight * DPR * 0.6;

  composer.render();
  clearEdges();
  mouseDX = mouseDY = 0; wheel = 0;
}

window.__dbg = { G, orbit, cam, camera, step, I, keys, assetLines, get wk() { return wkActor; }, get wf() { return wfActor; }, startGame, startShowcase, WK, WF };
boot().catch((e) => { console.error(e); $('load-text').textContent = '加载失败：' + e.message; });
