// 程序化 PBR 贴图库：颜色 / 法线 / 粗糙度 全部由噪声函数实时生成，无任何外部图片
import * as THREE from 'three';
import { Noise, clamp, lerp, smooth, rng } from './noise.js';

const N = new Noise(1337);
const N2 = new Noise(7);
const cache = new Map();

function dataTex(w, h, data, srgb) {
  const t = new THREE.DataTexture(data, w, h, THREE.RGBAFormat);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.magFilter = THREE.LinearFilter;
  t.minFilter = THREE.LinearMipmapLinearFilter;
  t.generateMipmaps = true;
  t.anisotropy = 8;
  if (srgb) t.colorSpace = THREE.SRGBColorSpace;
  t.needsUpdate = true;
  return t;
}

// fn(u, v, o) 写入 o.r o.g o.b (0..1, sRGB), o.h 高度, o.ro 粗糙度, o.m 金属度, o.a 透明度
function bake(w, h, fn, normalStrength = 2, opts = {}) {
  const n = w * h;
  const col = new Uint8Array(n * 4);
  const rough = new Uint8Array(n * 4);
  const H = new Float32Array(n);
  const o = { r: 0, g: 0, b: 0, h: 0, ro: 0.8, m: 0, a: 1 };
  for (let y = 0; y < h; y++) {
    const v = (y + 0.5) / h;
    for (let x = 0; x < w; x++) {
      const u = (x + 0.5) / w;
      o.r = o.g = o.b = 0.5; o.h = 0; o.ro = 0.8; o.m = 0; o.a = 1;
      fn(u, v, o, x, y);
      const i = y * w + x, j = i * 4;
      col[j] = clamp(o.r) * 255; col[j + 1] = clamp(o.g) * 255; col[j + 2] = clamp(o.b) * 255;
      col[j + 3] = clamp(o.a) * 255;
      rough[j] = 255; rough[j + 1] = clamp(o.ro) * 255; rough[j + 2] = clamp(o.m) * 255; rough[j + 3] = 255;
      H[i] = o.h;
    }
  }
  const nor = new Uint8Array(n * 4);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const xl = (x - 1 + w) % w, xr = (x + 1) % w, yd = (y - 1 + h) % h, yu = (y + 1) % h;
      const dx = (H[y * w + xr] - H[y * w + xl]) * normalStrength;
      const dy = (H[yu * w + x] - H[yd * w + x]) * normalStrength;
      let nx = -dx, ny = -dy, nz = 1;
      const l = Math.hypot(nx, ny, nz);
      nx /= l; ny /= l; nz /= l;
      const j = (y * w + x) * 4;
      nor[j] = (nx * 0.5 + 0.5) * 255; nor[j + 1] = (ny * 0.5 + 0.5) * 255; nor[j + 2] = (nz * 0.5 + 0.5) * 255; nor[j + 3] = 255;
    }
  }
  return {
    map: dataTex(w, h, col, true),
    normalMap: dataTex(w, h, nor, false),
    roughnessMap: dataTex(w, h, rough, false),
    metalnessMap: opts.metal ? dataTex(w, h, rough, false) : null,
  };
}

function cached(key, fn) {
  if (!cache.has(key)) cache.set(key, fn());
  return cache.get(key);
}

const mix3 = (o, a, b, t) => { o.r = lerp(a[0], b[0], t); o.g = lerp(a[1], b[1], t); o.b = lerp(a[2], b[2], t); };
const mul3 = (o, k) => { o.r *= k; o.g *= k; o.b *= k; };
const towards = (o, c, t) => { o.r = lerp(o.r, c[0], t); o.g = lerp(o.g, c[1], t); o.b = lerp(o.b, c[2], t); };

