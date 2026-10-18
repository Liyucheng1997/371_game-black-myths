// 自检：用代码合成「Mixamo 命名 + A-Pose」的蒙皮角色与「UE 命名 + T-Pose + 厘米单位」的动画库，
// 导出为 GLB（内存 Blob）后走完整的 加载 → 骨骼识别 → 重定向 → 战斗 流程，并做数值校验
import * as THREE from 'three';
import { GLTFExporter } from 'three/addons/exporters/GLTFExporter.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import * as SkeletonUtils from 'three/addons/utils/SkeletonUtils.js';
import { loadFile } from './loader.js';
import { analyze } from './bonemap.js';

function buildBones(spec, prefix = '') {
  const by = {}, list = [];
  for (const [n, p, pos, rot] of spec) {
    const b = new THREE.Bone();
    b.name = prefix + n;
    b.position.fromArray(pos);
    if (rot) b.rotation.set(rot[0], rot[1], rot[2]);
    if (p) by[p].add(b);
    by[n] = b; list.push(b);
  }
  return { by, list, root: list[0] };
}
const mirror = (spec) => spec.flatMap((e) => {
  if (!/Left|_l$/.test(e[0])) return [e];
  const r = (s) => s && s.replace('Left', 'Right').replace(/_l$/, '_r');
  return [e, [r(e[0]), r(e[1]) || e[1], [-e[2][0], e[2][1], e[2][2]], e[3] ? [e[3][0], -e[3][1], -e[3][2]] : undefined]];
});

// Mixamo 风格目标角色（米，A-Pose）
const TGT = mirror([
  ['Hips', null, [0, 0.95, 0]],
  ['Spine', 'Hips', [0, 0.1, 0]], ['Spine1', 'Spine', [0, 0.12, 0]], ['Spine2', 'Spine1', [0, 0.12, 0]],
  ['Neck', 'Spine2', [0, 0.15, 0]], ['Head', 'Neck', [0, 0.1, 0]], ['HeadTop_End', 'Head', [0, 0.2, 0]],
  ['LeftShoulder', 'Spine2', [0.05, 0.1, 0]], ['LeftArm', 'LeftShoulder', [0.12, 0, 0], [0, 0, -0.75]],
  ['LeftForeArm', 'LeftArm', [0.27, 0, 0]], ['LeftHand', 'LeftForeArm', [0.24, 0, 0]], ['LeftHandMiddle1', 'LeftHand', [0.08, 0, 0]],
  ['LeftUpLeg', 'Hips', [0.1, -0.05, 0]], ['LeftLeg', 'LeftUpLeg', [0, -0.42, 0]], ['LeftFoot', 'LeftLeg', [0, -0.4, 0]], ['LeftToeBase', 'LeftFoot', [0, -0.06, 0.12]],
]);
// UE 风格动画源（厘米，T-Pose）
const SRC = mirror([
  ['root', null, [0, 0, 0]], ['pelvis', 'root', [0, 100, 0]],
  ['spine_01', 'pelvis', [0, 10, 0]], ['spine_02', 'spine_01', [0, 12, 0]], ['spine_03', 'spine_02', [0, 12, 0]],
  ['neck_01', 'spine_03', [0, 16, 0]], ['head', 'neck_01', [0, 10, 0]],
  ['clavicle_l', 'spine_03', [6, 12, 0]], ['upperarm_l', 'clavicle_l', [13, 0, 0]], ['lowerarm_l', 'upperarm_l', [28, 0, 0]], ['hand_l', 'lowerarm_l', [26, 0, 0]],
  ['thigh_l', 'pelvis', [11, -5, 0]], ['calf_l', 'thigh_l', [0, -45, 0]], ['foot_l', 'calf_l', [0, -43, 0]], ['ball_l', 'foot_l', [0, -7, 13]],
]);

