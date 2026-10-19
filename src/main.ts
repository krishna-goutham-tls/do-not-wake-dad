import './style.css';
import * as THREE from 'three';
import { registerSW } from 'virtual:pwa-register';
import * as sfx from './audio';
import { LEVELS, CAUGHT_LINES, NOISE_LINES, WIN_LINES, type Level } from './levels';
import { buildWorld, setCreakyBoards, PATH_Z, KID_START_X, KID_ROOM_EDGE, FRIDGE_X, DAD_POS, type World } from './world';

registerSW({ immediate: true });

const $ = (id: string) => document.getElementById(id)!;
const rand = (a: number, b: number) => a + Math.random() * (b - a);
const pick = <T,>(xs: T[]) => xs[Math.floor(Math.random() * xs.length)];
const clamp = (v: number, a: number, b: number) => Math.min(b, Math.max(a, v));
const damp = (cur: number, target: number, rate: number, dt: number) => cur + (target - cur) * (1 - Math.exp(-rate * dt));

const SPEED = 2.3;
const DAD_SIT_Y = 0.25;
const DAD_SIT_Z = DAD_POS.z - 0.2;

// ---------- Renderer and camera ----------
const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.15;
$('stage').appendChild(renderer.domElement);

const camera = new THREE.PerspectiveCamera(40, 1, 0.1, 100);
const camPos = new THREE.Vector3(0, 4, 12);
const camLook = new THREE.Vector3(0, 1, 0);
let shake = 0;

function resize() {
  const w = window.innerWidth;
  const h = window.innerHeight;
  renderer.setSize(w, h);
  camera.aspect = w / h;
  camera.fov = camera.aspect < 1 ? 55 : 40;
  camera.updateProjectionMatrix();
}
window.addEventListener('resize', resize);
resize();

// ---------- Saved progress ----------
type Progress = { unlocked: number; stars: number[] };
let progress: Progress = { unlocked: 1, stars: [] };
try {
  const raw = localStorage.getItem('dwd-progress');
  if (raw) progress = { ...progress, ...JSON.parse(raw) };
} catch {
  /* storage blocked */
}
function saveProgress() {
  try {
    localStorage.setItem('dwd-progress', JSON.stringify(progress));
  } catch {
    /* storage blocked */
  }
}

// ---------- Game state ----------
type Mode = 'loading' | 'title' | 'intro' | 'play' | 'caught' | 'win';
type Phase = 'out' | 'grab' | 'back' | 'home' | 'done';
type DadState = 'snore' | 'stir' | 'check';

let world: World;
let mode: Mode = 'loading';
let levelIndex = 0;
let level: Level = LEVELS[0];

const g = {
  phase: 'out' as Phase,
  dad: 'snore' as DadState,
  dadTimer: 0,
  fake: false,
  noise: 0,
  time: 0,
  holding: false,
  speed: 0,
  stepDist: 0,
  snoreTimer: 0,
  heartTimer: 0,
  checkGrace: 0,
  grabTimer: 0,
  homeTimer: 0,
  introTimer: 0,
  creakHit: new Set<string>(),
  snack: null as THREE.Group | null,
  snackShown: false,
  hasMoved: false,
  stirsSeen: 0,
  fridgeGlow: 0,
  coneOpacity: 0,
  headPitch: 0.5,
  headYaw: 0,
  headRoll: 0.25,
  facing: Math.PI / 2,
  caught: null as null | {
    t: number;
    reason: 'seen' | 'noise';
    slipper: THREE.Group;
    from: THREE.Vector3;
    to: THREE.Vector3;
    thrown: boolean;
    hit: boolean;
    shown: boolean;
  },
};

// ---------- UI helpers ----------
const screens = ['screen-title', 'screen-intro', 'screen-caught', 'screen-win'];
function show(id: string | null) {
  for (const s of screens) $(s).classList.toggle('hidden', s !== id);
  const inGame = id === null || id === 'screen-intro';
  $('hud').classList.toggle('hidden', !inGame);
  $('hold-pad').classList.toggle('hidden', id !== null);
}

