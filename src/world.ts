import * as THREE from 'three';
import { GLTFLoader, type GLTF } from 'three/examples/jsm/loaders/GLTFLoader.js';

// Track layout along x. The kid walks at z = PATH_Z, between Dad and the TV (where the camera is).
export const PATH_Z = 0.9;
export const KID_START_X = -7.4;
export const KID_ROOM_EDGE = -6.6; // left of this, Dad cannot see the kid
export const FRIDGE_X = 10.6;
export const DAD_POS = new THREE.Vector3(0, 0, -1.75);

const loader = new GLTFLoader();
const cache = new Map<string, Promise<GLTF>>();

function load(path: string) {
  let p = cache.get(path);
  if (!p) {
    p = loader.loadAsync(path);
    cache.set(path, p);
  }
  return p;
}

function shadows(o: THREE.Object3D) {
  o.traverse((c) => {
    const m = c as THREE.Mesh;
    if (m.isMesh) {
      m.castShadow = true;
      m.receiveShadow = true;
    }
  });
}

// Scale a model so its height (or largest side) matches `size`, then sit it on y = 0, centred on x/z.
export function fit(o: THREE.Object3D, size: number, by: 'height' | 'max' | 'width' = 'height') {
  o.updateMatrixWorld(true);
  const box = new THREE.Box3().setFromObject(o);
  const s = box.getSize(new THREE.Vector3());
  const ref = by === 'height' ? s.y : by === 'width' ? s.x : Math.max(s.x, s.y, s.z);
  o.scale.multiplyScalar(size / ref);
  o.updateMatrixWorld(true);
  box.setFromObject(o);
  const c = box.getCenter(new THREE.Vector3());
  o.position.x -= c.x;
  o.position.z -= c.z;
  o.position.y -= box.min.y;
  const g = new THREE.Group();
  g.add(o);
  return g;
}

export async function prop(file: string, size: number, by: 'height' | 'max' | 'width' = 'height') {
  const gltf = await load(file);
  const o = gltf.scene.clone(true);
  shadows(o);
  return fit(o, size, by);
}

export class Actor {
  root = new THREE.Group();
  model!: THREE.Object3D;
  mixer!: THREE.AnimationMixer;
  actions: Record<string, THREE.AnimationAction> = {};
  current: THREE.AnimationAction | null = null;
  bones: Record<string, THREE.Object3D> = {};
  rest: Record<string, THREE.Quaternion> = {};

  static async create(file: string, height: number) {
    const a = new Actor();
    const gltf = await load(file);
    a.model = gltf.scene;
    shadows(a.model);
    const fitted = fit(a.model, height);
    a.root.add(fitted);
    a.mixer = new THREE.AnimationMixer(a.model);
    for (const clip of gltf.animations) a.actions[clip.name] = a.mixer.clipAction(clip);
    for (const n of ['head', 'torso', 'arm-left', 'arm-right', 'leg-left', 'leg-right', 'root']) {
      const b = a.model.getObjectByName(n);
      if (b) {
        a.bones[n] = b;
        a.rest[n] = b.quaternion.clone();
      }
    }
    return a;
  }

  play(name: string, opts: { fade?: number; once?: boolean; timeScale?: number } = {}) {
    const next = this.actions[name];
    if (!next) return;
    if (this.current === next) {
      next.timeScale = opts.timeScale ?? 1;
      return;
    }
    next.reset();
    next.timeScale = opts.timeScale ?? 1;
    next.setLoop(opts.once ? THREE.LoopOnce : THREE.LoopRepeat, Infinity);
    next.clampWhenFinished = !!opts.once;
    next.enabled = true;
    next.play();
    if (this.current) this.current.crossFadeTo(next, opts.fade ?? 0.15, false);
    this.current = next;
  }

  update(dt: number) {
    this.mixer.update(dt);
  }
}

export type World = {
  scene: THREE.Scene;
  kid: Actor;
  dad: Actor;
  fridgeLight: THREE.SpotLight;
  tvLight: THREE.PointLight;
  visionCone: THREE.Mesh;
  creakBoards: THREE.Group;
  loadSnack: (files: string[], size: number) => Promise<THREE.Group>;
};