// ───────────────────────── 石板地面（古寺庭院） ─────────────────────────
export const stoneFloor = () => cached('stoneFloor', () => bake(1024, 1024, (u, v, o) => {
  const C = 5;
  const wv = N.worley(u * C + N.fbm(u * 8, v * 8, 3, 8, 8) * 0.25, v * C, C, C, 0.85);
  const e = wv[1] - wv[0];
  const id = wv[2];
  const r = N.V[id], r2 = N.V[(id * 3 + 5) & 255];
  const groove = smooth(0.0, 0.07, e);
  const detail = N.fbm(u * 24, v * 24, 5, 24, 24);
  const big = N.fbm(u * 3, v * 3, 4, 3, 3);
  const crack = N.ridged(u * 10 + r * 3, v * 10, 4, 10, 10);
  const crackLine = smooth(0.82, 0.95, crack) * (r2 > 0.4 ? 1 : 0.2);
  const chip = smooth(0.62, 0.75, N.fbm(u * 40, v * 40, 3, 40, 40));
  o.h = groove * (0.75 + 0.15 * r) + detail * 0.12 - crackLine * 0.25 - chip * 0.06 * groove;
  mix3(o, [0.38, 0.36, 0.33], [0.53, 0.50, 0.45], r);
  mul3(o, 0.72 + 0.45 * detail);
  // 污渍与潮湿
  const wet = smooth(0.55, 0.75, big);
  mul3(o, 1 - wet * 0.35);
  // 苔藓：长在石缝与低洼处
  const mossN = N2.fbm(u * 12, v * 12, 4, 12, 12);
  const moss = clamp((1 - groove) * 1.2 * smooth(0.35, 0.6, mossN) + smooth(0.68, 0.8, mossN) * 0.6);
  towards(o, [0.17, 0.22, 0.09], moss * 0.85);
  // 地衣斑点
  const li = N2.worley(u * 30, v * 30, 30, 30);
  const lichen = (1 - smooth(0.05, 0.25, li[0])) * smooth(0.6, 0.75, N.fbm(u * 6, v * 6, 2, 6, 6));
  towards(o, [0.55, 0.52, 0.36], lichen * 0.5);
  mul3(o, 1 - crackLine * 0.6);
  mul3(o, 0.55 + 0.45 * groove);
  o.ro = clamp(0.82 + moss * 0.15 - wet * 0.3 + detail * 0.1);
}, 3.5));

// ───────────────────────── 山野泥土与枯草 ─────────────────────────
export const groundDirt = () => cached('groundDirt', () => bake(512, 512, (u, v, o) => {
  const f = N.fbm(u * 6, v * 6, 5, 6, 6);
  const g = N2.fbm(u * 4, v * 4, 4, 4, 4);
  const pebble = N.worley(u * 40, v * 40, 40, 40);
  const pb = 1 - smooth(0.15, 0.35, pebble[0]);
  const grass = smooth(0.45, 0.65, g);
  mix3(o, [0.20, 0.15, 0.10], [0.30, 0.24, 0.16], f);
  towards(o, [0.24, 0.26, 0.11], grass * 0.75);
  const blades = N.noise(u * 300, v * 60, 300, 60);
  mul3(o, 0.8 + 0.4 * blades * grass + 0.2 * f);
  towards(o, [0.42, 0.40, 0.36], pb * 0.6 * (1 - grass));
  o.h = f * 0.5 + pb * 0.4 + blades * grass * 0.2;
  o.ro = 0.9;
}, 2.5));

// ───────────────────────── 岩石 ─────────────────────────
export const rock = () => cached('rock', () => bake(512, 512, (u, v, o) => {
  const r = N.ridged(u * 4, v * 4, 6, 4, 4);
  const f = N.fbm(u * 16, v * 16, 5, 16, 16);
  const strata = Math.sin((v * 18 + N.fbm(u * 3, v * 3, 3, 3, 3) * 4) * Math.PI) * 0.5 + 0.5;
  mix3(o, [0.30, 0.29, 0.27], [0.50, 0.48, 0.44], f * 0.7 + strata * 0.3);
  mul3(o, 0.6 + r * 0.6);
  const lich = smooth(0.6, 0.72, N2.fbm(u * 10, v * 10, 4, 10, 10));
  towards(o, [0.36, 0.40, 0.20], lich * 0.7);
  o.h = r * 0.7 + f * 0.3 + strata * 0.1;
  o.ro = 0.85 - lich * 0.05;
}, 4));