let hintTimer = 0;
function hint(text: string, danger = false, secs = 1.2) {
  const h = $('hint');
  h.textContent = text;
  h.classList.toggle('danger', danger);
  h.classList.add('show');
  hintTimer = secs;
}
function clearHint() {
  $('hint').classList.remove('show');
  hintTimer = 0;
}

function flash(strength = 0.8) {
  const f = $('flash');
  f.style.transition = 'none';
  f.style.opacity = String(strength);
  requestAnimationFrame(() => {
    f.style.transition = 'opacity 0.5s';
    f.style.opacity = '0';
  });
}

const dadBubble = document.createElement('div');
dadBubble.className = 'dad-bubble';
$('bubbles').appendChild(dadBubble);
const sweat = document.createElement('div');
sweat.className = 'sweat';
sweat.textContent = '💧';
$('bubbles').appendChild(sweat);

function setBubble(text: string | null, alert = false) {
  if (!text) {
    dadBubble.classList.remove('show', 'alert');
    return;
  }
  dadBubble.textContent = text;
  dadBubble.classList.add('show');
  dadBubble.classList.toggle('alert', alert);
}

const tmpV = new THREE.Vector3();
function toScreen(p: THREE.Vector3) {
  tmpV.copy(p).project(camera);
  return { x: (tmpV.x * 0.5 + 0.5) * window.innerWidth, y: (-tmpV.y * 0.5 + 0.5) * window.innerHeight };
}
const dadHeadPos = () => new THREE.Vector3(world.dad.root.position.x, world.dad.root.position.y + 1.75, world.dad.root.position.z);

function spawnZ() {
  const p = toScreen(dadHeadPos());
  const z = document.createElement('div');
  z.className = 'zzz';
  z.textContent = Math.random() < 0.5 ? 'Z' : 'z';
  z.style.left = clamp(p.x + 10, 10, window.innerWidth - 30) + 'px';
  z.style.top = clamp(p.y - 10, 60, window.innerHeight - 30) + 'px';
  $('bubbles').appendChild(z);
  setTimeout(() => z.remove(), 2300);
}

function renderLevelGrid() {
  const grid = $('level-grid');
  grid.innerHTML = '';
  LEVELS.forEach((_, i) => {
    const b = document.createElement('button');
    b.className = 'lvl';
    b.textContent = String(i + 1);
    b.disabled = i + 1 > progress.unlocked;
    const s = progress.stars[i] ?? 0;
    if (s > 0) {
      const sm = document.createElement('small');
      sm.textContent = '★'.repeat(s);
      b.appendChild(sm);
    }
    b.addEventListener('click', () => {
      sfx.unlockAudio();
      sfx.click();
      tryLandscape();
      startLevel(i);
    });
    grid.appendChild(b);
  });
}

function syncMute() {
  $('btn-mute').textContent = sfx.isMuted() ? '🔇' : '🔊';
}

// ---------- Landscape on phones ----------
const portraitQuery = window.matchMedia('(orientation: portrait)');
const touchQuery = window.matchMedia('(pointer: coarse)');
function needsRotate() {
  return touchQuery.matches && portraitQuery.matches;
}

// Android Chrome can go fullscreen and lock to landscape from a tap. iOS Safari cannot, so the
// rotate prompt covers that case. Must run inside a click handler.
function tryLandscape() {
  if (!touchQuery.matches) return;
  const el = document.documentElement;
  const lock = () => {
    const o = screen.orientation as ScreenOrientation & { lock?: (o: string) => Promise<void> };
    return o?.lock?.('landscape');
  };
  try {
    const fs = el.requestFullscreen?.({ navigationUI: 'hide' });
    if (fs) fs.then(lock).catch(() => {});
    else lock()?.catch(() => {});
  } catch {
    /* not supported */
  }
}