function box(w: number, h: number, d: number, color: number, x: number, y: number, z: number) {
  const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), new THREE.MeshStandardMaterial({ color, roughness: 0.9 }));
  m.position.set(x, y, z);
  m.receiveShadow = true;
  m.castShadow = true;
  return m;
}

export async function buildWorld(): Promise<World> {
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x0d1024);

  // Night lighting: soft blue ambient, moonlight through the window, TV glow on Dad.
  scene.add(new THREE.HemisphereLight(0x6a7cc8, 0x2a2238, 1.1));
  const moon = new THREE.DirectionalLight(0xa8b8ff, 1.3);
  moon.position.set(-6, 12, 9);
  moon.castShadow = true;
  moon.shadow.mapSize.set(1024, 1024);
  const sc = moon.shadow.camera as THREE.OrthographicCamera;
  sc.left = -16; sc.right = 16; sc.top = 10; sc.bottom = -10; sc.near = 1; sc.far = 40;
  moon.shadow.bias = -0.0008;
  scene.add(moon);

  const tvLight = new THREE.PointLight(0x5aa0ff, 18, 9, 1.4);
  tvLight.position.set(0.3, 1.6, 3.2);
  scene.add(tvLight);

  const nightLight = new THREE.PointLight(0xffb060, 10, 7, 1.5);
  nightLight.position.set(-10.2, 1.1, -1.4);
  scene.add(nightLight);

  const kitchenLight = new THREE.PointLight(0x9fd0c8, 5, 8, 1.5);
  kitchenLight.position.set(9, 2.6, 0);
  scene.add(kitchenLight);

  const fridgeLight = new THREE.SpotLight(0xfff0c0, 0, 9, 0.9, 0.5, 1.2);
  fridgeLight.position.set(FRIDGE_X + 0.6, 1.6, -1.2);
  fridgeLight.target.position.set(FRIDGE_X - 1.5, 0.2, PATH_Z + 0.5);
  scene.add(fridgeLight, fridgeLight.target);

  // Shell of the house: floors, back wall, two partition walls.
  scene.add(box(8.6, 0.2, 7, 0x5b4a6b, -10.7, -0.1, 0)); // kid room carpet
  scene.add(box(13.2, 0.2, 7, 0x7a5236, 0, -0.1, 0)); // living room wood
  scene.add(box(8.6, 0.2, 7, 0x8c979c, 10.7, -0.1, 0)); // kitchen tiles
  scene.add(box(8.6, 3.4, 0.2, 0x4b3f6e, -10.7, 1.7, -3.1));
  scene.add(box(13.2, 3.4, 0.2, 0x34406a, 0, 1.7, -3.1));
  scene.add(box(8.6, 3.4, 0.2, 0x3e5d63, 10.7, 1.7, -3.1));
  scene.add(box(0.25, 3.4, 2.6, 0x2a2f4e, -6.6, 1.7, -1.85));
  scene.add(box(0.25, 3.4, 2.6, 0x2a2f4e, 6.6, 1.7, -1.85));
  scene.add(box(0.25, 3.4, 7, 0x2a2f4e, -15, 1.7, 0));
  scene.add(box(0.25, 3.4, 7, 0x2a2f4e, 15, 1.7, 0));
  // Skirting boards give the floor-to-wall edge some definition.
  scene.add(box(30, 0.14, 0.06, 0x1e2238, 0, 0.07, -2.98));

  // Living room window with a moon.
  const win = new THREE.Mesh(new THREE.PlaneGeometry(1.8, 1.3), new THREE.MeshBasicMaterial({ color: 0x1c2a5a }));
  win.position.set(-3.6, 1.95, -2.99);
  scene.add(win);
  const moonDisc = new THREE.Mesh(new THREE.CircleGeometry(0.22, 24), new THREE.MeshBasicMaterial({ color: 0xfff6d8 }));
  moonDisc.position.set(-3.2, 2.2, -2.98);
  scene.add(moonDisc);
  scene.add(box(1.95, 0.08, 0.1, 0x1e2238, -3.6, 1.3, -2.95));
  scene.add(box(0.06, 1.3, 0.06, 0x1e2238, -3.6, 1.95, -2.97));

  // Creaky boards are slightly lighter planks across the path.
  const creakBoards = new THREE.Group();
  scene.add(creakBoards);

  // Vision cone shows where Dad is looking during a check.
  const coneGeo = new THREE.CylinderGeometry(0.05, 2.6, 7, 32, 1, true);
  coneGeo.translate(0, -3.5, 0);
  coneGeo.rotateX(-Math.PI / 2);
  const visionCone = new THREE.Mesh(
    coneGeo,
    new THREE.MeshBasicMaterial({ color: 0xffdd55, transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide }),
  );
  visionCone.position.set(DAD_POS.x, 1.35, DAD_POS.z + 0.2);
  scene.add(visionCone);

  const F = '/models/furniture/';
  const placements: Promise<void>[] = [];
  const put = (file: string, size: number, x: number, z: number, rotY = 0, by: 'height' | 'max' | 'width' = 'height', y = 0) => {
    placements.push(
      prop(F + file, size, by).then((g) => {
        g.name = file;
        g.position.set(x, y, z);
        g.rotation.y = rotY;
        scene.add(g);
      }),
    );
  };

  // Kid room
  put('bedSingle.glb', 2.3, -11.4, -1.9, Math.PI / 2, 'max');
  put('bear.glb', 0.45, -12.1, -2.1, 0.4, 'height', 0.55);
  put('sideTable.glb', 0.6, -9.6, -2.5);
  put('lampRoundTable.glb', 0.5, -9.6, -2.5, 0, 'height', 0.6);
  put('bookcaseOpen.glb', 1.9, -13.9, -2.4, 0, 'height');
  put('rugRound.glb', 2.2, -10.4, 0.2, 0, 'max');

  // Living room: Dad on the sofa, TV is behind the camera.
  put('loungeSofa.glb', 2.4, DAD_POS.x, DAD_POS.z - 0.45, 0, 'width');
  put('rugRectangle.glb', 4.2, 0, 0.5, 0, 'max');
  put('pottedPlant.glb', 1.2, -5.4, -2.4);
  put('lampRoundFloor.glb', 1.8, 2.6, -2.5);
  put('sideTable.glb', 0.55, -2.1, -2.3);
  put('bookcaseOpen.glb', 1.9, 4.9, -2.5);

  // Kitchen
  put('kitchenCabinet.glb', 0.95, 7.6, -2.45);
  put('kitchenStove.glb', 0.95, 8.6, -2.45);
  put('kitchenCabinet.glb', 0.95, 9.6, -2.45);
  put('kitchenMicrowave.glb', 0.38, 9.6, -2.5, 0, 'height', 0.95);
  put('kitchenFridgeLarge.glb', 2.15, FRIDGE_X + 1.1, -2.2);

  const [kid, dad] = await Promise.all([
    Actor.create('/models/chars/character-female-b.glb', 1.15),
    Actor.create('/models/chars/character-male-b.glb', 1.75),
  ]);
  await Promise.all(placements);

  kid.root.position.set(KID_START_X, 0, PATH_Z);
  kid.root.rotation.y = Math.PI / 2;
  scene.add(kid.root);

  dad.root.position.copy(DAD_POS);
  scene.add(dad.root);

  const loadSnack = async (files: string[], size: number) => {
    const g = new THREE.Group();
    let y = 0;
    for (const f of files) {
      const p = await prop('/models/food/' + f, 1, 'max');
      p.position.y = y;
      const b = new THREE.Box3().setFromObject(p);
      y = b.max.y * 0.7;
      g.add(p);
    }
    return fit(g, size, 'max');
  };

  return { scene, kid, dad, fridgeLight, tvLight, visionCone, creakBoards, loadSnack };
}

export function setCreakyBoards(w: World, xs: number[]) {
  w.creakBoards.clear();
  for (const x of xs) {
    const plank = box(0.7, 0.02, 2.2, 0xa8784a, x, 0.035, PATH_Z);
    plank.castShadow = false;
    w.creakBoards.add(plank);
    for (const dz of [-0.6, 0, 0.6]) {
      const line = box(0.72, 0.022, 0.03, 0x4a2e1c, x, 0.037, PATH_Z + dz);
      line.castShadow = false;
      w.creakBoards.add(line);
    }
  }
}
