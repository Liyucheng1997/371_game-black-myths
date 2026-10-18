// 程序化骨架 + 两骨骼解析 IK（手臂、腿）+ 武器握持
import * as THREE from 'three';

const _A = new THREE.Vector3(), _T = new THREE.Vector3(), _D = new THREE.Vector3(), _B = new THREE.Vector3();
const _E = new THREE.Vector3(), _x = new THREE.Vector3(), _y = new THREE.Vector3(), _z = new THREE.Vector3();
const _m = new THREE.Matrix4(), _q = new THREE.Quaternion(), _q2 = new THREE.Quaternion(), _q3 = new THREE.Quaternion();
const _pq = new THREE.Quaternion(), _e = new THREE.Euler();
const _v1 = new THREE.Vector3(), _v2 = new THREE.Vector3(), _v3 = new THREE.Vector3();
const X = new THREE.Vector3(1, 0, 0), Y = new THREE.Vector3(0, 1, 0);

export class Rig {
  constructor(s) {
    this.s = s;
    this.root = new THREE.Object3D();
    this.model = new THREE.Object3D();
    this.root.add(this.model);
    const b = (this.bones = {});
    const mk = (name, parent, pos) => {
      const o = new THREE.Object3D();
      o.name = name;
      o.position.set(pos[0], pos[1], pos[2]);
      parent.add(o);
      b[name] = o;
      return o;
    };
    mk('hips', this.model, [0, s.hipsY, 0]);
    mk('spine', b.hips, [0, s.spine, 0]);
    mk('chest', b.spine, [0, s.chest, 0]);
    mk('neck', b.chest, [0, s.neck, s.neckZ || 0]);
    mk('head', b.neck, [0, s.head, s.headZ || 0]);
    for (const [side, sg] of [['L', 1], ['R', -1]]) {
      mk('clav' + side, b.chest, [sg * s.clavX, s.clavY, s.clavZ]);
      mk('upperArm' + side, b['clav' + side], [sg * s.shoulderX, 0, 0]);
      mk('foreArm' + side, b['upperArm' + side], [0, -s.upperArm, 0]);
      mk('hand' + side, b['foreArm' + side], [0, -s.foreArm, 0]);
      mk('thigh' + side, b.hips, [sg * s.hipX, -s.hipDrop, 0]);
      mk('shin' + side, b['thigh' + side], [0, -s.thigh, 0]);
      mk('foot' + side, b['shin' + side], [0, -s.shin, 0]);
    }
    this.weapon = new THREE.Object3D();
    this.model.add(this.weapon);
    this.gripW = new THREE.Vector3();
    this.dirW = new THREE.Vector3(0, 0, 1);
    this.weaponHandFollow = !!s.weaponHandFollow;
  }

  setE(bone, r) { bone.rotation.set(r[0], r[1], r[2], 'YXZ'); }

  apply(P) {
    const b = this.bones, s = this.s;
    this.model.rotation.set(0, P.yaw, 0);
    b.hips.position.set(P.hips.p[0], s.hipsY + P.hips.p[1], P.hips.p[2]);
    this.setE(b.hips, P.hips.r);
    this.setE(b.spine, P.spine);
    this.setE(b.chest, P.chest);
    this.setE(b.neck, P.neck);
    this.setE(b.head, P.head);
    this.setE(b.clavL, P.clavL);
    this.setE(b.clavR, P.clavR);
    this.root.updateMatrixWorld(true);
    this.model.getWorldQuaternion(_pq);
    const modelQ = _pq.clone();

    // 腿
    for (const [side, sg] of [['L', 1], ['R', -1]]) {
      const F = P['foot' + side];
      _T.set(F.p[0], F.p[1] + s.ankleH, F.p[2]);
      this.model.localToWorld(_T);
      const k = P['knee' + side];
      _v1.set(Math.sin(F.yaw) + sg * 0.12 + k[0], k[1], Math.cos(F.yaw) + k[2]).applyQuaternion(modelQ);
      const upperQ = this.solveTwoBone(b['thigh' + side], b['shin' + side], b['foot' + side], _T, _v1, true);
      // 脚掌朝向：模型空间 yaw/pitch → 局部
      _e.set(F.pitch, F.yaw, 0, 'YXZ');
      _q.setFromEuler(_e).premultiply(modelQ);
      _q2.copy(upperQ).multiply(b['shin' + side].quaternion).invert();
      b['foot' + side].quaternion.copy(_q2.multiply(_q));
    }

    // 右手：握持武器
    const st = P.staff;
    _v2.set(st.grip[0], st.grip[1], st.grip[2]);
    this.model.localToWorld(_v2);
    const gripTarget = _v2.clone();
    const dirW = this.dirW.set(st.dir[0], st.dir[1], st.dir[2]).applyQuaternion(modelQ).normalize();
    const poleR = new THREE.Vector3(P.poleR[0], P.poleR[1], P.poleR[2]).applyQuaternion(modelQ);
    const handRQ = this.solveGripArm('R', gripTarget, dirW, poleR, 1, P.handR.r);
    // 实际拳心位置 → 武器跟随
    const fistR = this.fistCenter('R', new THREE.Vector3());
    this.gripW.copy(fistR);
    const center = fistR.clone().addScaledVector(dirW, -st.slide);
    this.model.worldToLocal(center);
    this.weapon.position.copy(center);
    if (this.weaponHandFollow) {
      // 刀类：刃口方向跟随手腕
      _q.copy(handRQ).multiply(_q3.setFromAxisAngle(new THREE.Vector3(0, 0, 1), Math.PI / 2));
      _q.multiply(_q2.setFromAxisAngle(Y, st.roll));
      this.weapon.quaternion.copy(modelQ.clone().invert().multiply(_q));
    } else {
      const dM = new THREE.Vector3(st.dir[0], st.dir[1], st.dir[2]).normalize();
      this.weapon.quaternion.setFromUnitVectors(Y, dM);
      this.weapon.quaternion.multiply(_q.setFromAxisAngle(Y, st.roll));
    }

    // 左手：在武器上（w=1）或自由（w=0）
    const H = P.handL;
    const onP = fistR.clone().addScaledVector(dirW, H.s);
    const freeP = new THREE.Vector3(H.p[0], H.p[1], H.p[2]);
    this.model.localToWorld(freeP);
    const tgt = freeP.lerp(onP, H.w);
    const poleL = new THREE.Vector3(P.poleL[0], P.poleL[1], P.poleL[2]).applyQuaternion(modelQ);
    if (H.w > 0.01) this.solveGripArm('L', tgt, dirW, poleL, H.w, H.r);
    else {
      this.solveTwoBone(b.upperArmL, b.foreArmL, b.handL, tgt, poleL, false);
      this.setE(b.handL, H.r);
    }
    this.root.updateMatrixWorld(true);
  }