// ---------- Level flow ----------
async function startLevel(i: number) {
  levelIndex = i;
  level = LEVELS[i];
  resetLevel();
  if (g.snack) world.kid.root.remove(g.snack);
  g.snack = await world.loadSnack(level.snack, level.snackSize);
  g.snack.visible = false;
  g.snack.position.set(0, 1.2, 0.05);
  world.kid.root.add(g.snack);

  $('level-label').textContent = `${i + 1}. ${level.name}`;
  $('intro-num').textContent = `LEVEL ${i + 1}`;
  $('intro-name').textContent = level.name;
  $('intro-sub').textContent = level.sub;
  show('screen-intro');
  mode = 'intro';
  g.introTimer = 1.8;
}

function resetLevel() {
  const { kid, dad } = world;
  g.phase = 'out';
  g.dad = 'snore';
  g.dadTimer = rand(level.snore[0], level.snore[1]) + 1.5;
  g.fake = false;
  g.noise = 0;
  g.time = 0;
  g.speed = 0;
  g.stepDist = 0;
  g.snoreTimer = 0.6;
  g.heartTimer = 0;
  g.grabTimer = 0;
  g.homeTimer = 0;
  g.creakHit.clear();
  g.snackShown = false;
  g.hasMoved = false;
  g.stirsSeen = 0;
  g.fridgeGlow = 0;
  g.coneOpacity = 0;
  g.facing = Math.PI / 2;
  if (g.caught) {
    world.scene.remove(g.caught.slipper);
    g.caught = null;
  }
  if (g.snack) g.snack.visible = false;

  kid.root.position.set(KID_START_X, 0, PATH_Z);
  kid.root.rotation.set(0, g.facing, 0);
  kid.current?.stop();
  kid.current = null;
  kid.play('walk', { timeScale: 0 });

  dad.root.position.set(DAD_POS.x, DAD_SIT_Y, DAD_SIT_Z);
  dad.root.rotation.set(0, 0, 0);
  dad.current?.stop();
  dad.current = null;
  dad.play('sit');

  setCreakyBoards(world, level.creaky);
  setBubble(null);
  $('vignette').classList.remove('on');
  clearHint();
}

function enterStir(fast: boolean) {
  g.dad = 'stir';
  g.dadTimer = fast ? 0.35 : level.warn;
  g.fake = !fast && Math.random() < level.fake;
  g.stirsSeen++;
  if (fast) sfx.huh();
  else sfx.snort();
  setTimeout(() => {
    if (mode === 'play' && g.dad === 'stir' && !fast) sfx.hmm();
  }, 180);
  setBubble('?');
  if (levelIndex <= 1 || fast) hint(fast ? 'TOO LOUD!' : 'FREEZE!', true, g.dadTimer + 0.3);
}

function enterCheck() {
  g.dad = 'check';
  g.dadTimer = rand(level.check[0], level.check[1]);
  g.checkGrace = 0.12;
  g.heartTimer = 0;
  setBubble('!', true);
  $('vignette').classList.add('on');
  if (levelIndex <= 1) hint("DON'T MOVE", true, g.dadTimer);
}

function enterSnore() {
  g.dad = 'snore';
  g.dadTimer = rand(level.snore[0], level.snore[1]);
  g.snoreTimer = 0.5;
  g.noise *= 0.5;
  setBubble(null);
  $('vignette').classList.remove('on');
  if (levelIndex <= 1) hint('GO GO GO', false, 0.8);
}

function kidSafe() {
  return world.kid.root.position.x < KID_ROOM_EDGE || g.phase === 'home' || g.phase === 'done';
}

