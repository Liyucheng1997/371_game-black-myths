// 确定性随机数与可平铺噪声（值噪声 / fbm / Worley），用于所有程序化贴图
export function rng(seed = 1) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const mod = (a, n) => ((a % n) + n) % n;

export class Noise {
  constructor(seed = 1) {
    const r = rng(seed);
    const p = new Uint16Array(256);
    for (let i = 0; i < 256; i++) p[i] = i;
    for (let i = 255; i > 0; i--) {
      const j = Math.floor(r() * (i + 1));
      const t = p[i]; p[i] = p[j]; p[j] = t;
    }
    this.P = new Uint16Array(512);
    for (let i = 0; i < 512; i++) this.P[i] = p[i & 255];
    this.V = new Float32Array(256);
    for (let i = 0; i < 256; i++) this.V[i] = r();
    this._w = [0, 0, 0, 0, 0];
  }
  h(ix, iy) { return this.P[this.P[ix & 255] + (iy & 255)]; }
  // 可平铺值噪声，px/py 为周期（0 表示不平铺）
  noise(x, y, px = 0, py = 0) {
    let ix = Math.floor(x), iy = Math.floor(y);
    const fx = x - ix, fy = y - iy;
    const ux = fx * fx * (3 - 2 * fx), uy = fy * fy * (3 - 2 * fy);
    let ix1 = ix + 1, iy1 = iy + 1;
    if (px) { ix = mod(ix, px); ix1 = mod(ix1, px); }
    if (py) { iy = mod(iy, py); iy1 = mod(iy1, py); }
    const V = this.V;
    const a = V[this.h(ix, iy)], b = V[this.h(ix1, iy)];
    const c = V[this.h(ix, iy1)], d = V[this.h(ix1, iy1)];
    return a + (b - a) * ux + (c - a) * uy + (a - b - c + d) * ux * uy;
  }
  fbm(x, y, oct = 5, px = 0, py = 0, gain = 0.5) {
    let s = 0, amp = 1, norm = 0, f = 1;
    for (let o = 0; o < oct; o++) {
      s += this.noise(x * f, y * f, px * f, py * f) * amp;
      norm += amp; amp *= gain; f *= 2;
    }
    return s / norm;
  }
  ridged(x, y, oct = 5, px = 0, py = 0) {
    let s = 0, amp = 1, norm = 0, f = 1;
    for (let o = 0; o < oct; o++) {
      const n = 1 - Math.abs(this.noise(x * f, y * f, px * f, py * f) * 2 - 1);
      s += n * n * amp; norm += amp; amp *= 0.5; f *= 2;
    }
    return s / norm;
  }
  // 返回 [F1, F2, cellId, cellX, cellY]（复用数组）
  worley(x, y, px = 0, py = 0, jitter = 1) {
    const ix = Math.floor(x), iy = Math.floor(y);
    let f1 = 9, f2 = 9, id = 0, cx1 = 0, cy1 = 0;
    for (let dy = -1; dy <= 1; dy++) {
      for (let dx = -1; dx <= 1; dx++) {
        const cx = ix + dx, cy = iy + dy;
        const wx = px ? mod(cx, px) : cx, wy = py ? mod(cy, py) : cy;
        const hh = this.h(wx, wy);
        const jx = 0.5 + (this.V[hh] - 0.5) * jitter;
        const jy = 0.5 + (this.V[(hh * 7 + 13) & 255] - 0.5) * jitter;
        const ddx = cx + jx - x, ddy = cy + jy - y;
        const d = Math.sqrt(ddx * ddx + ddy * ddy);
        if (d < f1) { f2 = f1; f1 = d; id = hh; cx1 = cx + jx; cy1 = cy + jy; }
        else if (d < f2) f2 = d;
      }
    }
    const w = this._w;
    w[0] = f1; w[1] = f2; w[2] = id; w[3] = cx1; w[4] = cy1;
    return w;
  }
}

export const clamp = (x, a = 0, b = 1) => (x < a ? a : x > b ? b : x);
export const lerp = (a, b, t) => a + (b - a) * t;
export const smooth = (a, b, x) => {
  const t = clamp((x - a) / (b - a));
  return t * t * (3 - 2 * t);
};
