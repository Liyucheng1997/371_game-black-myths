// 特效：粒子（火花/金尘/烟尘）、棍影拖尾、冲击波、地裂、碎石、残影、定身法阵、刀光闪烁
import * as THREE from 'three';
import * as TX from '../core/textures.js';

const pv = `attribute float aSize; attribute float aAlpha; attribute vec3 aColor; uniform float uScale;
varying float vA; varying vec3 vC;
void main(){ vec4 mv = modelViewMatrix * vec4(position, 1.0); gl_PointSize = aSize * uScale / max(0.1, -mv.z); vA = aAlpha; vC = aColor; gl_Position = projectionMatrix * mv; }`;
const pf = `uniform sampler2D uTex; varying float vA; varying vec3 vC;
void main(){ vec4 t = texture2D(uTex, gl_PointCoord); gl_FragColor = vec4(vC * t.rgb, t.a * vA); if (gl_FragColor.a < 0.003) discard; }`;

class Particles {
  constructor(scene, cap, tex, additive) {
    this.cap = cap;
    this.n = 0;
    this.pos = new Float32Array(cap * 3);
    this.col = new Float32Array(cap * 3);
    this.size = new Float32Array(cap);
    this.alpha = new Float32Array(cap);
    this.vel = new Float32Array(cap * 3);
    this.life = new Float32Array(cap);
    this.max = new Float32Array(cap);
    this.grow = new Float32Array(cap);
    this.grav = new Float32Array(cap);
    this.drag = new Float32Array(cap);
    this.s0 = new Float32Array(cap);
    this.a0 = new Float32Array(cap);
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(this.pos, 3).setUsage(THREE.DynamicDrawUsage));
    g.setAttribute('aColor', new THREE.BufferAttribute(this.col, 3).setUsage(THREE.DynamicDrawUsage));
    g.setAttribute('aSize', new THREE.BufferAttribute(this.size, 1).setUsage(THREE.DynamicDrawUsage));
    g.setAttribute('aAlpha', new THREE.BufferAttribute(this.alpha, 1).setUsage(THREE.DynamicDrawUsage));
    this.geo = g;
    this.mat = new THREE.ShaderMaterial({
      vertexShader: pv, fragmentShader: pf, transparent: true, depthWrite: false,
      blending: additive ? THREE.AdditiveBlending : THREE.NormalBlending,
      uniforms: { uTex: { value: tex }, uScale: { value: 600 } },
    });
    this.points = new THREE.Points(g, this.mat);
    this.points.frustumCulled = false;
    this.points.renderOrder = additive ? 5 : 4;
    scene.add(this.points);
  }
  emit(p, v, c, size, life, { grav = 0, drag = 0.9, grow = 0, alpha = 1 } = {}) {
    if (this.n >= this.cap) return;
    const i = this.n++;
    this.pos[i * 3] = p.x; this.pos[i * 3 + 1] = p.y; this.pos[i * 3 + 2] = p.z;
    this.vel[i * 3] = v.x; this.vel[i * 3 + 1] = v.y; this.vel[i * 3 + 2] = v.z;
    this.col[i * 3] = c[0]; this.col[i * 3 + 1] = c[1]; this.col[i * 3 + 2] = c[2];
    this.size[i] = this.s0[i] = size; this.life[i] = this.max[i] = life;
    this.grav[i] = grav; this.drag[i] = drag; this.grow[i] = grow; this.alpha[i] = this.a0[i] = alpha;
  }
  update(dt) {
    let i = 0;
    while (i < this.n) {
      this.life[i] -= dt;
      if (this.life[i] <= 0) { this.kill(i); continue; }
      const t = 1 - this.life[i] / this.max[i];
      const d = Math.pow(this.drag[i], dt * 60);
      this.vel[i * 3] *= d; this.vel[i * 3 + 1] = this.vel[i * 3 + 1] * d - this.grav[i] * dt; this.vel[i * 3 + 2] *= d;
      this.pos[i * 3] += this.vel[i * 3] * dt; this.pos[i * 3 + 1] += this.vel[i * 3 + 1] * dt; this.pos[i * 3 + 2] += this.vel[i * 3 + 2] * dt;
      if (this.pos[i * 3 + 1] < 0.02) { this.pos[i * 3 + 1] = 0.02; this.vel[i * 3 + 1] *= -0.3; }
      this.size[i] = this.s0[i] * (1 + this.grow[i] * t);
      this.alpha[i] = this.a0[i] * (t < 0.1 ? t / 0.1 : 1) * (1 - t) * (1 - t * 0.3);
      i++;
    }
    const g = this.geo;
    g.setDrawRange(0, this.n);
    for (const k of ['position', 'aColor', 'aSize', 'aAlpha']) g.attributes[k].needsUpdate = true;
  }
  kill(i) {
    const j = --this.n;
    if (i === j) return;
    const c3 = (a, b) => { a[i * 3] = a[j * 3]; a[i * 3 + 1] = a[j * 3 + 1]; a[i * 3 + 2] = a[j * 3 + 2]; };
    c3(this.pos); c3(this.vel); c3(this.col);
    for (const a of [this.size, this.life, this.max, this.grow, this.grav, this.drag, this.s0, this.a0, this.alpha]) a[i] = a[j];
  }
}