function triggerCaught(reason: 'seen' | 'noise') {
  mode = 'caught';
  g.holding = false;
  $('hold-pad').classList.add('hidden');
  clearHint();
  setBubble('!!', true);
  sfx.caughtSting();
  const slipper = makeSlipper();
  slipper.visible = false;
  world.scene.add(slipper);
  const kp = world.kid.root.position;
  g.caught = {
    t: 0,
    reason,
    slipper,
    from: new THREE.Vector3(DAD_POS.x + 0.35, 1.5, DAD_POS.z + 0.8),
    to: new THREE.Vector3(kp.x, 1.05, kp.z),
    thrown: false,
    hit: false,
    shown: false,
  };
  // Dad springs up off the sofa to throw.
  world.dad.root.position.set(DAD_POS.x, 0, DAD_POS.z + 0.7);
  world.dad.play('attack-melee-right', { once: true, fade: 0.05, timeScale: 0.8 });
  world.kid.play('idle', { fade: 0.05 });
  // Kid turns to face Dad.
  g.facing = Math.atan2(DAD_POS.x - kp.x, DAD_POS.z - kp.z);
}

function makeSlipper() {
  const s = new THREE.Group();
  const soleMat = new THREE.MeshStandardMaterial({ color: 0x2f6fd8, roughness: 0.7 });
  const sole = new THREE.Mesh(new THREE.BoxGeometry(0.36, 0.06, 0.15), soleMat);
  const strap = new THREE.Mesh(new THREE.TorusGeometry(0.07, 0.022, 8, 16, Math.PI), new THREE.MeshStandardMaterial({ color: 0xffffff }));
  strap.position.set(0.07, 0.02, 0);
  strap.rotation.y = Math.PI / 2;
  s.add(sole, strap);
  s.traverse((c) => ((c as THREE.Mesh).castShadow = true));
  s.scale.setScalar(1.6);
  return s;
}

function winLevel() {
  mode = 'win';
  const stars = g.time <= level.par ? 3 : g.time <= level.par * 1.5 ? 2 : 1;
  progress.stars[levelIndex] = Math.max(progress.stars[levelIndex] ?? 0, stars);
  progress.unlocked = Math.max(progress.unlocked, Math.min(LEVELS.length, levelIndex + 2));
  saveProgress();
  sfx.win();
  $('win-stars').innerHTML = [1, 2, 3].map((n) => `<span class="${n <= stars ? '' : 'off'}">★</span>`).join('');
  $('win-line').textContent = `${pick(WIN_LINES)} ${g.time.toFixed(1)}s`;
  const last = levelIndex === LEVELS.length - 1;
  $('win-title').textContent = last ? 'YOU BEAT DAD' : 'SNACK SECURED';
  $('btn-next').textContent = last ? 'BACK TO LEVELS' : 'NEXT';
  setTimeout(() => {
    if (mode === 'win') show('screen-win');
  }, 900);
}

// ---------- Per-frame updates ----------
function updateDad(dt: number) {
  if (g.dad === 'snore') {
    g.dadTimer -= dt * (g.noise > 65 ? 2.2 : 1);
    g.snoreTimer -= dt;
    if (g.snoreTimer <= 0) {
      sfx.snore();
      spawnZ();
      g.snoreTimer = 2.4;
    }
    if (g.noise >= 100) enterStir(true);
    else if (g.dadTimer <= 0) enterStir(false);
  } else if (g.dad === 'stir') {
    g.dadTimer -= dt;
    if (g.noise >= 100) g.fake = false;
    if (g.dadTimer <= 0) {
      if (g.fake) {
        sfx.grumble();
        enterSnore();
      } else enterCheck();
    }
  } else {
    g.dadTimer -= dt;
    g.checkGrace -= dt;
    g.heartTimer -= dt;
    if (g.heartTimer <= 0) {
      sfx.heartbeat();
      g.heartTimer = 0.55;
    }
    if (g.speed > 0.15 && !kidSafe() && g.checkGrace <= 0) {
      triggerCaught(g.noise >= 100 ? 'noise' : 'seen');
      return;
    }
    if (g.dadTimer <= 0) enterSnore();
  }
}

