// Robô cirúrgico procedural (Three.js). Unidades em metros, mesa em y = 0.
// Cada braço é resolvido a partir de dois pontos: o centro remoto (onde ficaria
// o trocarte) e a ponta do instrumento. O resto da cadeia sai por IK.
import * as THREE from 'three';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';

const V = (x, y, z) => new THREE.Vector3(x, y, z);

const BERRY_R = 0.006;
const GRIP_D = 0.014;        // do eixo da pinça até o centro do que ela segura
const WRIST_LEN = 0.008;     // do punho até o eixo da pinça
const TIP_LEN = WRIST_LEN + GRIP_D;
const SHAFT = 0.40;
const L1 = 0.27;
const L2 = 0.25;

export const JAW_HOLD = Math.asin(BERRY_R / GRIP_D); // encosta na fruta sem atravessar
export const JAW_OPEN = 0.8;
export const JAW_REST = 0.2;

const BERRY = V(0, BERRY_R, 0.1);
const DISH = V(0.082, 0, 0.124);
const DISH_REST = V(DISH.x, 0.003 + BERRY_R, DISH.z);
const HERO_R = V(0.05, 0.15, 0.02);

const dirTo = (from, to) => to.clone().sub(from).normalize();
const HOVER = BERRY.clone().addScaledVector(dirTo(HERO_R, BERRY), -0.05);
const LIFT = V(0.004, 0.072, 0.112);
const DISH_ABOVE = DISH_REST.clone().addScaledVector(dirTo(HERO_R, DISH_REST), -0.045);
const DISH_AWAY = DISH_REST.clone().addScaledVector(dirTo(HERO_R, DISH_REST), -0.06);

export const K = { BERRY, DISH_REST, HOVER, LIFT, DISH_ABOVE, DISH_AWAY };

export function createState() {
  return {
    t: 0, grabAt: 1e9, releaseAt: 1e9,
    px: HOVER.x, py: HOVER.y, pz: HOVER.z,
    jaw: JAW_REST, roll: 0, pitch: 0,
    cx: 0, cy: 0.42, cz: 1.8, tx: 0, ty: 0.34, tz: -0.1,
    fogN: 2.6, fogF: 6.5, sx: 0, sy: 0, fov: 28,
    intro: 0,
  };
}

