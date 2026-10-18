// 程序化几何工具：车削肢体、雕刻变形、平滑法线、毛发属性、锥形管
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

export const FUR_CELL = 0.0034; // 单根毛发间距（米）

export const smoothstep = (a, b, x) => {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};
export const gauss = (a, b = 0) => Math.exp(-(a * a + b * b));

// Catmull-Rom 采样 [[t, r], ...]
export function profile(ctrl, t) {
  if (t <= ctrl[0][0]) return ctrl[0][1];
  if (t >= ctrl[ctrl.length - 1][0]) return ctrl[ctrl.length - 1][1];
  let i = 0;
  while (i < ctrl.length - 2 && t > ctrl[i + 1][0]) i++;
  const p0 = ctrl[Math.max(0, i - 1)][1], p1 = ctrl[i][1], p2 = ctrl[i + 1][1], p3 = ctrl[Math.min(ctrl.length - 1, i + 2)][1];
  const u = (t - ctrl[i][0]) / (ctrl[i + 1][0] - ctrl[i][0]);
  const u2 = u * u, u3 = u2 * u;
  return 0.5 * (2 * p1 + (-p0 + p2) * u + (2 * p0 - 5 * p1 + 4 * p2 - p3) * u2 + (-p0 + 3 * p1 - 3 * p2 + p3) * u3);
}

// 沿 -Y 方向的肢体（从关节原点向下延伸 len），两端半球封口
export function limb({ len, radii, seg = 28, rings = 26, sx = 1, sz = 1, cap = 8, capTop = true }) {
  const pts = [];
  const r1 = profile(radii, 1), r0 = profile(radii, 0);
  for (let i = 0; i <= cap; i++) {
    const a = -Math.PI / 2 + (i / cap) * (Math.PI / 2);
    pts.push(new THREE.Vector2(Math.max(1e-4, r1 * Math.cos(a)), -len + r1 * Math.sin(a)));
  }
  for (let j = 1; j < rings; j++) {
    const t = 1 - j / rings;
    pts.push(new THREE.Vector2(profile(radii, t), -len * t));
  }
  if (capTop) {
    for (let i = 0; i <= cap; i++) {
      const a = (i / cap) * (Math.PI / 2);
      pts.push(new THREE.Vector2(Math.max(1e-4, r0 * Math.cos(a)), r0 * Math.sin(a)));
    }
  } else pts.push(new THREE.Vector2(r0, 0));
  const g = new THREE.LatheGeometry(pts, seg);
  g.scale(sx, 1, sz);
  smoothNormals(g);
  return g;
}

export function ellipsoid(rx, ry, rz, ws = 40, hs = 28) {
  const g = new THREE.SphereGeometry(1, ws, hs);
  g.scale(rx, ry, rz);
  return g;
}

// 逐顶点变形 fn(v: Vector3, i)
export function deform(geo, fn) {
  const p = geo.attributes.position, v = new THREE.Vector3();
  for (let i = 0; i < p.count; i++) {
    v.fromBufferAttribute(p, i);
    fn(v, i);
    p.setXYZ(i, v.x, v.y, v.z);
  }
  p.needsUpdate = true;
  smoothNormals(geo);
  return geo;
}

// 计算法线并在重合顶点（UV 接缝）处取平均，消除接缝
export function smoothNormals(geo) {
  geo.computeVertexNormals();
  const p = geo.attributes.position, n = geo.attributes.normal;
  const map = new Map();
  const key = (i) => `${Math.round(p.getX(i) * 1e4)},${Math.round(p.getY(i) * 1e4)},${Math.round(p.getZ(i) * 1e4)}`;
  for (let i = 0; i < p.count; i++) {
    const k = key(i);
    let e = map.get(k);
    if (!e) { e = [0, 0, 0, []]; map.set(k, e); }
    e[0] += n.getX(i); e[1] += n.getY(i); e[2] += n.getZ(i); e[3].push(i);
  }
  for (const e of map.values()) {
    if (e[3].length < 2) continue;
    const l = Math.hypot(e[0], e[1], e[2]) || 1;
    for (const i of e[3]) n.setXYZ(i, e[0] / l, e[1] / l, e[2] / l);
  }
  n.needsUpdate = true;
  return geo;
}

