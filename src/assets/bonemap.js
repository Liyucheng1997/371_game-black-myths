// 人形骨骼自动识别：把任意命名（Mixamo / UE / Blender Rigify / 3ds Max Biped / CC 等）映射到统一的规范骨骼名
export const CANON = [
  'Hips', 'Spine', 'Spine1', 'Spine2', 'Neck', 'Head',
  'LeftShoulder', 'LeftArm', 'LeftForeArm', 'LeftHand',
  'RightShoulder', 'RightArm', 'RightForeArm', 'RightHand',
  'LeftUpLeg', 'LeftLeg', 'LeftFoot', 'LeftToeBase',
  'RightUpLeg', 'RightLeg', 'RightFoot', 'RightToeBase',
];
// 用于计算骨骼朝向（静止姿势对齐）的子骨骼
export const CHILD = {
  Hips: 'Spine', Spine: 'Spine1', Spine1: 'Spine2', Spine2: 'Neck', Neck: 'Head',
  LeftShoulder: 'LeftArm', LeftArm: 'LeftForeArm', LeftForeArm: 'LeftHand',
  RightShoulder: 'RightArm', RightArm: 'RightForeArm', RightForeArm: 'RightHand',
  LeftUpLeg: 'LeftLeg', LeftLeg: 'LeftFoot', LeftFoot: 'LeftToeBase',
  RightUpLeg: 'RightLeg', RightLeg: 'RightFoot', RightFoot: 'RightToeBase',
};
export const PARENT = {};
for (const [p, c] of Object.entries(CHILD)) PARENT[c] = p;
PARENT.LeftHand = 'LeftForeArm'; PARENT.RightHand = 'RightForeArm';
PARENT.LeftUpLeg = 'Hips'; PARENT.RightUpLeg = 'Hips';
PARENT.LeftShoulder = 'Spine2'; PARENT.RightShoulder = 'Spine2';

// 去掉命名空间前缀，例如 "mixamorig:Hips" / "Armature|Hips" / "mixamorig1Hips"
export function stripName(raw) {
  return String(raw || '').replace(/^.*[:|]/, '').replace(/^mixamorig\d*_?/i, '');
}
export function normName(raw) {
  return stripName(raw).toLowerCase().replace(/[^a-z0-9]/g, '');
}

function sideOf(raw) {
  const s = stripName(raw);
  const l = s.toLowerCase();
  if (/left/.test(l)) return 'L';
  if (/right/.test(l)) return 'R';
  if (/(^|[_.\s-])l([_.\s-]|$)/.test(l) || /^l(?=[A-Z_])/.test(s) || /[a-z]L$/.test(s) || /[_.]l$/i.test(s)) return 'L';
  if (/(^|[_.\s-])r([_.\s-]|$)/.test(l) || /^r(?=[A-Z_])/.test(s) || /[a-z]R$/.test(s) || /[_.]r$/i.test(s)) return 'R';
  return null;
}

const EXCL = /(end|nub|twist|roll|tip|thumb|index|middle|ring|pinky|finger|eye|jaw|tongue|ik|pole|target|ctrl|helper|weapon|prop|top|bend|share|corrective|breast|hair|tail|cloth|skirt)/;

function partOf(raw) {
  // 去掉左右标记后再判断部位
  let n = stripName(raw).toLowerCase()
    .replace(/left|right/g, '')
    .replace(/(^|[_.\s-])[lr](?=[_.\s-]|$)/g, '$1');
  n = n.replace(/[^a-z0-9]/g, '');
  if (/toe|ball/.test(n) && !/end/.test(n)) return 'toe';
  if (EXCL.test(n)) return null;
  if (/hips|pelvis|^hip\d*$/.test(n)) return 'hips';
  if (/neck/.test(n)) return 'neck';
  if (/head/.test(n)) return 'head';
  if (/shoulder|clavicle|collar/.test(n)) return 'shoulder';
  if (/forearm|lowerarm|elbow/.test(n)) return 'forearm';
  if (/upperarm|arm/.test(n)) return 'arm';
  if (/hand|wrist/.test(n)) return 'hand';
  if (/upleg|thigh|upperleg/.test(n)) return 'upleg';
  if (/calf|shin|lowerleg|knee|leg/.test(n)) return 'leg';
  if (/foot|ankle/.test(n)) return 'foot';
  if (/spine|chest|torso|abdomen|waist|back/.test(n)) return 'spine';
  return null;
}

const SIDED = { shoulder: 'Shoulder', arm: 'Arm', forearm: 'ForeArm', hand: 'Hand', upleg: 'UpLeg', leg: 'Leg', foot: 'Foot', toe: 'ToeBase' };

// 收集骨骼：优先 isBone，否则收集所有非网格节点
export function collectBones(root) {
  const out = [];
  root.traverse((o) => { if (o.isBone) out.push(o); });
  if (out.length) return out;
  root.traverse((o) => { if (o !== root && !o.isMesh && !o.isCamera && !o.isLight) out.push(o); });
  return out;
}

export function analyze(root) {
  const bones = collectBones(root); // traverse 顺序：父在前
  const map = {};
  const spine = [];
  for (const b of bones) {
    const part = partOf(b.name);
    if (!part) continue;
    if (part === 'hips') { if (!map.Hips) map.Hips = b; continue; }
    if (part === 'spine') { spine.push(b); continue; }
    if (part === 'neck') { if (!map.Neck) map.Neck = b; continue; }
    if (part === 'head') { if (!map.Head) map.Head = b; continue; }
    const side = sideOf(b.name);
    if (!side) continue;
    const key = (side === 'L' ? 'Left' : 'Right') + SIDED[part];
    if (!map[key]) map[key] = b;
  }
  // 没有 Hips 命名时：取两条大腿的公共父节点
  if (!map.Hips && map.LeftUpLeg && map.LeftUpLeg.parent) map.Hips = map.LeftUpLeg.parent;
  // 脊柱链：Hips 与 Neck 之间（只保留 Hips 的后代）
  const chain = spine.filter((b) => { let p = b.parent; while (p) { if (p === map.Hips) return true; p = p.parent; } return !map.Hips; });
  if (chain.length >= 3) { map.Spine = chain[0]; map.Spine1 = chain[Math.floor(chain.length / 2)]; map.Spine2 = chain[chain.length - 1]; }
  else if (chain.length === 2) { map.Spine = chain[0]; map.Spine2 = chain[1]; }
  else if (chain.length === 1) map.Spine = chain[0];
  const missing = CANON.filter((k) => !map[k]);
  // 额外骨骼（手指等）：按标准化名字一一对应
  const extras = {};
  const used = new Set(Object.values(map));
  for (const b of bones) if (!used.has(b)) extras[normName(b.name)] = b;
  return { root, bones, map, missing, extras };
}

export function describe(an) {
  return CANON.map((k) => `${k.padEnd(14)} ← ${an.map[k] ? an.map[k].name : '（缺失）'}`).join('\n');
}
