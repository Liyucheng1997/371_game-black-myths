// 外部角色资产加载：GLB/GLTF/FBX 模型 + 任意来源动画（Mixamo FBX、GLB 动画包…）→ 自动识别骨骼 → 重定向 → 挂武器
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { FBXLoader } from 'three/addons/loaders/FBXLoader.js';
import { DRACOLoader } from 'three/addons/loaders/DRACOLoader.js';
import { MeshoptDecoder } from 'three/addons/libs/meshopt_decoder.module.js';
import * as SkeletonUtils from 'three/addons/utils/SkeletonUtils.js';
import { analyze, describe } from './bonemap.js';
import { captureRest, retargetClip } from './retarget.js';
import { materials, staffMesh } from '../characters/parts.js';
import { buildSabre } from '../characters/wolf.js';

const D2R = Math.PI / 180;
const files = new Map();
let gltf = null;

function gltfLoader() {
  if (gltf) return gltf;
  gltf = new GLTFLoader();
  const draco = new DRACOLoader();
  draco.setDecoderPath('draco/');
  gltf.setDRACOLoader(draco);
  gltf.setMeshoptDecoder(MeshoptDecoder);
  return gltf;
}
const typeOf = (url, hint) => {
  if (hint) return hint.toLowerCase();
  const m = /\.(glb|gltf|fbx)(\?|#|$)/i.exec(url);
  return m ? m[1].toLowerCase() : 'glb';
};
const short = (u) => (u.startsWith('blob:') ? '（内存文件）' : u.split('/').slice(-2).join('/'));

export function loadFile(url, hint) {
  const key = url;
  if (!files.has(key)) {
    files.set(key, (async () => {
      if (typeOf(url, hint) === 'fbx') {
        const o = await new FBXLoader().loadAsync(url);
        return { scene: o, clips: o.animations || [] };
      }
      const g = await gltfLoader().loadAsync(url);
      return { scene: g.scene, clips: g.animations || [] };
    })());
  }
  return files.get(key);
}

export async function loadAssetConfig() {
  try {
    const r = await fetch('assets/assets.json', { cache: 'no-store' });
    if (!r.ok) return null;
    const txt = await r.text();
    if (txt.trim().startsWith('<')) return null; // Vite 对不存在文件回退为 index.html
    return JSON.parse(txt);
  } catch (e) {
    console.warn('assets.json 解析失败', e);
    return { __error: 'assets.json 解析失败：' + e.message };
  }
}

// 武器挂到手骨：内置金箍棒 / 大刀，或模型自带的网格节点
function attachWeapon(w, kind, an, model, log) {
  const boneName = w.bone || 'RightHand';
  const hand = an.map[boneName] || model.getObjectByName(boneName);
  if (!hand) { log(`⚠ 找不到挂武器的骨骼「${boneName}」，武器未挂载（命中判定将失效）`); return null; }
  const type = w.type || (kind === 'player' ? 'staff' : 'sabre');
  if (type === 'node') {
    const node = model.getObjectByName(w.name);
    if (!node) { log(`⚠ 模型中找不到武器节点「${w.name}」`); return null; }
    if (node.parent !== hand && !node.isSkinnedMesh) hand.attach(node);
    const geo = node.geometry;
    let seg = [new THREE.Vector3(0, 0, 0), new THREE.Vector3(0, 1, 0)];
    if (geo) {
      geo.computeBoundingBox();
      const b = geo.boundingBox, s = b.getSize(new THREE.Vector3()), c = b.getCenter(new THREE.Vector3());
      const ax = s.x >= s.y && s.x >= s.z ? 'x' : s.y >= s.z ? 'y' : 'z';
      const a = c.clone(), e = c.clone();
      a[ax] -= s[ax] / 2; e[ax] += s[ax] / 2;
      seg = [a, e];
    }
    log(`✓ 武器：模型自带节点「${w.name}」挂到 ${hand.name}`);
    return { obj: node, inner: null, seg, hand, type };
  }
  const holder = new THREE.Object3D();
  hand.add(holder);
  hand.updateMatrixWorld(true);
  const ws = hand.getWorldScale(new THREE.Vector3());
  holder.scale.set(1 / ws.x, 1 / ws.y, 1 / ws.z);
  const inner = new THREE.Object3D();
  holder.add(inner);
  const M = materials();
  const len = w.length || 1.9;
  const g = type === 'sabre' ? buildSabre(M) : staffMesh(M, len);
  inner.add(g);
  const off = w.offset || (type === 'sabre' ? [0, 0.08, 0.02] : [0, 0.08, 0.02]);
  const rot = w.rotation || [0, 0, 90];
  inner.position.fromArray(off);
  inner.rotation.set(rot[0] * D2R, rot[1] * D2R, rot[2] * D2R);
  g.position.y = w.slide ?? (type === 'sabre' ? 0 : -0.5);
  g.visible = !w.hidden;
  g.traverse((o) => { if (o.isMesh) o.castShadow = true; });
  const seg = type === 'sabre'
    ? [new THREE.Vector3(0, 0.13, 0), new THREE.Vector3(0, 1.08, 0)]
    : [new THREE.Vector3(0, -0.25 * len / 1.9, 0), new THREE.Vector3(0, 0.95 * len / 1.9, 0)];
  log(`✓ 武器：内置${type === 'sabre' ? '大刀' : '金箍棒'}挂到 ${hand.name}`);
  return { obj: g, inner, seg, hand, type };
}

export async function loadCharacter(cfg, kind, log = console.log) {
  if (!cfg.model) throw new Error('配置缺少 model');
  const f = await loadFile(cfg.model, cfg.type);
  const model = SkeletonUtils.clone(f.scene);
  const container = new THREE.Group();
  container.name = kind;
  container.add(model);
  model.rotation.y = (cfg.rotationY || 0) * D2R;
  container.updateMatrixWorld(true);
  // 归一化身高并落地
  const box = new THREE.Box3().setFromObject(model);
  const H = box.max.y - box.min.y;
  if (!(H > 1e-5)) throw new Error('模型包围盒为空');
  const height = cfg.height || (kind === 'player' ? 1.75 : 2.15);
  model.scale.multiplyScalar(height / H);
  container.updateMatrixWorld(true);
  const b2 = new THREE.Box3().setFromObject(model), c2 = b2.getCenter(new THREE.Vector3());
  model.position.x -= c2.x; model.position.z -= c2.z; model.position.y -= b2.min.y;
  container.updateMatrixWorld(true);
  let meshes = 0, skinned = 0;
  model.traverse((o) => {
    if (!o.isMesh) return;
    meshes++; if (o.isSkinnedMesh) skinned++;
    o.castShadow = true; o.receiveShadow = true; o.frustumCulled = false; o.userData.ghost = false;
    (Array.isArray(o.material) ? o.material : [o.material]).forEach((m) => {
      if (m.map) m.map.anisotropy = 8;
      if (m.transparent && m.opacity >= 0.99 && m.alphaTest === 0) m.alphaTest = 0.4, m.transparent = false;
    });
  });
  log(`【${kind === 'player' ? '天命人' : '敌人'}】模型 ${short(cfg.model)}：原始高度 ${H.toFixed(3)} → 缩放到 ${height}m，网格 ${meshes}（蒙皮 ${skinned}）`);
  if (!skinned) log('⚠ 模型没有蒙皮网格（SkinnedMesh），动画无法驱动身体');
  const an = analyze(model);
  log(describe(an));
  if (an.missing.length) log('⚠ 模型缺失骨骼：' + an.missing.join(', '));
  const rest = captureRest(container, an.bones);
  const weapon = attachWeapon(cfg.weapon || {}, kind, an, model, log);

  const clips = {};
  for (const [key, a] of Object.entries(cfg.anims || {})) {
    if (!a || !a.file) continue;
    try {
      const af = await loadFile(a.file, a.type);
      const clip = typeof a.clip === 'string' ? af.clips.find((c) => c.name === a.clip) : af.clips[a.clip || 0];
      if (!clip) { log(`✗ ${key}：文件中没有动画「${a.clip ?? 0}」（可用：${af.clips.map((c) => c.name).join('、') || '无'}）`); continue; }
      const src = SkeletonUtils.clone(af.scene);
      const holder = new THREE.Group();
      holder.add(src);
      src.rotation.y += (a.rotationY ?? cfg.animRotationY ?? 0) * D2R;
      holder.updateMatrixWorld(true);
      const sa = analyze(src);
      const sRest = captureRest(holder, sa.bones);
      const out = retargetClip({ src: sa, srcRest: sRest, clip, tgt: an, tgtRest: rest, inPlace: a.inPlace !== false, speed: a.speed || 1, trim: a.trim, name: key });
      clips[key] = { clip: out, cfg: a };
      log(`✓ ${key.padEnd(8)} ← ${short(a.file)} [${clip.name}] ${out.duration.toFixed(2)}s` + (sa.missing.length ? `  （源缺失：${sa.missing.join(',')}）` : ''));
    } catch (e) {
      console.error(e);
      log(`✗ ${key} 加载失败：${e.message}`);
    }
  }
  // 重定向采样会改动源骨骼，目标模型恢复静止姿势
  for (const bn of an.bones) { const r = rest.get(bn); bn.quaternion.copy(r.q); bn.position.copy(r.p); }
  return { kind, cfg, root: container, model, analysis: an, rest, clips, weapon, height };
}