export function createRobot(canvas) {
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.0;

  const BG = new THREE.Color('#e4eaeb');
  const scene = new THREE.Scene();
  scene.background = BG;
  scene.fog = new THREE.Fog(BG, 2.6, 6.5);

  const pmrem = new THREE.PMREMGenerator(renderer);
  scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.03).texture;
  pmrem.dispose();

  const camera = new THREE.PerspectiveCamera(28, 1, 0.01, 30);

  // ---------- materiais
  const M = {
    shell: new THREE.MeshPhysicalMaterial({ color: '#eef1f3', roughness: 0.34, clearcoat: 0.55, clearcoatRoughness: 0.3 }),
    shellLo: new THREE.MeshStandardMaterial({ color: '#dfe4e7', roughness: 0.5 }),
    dark: new THREE.MeshStandardMaterial({ color: '#2b3238', roughness: 0.5, metalness: 0.35 }),
    teal: new THREE.MeshPhysicalMaterial({ color: '#19a0c2', roughness: 0.3, clearcoat: 0.5, clearcoatRoughness: 0.2 }),
    steel: new THREE.MeshStandardMaterial({ color: '#cfd4d8', roughness: 0.22, metalness: 1 }),
    shaft: new THREE.MeshStandardMaterial({ color: '#3b4248', roughness: 0.38, metalness: 0.7 }),
    table: new THREE.MeshStandardMaterial({ color: '#a9bcc4', roughness: 0.66 }),
    tableEdge: new THREE.MeshStandardMaterial({ color: '#aeb8bd', roughness: 0.45, metalness: 0.4 }),
    porcelain: new THREE.MeshPhysicalMaterial({ color: '#f6f7f7', roughness: 0.2, clearcoat: 0.8, side: THREE.DoubleSide }),
    berry: new THREE.MeshPhysicalMaterial({ color: '#1c0d22', roughness: 0.2, clearcoat: 1, clearcoatRoughness: 0.12, sheen: 0.6, sheenColor: new THREE.Color('#6a2f7a') }),
    berryCrown: new THREE.MeshStandardMaterial({ color: '#3a2a1c', roughness: 0.9 }),
    lens: new THREE.MeshStandardMaterial({ color: '#0b0f12', roughness: 0.05, metalness: 0.9, emissive: '#bfe9ff', emissiveIntensity: 0.35 }),
  };

  const mesh = (geo, mat, cast = true) => {
    const m = new THREE.Mesh(geo, mat);
    m.castShadow = cast;
    m.receiveShadow = true;
    return m;
  };
  const rbox = (w, h, d, r) => new RoundedBoxGeometry(w, h, d, 4, r);

  // ---------- luz
  scene.add(new THREE.HemisphereLight('#ffffff', '#b9c6cc', 0.4));
  const key = new THREE.DirectionalLight('#ffffff', 2.0);
  key.position.set(0.9, 2.2, 1.3);
  key.target.position.set(0, 0.1, 0);
  key.castShadow = true;
  key.shadow.mapSize.set(2048, 2048);
  Object.assign(key.shadow.camera, { left: -0.8, right: 0.8, top: 0.9, bottom: -0.5, near: 0.5, far: 5 });
  key.shadow.bias = -0.00012;
  key.shadow.normalBias = 0.0012;
  key.shadow.radius = 5;
  scene.add(key, key.target);
  const rim = new THREE.DirectionalLight('#cfe6f2', 0.7);
  rim.position.set(-1.4, 1.0, -0.8);
  scene.add(rim);

  // ---------- mesa, torre e travessa
  const tableTop = mesh(rbox(2.3, 0.05, 1.15, 0.012), M.table, false);
  tableTop.position.set(0, -0.025, 0.05);
  const tableRail = mesh(rbox(2.32, 0.03, 1.17, 0.008), M.tableEdge, false);
  tableRail.position.set(0, -0.07, 0.05);
  const pedestal = mesh(rbox(0.5, 0.9, 0.4, 0.04), M.shellLo, false);
  pedestal.position.set(0, -0.53, 0);
  scene.add(tableTop, tableRail, pedestal);

  const tower = mesh(rbox(0.34, 2.3, 0.3, 0.06), M.shell);
  tower.position.set(0, 0.2, -0.86);
  const towerInset = mesh(rbox(0.05, 1.1, 0.02, 0.008), M.dark, false);
  towerInset.position.set(0, 0.5, -0.705);
  const boom = mesh(rbox(0.24, 0.16, 0.74, 0.05), M.shell);
  boom.position.set(0, 1.2, -0.52);
  const head = mesh(rbox(0.92, 0.1, 0.22, 0.045), M.shell);
  head.position.set(0, 1.08, -0.2);
  const headBand = mesh(rbox(0.94, 0.028, 0.2, 0.01), M.dark, false);
  headBand.position.set(0, 1.035, -0.2);
  scene.add(tower, towerInset, boom, head, headBand);

  // ---------- fruta e pires
  const berry = new THREE.Group();
  berry.add(mesh(new THREE.SphereGeometry(BERRY_R, 48, 32), M.berry));
  const crown = mesh(new THREE.CylinderGeometry(0.0011, 0.0016, 0.0008, 8), M.berryCrown, false);
  crown.position.set(0.0012, BERRY_R * 0.985, 0.0008);
  crown.rotation.z = -0.2;
  berry.add(crown);
  scene.add(berry);

  const dishProfile = [
    [0, 0.0005], [0.015, 0.0005], [0.023, 0.0058], [0.0243, 0.0066], [0.0234, 0.0074], [0.015, 0.003], [0, 0.003],
  ].map(([x, y]) => new THREE.Vector2(x, y));
  const dish = mesh(new THREE.LatheGeometry(dishProfile, 64), M.porcelain);
  dish.position.set(DISH.x, 0, DISH.z);
  scene.add(dish);

  // ---------- peças de um braço
  function numberTexture(n) {
    const c = document.createElement('canvas');
    c.width = c.height = 128;
    const g = c.getContext('2d');
    g.fillStyle = '#eef1f3';
    g.fillRect(0, 0, 128, 128);
    g.strokeStyle = '#7f8c95';
    g.lineWidth = 7;
    g.beginPath();
    g.arc(64, 64, 44, 0, Math.PI * 2);
    g.stroke();
    g.fillStyle = '#7f8c95';
    g.font = '600 60px Archivo, Helvetica, Arial, sans-serif';
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.fillText(String(n), 64, 68);
    const t = new THREE.CanvasTexture(c);
    t.colorSpace = THREE.SRGBColorSpace;
    t.anisotropy = 4;
    return t;
  }

  function makeLink(len, w, d) {
    const g = new THREE.Group();
    const body = mesh(rbox(w, len, d, Math.min(w, d) * 0.34), M.shell);
    body.position.y = len / 2;
    const band = mesh(rbox(w + 0.004, len * 0.46, d * 0.3, 0.004), M.dark, false);
    band.position.y = len / 2;
    g.add(body, band);
    return g;
  }

  function makeJoint(radius, width, number) {
    const g = new THREE.Group();
    g.add(mesh(new THREE.CylinderGeometry(radius, radius, width, 40), M.shell));
    const ring = mesh(new THREE.CylinderGeometry(radius * 1.015, radius * 1.015, width * 0.12, 40), M.dark, false);
    g.add(ring);
    if (number) {
      const mat = new THREE.MeshStandardMaterial({ map: numberTexture(number), roughness: 0.45 });
      const top = new THREE.Mesh(new THREE.CircleGeometry(radius * 0.7, 32), mat);
      top.rotation.x = -Math.PI / 2;
      top.position.y = width / 2 + 0.0006;
      const bottom = new THREE.Mesh(new THREE.CircleGeometry(radius * 0.7, 32), mat);
      bottom.rotation.set(Math.PI / 2, 0, Math.PI);
      bottom.position.y = -width / 2 - 0.0006;
      g.add(top, bottom);
    }
    return g;
  }

  function makeJaw(side) {
    const g = new THREE.Group();
    const len = 0.02;
    const blade = mesh(new THREE.BoxGeometry(0.0018, len, 0.0042), M.steel);
    blade.position.set(side * 0.0009, -len / 2, 0);
    const base = mesh(new THREE.BoxGeometry(0.0024, 0.006, 0.0046), M.steel);
    base.position.set(side * 0.0012, -0.003, 0);
    const tip = mesh(new THREE.CylinderGeometry(0.0021, 0.0021, 0.0018, 16), M.steel);
    tip.rotation.z = Math.PI / 2;
    tip.position.set(side * 0.0009, -len, 0);
    g.add(blade, base, tip);
    return g;
  }

  function makeArm({ index, S, R, backHint, pole, kind }) {
    const arm = { index, S, R, backHint: backHint.clone().normalize(), pole, kind, tipLen: kind === 'scope' ? 0 : TIP_LEN };

    const post = mesh(new THREE.CylinderGeometry(0.05, 0.05, 1.06 - S.y, 32), M.shell);
    post.position.set(S.x, (1.06 + S.y) / 2, S.z);
    scene.add(post);

    arm.shoulder = makeJoint(0.062, 0.1, 0);
    arm.upper = makeLink(L1, 0.082, 0.098);
    arm.elbow = makeJoint(0.058, 0.094, index);
    arm.fore = makeLink(L2, 0.074, 0.088);
    arm.wristBall = mesh(new THREE.SphereGeometry(0.05, 32, 24), M.shell);
    scene.add(arm.shoulder, arm.upper, arm.elbow, arm.fore, arm.wristBall);

    // carro do instrumento: origem no centro remoto, +Y sobe pelo eixo da haste
    const c = new THREE.Group();
    const railBody = mesh(rbox(0.052, 0.42, 0.046, 0.012), M.shell);
    railBody.position.set(0, 0.28, 0.058);
    const track = mesh(rbox(0.03, 0.38, 0.008, 0.003), M.dark, false);
    track.position.set(0, 0.28, 0.033);
    const mount = mesh(rbox(0.056, 0.1, 0.07, 0.016), M.shell);
    mount.position.set(0, 0.34, 0.098);
    const clampArm = mesh(rbox(0.026, 0.018, 0.06, 0.005), M.dark);
    clampArm.position.set(0, 0.062, 0.03);
    const cannula = mesh(new THREE.CylinderGeometry(0.0072, 0.0066, 0.11, 24), M.steel);
    cannula.position.y = 0.0;
    const bowl = mesh(new THREE.CylinderGeometry(0.0125, 0.0078, 0.02, 24), M.steel);
    bowl.position.y = 0.062;
    c.add(railBody, track, mount, clampArm, cannula, bowl);

    arm.housing = new THREE.Group();
    const body = mesh(rbox(0.046, 0.058, 0.05, 0.008), M.dark);
    body.position.set(0, 0.029, 0.004);
    const clip = mesh(rbox(0.054, 0.03, 0.058, 0.009), M.teal);
    clip.position.set(0, 0.07, 0.006);
    arm.housing.add(body, clip);
    c.add(arm.housing);

    arm.inst = new THREE.Group();
    const r = kind === 'scope' ? 0.0056 : 0.0042;
    const shaft = mesh(new THREE.CylinderGeometry(r, r, SHAFT, 20), M.shaft);
    shaft.position.y = SHAFT / 2;
    arm.inst.add(shaft);
    if (kind === 'scope') {
      const lens = mesh(new THREE.CylinderGeometry(r * 0.82, r * 0.82, 0.0012, 20), M.lens, false);
      lens.position.y = -0.0004;
      arm.inst.add(lens);
    } else {
      arm.wrist = new THREE.Group();
      const knuckle = mesh(new THREE.SphereGeometry(0.0043, 20, 14), M.steel);
      const neck = mesh(new THREE.CylinderGeometry(0.003, 0.0036, WRIST_LEN, 14), M.steel);
      neck.position.y = -WRIST_LEN / 2;
      const pin = mesh(new THREE.CylinderGeometry(0.0026, 0.0026, 0.0056, 14), M.steel);
      pin.rotation.x = Math.PI / 2;
      pin.position.y = -WRIST_LEN;
      arm.jawA = makeJaw(1);
      arm.jawB = makeJaw(-1);
      arm.jawA.position.y = arm.jawB.position.y = -WRIST_LEN;
      arm.grip = new THREE.Object3D();
      arm.grip.position.y = -TIP_LEN;
      arm.wrist.add(knuckle, neck, pin, arm.jawA, arm.jawB, arm.grip);
      arm.inst.add(arm.wrist);
    }
    c.add(arm.inst);
    arm.carriage = c;
    scene.add(c);
    return arm;
  }

  // ---------- solução de um braço
  const m4 = new THREE.Matrix4();
  const setBasis = (obj, x, y, z) => obj.quaternion.setFromRotationMatrix(m4.makeBasis(x, y, z));
  const UP = V(0, 1, 0);
  const a = { dir: V(), y: V(), b: V(), x: V(), M: V(), u: V(), v: V(), n: V(), E: V(), d1: V(), d2: V(), z: V(), up: V(), jx: V() };

  function solveArm(arm, P, pose) {
    a.dir.subVectors(P, arm.R);
    const ins = a.dir.length();
    a.dir.divideScalar(ins);
    a.y.copy(a.dir).negate();
    a.b.copy(arm.backHint).addScaledVector(a.y, -arm.backHint.dot(a.y)).normalize();
    a.x.crossVectors(a.y, a.b);
    setBasis(arm.carriage, a.x, a.y, a.b);
    arm.carriage.position.copy(arm.R);

    arm.inst.position.y = -ins + arm.tipLen;
    arm.housing.position.y = arm.inst.position.y + SHAFT;
    if (arm.wrist) {
      arm.inst.rotation.y = pose.roll;
      arm.wrist.rotation.x = pose.pitch;
      arm.jawA.rotation.z = pose.jaw;
      arm.jawB.rotation.z = -pose.jaw;
    }

    // cotovelo por IK de dois segmentos entre o ombro e o suporte do carro
    a.M.copy(arm.R).addScaledVector(a.y, 0.34).addScaledVector(a.b, 0.145);
    a.u.subVectors(a.M, arm.S);
    const d = THREE.MathUtils.clamp(a.u.length(), Math.abs(L1 - L2) + 0.01, L1 + L2 - 0.004);
    a.u.normalize();
    a.v.copy(arm.pole).addScaledVector(a.u, -arm.pole.dot(a.u)).normalize();
    const along = (L1 * L1 - L2 * L2 + d * d) / (2 * d);
    const out = Math.sqrt(Math.max(L1 * L1 - along * along, 0));
    a.E.copy(arm.S).addScaledVector(a.u, along).addScaledVector(a.v, out);
    a.n.crossVectors(a.u, a.v).normalize();

    a.d1.subVectors(a.E, arm.S).normalize();
    a.z.crossVectors(a.n, a.d1);
    setBasis(arm.upper, a.n, a.d1, a.z);
    arm.upper.position.copy(arm.S);

    a.d2.subVectors(a.M, a.E).normalize();
    a.z.crossVectors(a.n, a.d2);
    setBasis(arm.fore, a.n, a.d2, a.z);
    arm.fore.position.copy(a.E);

    // articulações: eixo = normal do plano do braço; número sempre em pé
    a.up.copy(UP).addScaledVector(a.n, -UP.dot(a.n)).normalize().negate();
    a.jx.crossVectors(a.n, a.up);
    setBasis(arm.elbow, a.jx, a.n, a.up);
    arm.elbow.position.copy(a.E);
    arm.shoulder.quaternion.copy(arm.elbow.quaternion);
    arm.shoulder.position.copy(arm.S);
    arm.wristBall.position.copy(a.M);
  }

  // ---------- os quatro braços
  const arms = [
    makeArm({ index: 1, S: V(-0.36, 0.82, -0.2), R: V(-0.115, 0.16, 0.03), backHint: V(-0.75, 0, -0.65), pole: V(-0.7, 0.55, 0.1), kind: 'forceps' }),
    makeArm({ index: 2, S: V(-0.12, 0.82, -0.2), R: V(-0.028, 0.185, -0.035), backHint: V(-0.15, 0, -1), pole: V(-0.25, 0.75, -0.5), kind: 'scope' }),
    makeArm({ index: 3, S: V(0.12, 0.82, -0.2), R: HERO_R, backHint: V(0.35, 0, -1), pole: V(0.35, 0.7, -0.4), kind: 'forceps' }),
    makeArm({ index: 4, S: V(0.36, 0.82, -0.2), R: V(0.2, 0.25, -0.03), backHint: V(0.8, 0, -0.6), pole: V(0.75, 0.5, 0.1), kind: 'forceps' }),
  ];
  const hero = arms[2];
  const REST = [V(-0.058, 0.034, 0.104), V(-0.012, 0.085, 0.045), null, V(0.165, 0.14, 0.05)];
  const restPose = { roll: 0, pitch: 0, jaw: JAW_REST };

  // orientação da fruta enquanto está presa: calculada a partir das duas poses de contato
  const qGrab = new THREE.Quaternion();
  const qPlace = new THREE.Quaternion();
  const qTmp = new THREE.Quaternion();
  const holdPose = { roll: 0, pitch: 0, jaw: JAW_HOLD };
  solveArm(hero, BERRY, holdPose);
  scene.updateMatrixWorld(true);
  hero.wrist.getWorldQuaternion(qGrab).invert();
  solveArm(hero, DISH_REST, holdPose);
  scene.updateMatrixWorld(true);
  hero.wrist.getWorldQuaternion(qPlace).multiply(qGrab);

  // ---------- quadro
  const P = V();
  const tgt = V();
  const heroPose = { roll: 0, pitch: 0, jaw: 0 };
  let W = 1;
  let H = 1;

  function frame(s) {
    const pull = (1 - s.intro) * 0.07;
    arms.forEach((arm, i) => {
      if (arm === hero) return;
      const drift = Math.sin(s.t * 0.9 + i * 1.7) * 0.004;
      P.copy(REST[i]);
      P.y += drift;
      P.addScaledVector(a.dir.subVectors(P, arm.R).normalize(), -pull);
      solveArm(arm, P, restPose);
    });

    P.set(s.px, s.py, s.pz);
    P.addScaledVector(a.dir.subVectors(P, hero.R).normalize(), -pull);
    heroPose.roll = s.roll;
    heroPose.pitch = s.pitch;
    heroPose.jaw = s.jaw;
    solveArm(hero, P, heroPose);

    if (s.t >= s.grabAt && s.t < s.releaseAt) {
      scene.updateMatrixWorld(true);
      hero.grip.getWorldPosition(berry.position);
      hero.wrist.getWorldQuaternion(qTmp);
      berry.quaternion.copy(qTmp).multiply(qGrab);
    } else if (s.t >= s.releaseAt) {
      berry.position.copy(DISH_REST);
      berry.quaternion.copy(qPlace);
    } else {
      berry.position.copy(BERRY);
      berry.quaternion.identity();
    }

    scene.fog.near = s.fogN;
    scene.fog.far = s.fogF;
    if (camera.fov !== s.fov) camera.fov = s.fov;
    camera.position.set(s.cx, s.cy, s.cz);
    tgt.set(s.tx, s.ty, s.tz);
    camera.lookAt(tgt);
    camera.setViewOffset(W, H, -s.sx * W, s.sy * H, W, H);
    camera.updateProjectionMatrix();
    renderer.render(scene, camera);
  }

  function resize(w, h, dpr) {
    W = w;
    H = h;
    renderer.setPixelRatio(dpr);
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
  }

  // quantos pixels ocupa 1 cm na profundidade do ponto que a câmera olha
  const p1 = V();
  const p2 = V();
  function pxPerCm() {
    camera.updateMatrixWorld();
    p1.copy(tgt);
    p2.setFromMatrixColumn(camera.matrixWorld, 0).multiplyScalar(0.01).add(tgt);
    p1.project(camera);
    p2.project(camera);
    return Math.abs(p2.x - p1.x) * W * 0.5;
  }

  return { frame, resize, pxPerCm };
}