// 棍影拖尾
class Trail {
  constructor(scene, color, N = 22) {
    this.N = N;
    this.hist = [];
    this.pos = new Float32Array(N * 2 * 3);
    const uv = new Float32Array(N * 2 * 2), idx = [];
    for (let i = 0; i < N; i++) {
      uv[i * 4] = i / (N - 1); uv[i * 4 + 1] = 0; uv[i * 4 + 2] = i / (N - 1); uv[i * 4 + 3] = 1;
      if (i < N - 1) { const a = i * 2; idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2); }
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(this.pos, 3));
    g.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
    g.setIndex(idx);
    this.geo = g;
    this.mat = new THREE.ShaderMaterial({
      transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide,
      uniforms: { uCol: { value: new THREE.Color(color) }, uOp: { value: 0 } },
      vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }',
      fragmentShader: `varying vec2 vUv; uniform vec3 uCol; uniform float uOp;
        void main(){ float age = vUv.x; float a = pow(1.0 - age, 3.0) * smoothstep(0.0, 0.9, vUv.y) * uOp;
          vec3 c = mix(uCol, vec3(1.0, 0.97, 0.9), smoothstep(0.75, 1.0, vUv.y) * (1.0 - age));
          gl_FragColor = vec4(c * a * 1.1, a * 0.6); }`,
    });
    this.mesh = new THREE.Mesh(g, this.mat);
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = 6;
    scene.add(this.mesh);
    this.active = false;
    this.op = 0;
  }
  push(a, b) {
    this.hist.unshift([a.clone(), b.clone()]);
    if (this.hist.length > this.N) this.hist.pop();
  }
  update(dt, a, b) {
    if (a) this.push(a, b);
    else if (this.hist.length) this.hist.pop();
    this.op += ((this.active ? 1 : 0) - this.op) * Math.min(1, dt * (this.active ? 30 : 8));
    this.mat.uniforms.uOp.value = this.op;
    const h = this.hist;
    for (let i = 0; i < this.N; i++) {
      const e = h[Math.min(i, h.length - 1)];
      if (!e) continue;
      this.pos.set([e[0].x, e[0].y, e[0].z, e[1].x, e[1].y, e[1].z], i * 6);
    }
    this.geo.attributes.position.needsUpdate = true;
    this.mesh.visible = h.length > 1 && this.op > 0.01;
  }
}