function updateKid(dt: number) {
  const { kid, fridgeLight } = world;
  const L = level;
  const p = kid.root.position;
  const walking = g.phase === 'out' || g.phase === 'back';
  const target = walking && g.holding ? SPEED : g.phase === 'home' ? SPEED * 1.3 : 0;
  g.speed = damp(g.speed, target, target > g.speed ? 10 : 22, dt);
  if (g.speed < 0.02) g.speed = 0;
  const dir = g.phase === 'out' ? 1 : -1;
  p.x += g.speed * dir * dt;

  if (walking || g.phase === 'home') {
    kid.play('walk', { timeScale: (g.speed / SPEED) * 0.85 });
  }

  const carrying = g.snackShown;
  const moving = g.speed > 0.15;
  if (moving && !g.hasMoved) {
    g.hasMoved = true;
    if (levelIndex === 0) clearHint();
  }

  // Footsteps and noise.
  if (moving) {
    g.stepDist += g.speed * dt;
    if (g.stepDist > 0.5) {
      g.stepDist = 0;
      sfx.step(carrying ? 1.4 : 1);
      if (carrying && L.sound === 'crinkle') sfx.crinkle(0.5);
      if (carrying && L.sound === 'clank' && Math.random() < 0.35) sfx.clank();
    }
  }
  if (moving && !kidSafe()) {
    const prox = 1 + Math.max(0, 1 - Math.abs(p.x - DAD_POS.x) / 5);
    const rate = 14 * (carrying ? L.noise : 0.5) * prox * (g.speed / SPEED);
    g.noise += rate * dt;
  } else {
    g.noise -= 20 * dt;
  }

  // Creaky boards.
  if (moving) {
    L.creaky.forEach((bx, i) => {
      const key = `${g.phase}-${i}`;
      if (Math.abs(p.x - bx) < 0.35 && !g.creakHit.has(key)) {
        g.creakHit.add(key);
        sfx.creak();
        g.noise += 30;
        shake = Math.max(shake, 0.08);
      }
    });
  }
  g.noise = clamp(g.noise, 0, 100);

  // Phase changes.
  if (g.phase === 'out' && p.x >= FRIDGE_X) {
    p.x = FRIDGE_X;
    g.phase = 'grab';
    g.grabTimer = 1.4;
    g.speed = 0;
    kid.play('interact-right', { fade: 0.1 });
    sfx.fridgeOpen();
    hint('GRAB IT!', false, 0.9);
  } else if (g.phase === 'grab') {
    g.grabTimer -= dt;
    if (!g.snackShown && g.grabTimer < 0.8) {
      g.snackShown = true;
      if (g.snack) g.snack.visible = true;
      if (L.sound === 'crinkle') sfx.crinkle(1.2);
      else if (L.sound === 'clank') sfx.clank();
      g.noise += 18 * L.noise;
    }
    if (g.grabTimer <= 0) {
      g.phase = 'back';
      g.facing = -Math.PI / 2;
      kid.play('walk', { timeScale: 0 });
      hint('NOW GO BACK', false, 1);
    }
  } else if (g.phase === 'back' && p.x <= KID_ROOM_EDGE - 0.3) {
    g.phase = 'home';
    setBubble(null);
    $('vignette').classList.remove('on');
  } else if (g.phase === 'home' && p.x <= KID_START_X - 1.6) {
    g.speed = 0;
    g.phase = 'done';
    g.facing = 0;
    kid.play('emote-yes', { fade: 0.1 });
    winLevel();
  }

  g.fridgeGlow = damp(g.fridgeGlow, g.phase === 'grab' ? 1 : 0, 6, dt);
  fridgeLight.intensity = g.fridgeGlow * 40;
}