  fistCenter(side, out) {
    const h = this.bones['hand' + side];
    return out.set(0, -this.s.fist, 0.008).applyMatrix4(h.matrixWorld);
  }

  // 握持手臂：迭代修正拳心偏移
  solveGripArm(side, gripW, dirW, poleW, w, freeR) {
    const b = this.bones, s = this.s;
    const up = b['upperArm' + side], lo = b['foreArm' + side], hd = b['hand' + side];
    const wrist = gripW.clone();
    const handQ = new THREE.Quaternion();
    let lowerQ = null;
    for (let it = 0; it < 2; it++) {
      const upperQ = this.solveTwoBone(up, lo, hd, wrist, poleW, false);
      lowerQ = upperQ.clone().multiply(lo.quaternion);
      // 前臂方向
      up.updateMatrixWorld(true);
      const E = lo.getWorldPosition(_v1);
      const W = hd.getWorldPosition(_v3);
      const fd = W.clone().sub(E).normalize();
      // 手部基：x 沿武器，y 指回肘部
      const sd = dirW;
      _y.copy(fd).addScaledVector(sd, -fd.dot(sd));
      if (_y.lengthSq() < 1e-5) _y.set(0, 1, 0).cross(sd);
      _y.normalize().negate();
      _x.copy(sd);
      if (side === 'R') _x.negate();
      _z.crossVectors(_x, _y).normalize();
      _y.crossVectors(_z, _x).normalize();
      _m.makeBasis(_x, _y, _z);
      handQ.setFromRotationMatrix(_m);
      const off = new THREE.Vector3(0, -s.fist, 0.008).applyQuaternion(handQ);
      wrist.copy(gripW).sub(off);
    }
    // 局部旋转
    const loc = lowerQ.clone().invert().multiply(handQ);
    if (w < 0.999) {
      _e.set(freeR[0], freeR[1], freeR[2], 'YXZ');
      const fq = new THREE.Quaternion().setFromEuler(_e);
      fq.slerp(loc, w);
      hd.quaternion.copy(fq);
    } else hd.quaternion.copy(loc);
    hd.updateMatrixWorld(true);
    return lowerQ.clone().multiply(hd.quaternion);
  }

  // 两骨骼 IK：legs=true 时膝盖朝向极向量，小腿向后弯；手臂则肘部朝极向量，前臂向前弯
  solveTwoBone(upper, lower, end, targetW, poleW, legs) {
    upper.parent.updateMatrixWorld(true);
    const A = upper.getWorldPosition(_A);
    const l1 = lower.position.length(), l2 = end.position.length();
    _D.subVectors(targetW, A);
    let d = _D.length();
    if (d < 1e-5) { _D.set(0, -1, 0); d = 1e-5; }
    _D.divideScalar(d);
    d = Math.min(Math.max(d, Math.abs(l1 - l2) + 1e-3), (l1 + l2) * 0.9995);
    const cosA = Math.min(1, Math.max(-1, (l1 * l1 + d * d - l2 * l2) / (2 * l1 * d)));
    const sinA = Math.sqrt(1 - cosA * cosA);
    _B.copy(poleW).addScaledVector(_D, -poleW.dot(_D));
    if (_B.lengthSq() < 1e-6) _B.set(0, 0, 1).addScaledVector(_D, -_D.z);
    _B.normalize();
    _E.copy(A).addScaledVector(_D, l1 * cosA).addScaledVector(_B, l1 * sinA);
    _y.subVectors(A, _E).normalize();
    _z.copy(_B);
    if (!legs) _z.negate();
    _z.addScaledVector(_y, -_z.dot(_y)).normalize();
    _x.crossVectors(_y, _z).normalize();
    _m.makeBasis(_x, _y, _z);
    const qW = new THREE.Quaternion().setFromRotationMatrix(_m);
    upper.parent.getWorldQuaternion(_q3);
    upper.quaternion.copy(_q3.invert().multiply(qW));
    const cosE = Math.min(1, Math.max(-1, (l1 * l1 + l2 * l2 - d * d) / (2 * l1 * l2)));
    const th = Math.PI - Math.acos(cosE);
    lower.quaternion.setFromAxisAngle(X, legs ? th : -th);
    upper.updateMatrixWorld(true);
    return qW;
  }
}
