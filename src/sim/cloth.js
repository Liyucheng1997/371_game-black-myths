// Verlet 布料：上沿钉在骨骼上，碰撞球体（腿部），并带有轻微“回弹到静止形状”的约束以保持造型
import * as THREE from 'three';

const _v = new THREE.Vector3();

export class Cloth {
  constructor({ bone, anchors, outward, length, ny = 10, material, colliders = [], restPull = 0.02, flare = 0.05, gravity = 9.8, damping = 0.985 }) {
    this.bone = bone;
    this.nx = anchors.length;
    this.ny = ny;
    this.colliders = colliders;
    this.restPull = restPull;
    this.gravity = gravity;
    this.damping = damping;
    const nx = this.nx, n = nx * ny;
    this.n = n;
    this.restL = [];
    for (let j = 0; j < ny; j++) {
      const t = j / (ny - 1);
      for (let i = 0; i < nx; i++) {
        const a = anchors[i], o = outward[i];
        this.restL.push(new THREE.Vector3(a.x + o.x * flare * t, a.y - length * t, a.z + o.z * flare * t));
      }
    }
    this.pos = new Float32Array(n * 3);
    this.prev = new Float32Array(n * 3);
    this.restW = new Float32Array(n * 3);
    // 约束
    const cons = [];
    const id = (i, j) => j * nx + i;
    const add = (a, b) => cons.push(a, b, this.restL[a].distanceTo(this.restL[b]));
    for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) {
      if (i < nx - 1) add(id(i, j), id(i + 1, j));
      if (j < ny - 1) add(id(i, j), id(i, j + 1));
      if (i < nx - 1 && j < ny - 1) { add(id(i, j), id(i + 1, j + 1)); add(id(i + 1, j), id(i, j + 1)); }
      if (j < ny - 2) add(id(i, j), id(i, j + 2));
    }
    this.cons = new Float32Array(cons);
    // 几何
    const geo = new THREE.BufferGeometry();
    const uv = new Float32Array(n * 2), idx = [];
    for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) {
      const k = id(i, j);
      uv[k * 2] = i / (nx - 1);
      uv[k * 2 + 1] = 1 - j / (ny - 1);
    }
    for (let j = 0; j < ny - 1; j++) for (let i = 0; i < nx - 1; i++) {
      const a = id(i, j), b = id(i + 1, j), c = id(i, j + 1), d = id(i + 1, j + 1);
      idx.push(a, c, b, b, c, d);
    }
    geo.setAttribute('position', new THREE.BufferAttribute(this.pos, 3));
    geo.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
    geo.setIndex(idx);
    this.geo = geo;
    this.mesh = new THREE.Mesh(geo, material);
    this.mesh.frustumCulled = false;
    this.mesh.castShadow = true;
    this.mesh.receiveShadow = true;
    this.mesh.userData.ghost = true;
    this.colW = colliders.map(() => new THREE.Vector3());
    this.frozen = false;
  }

  computeRest() {
    const m = this.bone.matrixWorld;
    for (let k = 0; k < this.n; k++) {
      _v.copy(this.restL[k]).applyMatrix4(m);
      this.restW[k * 3] = _v.x; this.restW[k * 3 + 1] = _v.y; this.restW[k * 3 + 2] = _v.z;
    }
  }

  reset() {
    this.computeRest();
    this.pos.set(this.restW);
    this.prev.set(this.restW);
    this.geo.attributes.position.needsUpdate = true;
    this.geo.computeVertexNormals();
  }

  update(dt, wind) {
    if (this.frozen || dt <= 0) return;
    this.computeRest();
    for (let c = 0; c < this.colliders.length; c++) {
      const C = this.colliders[c];
      this.colW[c].copy(C.off).applyMatrix4(C.bone.matrixWorld);
    }
    const sub = Math.min(3, Math.max(1, Math.ceil(dt / (1 / 90))));
    const h = Math.min(dt, 1 / 30) / sub;
    const P = this.pos, Q = this.prev, R = this.restW, nx = this.nx, ny = this.ny;
    const g = -this.gravity * h * h;
    for (let s = 0; s < sub; s++) {
      for (let j = 0; j < ny; j++) {
        const t = j / (ny - 1);
        const k = this.restPull * (1 - 0.65 * t);
        for (let i = 0; i < nx; i++) {
          const q = (j * nx + i) * 3;
          if (j === 0) { P[q] = Q[q] = R[q]; P[q + 1] = Q[q + 1] = R[q + 1]; P[q + 2] = Q[q + 2] = R[q + 2]; continue; }
          const x = P[q], y = P[q + 1], z = P[q + 2];
          const d = this.damping;
          P[q] += (x - Q[q]) * d + wind.x * h * h * t;
          P[q + 1] += (y - Q[q + 1]) * d + g;
          P[q + 2] += (z - Q[q + 2]) * d + wind.z * h * h * t;
          Q[q] = x; Q[q + 1] = y; Q[q + 2] = z;
          P[q] += (R[q] - P[q]) * k; P[q + 1] += (R[q + 1] - P[q + 1]) * k; P[q + 2] += (R[q + 2] - P[q + 2]) * k;
        }
      }
      const C = this.cons;
      for (let it = 0; it < 5; it++) {
        for (let c = 0; c < C.length; c += 3) {
          const a = C[c] * 3, b = C[c + 1] * 3, rest = C[c + 2];
          const dx = P[b] - P[a], dy = P[b + 1] - P[a + 1], dz = P[b + 2] - P[a + 2];
          const l = Math.sqrt(dx * dx + dy * dy + dz * dz) || 1e-6;
          const diff = (l - rest) / l;
          const pa = C[c] < nx ? 0 : 0.5, pb = C[c + 1] < nx ? 0 : 0.5;
          const sum = pa + pb || 1;
          P[a] += dx * diff * (pa / sum); P[a + 1] += dy * diff * (pa / sum); P[a + 2] += dz * diff * (pa / sum);
          P[b] -= dx * diff * (pb / sum); P[b + 1] -= dy * diff * (pb / sum); P[b + 2] -= dz * diff * (pb / sum);
        }
        // 碰撞
        for (let c = 0; c < this.colW.length; c++) {
          const cw = this.colW[c], r = this.colliders[c].r;
          for (let k = nx; k < this.n; k++) {
            const q = k * 3;
            const dx = P[q] - cw.x, dy = P[q + 1] - cw.y, dz = P[q + 2] - cw.z;
            const d2 = dx * dx + dy * dy + dz * dz;
            if (d2 < r * r) {
              const d = Math.sqrt(d2) || 1e-6, f = r / d;
              P[q] = cw.x + dx * f; P[q + 1] = cw.y + dy * f; P[q + 2] = cw.z + dz * f;
            }
          }
        }
        // 地面
        for (let k = nx; k < this.n; k++) if (P[k * 3 + 1] < 0.02) P[k * 3 + 1] = 0.02;
      }
    }
    this.geo.attributes.position.needsUpdate = true;
    this.geo.computeVertexNormals();
  }
}

// 布料下摆破损的透明贴图
let _fray = null;
export function frayAlpha() {
  if (_fray) return _fray;
  const c = document.createElement('canvas');
  c.width = 256; c.height = 256;
  const g = c.getContext('2d');
  g.fillStyle = '#fff'; g.fillRect(0, 0, 256, 256);
  g.fillStyle = '#000';
  // 底部（v 小 → canvas 底部）锯齿
  g.beginPath(); g.moveTo(0, 256);
  for (let x = 0; x <= 256; x += 4) {
    const y = 256 - (10 + Math.abs(Math.sin(x * 0.13) * 14 + Math.sin(x * 0.41) * 8 + (Math.random() * 16)));
    g.lineTo(x, y);
  }
  g.lineTo(256, 256); g.fill();
  for (let i = 0; i < 9; i++) {
    g.beginPath();
    g.ellipse(Math.random() * 256, 140 + Math.random() * 90, 2 + Math.random() * 5, 3 + Math.random() * 9, Math.random(), 0, Math.PI * 2);
    g.fill();
  }
  _fray = new THREE.CanvasTexture(c);
  return _fray;
}