// 为毛发几何添加 aFur（长度系数）、aFurUv（毛囊坐标）、color（基础颜色）
export function furAttrs(geo, { len = () => 1, color = () => [0.08, 0.065, 0.055], cellScale = 1 } = {}) {
  geo.computeBoundingBox();
  const s = new THREE.Vector3();
  geo.boundingBox.getSize(s);
  const cell = FUR_CELL * cellScale;
  const su = (Math.PI * (s.x + s.z)) / 2 / cell;
  const sv = (s.y + (s.x + s.z) / 4) / cell;
  const p = geo.attributes.position, nrm = geo.attributes.normal, uv = geo.attributes.uv;
  const n = p.count;
  const aFur = new Float32Array(n), aUv = new Float32Array(n * 2), col = new Float32Array(n * 3);
  const v = new THREE.Vector3(), nn = new THREE.Vector3();
  for (let i = 0; i < n; i++) {
    v.fromBufferAttribute(p, i); nn.fromBufferAttribute(nrm, i);
    aFur[i] = len(v, nn, i);
    aUv[i * 2] = uv.getX(i) * Math.round(su);
    aUv[i * 2 + 1] = uv.getY(i) * sv;
    const c = color(v, nn, i);
    // 输入为 sRGB，顶点色在着色器中按线性空间处理
    col[i * 3] = Math.pow(c[0], 2.2); col[i * 3 + 1] = Math.pow(c[1], 2.2); col[i * 3 + 2] = Math.pow(c[2], 2.2);
  }
  geo.setAttribute('aFur', new THREE.BufferAttribute(aFur, 1));
  geo.setAttribute('aFurUv', new THREE.BufferAttribute(aUv, 2));
  geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
  return geo;
}

export function setColor(geo, c) {
  const n = geo.attributes.position.count, a = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) { a[i * 3] = c[0]; a[i * 3 + 1] = c[1]; a[i * 3 + 2] = c[2]; }
  geo.setAttribute('color', new THREE.BufferAttribute(a, 3));
  return geo;
}

// 合并（只保留 position/normal/uv 及可选属性）
export function merge(geos, keep = ['position', 'normal', 'uv']) {
  const list = geos.map((g) => {
    let gg = g.index ? g : g;
    gg = gg.index ? gg.toNonIndexed() : gg;
    for (const k of Object.keys(gg.attributes)) if (!keep.includes(k)) gg.deleteAttribute(k);
    return gg;
  });
  return mergeGeometries(list, false);
}

// 锥形管（树干、羽轴、绳索）：points 为 Vector3 数组，radius(t)
export function taperTube(points, radius, radial = 10, closeEnd = true) {
  const curve = new THREE.CatmullRomCurve3(points);
  const segs = Math.max(8, points.length * 6);
  const frames = curve.computeFrenetFrames(segs, false);
  const pos = [], nor = [], uv = [], idx = [];
  for (let i = 0; i <= segs; i++) {
    const t = i / segs;
    const P = curve.getPointAt(t);
    const r = radius(t);
    const N = frames.normals[i], B = frames.binormals[i];
    for (let j = 0; j <= radial; j++) {
      const a = (j / radial) * Math.PI * 2;
      const cx = Math.cos(a), cy = Math.sin(a);
      const nx = cx * N.x + cy * B.x, ny = cx * N.y + cy * B.y, nz = cx * N.z + cy * B.z;
      pos.push(P.x + nx * r, P.y + ny * r, P.z + nz * r);
      nor.push(nx, ny, nz);
      uv.push(j / radial, t * curve.getLength() * 0.5);
    }
  }
  for (let i = 0; i < segs; i++) for (let j = 0; j < radial; j++) {
    const a = i * (radial + 1) + j, b = a + radial + 1;
    idx.push(a, b, a + 1, b, b + 1, a + 1);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(idx);
  return g;
}

// 平面形状挤出（冠饰、刀刃等）
export function extrude(shape, depth, bevel = 0.002, curveSegments = 24) {
  const g = new THREE.ExtrudeGeometry(shape, {
    depth, bevelEnabled: bevel > 0, bevelThickness: bevel, bevelSize: bevel, bevelSegments: 3, curveSegments,
  });
  g.translate(0, 0, -depth / 2);
  g.computeVertexNormals();
  return g;
}

// 开口环带（腰带、绶带、金箍）
export function band(rx, rz, h, seg = 64, thick = 0.006) {
  const pts = [
    new THREE.Vector2(1, -h / 2), new THREE.Vector2(1 + thick, -h / 2 + thick * 0.5),
    new THREE.Vector2(1 + thick, h / 2 - thick * 0.5), new THREE.Vector2(1, h / 2),
  ];
  // 以单位半径车削后再按比例缩放
  const g = new THREE.LatheGeometry(pts.map((p) => new THREE.Vector2(p.x, p.y)), seg);
  g.scale(rx, 1, rz);
  g.computeVertexNormals();
  return g;
}
