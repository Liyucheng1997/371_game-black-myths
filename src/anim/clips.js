// 动作库：天命人棍法（轻击四连、蓄力劈棍、闪身、喝葫芦、定身法…）与狼校卫刀法，均为手写关键帧 + 程序化步态
import { BASE_POSE, mergePose, finalizePose, makeClip, blendPose, clonePose } from './pose.js';

const TAU = Math.PI * 2;

// ═════════════════════ 天命人 ═════════════════════
export const WK_IDLE = finalizePose(mergePose(BASE_POSE, {
  hips: { p: [0, -0.08, 0], r: [0.07, -0.25, 0] },
  spine: [0.05, -0.1, 0], chest: [0.07, -0.1, 0], neck: [-0.02, 0.15, 0], head: [-0.06, 0.25, 0],
  staff: { grip: [-0.15, 0.98, 0.12], dir: [0.3, -0.25, 1], slide: -0.5 },
  handL: { w: 1, s: 0.33 },
  poleR: [-0.8, -0.5, -0.4], poleL: [0.7, -0.6, -0.2],
  footL: { p: [0.12, 0, 0.2], yaw: -0.05 }, footR: { p: [-0.16, 0, -0.2], yaw: -0.75 },
}));

function makeLoco(idle, cfg) {
  const run = mergePose(idle, cfg.run);
  const a = clonePose(idle), b = clonePose(run);
  return (t, ctx, out) => {
    // 待机：呼吸
    const br = Math.sin(t * 2.1);
    copyInto(idle, a);
    a.chest[0] += 0.018 * br; a.neck[0] -= 0.012 * br;
    a.clavL[2] = -0.02 * br; a.clavR[2] = 0.02 * br;
    a.staff.grip[1] += 0.006 * br;
    a.hips.p[1] += 0.004 * br;
    // 奔跑步态
    const sp = ctx.speed || 0, stride = cfg.stride(sp);
    const ph = ctx.phase || 0;
    copyInto(run, b);
    const s = Math.sin(ph * TAU);
    b.hips.p[1] = cfg.hipY - cfg.bob * Math.cos(2 * TAU * (ph - 0.2)) - Math.min(sp, 8) * 0.004;
    b.hips.r[0] = cfg.lean + sp * 0.012;
    b.hips.r[1] = 0.14 * s;
    b.hips.r[2] = (ctx.lean || 0) * 0.5;
    b.spine[1] = -0.06 * s; b.chest[1] = -0.12 * s;
    b.chest[2] = -(ctx.lean || 0) * 0.3;
    b.head[1] = 0.15 * s;
    for (const [side, off, sg] of [['L', 0, 1], ['R', 0.5, -1]]) {
      const p = (ph + off) % 1;
      const F = b['foot' + side];
      let z, y, pitch;
      if (p < cfg.stance) {
        const u = p / cfg.stance;
        z = stride * (0.5 - u); y = 0; pitch = u > 0.7 ? (u - 0.7) * 1.6 : 0;
      } else {
        const u = (p - cfg.stance) / (1 - cfg.stance);
        const e = u * u * (3 - 2 * u);
        z = stride * (-0.5 + e);
        y = cfg.lift * Math.sin(Math.PI * u) + 0.1 * Math.sin(Math.PI * Math.min(1, u * 1.8)) * (stride / 1.0);
        pitch = 0.9 * (1 - u) * (1 - u) - 0.15 * Math.sin(Math.PI * u);
      }
      F.p[0] = sg * cfg.legX; F.p[1] = y; F.p[2] = z + 0.05;
      F.yaw = sg * 0.06; F.pitch = pitch;
      if (side === 'L') { b.handL.p[2] = cfg.handZ - 0.32 * (z / Math.max(0.3, stride)); b.handL.p[1] += 0; }
      else { b.staff.grip[2] = cfg.gripZ - 0.18 * (z / Math.max(0.3, stride)); }
    }
    b.staff.grip[1] = cfg.gripY + b.hips.p[1] * 0.6;
    blendPose(a, b, ctx.runW || 0, out);
    return out;
  };
}

function copyInto(src, dst) { return blendPose(src, src, 0, dst); }

export const wkLocomotion = makeLoco(WK_IDLE, {
  run: {
    hips: { p: [0, -0.06, 0], r: [0.22, 0, 0] }, spine: [0.08, 0, 0], chest: [0.05, 0, 0], neck: [-0.1, 0, 0], head: [-0.14, 0, 0],
    staff: { grip: [-0.27, 0.93, 0.0], dir: [-0.12, 0.3, -1], slide: -0.4 },
    handL: { w: 0, p: [0.25, 0.98, 0.1], r: [-0.3, 0, 0] }, poleL: [0.5, -0.3, -1], poleR: [-0.9, -0.3, -0.3],
  },
  stride: (sp) => Math.min(1.25, 0.35 + sp * 0.13), stance: 0.38, lift: 0.17, bob: 0.03, hipY: -0.075, lean: 0.18,
  legX: 0.1, handZ: 0.05, gripZ: 0.02, gripY: 0.97,
});