// ───────────────────────── 朱漆木柱（剥落） ─────────────────────────
export const lacquerWood = () => cached('lacquer', () => bake(512, 512, (u, v, o) => {
  const grain = N.fbm(u * 3, v * 40, 4, 3, 40);
  const fine = N.noise(u * 6, v * 300, 6, 300);
  const peel = N2.fbm(u * 5, v * 5, 5, 5, 5);
  const paint = smooth(0.5, 0.53, peel + N.noise(u * 60, v * 60, 60, 60) * 0.06);
  const wood = [0.22 + grain * 0.12, 0.13 + grain * 0.07, 0.07 + grain * 0.04];
  const fade = N.fbm(u * 2, v * 8, 3, 2, 8);
  const red = [0.48 - fade * 0.15, 0.09, 0.06];
  mix3(o, wood, red, paint);
  mul3(o, 0.75 + fine * 0.3);
  // 垂直雨渍
  const streak = N.noise(u * 50, v * 2, 50, 2);
  mul3(o, 1 - smooth(0.6, 0.9, streak) * 0.3);
  o.h = paint * 0.4 + grain * 0.3 + fine * 0.1;
  o.ro = lerp(0.85, 0.55 + fade * 0.25, paint);
}, 2.5));

// ───────────────────────── 屋瓦 ─────────────────────────
export const roofTiles = () => cached('roof', () => bake(512, 512, (u, v, o) => {
  const cols = 10, rows = 14;
  const cu = u * cols, cv = v * rows;
  const row = Math.floor(cv);
  const fu = cu - Math.floor(cu), fv = cv - row;
  const ch = Math.abs(Math.cos(fu * Math.PI));
  const lip = smooth(0.0, 0.15, fv) * (1 - smooth(0.85, 1.0, fv) * 0.5);
  const f = N.fbm(u * 10, v * 10, 4, 10, 10);
  o.h = (1 - ch) * 0.6 + fv * 0.4 + f * 0.1;
  mix3(o, [0.12, 0.13, 0.13], [0.24, 0.25, 0.25], f);
  mul3(o, 0.5 + 0.6 * lip * (0.4 + 0.6 * (1 - ch)));
  const moss = smooth(0.55, 0.75, N2.fbm(u * 6, v * 6, 4, 6, 6)) * ch;
  towards(o, [0.18, 0.21, 0.10], moss * 0.8);
  o.ro = 0.55 + f * 0.3 + moss * 0.2;
}, 3));

// ───────────────────────── 粗布（深褐） ─────────────────────────
export const clothDark = () => cached('clothDark', () => bake(512, 512, (u, v, o) => {
  const wx = Math.sin(u * 2 * Math.PI * 160), wy = Math.sin(v * 2 * Math.PI * 160);
  const weave = (wx * 0.5 + 0.5) * (wy > 0 ? 1 : 0.6);
  const wear = N.fbm(u * 6, v * 6, 5, 6, 6);
  const dirt = N2.fbm(u * 3, v * 3, 4, 3, 3);
  mix3(o, [0.11, 0.08, 0.06], [0.22, 0.16, 0.11], wear);
  mul3(o, 0.8 + weave * 0.25);
  towards(o, [0.28, 0.24, 0.18], smooth(0.6, 0.8, dirt) * 0.5);
  o.h = weave * 0.3 + wear * 0.2;
  o.ro = 0.92;
}, 1.5));

export const clothRed = () => cached('clothRed', () => bake(512, 512, (u, v, o) => {
  const wx = Math.sin(u * 2 * Math.PI * 140), wy = Math.sin(v * 2 * Math.PI * 140);
  const weave = (wx * 0.5 + 0.5) * (wy > 0 ? 1 : 0.6);
  const wear = N.fbm(u * 5, v * 5, 5, 5, 5);
  mix3(o, [0.20, 0.05, 0.04], [0.36, 0.10, 0.07], wear);
  mul3(o, 0.8 + weave * 0.25);
  towards(o, [0.25, 0.20, 0.15], smooth(0.62, 0.8, N2.fbm(u * 4, v * 4, 4, 4, 4)) * 0.6);
  o.h = weave * 0.3 + wear * 0.2;
  o.ro = 0.9;
}, 1.5));