function updateDadPose(dt: number, t: number) {
  const { dad, kid, visionCone } = world;
  const head = dad.bones['head'];
  const torso = dad.bones['torso'];
  const dx = kid.root.position.x - DAD_POS.x;
  const dz = PATH_Z - DAD_POS.z;
  const yawToKid = clamp(Math.atan2(dx, dz), -1.1, 1.1);

  let pitch = 0.5;
  let yaw = 0;
  let roll = 0.25 + Math.sin(t * 0.4) * 0.05;
  let cone = 0;
  if (mode === 'caught') {
    pitch = -0.1;
    yaw = yawToKid;
    roll = 0;
  } else if (g.dad === 'stir') {
    pitch = 0.2;
    yaw = Math.sin(t * 9) * 0.08;
    roll = 0.05;
    cone = 0.05;
  } else if (g.dad === 'check') {
    pitch = -0.05;
    yaw = yawToKid * 0.9 + Math.sin(t * 2.2) * 0.12;
    roll = 0;
    cone = 0.2 + Math.sin(t * 10) * 0.04;
  }
  const rate = g.dad === 'check' || mode === 'caught' ? 14 : 5;
  g.headPitch = damp(g.headPitch, pitch, rate, dt);
  g.headYaw = damp(g.headYaw, yaw, rate, dt);
  g.headRoll = damp(g.headRoll, roll, rate, dt);
  g.coneOpacity = damp(g.coneOpacity, mode === 'play' ? cone : 0, 10, dt);

  if (head) {
    head.quaternion.copy(dad.rest['head']);
    head.quaternion.multiply(new THREE.Quaternion().setFromEuler(new THREE.Euler(g.headPitch, g.headYaw, g.headRoll, 'YXZ')));
  }
  if (torso && g.dad === 'snore' && mode !== 'caught') {
    const b = Math.sin(t * ((Math.PI * 2) / 2.4));
    torso.scale.set(1 + b * 0.04, 1 + b * 0.02, 1 + b * 0.06);
  } else if (torso) torso.scale.set(1, 1, 1);

  visionCone.rotation.order = 'YXZ';
  visionCone.rotation.y = g.headYaw;
  visionCone.rotation.x = 0.14;
  (visionCone.material as THREE.MeshBasicMaterial).opacity = g.coneOpacity;
}

function updateCaught(dtReal: number) {
  const c = g.caught!;
  c.t += dtReal;
  const throwAt = 0.35;
  const flight = 0.85;
  if (!c.thrown && c.t >= throwAt) {
    c.thrown = true;
    c.slipper.visible = true;
    sfx.whoosh();
  }
  if (c.thrown && !c.hit) {
    const u = clamp((c.t - throwAt) / flight, 0, 1);
    c.slipper.position.lerpVectors(c.from, c.to, u);
    c.slipper.position.y += Math.sin(u * Math.PI) * 1.4;
    c.slipper.rotation.set(u * 14, u * 4, u * 9);
    if (u >= 1) {
      c.hit = true;
      sfx.thwack();
      flash(0.85);
      shake = 0.6;
      world.kid.play('die', { once: true, fade: 0.05 });
    }
  }
  if (c.hit) {
    // Slipper bounces off and lands on the floor.
    const s = c.slipper;
    s.position.y = Math.max(0.05, s.position.y - dtReal * 3);
    s.position.x += dtReal * 0.8;
    s.rotation.z += dtReal * 6 * (s.position.y > 0.06 ? 1 : 0);
  }
  if (c.hit && !c.shown && c.t > throwAt + flight + 1.0) {
    c.shown = true;
    $('caught-line').textContent = c.reason === 'noise' ? pick(NOISE_LINES) : pick(CAUGHT_LINES);
    show('screen-caught');
  }
}

