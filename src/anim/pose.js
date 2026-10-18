// 控制骨架姿势：躯干 FK 欧拉角 + 武器/手/脚 IK 目标。所有坐标均为角色模型空间（+Z 为正前方，+X 为角色左侧）
export const BASE_POSE = {
  yaw: 0,
  hips: { p: [0, 0, 0], r: [0, 0, 0] },
  spine: [0, 0, 0], chest: [0, 0, 0], neck: [0, 0, 0], head: [0, 0, 0],
  clavL: [0, 0, 0], clavR: [0, 0, 0],
  staff: { grip: [-0.25, 0.95, 0.1], dir: [0, 0, 1], slide: 0, roll: 0 },
  handL: { w: 0, s: 0.3, p: [0.25, 0.9, 0.1], r: [0, 0, 0] },
  handR: { r: [0, 0, 0] },
  poleL: [0.7, -0.5, -0.6], poleR: [-0.7, -0.5, -0.6],
  footL: { p: [0.11, 0, 0.02], yaw: 0.12, pitch: 0 },
  footR: { p: [-0.11, 0, 0.02], yaw: -0.12, pitch: 0 },
  kneeL: [0, 0, 0], kneeR: [0, 0, 0],
  fx: { glow: 0, gourd: 0, open: 0 },
};

export function clonePose(p) { return JSON.parse(JSON.stringify(p)); }

// 深度合并（数组整体替换）
export function mergePose(base, over) {
  const out = clonePose(base);
  (function m(a, b) {
    for (const k of Object.keys(b)) {
      const v = b[k];
      if (Array.isArray(v)) a[k] = v.slice();
      else if (v && typeof v === 'object') { if (!a[k] || typeof a[k] !== 'object') a[k] = {}; m(a[k], v); }
      else a[k] = v;
    }
  })(out, over);
  return out;
}

function norm3(a) {
  const l = Math.hypot(a[0], a[1], a[2]) || 1;
  a[0] /= l; a[1] /= l; a[2] /= l;
  return a;
}

// 若左手握在武器上，预先算出其位置，便于与自由手位置平滑过渡
export function finalizePose(p) {
  norm3(p.staff.dir);
  if (p.handL.w > 0.999) {
    const g = p.staff.grip, d = p.staff.dir, s = p.handL.s;
    p.handL.p = [g[0] + d[0] * s, g[1] + d[1] * s, g[2] + d[2] * s];
  }
  return p;
}

// out = lerp(a, b, t)，结构需一致
export function blendPose(a, b, t, out) {
  (function m(x, y, o) {
    for (const k of Object.keys(y)) {
      const vy = y[k], vx = x[k];
      if (typeof vy === 'number') o[k] = vx + (vy - vx) * t;
      else if (Array.isArray(vy)) {
        if (!Array.isArray(o[k])) o[k] = vy.slice();
        for (let i = 0; i < vy.length; i++) o[k][i] = vx[i] + (vy[i] - vx[i]) * t;
      } else if (vy && typeof vy === 'object') {
        if (!o[k]) o[k] = {};
        m(vx, vy, o[k]);
      }
    }
  })(a, b, out);
  norm3(out.staff.dir);
  return out;
}

export function copyPose(src, dst) { return blendPose(src, src, 0, dst); }

export const EASE = {
  lin: (t) => t,
  io: (t) => t * t * (3 - 2 * t),
  in: (t) => t * t * t,
  in2: (t) => t * t,
  out: (t) => 1 - (1 - t) ** 3,
  out2: (t) => 1 - (1 - t) ** 2,
  snap: (t) => 1 - (1 - t) ** 5,
};

// 关键帧剪辑：每个关键帧只写与上一帧不同的部分
export function makeClip(name, base, def) {
  const keys = [];
  let prev = base;
  for (const k of def.keys) {
    const full = finalizePose(mergePose(prev, k.p || {}));
    keys.push({ t: k.t, pose: full, ease: EASE[k.e || 'io'] });
    prev = full;
  }
  return {
    name, keys,
    dur: def.dur ?? keys[keys.length - 1].t,
    loop: !!def.loop,
    events: (def.events || []).slice().sort((a, b) => a.t - b.t),
    motion: def.motion || [],
    hit: def.hit || [],
    combo: def.combo || null,
    cancel: def.cancel ?? 1e9,
    iframes: def.iframes || null,
    meta: def.meta || {},
  };
}

export function sampleClip(clip, time, out) {
  const keys = clip.keys;
  let t = time;
  if (clip.loop) t = ((time % clip.dur) + clip.dur) % clip.dur;
  if (t <= keys[0].t) return copyPose(keys[0].pose, out);
  for (let i = 0; i < keys.length - 1; i++) {
    const a = keys[i], b = keys[i + 1];
    if (t < b.t) return blendPose(a.pose, b.pose, b.ease((t - a.t) / (b.t - a.t)), out);
  }
  return copyPose(keys[keys.length - 1].pose, out);
}