// ───────────────────────── 虎皮（虎皮裙） ─────────────────────────
export const tigerSkin = () => cached('tiger', () => bake(512, 512, (u, v, o) => {
  const warp = N.fbm(u * 3, v * 3, 4, 3, 3) * 1.6 + N.noise(u * 12, v * 4, 12, 4) * 0.2;
  const s = Math.abs(Math.sin(Math.PI * (u * 7 + warp)));
  const width = 0.25 + 0.35 * N2.fbm(u * 4, v * 6, 3, 4, 6);
  const stripe = 1 - smooth(width - 0.08, width, s);
  const hair = N.noise(u * 220, v * 30, 220, 30);
  const belly = smooth(0.55, 0.95, N.fbm(u * 2, v * 2, 3, 2, 2));
  mix3(o, [0.70, 0.38, 0.11], [0.85, 0.55, 0.22], hair);
  towards(o, [0.88, 0.80, 0.66], belly * 0.6);
  towards(o, [0.05, 0.035, 0.03], stripe * 0.95);
  mul3(o, 0.8 + hair * 0.3);
  o.h = hair * 0.5;
  o.ro = 0.88;
}, 2));

// ───────────────────────── 鎏金錾刻（祥云卷纹） ─────────────────────────
export const goldEngraved = () => cached('gold', () => bake(512, 512, (u, v, o) => {
  const G = 4;
  const cu = u * G, cv = v * G;
  const fx = cu - Math.floor(cu) - 0.5, fy = cv - Math.floor(cv) - 0.5;
  const odd = (Math.floor(cu) + Math.floor(cv)) & 1;
  const r = Math.hypot(fx, fy);
  const a = Math.atan2(fy, fx) * (odd ? 1 : -1);
  const spiral = (r * 7 - a / (2 * Math.PI)) % 1;
  const sp = (spiral + 1) % 1;
  const groove = (1 - smooth(0.0, 0.09, Math.min(sp, 1 - sp))) * (1 - smooth(0.36, 0.42, r));
  const band = 1 - smooth(0.0, 0.025, Math.min(Math.abs(fy + 0.5), Math.abs(fy - 0.5)) - 0.0);
  const g = clamp(groove + band * 0.8);
  const wear = N.fbm(u * 12, v * 12, 4, 12, 12);
  mix3(o, [1.0, 0.77, 0.36], [0.92, 0.66, 0.30], wear);
  towards(o, [0.30, 0.20, 0.08], g * 0.75);
  o.h = 1 - g * 0.7 + wear * 0.05;
  o.ro = 0.22 + g * 0.45 + wear * 0.15;
  o.m = 1 - g * 0.2;
}, 4, { metal: true }));

// ───────────────────────── 黑铁 ─────────────────────────
export const darkIron = () => cached('iron', () => bake(512, 512, (u, v, o) => {
  const f = N.fbm(u * 10, v * 10, 5, 10, 10);
  const scratch = N.noise(u * 400, v * 8, 400, 8);
  const rust = smooth(0.62, 0.8, N2.fbm(u * 6, v * 6, 5, 6, 6));
  mix3(o, [0.07, 0.065, 0.06], [0.16, 0.15, 0.14], f);
  mul3(o, 0.85 + scratch * 0.3);
  towards(o, [0.28, 0.13, 0.06], rust * 0.8);
  o.h = f * 0.3 + rust * 0.3;
  o.ro = 0.38 + f * 0.2 + rust * 0.4;
  o.m = 1 - rust;
}, 2, { metal: true }));