function updateCamera(dtReal: number) {
  const kp = world.kid.root.position;
  let tx: number;
  let ty: number;
  let tz: number;
  let lx: number;
  let ly: number;
  let lz: number;
  if (mode === 'caught' && g.caught && g.caught.t > 0.2) {
    const mid = (kp.x + DAD_POS.x) / 2;
    const span = Math.abs(kp.x - DAD_POS.x);
    const dist = clamp((span + 3) / (2 * Math.tan((camera.fov * Math.PI) / 360) * camera.aspect), 4.5, 22);
    tx = mid;
    ty = 2.2;
    tz = PATH_Z + dist;
    lx = mid;
    ly = 0.9;
    lz = PATH_Z - 0.6;
  } else if (mode === 'title' || mode === 'loading') {
    tx = camera.aspect >= 1.2 ? -3.2 : 0;
    ty = 3.5;
    tz = 9.5;
    lx = 0;
    ly = 0.9;
    lz = -1;
  } else {
    const wide = camera.aspect >= 1;
    const visible = wide ? 12.5 : 7;
    const dist = clamp(visible / (2 * Math.tan((camera.fov * Math.PI) / 360) * camera.aspect), 9, 30);
    tx = clamp(kp.x * (wide ? 0.55 : 0.85), -9, 9);
    ty = wide ? 3 + dist * 0.12 : 2.5 + dist * 0.3;
    tz = dist;
    lx = tx;
    ly = 0.8;
    lz = -0.8;
  }
  const r = mode === 'caught' ? 3 : 4;
  camPos.set(damp(camPos.x, tx, r, dtReal), damp(camPos.y, ty, r, dtReal), damp(camPos.z, tz, r, dtReal));
  camLook.set(damp(camLook.x, lx, r, dtReal), damp(camLook.y, ly, r, dtReal), damp(camLook.z, lz, r, dtReal));
  camera.position.copy(camPos);
  if (shake > 0) {
    camera.position.x += (Math.random() - 0.5) * shake;
    camera.position.y += (Math.random() - 0.5) * shake;
    shake = Math.max(0, shake - dtReal * 1.6);
  }
  camera.lookAt(camLook);
}

function updateOverlays() {
  const hp = toScreen(dadHeadPos().add(new THREE.Vector3(0, 0.35, 0)));
  dadBubble.style.left = clamp(hp.x, 40, window.innerWidth - 40) + 'px';
  dadBubble.style.top = clamp(hp.y, 110, window.innerHeight - 20) + 'px';
  const kp = world.kid.root.position;
  const ks = toScreen(new THREE.Vector3(kp.x + 0.3, 1.45, kp.z));
  sweat.style.left = ks.x + 'px';
  sweat.style.top = ks.y + 'px';
  sweat.classList.toggle('show', mode === 'play' && g.dad !== 'snore' && !kidSafe());

  ($('noise-fill') as HTMLElement).style.width = g.noise.toFixed(1) + '%';
  $('noise-fill').parentElement!.parentElement!.classList.toggle('shake', g.noise > 75);
  $('timer').textContent = g.time.toFixed(1);
}

const clock = new THREE.Clock();
function frame() {
  requestAnimationFrame(frame);
  const dtReal = Math.min(clock.getDelta(), 0.05);
  const t = clock.elapsedTime;
  if (!world) return;

  let dt = dtReal;
  if (mode === 'caught' && g.caught && !g.caught.hit) dt *= 0.35;

  if (hintTimer > 0) {
    hintTimer -= dtReal;
    if (hintTimer <= 0) clearHint();
  }

  const rotateBlock = needsRotate() && mode !== 'title' && mode !== 'loading';
  $('rotate').classList.toggle('hidden', !rotateBlock);
  if (rotateBlock) {
    // Game pauses until the phone is sideways.
    press(false);
    dt = 0;
  }

  if (rotateBlock) {
    // paused
  } else if (mode === 'intro') {
    g.introTimer -= dtReal;
    g.snoreTimer -= dtReal;
    if (g.snoreTimer <= 0) {
      sfx.snore();
      spawnZ();
      g.snoreTimer = 2.4;
    }
    if (g.introTimer <= 0) {
      mode = 'play';
      show(null);
      if (levelIndex === 0) hint('HOLD ANYWHERE TO SNEAK', false, 99);
    }
  } else if (mode === 'play') {
    g.time += dt;
    updateKid(dt);
    if (mode === 'play') updateDad(dt);
  } else if (mode === 'caught') {
    updateCaught(dtReal);
  } else if (mode === 'win') {
    $('hold-pad').classList.add('hidden');
    updateKid(dt);
  } else if (mode === 'title') {
    g.snoreTimer -= dtReal;
    if (g.snoreTimer <= 0) {
      sfx.snore(0.6);
      spawnZ();
      g.snoreTimer = 2.4;
    }
  }

  // Kid turns smoothly toward its facing.
  const kr = world.kid.root.rotation;
  kr.y = damp(kr.y, g.facing, 10, dt);
  if (g.snack && g.snackShown) g.snack.position.y = 1.2 + Math.sin(t * 8) * 0.03 * (g.speed / SPEED);

  world.kid.update(dt);
  world.dad.update(dt);
  updateDadPose(dt, t);

  world.tvLight.intensity = 14 + Math.sin(t * 13) * 3 + Math.sin(t * 31) * 2 + (Math.random() < 0.03 ? 6 : 0);
  updateCamera(dtReal);
  updateOverlays();
  renderer.render(world.scene, camera);
}