function targetCharacter() {
  const sk = buildBones(TGT, 'mixamorig:');
  const scene = new THREE.Scene();
  const arm = new THREE.Group(); arm.name = 'Armature';
  scene.add(arm);
  arm.add(sk.root);
  scene.updateMatrixWorld(true);
  const geos = [];
  const idx = (b) => sk.list.indexOf(b);
  const seg = (b, c, r) => {
    const a = b.getWorldPosition(new THREE.Vector3()), e = c.getWorldPosition(new THREE.Vector3());
    const len = a.distanceTo(e);
    const g = new THREE.CylinderGeometry(r * 0.85, r, len, 12, 3);
    g.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), e.clone().sub(a).normalize()));
    g.translate((a.x + e.x) / 2, (a.y + e.y) / 2, (a.z + e.z) / 2);
    push(g, idx(b));
    const s = new THREE.SphereGeometry(r * 1.05, 12, 8); s.translate(a.x, a.y, a.z); push(s, idx(b));
  };
  const push = (g, i) => {
    const n = g.attributes.position.count;
    g.setAttribute('skinIndex', new THREE.Uint16BufferAttribute(new Uint16Array(n * 4).map((_, k) => (k % 4 === 0 ? i : 0)), 4));
    g.setAttribute('skinWeight', new THREE.Float32BufferAttribute(new Float32Array(n * 4).map((_, k) => (k % 4 === 0 ? 1 : 0)), 4));
    geos.push(g.index ? g.toNonIndexed() : g);
  };
  const B = sk.by;
  const R = { Spine: 0.13, Spine1: 0.14, Spine2: 0.15, Neck: 0.05, Hips: 0.14, LeftShoulder: 0.05, LeftArm: 0.045, LeftForeArm: 0.038, LeftHand: 0.03, LeftUpLeg: 0.07, LeftLeg: 0.05, LeftFoot: 0.035 };
  for (const [n, r] of Object.entries(R)) {
    for (const nn of [n, n.replace('Left', 'Right')]) {
      const b = B[nn], c = b && b.children.find((x) => x.isBone);
      if (b && c) seg(b, c, r);
    }
  }
  const head = new THREE.SphereGeometry(0.12, 20, 14); head.scale(0.9, 1.05, 1); const hp = B.Head.getWorldPosition(new THREE.Vector3()); head.translate(hp.x, hp.y + 0.1, hp.z + 0.02); push(head, idx(B.Head));
  const muzzle = new THREE.SphereGeometry(0.06, 14, 10); muzzle.translate(hp.x, hp.y + 0.05, hp.z + 0.1); push(muzzle, idx(B.Head));
  const geo = mergeGeometries(geos);
  const mesh = new THREE.SkinnedMesh(geo, new THREE.MeshStandardMaterial({ color: 0xb08a5a, roughness: 0.7 }));
  mesh.name = 'Body';
  arm.add(mesh);
  const skel = new THREE.Skeleton(sk.list);
  mesh.bind(skel);
  return scene;
}

function q(ax, ay, az) {
  // 先 Z 后 X 再 Y（父空间）
  const qz = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 0, 1), az || 0);
  const qx = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), ax || 0);
  const qy = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), ay || 0);
  return qy.multiply(qx).multiply(qz);
}
function clipFrom(name, dur, fps, fn) {
  const n = Math.round(dur * fps) + 1, times = [], tr = {};
  for (let i = 0; i < n; i++) {
    const t = (i / (n - 1)) * dur;
    times.push(t);
    const pose = fn(t, t / dur);
    for (const [bone, v] of Object.entries(pose)) {
      const key = bone + (v.isQuaternion ? '.quaternion' : '.position');
      (tr[key] = tr[key] || []).push(...v.toArray());
    }
  }
  const tracks = Object.entries(tr).map(([k, v]) => (k.endsWith('quaternion') ? new THREE.QuaternionKeyframeTrack(k, times, v) : new THREE.VectorKeyframeTrack(k, times, v)));
  return new THREE.AnimationClip(name, dur, tracks);
}
function sourceLibrary() {
  const sk = buildBones(SRC);
  const scene = new THREE.Scene();
  const g = new THREE.Group(); g.name = 'UERig'; g.scale.setScalar(0.01);
  scene.add(g); g.add(sk.root);
  const P = (y) => new THREE.Vector3(0, y, 0);
  const TAU = Math.PI * 2;
  const clips = [
    clipFrom('Idle', 2, 20, (t) => {
      const s = Math.sin(t * Math.PI);
      return { pelvis: P(100 + s), spine_01: q(0.04 * s), upperarm_l: q(0, 0, -1.25 + 0.03 * s), upperarm_r: q(0, 0, 1.25 - 0.03 * s), lowerarm_l: q(0, -0.3), lowerarm_r: q(0, 0.3) };
    }),
    clipFrom('Run', 0.8, 30, (t) => {
      const f = (t / 0.8) * TAU, s = Math.sin(f);
      return {
        pelvis: P(97 + 3 * Math.abs(Math.cos(f))), spine_01: q(0.15),
        thigh_l: q(-0.7 * s), thigh_r: q(0.7 * s),
        calf_l: q(0.2 + 0.9 * Math.max(0, Math.cos(f))), calf_r: q(0.2 + 0.9 * Math.max(0, -Math.cos(f))),
        upperarm_l: q(0.6 * s, 0, -1.2), upperarm_r: q(-0.6 * s, 0, 1.2), lowerarm_l: q(0, -1.0), lowerarm_r: q(0, 1.0),
      };
    }),
    clipFrom('Attack', 1.0, 30, (t) => {
      const k = (a, b, x) => Math.min(1, Math.max(0, (x - a) / (b - a)));
      const up = k(0, 0.35, t) * (1 - k(0.35, 0.55, t));
      const down = k(0.35, 0.55, t) * (1 - k(0.6, 1.0, t));
      return {
        pelvis: P(100 - 8 * down), spine_02: q(0.2 * down, 0.45 * up - 0.45 * down),
        upperarm_r: q(-2.6 * up - 0.6 * down, 0, 1.2), lowerarm_r: q(0, 0.2),
        upperarm_l: q(-1.2 * up - 0.4 * down, 0, -1.1), thigh_l: q(-0.5 * down), calf_l: q(0.4 * down), thigh_r: q(0.3 * down),
      };
    }),
    clipFrom('Dodge', 0.6, 30, (t, u) => {
      const c = Math.sin(u * Math.PI);
      return { pelvis: P(100 - 30 * c), spine_01: q(0.6 * c), thigh_l: q(-1.2 * c), thigh_r: q(-0.9 * c), calf_l: q(1.5 * c), calf_r: q(1.3 * c), upperarm_l: q(0, 0, -1.2), upperarm_r: q(0, 0, 1.2) };
    }),
    clipFrom('Hit', 0.5, 30, (t, u) => {
      const c = Math.sin(Math.min(1, u * 2.5) * Math.PI / 2) * (1 - u);
      return { spine_01: q(-0.4 * c), head: q(-0.3 * c), upperarm_l: q(0, 0, -1.0), upperarm_r: q(0, 0, 1.0) };
    }),
  ];
  return { scene, clips };
}