const W = WK_IDLE;
export const WK = {};
WK.A1 = makeClip('A1', W, {
  dur: 0.62, hit: [[0.12, 0.27, 1]], combo: [0.22, 0.62], cancel: 0.36, motion: [[0.05, 0.25, 3.2]],
  keys: [
    { t: 0, p: { hips: { p: [0, -0.08, 0], r: [0.02, -0.55, 0] }, spine: [0, -0.25, 0.05], chest: [-0.05, -0.3, 0.08], neck: [0, 0.35, 0], head: [0, 0.4, 0],
      staff: { grip: [-0.28, 1.42, -0.08], dir: [-0.45, 0.75, -0.5], slide: -0.72 }, handL: { w: 1, s: -0.14 }, poleR: [-0.9, 0.1, -0.3], poleL: [0.4, -0.8, 0.2],
      footL: { p: [0.13, 0, 0.22], yaw: -0.1 }, footR: { p: [-0.17, 0, -0.2], yaw: -0.8 } } },
    { t: 0.1, e: 'out2', p: { staff: { grip: [-0.3, 1.5, -0.12], dir: [-0.35, 0.8, -0.55] }, chest: [-0.08, -0.38, 0.1] } },
    { t: 0.19, e: 'in2', p: { hips: { p: [0, -0.12, 0.05], r: [0.12, 0.15, 0] }, spine: [0.08, 0.1, 0], chest: [0.12, 0.25, -0.05], neck: [0, -0.15, 0], head: [0, -0.15, 0],
      staff: { grip: [-0.05, 1.15, 0.42], dir: [0.1, 0.05, 1] }, footL: { p: [0.13, 0, 0.35], yaw: 0 } } },
    { t: 0.27, e: 'out', p: { hips: { p: [0, -0.13, 0.08], r: [0.18, 0.5, 0] }, spine: [0.1, 0.15, 0], chest: [0.2, 0.35, -0.1], neck: [0, -0.3, 0], head: [0, -0.3, 0],
      staff: { grip: [0.22, 0.92, 0.32], dir: [0.85, -0.5, 0.3] } } },
    { t: 0.62, p: { hips: { p: [0, -0.1, 0.05], r: [0.1, 0.35, 0] }, chest: [0.1, 0.2, 0], staff: { grip: [0.12, 0.98, 0.32], dir: [0.75, -0.45, 0.5] } } },
  ],
});
WK.A2 = makeClip('A2', WK.A1.keys[4].pose, {
  dur: 0.6, hit: [[0.11, 0.27, 1]], combo: [0.22, 0.6], cancel: 0.36, motion: [[0.04, 0.22, 3.0]],
  keys: [
    { t: 0, p: { hips: { p: [0, -0.1, 0.05], r: [0.08, 0.6, 0] }, spine: [0.05, 0.2, 0], chest: [0.05, 0.4, 0], neck: [0, -0.4, 0], head: [0, -0.45, 0],
      staff: { grip: [0.22, 1.18, 0.18], dir: [0.85, 0.25, -0.45], slide: -0.72 }, handL: { w: 1, s: -0.14 }, poleR: [-0.4, -0.6, -0.6], poleL: [0.8, -0.3, -0.3] } },
    { t: 0.09, e: 'out2', p: { staff: { grip: [0.25, 1.22, 0.1], dir: [0.75, 0.3, -0.6] }, chest: [0.03, 0.5, 0] } },
    { t: 0.18, e: 'in2', p: { hips: { p: [0, -0.12, 0.08], r: [0.1, -0.05, 0] }, spine: [0.08, -0.1, 0], chest: [0.12, -0.15, 0], neck: [0, 0.1, 0], head: [0, 0.12, 0],
      staff: { grip: [-0.02, 1.12, 0.45], dir: [-0.05, 0.02, 1] }, footR: { p: [-0.17, 0, 0.0], yaw: -0.5 } } },
    { t: 0.27, e: 'out', p: { hips: { p: [0, -0.12, 0.1], r: [0.1, -0.55, 0] }, spine: [0.06, -0.25, 0], chest: [0.08, -0.4, 0], neck: [0, 0.4, 0], head: [0, 0.45, 0],
      staff: { grip: [-0.35, 1.08, 0.2], dir: [-0.9, 0.12, 0.15] } } },
    { t: 0.6, p: { hips: { r: [0.06, -0.4, 0] }, chest: [0.05, -0.25, 0], staff: { grip: [-0.3, 1.05, 0.22], dir: [-0.75, 0, 0.6] } } },
  ],
});
WK.A3 = makeClip('A3', W, {
  dur: 0.72, hit: [[0.17, 0.27, 1.2]], combo: [0.32, 0.72], cancel: 0.42, motion: [[0.05, 0.25, 4.2]],
  events: [{ t: 0.25, type: 'impact', power: 0.45 }],
  keys: [
    { t: 0, p: { hips: { p: [0, -0.05, 0], r: [-0.05, -0.15, 0] }, spine: [-0.08, -0.05, 0], chest: [-0.15, -0.05, 0], neck: [0.1, 0.1, 0], head: [0.1, 0.1, 0],
      staff: { grip: [-0.1, 1.55, 0.05], dir: [0.05, 0.85, -0.5], slide: -0.75 }, handL: { w: 1, s: -0.15 }, poleR: [-0.8, 0.2, 0.2], poleL: [0.8, 0.2, 0.2],
      footL: { p: [0.12, 0, 0.15], yaw: -0.05 }, footR: { p: [-0.14, 0, -0.15], yaw: -0.5 } } },
    { t: 0.14, e: 'out2', p: { hips: { p: [0, 0.06, 0.05], r: [-0.15, -0.05, 0] }, chest: [-0.25, 0, 0], staff: { grip: [-0.08, 1.68, -0.02], dir: [0.02, 0.7, -0.72] },
      footL: { p: [0.12, 0.04, 0.25], pitch: 0.3 }, footR: { p: [-0.14, 0.05, -0.1], pitch: 0.4 } } },
    { t: 0.25, e: 'in', p: { hips: { p: [0, -0.22, 0.15], r: [0.35, 0, 0] }, spine: [0.15, 0, 0], chest: [0.3, 0, 0], neck: [-0.2, 0, 0], head: [-0.25, 0, 0],
      staff: { grip: [-0.04, 0.92, 0.55], dir: [0.02, -0.55, 1] }, footL: { p: [0.13, 0, 0.42], pitch: 0 }, footR: { p: [-0.15, 0, -0.25], pitch: 0.2 } } },
    { t: 0.38, p: { hips: { p: [0, -0.24, 0.15] }, staff: { grip: [-0.04, 0.9, 0.55], dir: [0.02, -0.58, 1] } } },
    { t: 0.72, p: { hips: { p: [0, -0.12, 0.08], r: [0.15, -0.1, 0] }, chest: [0.1, -0.05, 0], staff: { grip: [-0.1, 1.0, 0.35], dir: [0.15, -0.35, 1] } } },
  ],
});
WK.A4 = makeClip('A4', W, {
  dur: 0.95, hit: [[0.16, 0.34, 1.1], [0.36, 0.5, 1.1], [0.5, 0.6, 1.4]], cancel: 0.7, motion: [[0.12, 0.55, 2.6]],
  keys: [
    { t: 0, p: { yaw: 0, hips: { p: [0, -0.14, 0], r: [0.12, -0.3, 0] }, spine: [0.05, -0.1, 0], chest: [0.08, -0.2, 0], neck: [0, 0.2, 0], head: [0, 0.25, 0],
      staff: { grip: [-0.32, 1.05, 0.05], dir: [-1, 0.08, -0.3], slide: -0.65 }, handL: { w: 1, s: -0.15 }, poleR: [-0.6, -0.6, -0.4], poleL: [0.5, -0.7, 0.4],
      footL: { p: [0.16, 0, 0.15], yaw: 0.2 }, footR: { p: [-0.18, 0, -0.12], yaw: -0.4 } } },
    { t: 0.12, e: 'out2', p: { yaw: -0.5, staff: { dir: [-0.95, 0.12, -0.45] } } },
    { t: 0.24, e: 'in2', p: { yaw: 1.4, staff: { grip: [-0.36, 1.05, 0.1], dir: [-1, 0.05, 0.05] }, hips: { p: [0, -0.16, 0] } } },
    { t: 0.36, e: 'lin', p: { yaw: 3.2 } },
    { t: 0.48, e: 'lin', p: { yaw: 5.0 } },
    { t: 0.58, e: 'out', p: { yaw: TAU, hips: { p: [0, -0.2, 0.1], r: [0.25, 0.2, 0] }, chest: [0.2, 0.3, 0], neck: [0, -0.3, 0], head: [0, -0.3, 0],
      staff: { grip: [0.2, 0.95, 0.38], dir: [0.8, -0.4, 0.45] } } },
    { t: 0.95, p: { hips: { p: [0, -0.12, 0.05], r: [0.12, 0.1, 0] }, chest: [0.1, 0.15, 0], staff: { grip: [0.05, 1.0, 0.35], dir: [0.5, -0.4, 0.8] } } },
  ],
});
WK.HC = makeClip('HC', W, {
  dur: 0.3,
  keys: [
    { t: 0, p: { hips: { p: [0, -0.2, -0.02], r: [0.2, -0.45, 0] }, spine: [0.05, -0.2, 0], chest: [0, -0.3, 0.05], neck: [0, 0.4, 0], head: [0.05, 0.45, 0],
      staff: { grip: [-0.25, 1.45, -0.12], dir: [-0.25, 0.65, -0.75], slide: -0.75 }, handL: { w: 1, s: -0.15 }, poleR: [-0.9, 0, -0.2], poleL: [0.6, -0.6, 0.3],
      footL: { p: [0.16, 0, 0.3], yaw: -0.1 }, footR: { p: [-0.2, 0, -0.25], yaw: -0.9 }, fx: { glow: 0.3 } } },
    { t: 0.3, p: { hips: { p: [0, -0.25, -0.04] }, staff: { grip: [-0.27, 1.5, -0.16], dir: [-0.25, 0.7, -0.7] }, fx: { glow: 1 } } },
  ],
});
WK.HS = makeClip('HS', WK.HC.keys[1].pose, {
  dur: 1.0, hit: [[0.24, 0.33, 1]], cancel: 0.66, motion: [[0.0, 0.3, 7]],
  events: [{ t: 0.3, type: 'impact', power: 1 }],
  keys: [
    { t: 0, p: {} },
    { t: 0.16, e: 'out2', p: { hips: { p: [0, 0.5, 0.25], r: [-0.2, -0.1, 0] }, spine: [-0.1, 0, 0], chest: [-0.25, -0.05, 0], neck: [0.1, 0.05, 0], head: [0.1, 0.05, 0],
      staff: { grip: [-0.1, 1.95, 0.1], dir: [0, 0.8, -0.6] }, poleR: [-0.8, 0.3, 0.2], poleL: [0.8, 0.3, 0.2],
      footL: { p: [0.13, 0.45, 0.25], yaw: 0, pitch: 0.5 }, footR: { p: [-0.14, 0.35, -0.05], yaw: -0.3, pitch: 0.7 } } },
    { t: 0.3, e: 'in', p: { hips: { p: [0, -0.3, 0.25], r: [0.45, 0, 0] }, spine: [0.15, 0, 0], chest: [0.35, 0, 0], neck: [-0.25, 0, 0], head: [-0.3, 0, 0],
      staff: { grip: [-0.04, 0.85, 0.62], dir: [0, -0.6, 1] }, footL: { p: [0.15, 0, 0.45], pitch: 0, yaw: -0.05 }, footR: { p: [-0.18, 0, -0.35], pitch: 0.3, yaw: -0.5 }, fx: { glow: 1 } } },
    { t: 0.55, p: { hips: { p: [0, -0.31, 0.25] }, fx: { glow: 0 } } },
    { t: 1.0, p: { hips: { p: [0, -0.12, 0.1], r: [0.15, -0.1, 0] }, chest: [0.08, 0, 0], neck: [0, 0.1, 0], head: [0, 0.15, 0], staff: { grip: [-0.1, 1.0, 0.3], dir: [0.2, -0.35, 1] } } },
  ],
});
WK.DG = makeClip('DG', W, {
  dur: 0.52, iframes: [0.0, 0.34], cancel: 0.4, motion: [[0, 0.28, 10], [0.28, 0.42, 3]],
  keys: [
    { t: 0, p: { hips: { p: [0, -0.25, 0], r: [0.55, 0, 0] }, spine: [0.2, 0, 0], chest: [0.2, 0, 0], neck: [-0.3, 0, 0], head: [-0.35, 0, 0],
      staff: { grip: [-0.22, 0.9, -0.05], dir: [-0.05, 0.35, -1], slide: -0.2 }, handL: { w: 0, p: [0.28, 0.85, -0.15], r: [0.3, 0, 0] }, poleL: [1, 0, -0.5],
      footL: { p: [0.12, 0, 0.3], yaw: 0 }, footR: { p: [-0.12, 0.15, -0.4], yaw: 0, pitch: 0.8 } } },
    { t: 0.15, p: { hips: { p: [0, -0.32, 0] }, footL: { p: [0.12, 0.12, 0.1], pitch: 0.4 }, footR: { p: [-0.12, 0, 0.25], pitch: 0 } } },
    { t: 0.3, p: { hips: { p: [0, -0.22, 0], r: [0.35, 0, 0] }, footL: { p: [0.12, 0, 0.2], pitch: 0 }, footR: { p: [-0.14, 0, -0.15] } } },
    { t: 0.52, p: { hips: W.hips, spine: W.spine, chest: W.chest, neck: W.neck, head: W.head, staff: W.staff, handL: { w: 1, s: 0.33 }, poleL: W.poleL, footL: W.footL, footR: W.footR } },
  ],
});
WK.HIT = makeClip('HIT', W, {
  dur: 0.55, motion: [[0, 0.25, -2.5]],
  keys: [
    { t: 0, p: { hips: { p: [0, -0.1, -0.05], r: [-0.2, 0.2, 0.05] }, spine: [-0.15, 0.1, 0], chest: [-0.25, 0.1, 0.1], neck: [-0.2, 0, 0], head: [-0.3, 0.1, 0.1],
      staff: { grip: [-0.3, 1.05, -0.05], dir: [-0.2, -0.4, 1] }, handL: { w: 0, p: [0.3, 1.0, 0.1], r: [0, 0, 0] } } },
    { t: 0.12, p: { chest: [-0.32, 0.15, 0.12] } },
    { t: 0.55, p: { hips: W.hips, spine: W.spine, chest: W.chest, neck: W.neck, head: W.head, staff: W.staff, handL: { w: 1, s: 0.33 } } },
  ],
});
WK.DRINK = makeClip('DRINK', W, {
  dur: 1.45, events: [{ t: 0.75, type: 'heal' }],
  keys: [
    { t: 0, p: { hips: { p: [0, -0.04, 0], r: [0, 0, 0] }, spine: [0, 0, 0], chest: [0, 0, 0], neck: [0, 0, 0], head: [0, 0, 0],
      staff: { grip: [-0.24, 1.0, 0.12], dir: [0, -1, 0.05], slide: -0.05 }, poleR: [-1, -0.3, -0.3], handL: { w: 0, p: [0.2, 0.95, 0.2], r: [0, 0, 0] },
      footL: { p: [0.12, 0, 0.05], yaw: 0.1 }, footR: { p: [-0.12, 0, -0.02], yaw: -0.15 }, fx: { gourd: 1 } } },
    { t: 0.35, p: { handL: { p: [0.05, 1.5, 0.2], r: [-1.6, 0.3, 0] }, head: [-0.15, 0, 0] } },
    { t: 0.55, p: { head: [-0.5, 0, 0], neck: [-0.2, 0, 0], handL: { p: [0.03, 1.6, 0.16], r: [-2.3, 0.3, 0] } } },
    { t: 0.95, p: { head: [-0.5, 0, 0] } },
    { t: 1.15, p: { head: [0, 0, 0], neck: [0, 0, 0], handL: { p: [0.22, 0.98, 0.18], r: [0, 0, 0] } } },
    { t: 1.45, p: { fx: { gourd: 0 }, hips: W.hips, spine: W.spine, chest: W.chest, neck: W.neck, head: W.head, staff: W.staff, handL: { w: 1, s: 0.33 }, poleR: W.poleR, footL: W.footL, footR: W.footR } },
  ],
});
WK.SPELL = makeClip('SPELL', W, {
  dur: 0.95, events: [{ t: 0.3, type: 'cast' }],
  keys: [
    { t: 0, p: { hips: { p: [0, -0.08, 0], r: [0.05, -0.3, 0] }, chest: [0.05, -0.2, 0], neck: [0, 0.25, 0], head: [0, 0.25, 0],
      staff: { grip: [-0.3, 1.0, -0.05], dir: [-0.15, -0.9, 0.4], slide: -0.1 }, handL: { w: 0, p: [0.15, 1.25, 0.15], r: [0, 0, 0] }, fx: { open: 1 } } },
    { t: 0.25, e: 'out', p: { hips: { r: [0.08, 0.2, 0] }, chest: [0.08, 0.25, 0], neck: [0, -0.2, 0], head: [0, -0.25, 0], handL: { p: [0.1, 1.42, 0.55], r: [-1.5, 0, 0] } } },
    { t: 0.62, p: {} },
    { t: 0.95, p: { fx: { open: 0 }, hips: W.hips, spine: W.spine, chest: W.chest, neck: W.neck, head: W.head, staff: W.staff, handL: { w: 1, s: 0.33, r: [0, 0, 0] } } },
  ],
});
WK.DEATH = makeClip('DEATH', W, {
  dur: 2.2,
  keys: [
    { t: 0, p: WK.HIT.keys[0].pose },
    { t: 0.6, p: { hips: { p: [0, -0.45, 0.1], r: [0.5, 0.1, 0.15] }, spine: [0.2, 0, 0], chest: [0.35, 0, 0.1], neck: [0.3, 0, 0], head: [0.4, 0, 0],
      footL: { p: [0.15, 0, 0.35], yaw: 0, pitch: 0 }, footR: { p: [-0.15, 0.1, -0.4], pitch: 1.2 }, staff: { grip: [-0.3, 0.55, 0.25], dir: [0.1, -1, 0.3], slide: -0.2 },
      handL: { w: 0, p: [0.25, 0.3, 0.4] } } },
    { t: 2.2, p: { hips: { p: [0, -0.5, 0.1] } } },
  ],
});
WK.WIN = makeClip('WIN', W, {
  dur: 0.8,
  keys: [
    { t: 0, p: {} },
    { t: 0.8, p: { hips: { p: [0, -0.02, 0], r: [0, 0, 0] }, spine: [0, 0, 0], chest: [-0.05, 0, 0], neck: [0, 0, 0], head: [-0.1, 0, 0],
      staff: { grip: [-0.25, 1.25, 0.1], dir: [0, -1, 0], slide: -0.25 }, handL: { w: 0, p: [0.22, 0.9, 0.05], r: [0, 0, 0] }, poleR: [-1, -0.3, -0.2],
      footL: { p: [0.11, 0, 0.02], yaw: 0.12 }, footR: { p: [-0.11, 0, 0.02], yaw: -0.12 } } },
  ],
});
WK.COMBO = [WK.A1, WK.A2, WK.A3, WK.A4];