// ───────────────────────── 皮革 ─────────────────────────
export const leather = () => cached('leather', () => bake(512, 512, (u, v, o) => {
  const w = N.worley(u * 30, v * 30, 30, 30);
  const crease = smooth(0.0, 0.12, w[1] - w[0]);
  const f = N.fbm(u * 8, v * 8, 5, 8, 8);
  mix3(o, [0.17, 0.10, 0.06], [0.33, 0.20, 0.11], f);
  mul3(o, 0.7 + 0.3 * crease);
  o.h = crease * 0.4 + f * 0.3;
  o.ro = 0.55 + (1 - crease) * 0.25;
}, 2));

// ───────────────────────── 绷带 / 绑腿 ─────────────────────────
export const bandage = () => cached('bandage', () => bake(512, 512, (u, v, o) => {
  const k = (v * 9 + u * 1.0) % 1;
  const ridge = smooth(0.0, 0.12, k) * (1 - smooth(0.9, 1.0, k) * 0.3);
  const thread = Math.sin(u * 2 * Math.PI * 200) * 0.5 + 0.5;
  const dirt = N.fbm(u * 5, v * 5, 5, 5, 5);
  mix3(o, [0.36, 0.31, 0.24], [0.60, 0.54, 0.43], dirt);
  mul3(o, 0.55 + 0.45 * ridge);
  mul3(o, 0.9 + thread * 0.1);
  towards(o, [0.20, 0.13, 0.08], smooth(0.62, 0.8, N2.fbm(u * 6, v * 6, 4, 6, 6)) * 0.6);
  o.h = ridge * 0.6 + thread * 0.08;
  o.ro = 0.95;
}, 2.5));

// ───────────────────────── 皮肤（猴面） ─────────────────────────
export const skin = () => cached('skin', () => bake(512, 512, (u, v, o) => {
  const pores = N.worley(u * 90, v * 90, 90, 90);
  const pr = smooth(0.0, 0.3, pores[0]);
  const wr = N.ridged(u * 8, v * 20, 4, 8, 20);
  const f = N.fbm(u * 6, v * 6, 4, 6, 6);
  o.r = o.g = o.b = 0.75 + f * 0.25;
  o.h = pr * 0.25 - smooth(0.7, 0.95, wr) * 0.4 + f * 0.1;
  o.ro = 0.5 + f * 0.2;
}, 2.5));

// ───────────────────────── 札甲（狼妖胸甲） ─────────────────────────
export const lamellar = () => cached('lamellar', () => bake(512, 512, (u, v, o) => {
  const cols = 12, rows = 10;
  const row = Math.floor(v * rows);
  const cu = u * cols + (row & 1) * 0.5;
  const fu = cu - Math.floor(cu), fv = v * rows - row;
  const pid = Math.floor(cu) * 31 + row * 17;
  const rnd = N.V[pid & 255];
  const edge = Math.min(fu, 1 - fu, fv * 2, 1 - fv);
  const bevel = smooth(0.0, 0.12, edge);
  const rivet = 1 - smooth(0.03, 0.06, Math.hypot(fu - 0.5, fv - 0.25) * 1.0);
  const f = N.fbm(u * 10, v * 10, 4, 10, 10);
  mix3(o, [0.10, 0.09, 0.08], [0.22, 0.19, 0.15], rnd * 0.5 + f * 0.5);
  mul3(o, 0.45 + 0.55 * bevel);
  towards(o, [0.55, 0.42, 0.22], rivet * 0.8);
  const rust = smooth(0.6, 0.8, N2.fbm(u * 8, v * 8, 4, 8, 8));
  towards(o, [0.30, 0.14, 0.06], rust * 0.6);
  o.h = bevel * 0.6 + rivet * 0.5 + fv * 0.15;
  o.ro = 0.45 + f * 0.25 + rust * 0.3;
  o.m = 0.85 - rust * 0.6;
}, 4, { metal: true }));