async function toBlobURL(scene, animations) {
  const buf = await new GLTFExporter().parseAsync(scene, { binary: true, animations });
  return URL.createObjectURL(new Blob([buf], { type: 'model/gltf-binary' }));
}

let urls = null;
export async function makeSelfTestConfig(log) {
  const tgt = targetCharacter();
  const lib = sourceLibrary();
  const model = await toBlobURL(tgt, []);
  const anims = await toBlobURL(lib.scene, lib.clips);
  urls = { model, anims };
  log('【自检】已合成测试资产：Mixamo 命名 A-Pose 角色 + UE 命名 T-Pose 厘米单位动画库');
  const A = (clip, extra = {}) => ({ file: anims, type: 'glb', clip, ...extra });
  return {
    player: {
      model, type: 'glb', height: 1.75,
      weapon: { type: 'staff', offset: [0, 0.08, 0.02], rotation: [0, 0, 90] },
      anims: { idle: A('Idle'), run: A('Run'), attack1: A('Attack'), attack2: A('Attack', { speed: 1.25 }), heavy: A('Attack', { speed: 0.8 }), dodge: A('Dodge'), hit: A('Hit') },
    },
  };
}

// 数值校验：同一时刻，目标骨骼方向应与源骨骼方向一致
export async function verify(actor) {
  if (!urls) return 'not selftest';
  const f = await loadFile(urls.anims, 'glb');
  const src = SkeletonUtils.clone(f.scene);
  const sa = analyze(src);
  const L = actor.loaded, ta = L.analysis;
  const savedR = actor.root.rotation.y, savedP = actor.root.position.clone();
  actor.root.rotation.y = 0; actor.root.position.set(0, 0, 0);
  const pairs = [['RightArm', 'RightForeArm'], ['LeftArm', 'LeftForeArm'], ['LeftUpLeg', 'LeftLeg'], ['RightLeg', 'RightFoot'], ['Spine2', 'Neck']];
  const res = {};
  for (const [key, clipName] of [['attack1', 'Attack'], ['run', 'Run'], ['dodge', 'Dodge']]) {
    const sm = new THREE.AnimationMixer(src), tm = new THREE.AnimationMixer(L.root);
    const sAct = sm.clipAction(f.clips.find((c) => c.name === clipName)); sAct.setLoop(THREE.LoopOnce); sAct.clampWhenFinished = true; sAct.play();
    const tAct = tm.clipAction(L.clips[key].clip); tAct.setLoop(THREE.LoopOnce); tAct.clampWhenFinished = true; tAct.play();
    let worst = 0;
    for (const t of [0.1, 0.25, 0.35, 0.5]) {
      sm.setTime(t); tm.setTime(t);
      src.updateMatrixWorld(true); actor.root.updateMatrixWorld(true);
      for (const [a, b] of pairs) {
        const ds = sa.map[b].getWorldPosition(new THREE.Vector3()).sub(sa.map[a].getWorldPosition(new THREE.Vector3())).normalize();
        const dt = ta.map[b].getWorldPosition(new THREE.Vector3()).sub(ta.map[a].getWorldPosition(new THREE.Vector3())).normalize();
        worst = Math.max(worst, THREE.MathUtils.radToDeg(ds.angleTo(dt)));
      }
    }
    sAct.stop(); tAct.stop(); sm.uncacheRoot(src); tm.uncacheRoot(L.root);
    res[key] = +worst.toFixed(3);
  }
  actor.root.rotation.y = savedR; actor.root.position.copy(savedP);
  return res;
}