export class FX {
  constructor(scene, camera) {
    this.scene = scene;
    this.camera = camera;
    this.glow = new Particles(scene, 4000, TX.glowTex(), true);
    this.smoke = new Particles(scene, 1500, TX.smokeTex(), false);
    this.trails = new Map();
    this.temp = [];
    // 碎石
    this.debrisGeo = new THREE.DodecahedronGeometry(0.08, 0);
    this.debrisMat = new THREE.MeshStandardMaterial({ color: 0x6a645a, roughness: 0.9 });
    this.debris = new THREE.InstancedMesh(this.debrisGeo, this.debrisMat, 80);
    this.debris.count = 0;
    this.debris.castShadow = true;
    this.debrisData = [];
    scene.add(this.debris);
    this._m = new THREE.Matrix4(); this._q = new THREE.Quaternion(); this._s = new THREE.Vector3(); this._e = new THREE.Euler();
    this.ghostMat = new THREE.MeshBasicMaterial({ color: 0xc08a30, transparent: true, opacity: 0.12, blending: THREE.AdditiveBlending, depthWrite: false });
  }
  trail(key, color) {
    if (!this.trails.has(key)) this.trails.set(key, new Trail(this.scene, color));
    return this.trails.get(key);
  }
  sparks(p, dir, n = 24, color = [3, 2.2, 1.1], speed = 7) {
    const v = new THREE.Vector3();
    for (let i = 0; i < n; i++) {
      v.set(Math.random() - 0.5, Math.random() - 0.3, Math.random() - 0.5).normalize().multiplyScalar(speed * (0.3 + Math.random()));
      if (dir) v.addScaledVector(dir, speed * 0.6);
      this.glow.emit(p, v, color, 0.05 + Math.random() * 0.06, 0.25 + Math.random() * 0.45, { grav: 9, drag: 0.93 });
    }
    this.glow.emit(p, new THREE.Vector3(), [4, 3, 1.8], 1.2, 0.12, { drag: 1 });
  }
  goldDust(p, n = 10, spread = 0.4, up = 1) {
    const v = new THREE.Vector3(), q = new THREE.Vector3();
    for (let i = 0; i < n; i++) {
      q.set(p.x + (Math.random() - 0.5) * spread, p.y + (Math.random() - 0.5) * spread, p.z + (Math.random() - 0.5) * spread);
      v.set((Math.random() - 0.5) * 0.6, up * (0.5 + Math.random()), (Math.random() - 0.5) * 0.6);
      this.glow.emit(q, v, [2.2, 1.5, 0.5], 0.04 + Math.random() * 0.05, 0.6 + Math.random() * 0.8, { grav: -0.3, drag: 0.96 });
    }
  }
  dust(p, n = 12, r = 0.6, col = [0.42, 0.38, 0.33], size = 0.8) {
    const v = new THREE.Vector3(), q = new THREE.Vector3();
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2;
      q.set(p.x + Math.cos(a) * r * Math.random(), p.y + 0.1, p.z + Math.sin(a) * r * Math.random());
      v.set(Math.cos(a) * (1 + Math.random() * 2.5), 0.4 + Math.random() * 1.2, Math.sin(a) * (1 + Math.random() * 2.5));
      this.smoke.emit(q, v, col, size * (0.6 + Math.random() * 0.6), 1.2 + Math.random() * 1.2, { drag: 0.94, grow: 2.2, alpha: 0.45 });
    }
  }
  blood(p, dir, n = 14) {
    const v = new THREE.Vector3();
    for (let i = 0; i < n; i++) {
      v.set(Math.random() - 0.5, Math.random() * 0.8, Math.random() - 0.5).multiplyScalar(3).addScaledVector(dir, 2.5);
      this.smoke.emit(p, v, [0.18, 0.02, 0.02], 0.12 + Math.random() * 0.1, 0.5 + Math.random() * 0.4, { grav: 9, drag: 0.95, grow: 0.5, alpha: 0.9 });
    }
  }
  smokePuff(p, col = [0.35, 0.33, 0.32]) {
    this.smoke.emit(p, new THREE.Vector3((Math.random() - 0.5) * 0.2, 0.5 + Math.random() * 0.4, (Math.random() - 0.5) * 0.2), col, 0.5, 3 + Math.random() * 2, { drag: 0.99, grow: 3, alpha: 0.18 });
  }
  shockwave(p, power = 1) {
    const ring = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), new THREE.MeshBasicMaterial({
      map: TX.ringTex(), transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, color: new THREE.Color(2.5, 1.9, 1.1),
    }));
    ring.rotation.x = -Math.PI / 2;
    ring.position.set(p.x, 0.06, p.z);
    this.scene.add(ring);
    this.temp.push({ obj: ring, t: 0, dur: 0.5, upd: (o, k) => { const s = 0.5 + k * 7 * power; o.scale.set(s, s, s); o.material.opacity = (1 - k) ** 1.5; } });
    // 地裂
    const crack = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), new THREE.MeshBasicMaterial({ map: TX.crackDecal(), transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2 }));
    crack.rotation.set(-Math.PI / 2, 0, Math.random() * 6);
    crack.position.set(p.x, 0.025, p.z);
    const cs = 2.2 + power * 2.2;
    crack.scale.set(cs, cs, cs);
    this.scene.add(crack);
    this.temp.push({ obj: crack, t: 0, dur: 7, upd: (o, k) => { o.material.opacity = k < 0.7 ? 0.9 : 0.9 * (1 - (k - 0.7) / 0.3); } });
    this.dust(p, 18 + power * 18, 0.8 + power, [0.42, 0.38, 0.33], 0.9 + power * 0.5);
    this.sparks(new THREE.Vector3(p.x, 0.1, p.z), new THREE.Vector3(0, 1, 0), 30 + power * 30, [3, 2, 0.9], 6 + power * 4);
    for (let i = 0; i < 10 + power * 14; i++) {
      if (this.debrisData.length >= 80) this.debrisData.shift();
      const a = Math.random() * Math.PI * 2, sp = 2 + Math.random() * 4 * power;
      this.debrisData.push({
        p: new THREE.Vector3(p.x + Math.cos(a) * 0.3, 0.1, p.z + Math.sin(a) * 0.3),
        v: new THREE.Vector3(Math.cos(a) * sp, 3 + Math.random() * 5 * power, Math.sin(a) * sp),
        r: new THREE.Vector3(Math.random() * 6, Math.random() * 6, 0), s: 0.5 + Math.random() * 1.4, life: 2.5 + Math.random(),
      });
    }
  }
  ghost(root, sim) {
    const g = new THREE.Group();
    const addM = (o) => {
      if (!o.isMesh || o.isInstancedMesh || !o.userData.ghost || !o.visible) return;
      const m = new THREE.Mesh(o.geometry, this.ghostMat.clone());
      m.matrixAutoUpdate = false;
      m.matrix.copy(o.matrixWorld);
      g.add(m);
    };
    root.traverse(addM);
    if (sim) sim.traverse(addM);
    this.scene.add(g);
    this.temp.push({ obj: g, t: 0, dur: 0.45, upd: (o, k) => o.children.forEach((c) => (c.material.opacity = 0.12 * (1 - k))), dispose: (o) => o.children.forEach((c) => c.material.dispose()) });
  }
  sigil(target, dur = 4) {
    const m = new THREE.Mesh(new THREE.PlaneGeometry(3.4, 3.4), new THREE.MeshBasicMaterial({
      map: TX.sigilTex(), transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, color: new THREE.Color(2.2, 1.6, 0.7),
    }));
    m.rotation.x = -Math.PI / 2;
    this.scene.add(m);
    this.temp.push({ obj: m, t: 0, dur, upd: (o, k, dt) => {
      o.position.set(target.x, 0.05, target.z);
      o.rotation.z += dt * 0.6;
      o.material.opacity = Math.min(1, k * 12) * (k > 0.85 ? (1 - k) / 0.15 : 1);
      const s = 1 + Math.sin(k * 40) * 0.01; o.scale.set(s, s, s);
    } });
    const ring = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), new THREE.MeshBasicMaterial({ map: TX.ringTex(), transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, color: new THREE.Color(2, 1.5, 0.6) }));
    ring.position.copy(target).add(new THREE.Vector3(0, 1.2, 0));
    this.scene.add(ring);
    this.temp.push({ obj: ring, t: 0, dur: 0.6, upd: (o, k) => { o.quaternion.copy(this.camera.quaternion); const s = 0.5 + k * 6; o.scale.set(s, s, s); o.material.opacity = 1 - k; } });
  }
  glint(p, color = [3, 2.6, 2]) {
    this.glow.emit(p, new THREE.Vector3(), color, 0.9, 0.25, { drag: 1 });
    this.glow.emit(p, new THREE.Vector3(), [color[0] * 0.5, color[1] * 0.4, color[2] * 0.3], 2.2, 0.18, { drag: 1 });
  }
  update(dt) {
    this.glow.update(dt);
    this.smoke.update(dt);
    for (let i = this.temp.length - 1; i >= 0; i--) {
      const T = this.temp[i];
      T.t += dt;
      const k = Math.min(1, T.t / T.dur);
      T.upd(T.obj, k, dt);
      if (k >= 1) {
        this.scene.remove(T.obj);
        if (T.dispose) T.dispose(T.obj);
        else if (T.obj.material) T.obj.material.dispose();
        this.temp.splice(i, 1);
      }
    }
    // 碎石
    const D = this.debrisData;
    for (let i = D.length - 1; i >= 0; i--) {
      const d = D[i];
      d.life -= dt;
      if (d.life <= 0) { D.splice(i, 1); continue; }
      d.v.y -= 14 * dt;
      d.p.addScaledVector(d.v, dt);
      if (d.p.y < 0.05) { d.p.y = 0.05; d.v.multiplyScalar(0.4); d.v.y = Math.abs(d.v.y) * 0.3; }
      else { d.r.x += dt * 8; d.r.y += dt * 6; }
    }
    for (let i = 0; i < D.length; i++) {
      const d = D[i];
      this._q.setFromEuler(this._e.set(d.r.x, d.r.y, 0));
      const s = d.s * Math.min(1, d.life * 2);
      this._s.set(s, s, s);
      this.debris.setMatrixAt(i, this._m.compose(d.p, this._q, this._s));
    }
    this.debris.count = D.length;
    this.debris.instanceMatrix.needsUpdate = true;
  }
}