// ───────────────────────── 树皮 ─────────────────────────
export const bark = () => cached('bark', () => bake(256, 512, (u, v, o) => {
  const w = N.worley(u * 6, v * 2, 6, 2, 0.9);
  const ridge = smooth(0.0, 0.25, w[1] - w[0]);
  const f = N.fbm(u * 8, v * 20, 4, 8, 20);
  mix3(o, [0.14, 0.10, 0.08], [0.32, 0.25, 0.20], ridge * 0.7 + f * 0.3);
  o.h = ridge * 0.8 + f * 0.2;
  o.ro = 0.92;
}, 3));

// ───────────────────────── 雉羽（凤翅紫金冠翎羽） ─────────────────────────
export const feather = () => cached('feather', () => bake(128, 1024, (u, v, o) => {
  const x = Math.abs(u - 0.5) * 2;
  const edgeN = N.noise(v * 120, u * 3) * 0.12 + N.noise(v * 400, 0) * 0.05;
  const taper = v < 0.04 ? v / 0.04 : 1;
  const inside = x < (0.95 - edgeN) * (0.85 + 0.15 * taper);
  o.a = inside ? 1 : 0;
  // 人字形横斑
  const bars = (v * 34 + x * 0.9) % 1;
  const dark = 1 - smooth(0.36, 0.44, bars);
  const pale = smooth(0.44, 0.48, bars) * (1 - smooth(0.5, 0.54, bars));
  mix3(o, [0.62, 0.42, 0.18], [0.75, 0.55, 0.26], N.noise(v * 50, u * 5));
  towards(o, [0.08, 0.05, 0.03], dark * 0.92);
  towards(o, [0.92, 0.86, 0.72], pale * 0.7);
  // 羽轴
  const shaft = 1 - smooth(0.02, 0.06, x);
  towards(o, [0.86, 0.80, 0.66], shaft * 0.85);
  // 羽枝
  const barb = Math.sin((v * 700 - x * 90) * 1.0) * 0.5 + 0.5;
  mul3(o, 0.82 + barb * 0.2);
  // 末梢渐红（凤翅意象）
  towards(o, [0.55, 0.12, 0.06], smooth(0.88, 1.0, v) * 0.5);
  o.h = barb * 0.3 + shaft * 0.6;
  o.ro = 0.6;
}, 2));

// ───────────────────────── 以下为 Canvas 2D 绘制贴图 ─────────────────────────
function canvasTex(w, h, draw, srgb = true) {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  const g = c.getContext('2d');
  draw(g, w, h);
  const t = new THREE.CanvasTexture(c);
  if (srgb) t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 8;
  return t;
}

// 金色瞳孔（火眼金睛）——等距柱状投影，瞳孔位于 u=0.25（朝 +Z）
export const eyeIris = (hue = 'gold') => cached('eye' + hue, () => canvasTex(512, 256, (g, w, h) => {
  const gold = hue === 'gold';
  const brown = hue === 'brown';
  g.fillStyle = brown ? '#2a1a12' : gold ? '#1a0f08' : '#140d06';
  g.fillRect(0, 0, w, h);
  const cx = w * 0.25, cy = h * 0.5, R = 62;
  const grad = g.createRadialGradient(cx, cy, 6, cx, cy, R);
  if (brown) {
    grad.addColorStop(0, '#120804'); grad.addColorStop(0.25, '#5a2e10');
    grad.addColorStop(0.55, '#9a5e24'); grad.addColorStop(0.85, '#5c3010'); grad.addColorStop(1, '#1e0e05');
  } else if (gold) {
    grad.addColorStop(0, '#2a1203'); grad.addColorStop(0.22, '#b8620e');
    grad.addColorStop(0.5, '#f2b33a'); grad.addColorStop(0.82, '#c77612'); grad.addColorStop(1, '#3a1a05');
  } else {
    grad.addColorStop(0, '#300'); grad.addColorStop(0.25, '#d8a018');
    grad.addColorStop(0.6, '#ffd84a'); grad.addColorStop(0.9, '#a86a10'); grad.addColorStop(1, '#2a1404');
  }
  g.fillStyle = grad;
  g.beginPath(); g.arc(cx, cy, R, 0, Math.PI * 2); g.fill();
  const r = rng(3);
  g.globalAlpha = 0.35;
  for (let i = 0; i < 260; i++) {
    const a = r() * Math.PI * 2, l0 = 14 + r() * 10, l1 = 40 + r() * 22;
    g.strokeStyle = r() > 0.5 ? '#ffe28a' : '#5a2a06';
    g.lineWidth = 0.6 + r() * 1.2;
    g.beginPath(); g.moveTo(cx + Math.cos(a) * l0, cy + Math.sin(a) * l0);
    g.lineTo(cx + Math.cos(a + 0.05) * l1, cy + Math.sin(a + 0.05) * l1); g.stroke();
  }
  g.globalAlpha = 1;
  g.fillStyle = '#050302';
  g.beginPath();
  if (gold || brown) g.arc(cx, cy, brown ? 19 : 15, 0, Math.PI * 2);
  else g.ellipse(cx, cy, 5, 20, 0, 0, Math.PI * 2);
  g.fill();
  g.strokeStyle = 'rgba(10,5,2,0.9)'; g.lineWidth = 6;
  g.beginPath(); g.arc(cx, cy, R - 2, 0, Math.PI * 2); g.stroke();
}));