// ═════════════════════ 狼校卫 ═════════════════════
export const WF_IDLE = finalizePose(mergePose(BASE_POSE, {
  hips: { p: [0, -0.13, 0], r: [0.22, -0.2, 0] }, spine: [0.1, -0.05, 0], chest: [0.12, -0.05, 0], neck: [-0.15, 0.1, 0], head: [-0.22, 0.15, 0],
  staff: { grip: [-0.32, 0.98, 0.32], dir: [0.25, 0.4, 1], slide: 0, roll: 0 }, handL: { w: 0, p: [0.34, 1.02, 0.28], r: [-0.4, 0, 0.2] },
  poleR: [-0.8, -0.5, -0.4], poleL: [0.8, -0.5, -0.4],
  footL: { p: [0.17, 0, 0.2], yaw: 0 }, footR: { p: [-0.2, 0, -0.22], yaw: -0.5 },
}));
export const wfLocomotion = makeLoco(WF_IDLE, {
  run: {
    hips: { p: [0, -0.1, 0], r: [0.3, 0, 0] }, spine: [0.1, 0, 0], chest: [0.08, 0, 0], neck: [-0.2, 0, 0], head: [-0.25, 0, 0],
    staff: { grip: [-0.34, 1.0, 0.0], dir: [-0.2, 0.25, -1], slide: 0 }, handL: { w: 0, p: [0.3, 1.05, 0.1], r: [-0.3, 0, 0] },
  },
  stride: (sp) => Math.min(1.5, 0.45 + sp * 0.14), stance: 0.38, lift: 0.2, bob: 0.04, hipY: -0.11, lean: 0.25,
  legX: 0.13, handZ: 0.05, gripZ: 0.05, gripY: 1.02,
});
const F = WF_IDLE;
const fIdle = { hips: F.hips, spine: F.spine, chest: F.chest, neck: F.neck, head: F.head, staff: F.staff, handL: F.handL, poleR: F.poleR, poleL: F.poleL, footL: F.footL, footR: F.footR };
export const WF = {};
WF.S1 = makeClip('S1', F, {
  dur: 1.15, hit: [[0.54, 0.72, 1]], motion: [[0.5, 0.68, 5]], meta: { dmg: 30, tele: 0.36 },
  keys: [
    { t: 0, p: { hips: { p: [0, -0.1, 0], r: [0.1, -0.5, 0] }, chest: [0, -0.4, 0.05], neck: [0, 0.3, 0], head: [0, 0.35, 0],
      staff: { grip: [-0.35, 1.75, -0.15], dir: [-0.3, 0.6, -0.75] }, handL: { p: [0.35, 1.3, 0.35], r: [-1, 0, 0] }, poleR: [-0.9, 0.3, -0.2] } },
    { t: 0.5, e: 'out2', p: { hips: { r: [0.05, -0.6, 0] }, chest: [-0.05, -0.5, 0.08], staff: { grip: [-0.38, 1.85, -0.2], dir: [-0.25, 0.55, -0.8] } } },
    { t: 0.62, e: 'in2', p: { hips: { p: [0, -0.18, 0.15], r: [0.25, 0.3, 0] }, chest: [0.25, 0.35, 0], neck: [0, -0.3, 0], head: [0, -0.3, 0], staff: { grip: [0, 1.2, 0.6], dir: [0.25, -0.2, 1] } } },
    { t: 0.72, e: 'out', p: { hips: { r: [0.3, 0.6, 0] }, chest: [0.3, 0.5, 0], staff: { grip: [0.35, 0.85, 0.4], dir: [0.8, -0.55, 0.2] } } },
    { t: 1.15, p: fIdle },
  ],
});
WF.S2 = makeClip('S2', WF.S1.keys[3].pose, {
  dur: 1.0, hit: [[0.4, 0.56, 1]], motion: [[0.35, 0.5, 4]], meta: { dmg: 26, tele: 0.25 },
  keys: [
    { t: 0, p: { hips: { r: [0.2, 0.6, 0] }, chest: [0.1, 0.5, 0], neck: [0, -0.4, 0], head: [0, -0.45, 0], staff: { grip: [0.3, 1.3, 0.25], dir: [0.9, 0.2, -0.4] } } },
    { t: 0.35, e: 'out2', p: { staff: { grip: [0.32, 1.35, 0.15], dir: [0.8, 0.25, -0.55] } } },
    { t: 0.46, e: 'in2', p: { hips: { p: [0, -0.16, 0.12], r: [0.2, -0.1, 0] }, chest: [0.15, -0.1, 0], neck: [0, 0.1, 0], head: [0, 0.1, 0], staff: { grip: [-0.05, 1.25, 0.65], dir: [0, 0, 1] } } },
    { t: 0.56, e: 'out', p: { hips: { r: [0.2, -0.7, 0] }, chest: [0.12, -0.5, 0], staff: { grip: [-0.45, 1.2, 0.25], dir: [-0.95, 0.05, 0.1] } } },
    { t: 1.0, p: fIdle },
  ],
});
WF.LEAP = makeClip('LEAP', F, {
  dur: 1.6, hit: [[0.82, 0.96, 1]], motion: [[0.45, 0.92, 9]], meta: { dmg: 42, tele: 0.4 },
  events: [{ t: 0.92, type: 'impact', power: 0.8 }],
  keys: [
    { t: 0, p: { hips: { p: [0, -0.3, -0.05], r: [0.35, 0, 0] }, chest: [0.2, 0, 0], neck: [-0.2, 0, 0], head: [-0.3, 0, 0], staff: { grip: [-0.3, 1.0, -0.2], dir: [-0.2, 0.3, -1] },
      handL: { p: [0.3, 0.7, 0.3] }, footL: { p: [0.16, 0, 0.15] }, footR: { p: [-0.16, 0, -0.2] } } },
    { t: 0.45, p: { hips: { p: [0, -0.38, -0.05] } } },
    { t: 0.75, e: 'out2', p: { hips: { p: [0, 0.6, 0.2], r: [-0.2, 0, 0] }, chest: [-0.25, 0, 0], neck: [0.1, 0, 0], head: [0.1, 0, 0], staff: { grip: [-0.15, 2.3, 0], dir: [0, 0.75, -0.65] },
      handL: { p: [0.3, 1.9, 0.1], r: [-2, 0, 0] }, poleR: [-0.8, 0.3, 0.2], footL: { p: [0.16, 0.5, 0.2], pitch: 0.5 }, footR: { p: [-0.16, 0.4, -0.1], pitch: 0.6 } } },
    { t: 0.92, e: 'in', p: { hips: { p: [0, -0.35, 0.3], r: [0.5, 0, 0] }, chest: [0.35, 0, 0], neck: [-0.3, 0, 0], head: [-0.3, 0, 0], staff: { grip: [0, 1.0, 0.8], dir: [0, -0.6, 1] },
      handL: { p: [0.35, 0.8, 0.5], r: [0, 0, 0] }, footL: { p: [0.18, 0, 0.4], pitch: 0 }, footR: { p: [-0.18, 0, -0.35], pitch: 0.3 } } },
    { t: 1.2, p: {} },
    { t: 1.6, p: fIdle },
  ],
});
WF.SPIN = makeClip('SPIN', F, {
  dur: 1.5, hit: [[0.5, 0.75, 1], [0.76, 0.98, 1]], motion: [[0.45, 0.95, 3.5]], meta: { dmg: 28, tele: 0.3 },
  keys: [
    { t: 0, p: { yaw: 0, hips: { p: [0, -0.15, 0], r: [0.15, -0.4, 0] }, chest: [0.05, -0.3, 0], staff: { grip: [-0.4, 1.2, 0], dir: [-1, 0.1, -0.3] }, handL: { p: [0.35, 1.1, 0.2] } } },
    { t: 0.45, e: 'out2', p: { yaw: -0.6 } },
    { t: 0.62, e: 'in2', p: { yaw: 1.6 } },
    { t: 0.8, e: 'lin', p: { yaw: 3.8 } },
    { t: 0.98, e: 'out', p: { yaw: TAU, staff: { grip: [0.3, 1.1, 0.4], dir: [0.8, -0.3, 0.5] } } },
    { t: 1.5, p: fIdle },
  ],
});
WF.HIT = makeClip('WHIT', F, {
  dur: 0.5, motion: [[0, 0.2, -1.5]],
  keys: [
    { t: 0, p: { hips: { p: [0, -0.12, -0.05], r: [0.0, 0.15, 0.05] }, chest: [-0.2, 0.1, 0.1], neck: [-0.2, 0, 0], head: [-0.3, 0.15, 0.1] } },
    { t: 0.5, p: fIdle },
  ],
});
WF.STAG = makeClip('STAG', F, {
  dur: 2.0, motion: [[0, 0.3, -2]],
  keys: [
    { t: 0, p: { hips: { p: [0, -0.2, -0.1], r: [-0.1, 0.2, 0.1] }, chest: [-0.3, 0.1, 0.15], neck: [-0.3, 0, 0], head: [-0.4, 0, 0], staff: { grip: [-0.4, 0.8, 0.1], dir: [-0.3, -0.6, 0.8] }, handL: { p: [0.4, 1.0, 0.0] } } },
    { t: 0.45, p: { hips: { p: [0, -0.55, 0.05], r: [0.5, 0, 0.05] }, chest: [0.35, 0, 0], neck: [0.2, 0, 0], head: [0.3, 0, 0], staff: { grip: [-0.4, 0.45, 0.4], dir: [0, -1, 0.3] },
      handL: { p: [0.35, 0.2, 0.45] }, footL: { p: [0.18, 0, 0.4], yaw: 0 }, footR: { p: [-0.18, 0.05, -0.5], pitch: 1.2 } } },
    { t: 1.5, p: { hips: { p: [0, -0.52, 0.05] } } },
    { t: 2.0, p: fIdle },
  ],
});
WF.DEATH = makeClip('WDEATH', F, {
  dur: 2.6,
  keys: [
    { t: 0, p: WF.STAG.keys[0].pose },
    { t: 0.5, p: WF.STAG.keys[1].pose },
    { t: 1.4, p: { hips: { p: [0, -0.8, -0.3], r: [-0.9, 0.2, 0.3] }, chest: [-0.4, 0, 0.2], neck: [-0.4, 0, 0], head: [-0.5, 0.3, 0], footL: { p: [0.2, 0, 0.5] }, footR: { p: [-0.2, 0, 0.45], pitch: 0 },
      staff: { grip: [-0.6, 0.15, 0.1], dir: [-0.4, -0.1, 1] }, handL: { p: [0.6, 0.2, 0.0] } } },
    { t: 2.6, p: { hips: { p: [0, -0.85, -0.3] } } },
  ],
});
WF.ROAR = makeClip('ROAR', F, {
  dur: 1.9, events: [{ t: 0.6, type: 'roar' }],
  keys: [
    { t: 0, p: {} },
    { t: 0.5, p: { hips: { p: [0, -0.05, 0], r: [-0.1, 0, 0] }, spine: [-0.1, 0, 0], chest: [-0.25, 0, 0], neck: [-0.2, 0, 0], head: [-0.45, 0, 0],
      staff: { grip: [-0.55, 1.25, 0.2], dir: [-0.6, 0.6, 0.2] }, handL: { p: [0.55, 1.3, 0.2], r: [-1.2, 0, 0.6] } } },
    { t: 1.3, p: {} },
    { t: 1.9, p: fIdle },
  ],
});

