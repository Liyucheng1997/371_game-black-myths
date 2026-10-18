// 翎羽：Verlet 链 + 形状回复，生成随头部甩动的长羽带状网格
import * as THREE from 'three';

const _v = new THREE.Vector3(), _t = new THREE.Vector3(), _s = new THREE.Vector3(), _n = new THREE.Vector3();

export class Feather {
  constructor({ bone, points, sides, width, material }) {
    this.bone = bone;
    this.rest = points;
    this.sides = sides;
    this.width = width;
    const n = points.length;
    this.n = n;
    this.p = points.map((p) => p.clone());
    this.q = points.map((p) => p.clone());
    this.rw = points.map((p) => p.clone());
    this.len = [];
    for (let i = 0; i < n - 1; i++) this.len.push(points[i].distanceTo(points[i + 1]));
    const geo = new THREE.BufferGeometry();
    this.posA = new Float32Array(n * 2 * 3);
    const uv = new Float32Array(n * 2 * 2), idx = [];
    for (let i = 0; i < n; i++) {
      uv[i * 4] = 0; uv[i * 4 + 1] = i / (n - 1);
      uv[i * 4 + 2] = 1; uv[i * 4 + 3] = i / (n - 1);
      if (i < n - 1) { const a = i * 2; idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2); }
    }
    geo.setAttribute('position', new THREE.BufferAttribute(this.posA, 3));
    geo.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
    geo.setIndex(idx);
    this.geo = geo;
    this.mesh = new THREE.Mesh(geo, material);
    this.mesh.frustumCulled = false;
    this.mesh.castShadow = true;
    this.mesh.userData.ghost = true;
    this.frozen = false;
  }

  reset() {
    for (let i = 0; i < this.n; i++) {
      this.rw[i].copy(this.rest[i]).applyMatrix4(this.bone.matrixWorld);
      this.p[i].copy(this.rw[i]); this.q[i].copy(this.rw[i]);
    }
    this.build();
  }

  update(dt, wind) {
    if (this.frozen || dt <= 0) return;
    const m = this.bone.matrixWorld, n = this.n;
    for (let i = 0; i < n; i++) this.rw[i].copy(this.rest[i]).applyMatrix4(m);
    const h = Math.min(dt, 1 / 30);
    for (let i = 0; i < n; i++) {
      if (i < 2) { this.p[i].copy(this.rw[i]); this.q[i].copy(this.rw[i]); continue; }
      const t = i / (n - 1);
      _v.subVectors(this.p[i], this.q[i]).multiplyScalar(0.94);
      this.q[i].copy(this.p[i]);
      this.p[i].add(_v);
      this.p[i].y -= 2.0 * h * h;
      this.p[i].x += wind.x * h * h * t * 0.6;
      this.p[i].z += wind.z * h * h * t * 0.6;
      const k = 0.3 * (1 - t) + 0.04;
      this.p[i].lerp(this.rw[i], k);
    }
    for (let it = 0; it < 4; it++) {
      for (let i = 1; i < n - 1; i++) {
        const a = this.p[i], b = this.p[i + 1];
        _v.subVectors(b, a);
        const l = _v.length() || 1e-6;
        const d = (l - this.len[i]) / l;
        if (i < 2) b.addScaledVector(_v, -d);
        else { a.addScaledVector(_v, d * 0.5); b.addScaledVector(_v, -d * 0.5); }
      }
    }
    this.build();
  }

  build() {
    const n = this.n, A = this.posA, m = this.bone.matrixWorld;
    for (let i = 0; i < n; i++) {
      const a = this.p[Math.max(0, i - 1)], b = this.p[Math.min(n - 1, i + 1)];
      _t.subVectors(b, a).normalize();
      _s.copy(this.sides[i]).transformDirection(m);
      _s.addScaledVector(_t, -_s.dot(_t)).normalize();
      const w = this.width(i / (n - 1)) * 0.5;
      const P = this.p[i];
      A[i * 6] = P.x - _s.x * w; A[i * 6 + 1] = P.y - _s.y * w; A[i * 6 + 2] = P.z - _s.z * w;
      A[i * 6 + 3] = P.x + _s.x * w; A[i * 6 + 4] = P.y + _s.y * w; A[i * 6 + 5] = P.z + _s.z * w;
    }
    this.geo.attributes.position.needsUpdate = true;
    this.geo.computeVertexNormals();
  }
}