// ---------- Input ----------
function isUi(e: Event) {
  return (e.target as HTMLElement).closest('button, .card') !== null;
}
function press(on: boolean) {
  if (mode !== 'play') on = false;
  g.holding = on;
  $('hold-pad').classList.toggle('active', on);
}
window.addEventListener('pointerdown', (e) => {
  sfx.unlockAudio();
  if (isUi(e)) return;
  press(true);
});
window.addEventListener('pointerup', () => press(false));
window.addEventListener('pointercancel', () => press(false));
window.addEventListener('blur', () => press(false));
const HOLD_KEYS = ['Space', 'ArrowRight', 'ArrowLeft', 'ArrowUp', 'KeyW', 'KeyD', 'KeyA'];
window.addEventListener('keydown', (e) => {
  sfx.unlockAudio();
  if (HOLD_KEYS.includes(e.code)) {
    e.preventDefault();
    if (mode === 'play') press(true);
    else if (!e.repeat && (mode === 'caught' && g.caught?.shown)) $('btn-retry').click();
    else if (!e.repeat && mode === 'win' && !$('screen-win').classList.contains('hidden')) $('btn-next').click();
  }
  if (e.code === 'Enter') {
    if (mode === 'title') $('btn-play').click();
  }
});
window.addEventListener('keyup', (e) => {
  if (HOLD_KEYS.includes(e.code)) press(false);
});
window.addEventListener('contextmenu', (e) => e.preventDefault());

$('btn-play').addEventListener('click', () => {
  sfx.unlockAudio();
  sfx.click();
  tryLandscape();
  startLevel(Math.min(progress.unlocked, LEVELS.length) - 1);
});
$('btn-retry').addEventListener('click', () => {
  sfx.click();
  tryLandscape();
  startLevel(levelIndex);
});
$('btn-win-retry').addEventListener('click', () => {
  sfx.click();
  startLevel(levelIndex);
});
$('btn-next').addEventListener('click', () => {
  sfx.click();
  if (levelIndex < LEVELS.length - 1) startLevel(levelIndex + 1);
  else goTitle();
});
$('btn-caught-menu').addEventListener('click', () => {
  sfx.click();
  goTitle();
});
$('btn-menu').addEventListener('click', () => {
  sfx.click();
  goTitle();
});
$('btn-mute').addEventListener('click', () => {
  sfx.setMuted(!sfx.isMuted());
  syncMute();
});

function goTitle() {
  mode = 'title';
  level = LEVELS[levelIndex];
  resetLevel();
  renderLevelGrid();
  show('screen-title');
}

// ---------- Boot ----------
syncMute();
buildWorld()
  .then((w) => {
    world = w;
    $('loading').remove();
    goTitle();
    frame();
  })
  .catch((err) => {
    $('loading').textContent = 'Could not load the house. Refresh to try again.';
    console.error(err);
  });

// Dev-only handle for poking at the game from the browser console.
if (import.meta.env.DEV) {
  (window as unknown as Record<string, unknown>).dwd = { g, startLevel, get world() { return world; }, get mode() { return mode; } };
}