// 松针卡片
export const pineCard = () => cached('pineCard', () => canvasTex(256, 256, (g, w, h) => {
  g.clearRect(0, 0, w, h);
  const r = rng(11);
  g.lineCap = 'round';
  for (let b = 0; b < 3; b++) {
    const bx = w * (0.3 + b * 0.2), by = h * 0.95;
    const ex = w * (0.25 + r() * 0.5), ey = h * 0.08;
    g.strokeStyle = '#3a2a1a'; g.lineWidth = 3;
    g.beginPath(); g.moveTo(bx, by); g.lineTo(ex, ey); g.stroke();
    for (let i = 0; i < 90; i++) {
      const t = r();
      const px = bx + (ex - bx) * t, py = by + (ey - by) * t;
      const side = r() > 0.5 ? 1 : -1;
      const len = 26 + r() * 30 * (1 - t * 0.4);
      const ang = Math.atan2(ey - by, ex - bx) + side * (0.6 + r() * 0.5);
      const shade = 50 + r() * 60;
      g.strokeStyle = `rgb(${shade * 0.45 | 0},${shade + 20 | 0},${shade * 0.4 | 0})`;
      g.lineWidth = 1.3 + r();
      g.beginPath(); g.moveTo(px, py); g.lineTo(px + Math.cos(ang) * len, py + Math.sin(ang) * len); g.stroke();
    }
  }
}));

// 飘落枫叶
export const leafTex = () => cached('leaf', () => canvasTex(64, 64, (g) => {
  g.translate(32, 32);
  const grd = g.createLinearGradient(-20, -20, 20, 20);
  grd.addColorStop(0, '#d0461a'); grd.addColorStop(1, '#7a1e0a');
  g.fillStyle = grd;
  g.beginPath();
  for (let i = 0; i <= 10; i++) {
    const a = (i / 10) * Math.PI * 2 - Math.PI / 2;
    const rr = i % 2 === 0 ? 28 : 12;
    g.lineTo(Math.cos(a) * rr, Math.sin(a) * rr);
  }
  g.fill();
  g.strokeStyle = 'rgba(60,15,5,0.6)'; g.lineWidth = 1.5;
  for (let i = 0; i < 5; i++) {
    const a = (i / 5) * Math.PI * 2 - Math.PI / 2;
    g.beginPath(); g.moveTo(0, 0); g.lineTo(Math.cos(a) * 24, Math.sin(a) * 24); g.stroke();
  }
}));

// 粒子：柔和烟雾
export const smokeTex = () => cached('smoke', () => canvasTex(128, 128, (g, w, h) => {
  const img = g.createImageData(w, h);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const dx = x / w - 0.5, dy = y / h - 0.5;
    const d = Math.hypot(dx, dy) * 2;
    const n = N.fbm(x / 24, y / 24, 4);
    const a = clamp(1 - d) ** 1.5 * (0.4 + 0.8 * n);
    const j = (y * w + x) * 4;
    img.data[j] = img.data[j + 1] = img.data[j + 2] = 255;
    img.data[j + 3] = clamp(a) * 255;
  }
  g.putImageData(img, 0, 0);
}));

