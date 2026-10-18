// 世界空间动画重定向：
//   目标骨骼世界旋转(t) = Δ源(t) · R · 目标静止世界旋转
//   Δ源(t) = 源骨骼世界旋转(t) · 源静止世界旋转⁻¹
//   R 把目标静止骨骼方向对齐到源静止骨骼方向（自动兼容 T-Pose / A-Pose 差异）
// 结果烘焙为目标骨骼上的四元数关键帧（以 uuid 绑定，不受骨骼命名影响）
import * as THREE from 'three';
import { CANON, CHILD, PARENT } from './bonemap.js';

const _q = new THREE.Quaternion(), _q2 = new THREE.Quaternion(), _v = new THREE.Vector3(), _m = new THREE.Matrix4();

// 记录静止姿势（在播放任何动画之前调用）
export function captureRest(root, bones) {
  root.updateMatrixWorld(true);
  const rest = new Map();
  for (const b of bones) {
    rest.set(b, {
      q: b.quaternion.clone(), p: b.position.clone(),
      wq: b.getWorldQuaternion(new THREE.Quaternion()),
      wp: b.getWorldPosition(new THREE.Vector3()),
      wm: b.matrixWorld.clone(),
    });
  }
  // 根骨骼父节点的静止世界矩阵
  const parents = new Set(bones.map((b) => b.parent).filter((p) => p && !rest.has(p)));
  for (const p of parents) {
    rest.set(p, {
      q: p.quaternion.clone(), p: p.position.clone(),
      wq: p.getWorldQuaternion(new THREE.Quaternion()), wp: p.getWorldPosition(new THREE.Vector3()),
      wm: p.matrixWorld.clone(), static: true,
    });
  }
  return rest;
}

function restDir(an, rest, canon) {
  const b = an.map[canon], c = an.map[CHILD[canon]];
  if (!b || !c) return null;
  const d = rest.get(c).wp.clone().sub(rest.get(b).wp);
  return d.lengthSq() > 1e-10 ? d.normalize() : null;
}

// 计算每根规范骨骼的对齐旋转 R
function alignments(src, srcRest, tgt, tgtRest) {
  const R = {};
  for (const k of CANON) {
    const ds = restDir(src, srcRest, k), dt = restDir(tgt, tgtRest, k);
    if (ds && dt && k !== 'Hips') R[k] = new THREE.Quaternion().setFromUnitVectors(dt, ds);
  }
  // 末端骨骼（手、头、脚趾）继承父骨骼的对齐
  for (const k of CANON) {
    if (R[k]) continue;
    let p = PARENT[k];
    while (p && !R[p]) p = PARENT[p];
    R[k] = p ? R[p].clone() : new THREE.Quaternion();
  }
  return R;
}

export function retargetClip({ src, srcRest, clip, tgt, tgtRest, fps = 30, inPlace = true, speed = 1, trim = null, name }) {
  const srcRoot = src.root;
  const mixer = new THREE.AnimationMixer(srcRoot);
  const action = mixer.clipAction(clip);
  action.setLoop(THREE.LoopOnce, 1);
  action.clampWhenFinished = true;
  action.play();

  const R = alignments(src, srcRest, tgt, tgtRest);
  // 配对：规范骨骼 + 同名额外骨骼（手指等）
  const pairs = new Map(); // targetBone → { s, R }
  for (const k of CANON) if (src.map[k] && tgt.map[k]) pairs.set(tgt.map[k], { s: src.map[k], R: R[k], canon: k });
  for (const [n, tb] of Object.entries(tgt.extras)) {
    const sb = src.extras[n];
    if (!sb) continue;
    // 额外骨骼使用最近的已映射祖先的对齐
    let p = tb.parent, r = null;
    while (p && !r) { const e = pairs.get(p); if (e) r = e.R; p = p.parent; }
    pairs.set(tb, { s: sb, R: r || new THREE.Quaternion() });
  }
  const order = tgt.bones; // 父在前

  const t0 = trim ? Math.max(0, trim[0]) : 0;
  const t1 = trim ? Math.min(clip.duration, trim[1]) : clip.duration;
  const span = Math.max(1e-3, t1 - t0);
  const n = Math.max(2, Math.ceil(span * fps) + 1);
  const times = new Float32Array(n);
  const qvals = new Map();
  for (const b of order) if (pairs.has(b)) qvals.set(b, new Float32Array(n * 4));
  const hips = tgt.map.Hips, sHips = src.map.Hips;
  const pvals = hips && sHips ? new Float32Array(n * 3) : null;
  const hipScale = hips && sHips ? (tgtRest.get(hips).wp.y / Math.max(1e-4, srcRest.get(sHips).wp.y)) : 1;
  const world = new Map();
  const srcWQ = new THREE.Quaternion();

  for (let i = 0; i < n; i++) {
    const tt = t0 + (span * i) / (n - 1);
    times[i] = (tt - t0) / speed;
    mixer.setTime(tt);
    srcRoot.updateMatrixWorld(true);
    world.clear();
    for (const b of order) {
      const pr = b.parent;
      const parentWQ = world.get(pr) || (tgtRest.get(pr) ? tgtRest.get(pr).wq : _q2.identity());
      const e = pairs.get(b);
      let local;
      if (e) {
        e.s.getWorldQuaternion(srcWQ);
        // Δ = 源当前 · 源静止⁻¹
        const delta = srcWQ.clone().multiply(srcRest.get(e.s).wq.clone().invert());
        const desired = delta.multiply(e.R).multiply(tgtRest.get(b).wq);
        local = parentWQ.clone().invert().multiply(desired);
        world.set(b, desired);
        const arr = qvals.get(b);
        // 保持四元数连续（避免插值翻转）
        if (i > 0) {
          const j = (i - 1) * 4;
          if (arr[j] * local.x + arr[j + 1] * local.y + arr[j + 2] * local.z + arr[j + 3] * local.w < 0) local.set(-local.x, -local.y, -local.z, -local.w);
        }
        arr.set([local.x, local.y, local.z, local.w], i * 4);
      } else {
        local = tgtRest.get(b).q;
        world.set(b, parentWQ.clone().multiply(local));
      }
    }
    if (pvals) {
      const d = sHips.getWorldPosition(_v).sub(srcRest.get(sHips).wp).multiplyScalar(hipScale);
      if (inPlace) { d.x = 0; d.z = 0; }
      const wp = tgtRest.get(hips).wp.clone().add(d);
      const pr = tgtRest.get(hips.parent);
      if (pr && pr.wm) wp.applyMatrix4(_m.copy(pr.wm).invert());
      pvals.set([wp.x, wp.y, wp.z], i * 3);
    }
  }
  action.stop();
  mixer.uncacheRoot(srcRoot);

  const tracks = [];
  for (const [b, arr] of qvals) tracks.push(new THREE.QuaternionKeyframeTrack(`${b.uuid}.quaternion`, times, arr));
  if (pvals) tracks.push(new THREE.VectorKeyframeTrack(`${hips.uuid}.position`, times, pvals));
  return new THREE.AnimationClip(name || clip.name, times[n - 1], tracks);
}