// ═════════════════════ 动画播放器 ═════════════════════
import { sampleClip, copyPose } from './pose.js';

export class Animator {
  constructor(base, loco) {
    this.out = clonePose(base);
    this.from = clonePose(base);
    this.tmp = clonePose(base);
    this.loco = loco;
    this.clip = null; // null → 程序化步态
    this.time = 0; this.speed = 1;
    this.fade = 1; this.fadeDur = 0;
    this.ctx = { speed: 0, phase: 0, runW: 0, lean: 0 };
    this.onEvent = null;
    this.done = false;
    this.t = 0;
  }
  play(clip, { fade = 0.1, speed = 1 } = {}) {
    copyPose(this.out, this.from);
    this.from.yaw = Math.atan2(Math.sin(this.from.yaw), Math.cos(this.from.yaw));
    this.clip = clip; this.time = 0; this.speed = speed;
    this.fade = 0; this.fadeDur = fade; this.done = false;
  }
  stop(fade = 0.18) { this.play(null, { fade }); }
  update(dt) {
    this.t += dt;
    const prev = this.time;
    this.time += dt * this.speed;
    if (this.clip) {
      const c = this.clip;
      for (const e of c.events) if (e.t > prev && e.t <= this.time && this.onEvent) this.onEvent(e, c);
      if (!c.loop && this.time >= c.dur) { this.time = c.dur; this.done = true; }
      sampleClip(c, this.time, this.tmp);
    } else this.loco(this.t, this.ctx, this.tmp);
    if (this.fade < this.fadeDur) {
      this.fade += dt;
      const w = Math.min(1, this.fade / this.fadeDur);
      blendPose(this.from, this.tmp, w * w * (3 - 2 * w), this.out);
    } else copyPose(this.tmp, this.out);
    return this.out;
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