// 粒子：火花/光点
export const glowTex = () => cached('glow', () => canvasTex(64, 64, (g, w, h) => {
  const grd = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  grd.addColorStop(0, 'rgba(255,255,255,1)');
  grd.addColorStop(0.2, 'rgba(255,255,255,0.8)');
  grd.addColorStop(0.5, 'rgba(255,255,255,0.2)');
  grd.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = grd; g.fillRect(0, 0, w, h);
}));

// 冲击波环
export const ringTex = () => cached('ring', () => canvasTex(256, 256, (g, w, h) => {
  const grd = g.createRadialGradient(128, 128, 60, 128, 128, 128);
  grd.addColorStop(0, 'rgba(255,255,255,0)');
  grd.addColorStop(0.75, 'rgba(255,240,200,0.0)');
  grd.addColorStop(0.9, 'rgba(255,230,170,1)');
  grd.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = grd; g.fillRect(0, 0, w, h);
}));

// 地面裂痕贴花
export const crackDecal = () => cached('crack', () => canvasTex(256, 256, (g, w, h) => {
  g.clearRect(0, 0, w, h);
  const r = rng(99);
  const grd = g.createRadialGradient(128, 128, 0, 128, 128, 120);
  grd.addColorStop(0, 'rgba(10,8,6,0.85)'); grd.addColorStop(0.35, 'rgba(20,15,10,0.35)'); grd.addColorStop(1, 'rgba(0,0,0,0)');
  g.fillStyle = grd; g.fillRect(0, 0, w, h);
  g.strokeStyle = 'rgba(5,4,3,0.95)';
  for (let i = 0; i < 14; i++) {
    let x = 128, y = 128, a = r() * Math.PI * 2;
    g.lineWidth = 3.5;
    g.beginPath(); g.moveTo(x, y);
    for (let s = 0; s < 12; s++) {
      a += (r() - 0.5) * 0.9;
      const l = 6 + r() * 10;
      x += Math.cos(a) * l; y += Math.sin(a) * l;
      g.lineTo(x, y);
      g.lineWidth = Math.max(0.6, 3.5 - s * 0.3);
    }
    g.stroke();
  }
}));

// 定身咒 金色符文法阵
export const sigilTex = () => cached('sigil', () => canvasTex(512, 512, (g, w, h) => {
  g.clearRect(0, 0, w, h);
  g.translate(256, 256);
  g.strokeStyle = 'rgba(255,215,120,1)';
  g.shadowColor = 'rgba(255,190,80,1)'; g.shadowBlur = 12;
  const ring = (r, lw) => { g.lineWidth = lw; g.beginPath(); g.arc(0, 0, r, 0, Math.PI * 2); g.stroke(); };
  ring(240, 4); ring(222, 2); ring(150, 3); ring(90, 2);
  g.font = 'bold 34px "KaiTi","STKaiti",serif';
  g.fillStyle = 'rgba(255,225,150,1)';
  g.textAlign = 'center'; g.textBaseline = 'middle';
  const chars = '定住乾坤敕令天罡地煞北斗七星禁';
  for (let i = 0; i < chars.length; i++) {
    const a = (i / chars.length) * Math.PI * 2;
    g.save(); g.rotate(a); g.fillText(chars[i], 0, -186); g.restore();
  }
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * Math.PI * 2;
    g.lineWidth = 2;
    g.beginPath(); g.moveTo(Math.cos(a) * 90, Math.sin(a) * 90); g.lineTo(Math.cos(a + Math.PI * 0.75) * 150, Math.sin(a + Math.PI * 0.75) * 150); g.stroke();
  }
  g.font = 'bold 110px "KaiTi","STKaiti",serif';
  g.fillText('定', 0, 6);
}));
