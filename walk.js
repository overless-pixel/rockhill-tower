/* Rockhill Tower: walk through a home in 3D.
   Two sources, same controls:
   1. the render studio's model (.glb), when RH_MODELS lists one for the home type;
   2. otherwise a model built at true scale from Rockhill's furnished floor plans (apts.json).
   Controls: drag to look, W A S D / arrows to walk, click or tap the floor to go there,
   joystick on touch screens, room buttons and the plan in the corner to jump. */
(function () {
'use strict';
const LIB = 'lib/';
const CH = 2.8, EYE = 1.6, RAD = .19, CELL = .05, SOF = 2.52;
const MODELS = window.RH_MODELS || {};          // e.g. {S:{url:'models/studio.glb', spawn:[x,z,yawDeg], rooms:[[name,x,z,yawDeg]]}}
const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
const touch = matchMedia('(pointer: coarse)').matches;

let libs = null, data = null;
function script(src) {
  return new Promise((res, rej) => { const s = document.createElement('script'); s.src = src; s.onload = res; s.onerror = () => rej(new Error(src)); document.head.appendChild(s); });
}
function load() {
  if (!libs) libs = (async () => {
    if (!window.THREE) await script(LIB + 'three.min.js');
    await Promise.all([script(LIB + 'RoomEnvironment.js'), script(LIB + 'RoundedBoxGeometry.js')]);
  })().catch(e => { libs = null; throw e; });
  return libs;
}
function loadData() {
  if (!data) data = fetch('apts.json').then(r => { if (!r.ok) throw new Error('apts'); return r.json(); }).catch(e => { data = null; throw e; });
  return data;
}
let gltfLibs = null;
function loadGLTFLibs() {
  if (!gltfLibs) gltfLibs = Promise.all(['GLTFLoader.js', 'DRACOLoader.js', 'meshopt_decoder.js'].map(f => script(LIB + f)));
  return gltfLibs;
}

/* ---------------- DOM ---------------- */
const css = `
#walk{position:fixed;inset:0;z-index:50;background:#16171a;display:none;color:#fff;touch-action:none;user-select:none;-webkit-user-select:none}
#walk.open{display:block}
#walk canvas{position:absolute;inset:0;width:100%;height:100%;display:block;cursor:grab;outline:none}
#walk canvas.drag{cursor:grabbing}
#walk .tt{position:absolute;left:20px;top:20px;z-index:3;background:rgba(14,15,18,.62);backdrop-filter:blur(12px);-webkit-backdrop-filter:blur(12px);border:1px solid rgba(255,255,255,.12);border-radius:12px;padding:12px 16px;max-width:min(420px,calc(100vw - 40px))}
#walk .tt p{margin:0 0 4px;font-size:12px;color:#e7c879;letter-spacing:.02em}
#walk .tt h2{font:300 28px/1.05 'Josefin Sans',sans-serif;margin:0}
#walk .tt .sub{font-size:13px;color:#d7dbe2;margin-top:4px}
#wMap{position:absolute;right:20px;top:20px;z-index:3;width:210px;border-radius:12px;overflow:hidden;border:1px solid rgba(255,255,255,.16);background:#0e0f12;box-shadow:0 18px 40px -18px rgba(0,0,0,.8);cursor:pointer}
#wMap img{display:block;width:100%;height:auto;opacity:.92}
#wMap svg{position:absolute;inset:0;width:100%;height:100%}
#wMap .lbl{position:absolute;left:8px;bottom:6px;font-size:11px;color:#fff;text-shadow:0 1px 4px #000;pointer-events:none}
#wHelp{position:absolute;left:50%;top:50%;transform:translate(-50%,-50%);z-index:4;background:rgba(14,15,18,.72);backdrop-filter:blur(10px);-webkit-backdrop-filter:blur(10px);border:1px solid rgba(255,255,255,.14);border-radius:14px;padding:16px 20px;font-size:14px;line-height:1.6;text-align:center;pointer-events:none;transition:opacity .6s;max-width:calc(100vw - 40px)}
#wHelp b{color:#e7c879;font-weight:500}
#wHelp.off{opacity:0}
#wRooms{position:absolute;left:50%;bottom:18px;transform:translateX(-50%);z-index:3;display:flex;gap:6px;align-items:center;flex-wrap:wrap;justify-content:center;background:rgba(14,15,18,.62);backdrop-filter:blur(12px);-webkit-backdrop-filter:blur(12px);border:1px solid rgba(255,255,255,.12);border-radius:12px;padding:6px;max-width:calc(100vw - 24px)}
#wRooms button{flex:none;min-height:40px;padding:0 14px;border-radius:8px;border:1px solid transparent;background:rgba(255,255,255,.06);color:#fff;font:500 13px Montserrat,sans-serif;cursor:pointer;white-space:nowrap}
#wRooms button:hover{border-color:rgba(231,200,121,.6)}
#wRooms button[aria-pressed=true]{border-color:#d2aa4b;background:rgba(210,170,75,.18)}
#wRooms .back{background:#d2aa4b;color:#131518;font-weight:600}
#wWa{position:absolute;right:20px;bottom:20px;z-index:3}
#wJoy{position:absolute;left:22px;bottom:96px;z-index:3;width:116px;height:116px;border-radius:50%;background:rgba(14,15,18,.35);border:1px solid rgba(255,255,255,.25);display:none;touch-action:none}
#wJoy i{position:absolute;left:50%;top:50%;width:48px;height:48px;margin:-24px 0 0 -24px;border-radius:50%;background:rgba(255,255,255,.85);box-shadow:0 4px 14px rgba(0,0,0,.4)}
#walk.touch #wJoy{display:block}
#wLoad{position:absolute;inset:0;z-index:6;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:10px;background:#16171a;transition:opacity .5s;font-size:15px}
#wLoad.off{opacity:0;pointer-events:none}
#wLoad i{width:180px;height:3px;background:rgba(255,255,255,.15);border-radius:2px;overflow:hidden}
#wLoad i b{display:block;height:100%;width:0;background:#d2aa4b;transition:width .2s}
#wFade{position:absolute;inset:0;z-index:5;background:#0d0e10;opacity:0;pointer-events:none;transition:opacity .28s}
#wNote{position:absolute;left:20px;bottom:24px;z-index:2;font-size:11px;color:rgba(255,255,255,.7);max-width:260px;text-shadow:0 1px 4px #000}
#wErr{position:absolute;left:50%;top:50%;transform:translate(-50%,-50%);z-index:7;background:#1d1f24;border:1px solid rgba(255,255,255,.15);border-radius:12px;padding:18px 22px;display:none;text-align:center}
@media (max-width:760px){
 #walk .tt{left:10px;top:10px;padding:9px 12px}#walk .tt h2{font-size:21px}#walk .tt .sub{display:none}
 #wMap{right:10px;top:10px;width:118px}#wMap .lbl{display:none}
 #wRooms{bottom:10px;flex-wrap:nowrap;overflow-x:auto;justify-content:flex-start;left:10px;right:10px;transform:none;max-width:none}
 #wWa{right:10px;bottom:72px;min-height:42px;padding:0 14px;font-size:13px}
 #wJoy{left:14px;bottom:76px}
 #wNote{display:none}
}`;
let root, canvas, ui = {};
function buildDOM() {
  if (root) return;
  const st = document.createElement('style'); st.textContent = css; document.head.appendChild(st);
  root = document.createElement('div'); root.id = 'walk'; root.setAttribute('role', 'dialog'); root.setAttribute('aria-modal', 'true'); root.setAttribute('aria-labelledby', 'wH');
  root.innerHTML = `<canvas id="wc" tabindex="0" aria-label="3D view of the home. Drag to look around, use W A S D or the arrow keys to walk, click the floor to go there."></canvas>
  <div class="tt"><p id="wK"></p><h2 id="wH">Home</h2><div class="sub" id="wS"></div></div>
  <div id="wMap" role="button" tabindex="0" aria-label="Floor plan: click a spot to go there"><img id="wMapImg" alt=""><svg id="wMapSvg" viewBox="0 0 1000 1000" preserveAspectRatio="none"><path id="wCone" fill="rgba(231,200,121,.35)"/><circle id="wDot" r="14" fill="#e7c879" stroke="#131518" stroke-width="5"/></svg><span class="lbl">Tap the plan to jump</span></div>
  <div id="wHelp"></div>
  <div id="wJoy" aria-hidden="true"><i></i></div>
  <a class="gbtn" id="wWa" href="#" target="_blank" rel="noopener">Reserve on WhatsApp</a>
  <p id="wNote"></p>
  <div id="wRooms" role="toolbar" aria-label="Rooms"></div>
  <div id="wFade"></div>
  <div id="wLoad"><span id="wLoadT">Building your home</span><i><b id="wLoadB"></b></i></div>
  <div id="wErr"><p>The 3D home could not load. Check your connection and try again.</p><button class="gbtn" id="wErrB">Back to the tower</button></div>`;
  document.body.appendChild(root);
  canvas = root.querySelector('#wc');
  for (const id of ['wK', 'wH', 'wS', 'wMap', 'wMapImg', 'wMapSvg', 'wCone', 'wDot', 'wHelp', 'wJoy', 'wWa', 'wNote', 'wRooms', 'wFade', 'wLoad', 'wLoadB', 'wLoadT', 'wErr', 'wErrB']) ui[id] = root.querySelector('#' + id);
  if (touch) root.classList.add('touch');
  ui.wHelp.innerHTML = touch
    ? '<b>Drag</b> to look around<br>Use the <b>joystick</b> to walk, or <b>tap the floor</b> to go there'
    : '<b>Drag</b> to look around · <b>W A S D</b> or <b>arrow keys</b> to walk<br><b>Click the floor</b> to go there · <b>scroll</b> to zoom';
}

/* ---------------- three.js world ---------------- */
let renderer, scene, camera, envTex, sun, home = null, floors = [], grid = null, cur = null, marker;
const P = { x: 0, z: 0, yaw: 0, pitch: -.08, ty: 0, tp: -.08, vx: 0, vz: 0, fov: 72, tfov: 72 };
const keys = new Set();
let auto = null, last = 0, running = false, opts = null, maxAniso = 4;

function init() {
  renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
  renderer.setPixelRatio(Math.min(devicePixelRatio || 1, touch ? 1.6 : 2));
  renderer.outputEncoding = THREE.sRGBEncoding;
  renderer.toneMapping = THREE.ACESFilmicToneMapping; renderer.toneMappingExposure = .68;
  renderer.shadowMap.enabled = true; renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  maxAniso = renderer.capabilities.getMaxAnisotropy();
  scene = new THREE.Scene();
  camera = new THREE.PerspectiveCamera(72, 1, .05, 400);
  const pm = new THREE.PMREMGenerator(renderer);
  envTex = pm.fromScene(new THREE.RoomEnvironment(), .04).texture;
  scene.environment = envTex;
  scene.add(new THREE.HemisphereLight(0xffeedb, 0x4f4031, .22));
  sun = new THREE.DirectionalLight(0xffd4a0, 1.45);
  sun.castShadow = true; sun.shadow.mapSize.set(touch ? 1024 : 2048, touch ? 1024 : 2048);
  sun.shadow.bias = -.0004; sun.shadow.normalBias = .03; sun.shadow.radius = 3;
  scene.add(sun, sun.target);
  scene.add(skyDome());
  marker = new THREE.Mesh(new THREE.RingGeometry(.16, .21, 40), new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: .75, depthWrite: false }));
  marker.rotation.x = -Math.PI / 2; marker.visible = false; marker.renderOrder = 5; scene.add(marker);
  bindInput();
  addEventListener('resize', resize);
}

/* ---- procedural textures (no downloads) ---- */
const texCache = {};
function canvasTex(key, size, draw) {
  if (texCache[key]) return texCache[key];
  const c = document.createElement('canvas'); c.width = c.height = size; const g = c.getContext('2d'); draw(g, size);
  const t = new THREE.CanvasTexture(c); t.encoding = THREE.sRGBEncoding; t.wrapS = t.wrapT = THREE.RepeatWrapping; t.anisotropy = maxAniso;
  return texCache[key] = t;
}
function rng(seed) { let s = seed >>> 0; return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296); }
const TEXM = { wood: 1.6, tile: 1.2, stone: 1.2, marble: 1, walnut: 1, oak: 1, fabric: .5, rug: 1 };   // metres covered by one texture tile
function woodTex() {
  return canvasTex('wood', 1024, (g, S) => {
    const r = rng(7), pw = S / 8;
    for (let i = 0; i < 8; i++) {
      let y = -r() * S;
      while (y < S) {
        const len = S * (.55 + r() * .3), base = [176 + r() * 26 - 13, 133 + r() * 20 - 10, 92 + r() * 16 - 8];
        g.fillStyle = `rgb(${base.map(Math.round)})`; g.fillRect(i * pw, y, pw, len);
        for (let k = 0; k < 26; k++) {           // grain
          const x = i * pw + r() * pw, a = .05 + r() * .09; g.strokeStyle = r() < .5 ? `rgba(90,56,30,${a})` : `rgba(240,210,170,${a * .7})`;
          g.lineWidth = .6 + r() * 1.6; g.beginPath(); g.moveTo(x, y);
          for (let t = 0; t <= 1; t += .1) g.lineTo(x + Math.sin(t * 6 + k) * (2 + r() * 2), y + t * len); g.stroke();
        }
        g.fillStyle = 'rgba(60,36,20,.55)'; g.fillRect(i * pw, y, pw, 2);
        y += len;
      }
      g.fillStyle = 'rgba(60,36,20,.5)'; g.fillRect(i * pw, 0, 2, S);
    }
  });
}
function tileTex(key, col, grout, n) {
  return canvasTex(key, 1024, (g, S) => {
    const r = rng(key.length * 31), t = S / n;
    for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) {
      const v = r() * 10 - 5; g.fillStyle = `rgb(${col.map(c => Math.round(c + v))})`; g.fillRect(i * t, j * t, t, t);
      for (let k = 0; k < 900; k++) { g.fillStyle = `rgba(${r() < .5 ? '255,255,255' : '0,0,0'},${r() * .05})`; g.fillRect(i * t + r() * t, j * t + r() * t, 2, 2); }
    }
    g.strokeStyle = `rgb(${grout})`; g.lineWidth = 3;
    for (let i = 0; i <= n; i++) { g.beginPath(); g.moveTo(i * t, 0); g.lineTo(i * t, S); g.stroke(); g.beginPath(); g.moveTo(0, i * t); g.lineTo(S, i * t); g.stroke(); }
  });
}
function marbleTex() {
  return canvasTex('marble', 1024, (g, S) => {
    const r = rng(11); g.fillStyle = '#efece7'; g.fillRect(0, 0, S, S);
    for (let k = 0; k < 2200; k++) { g.fillStyle = `rgba(160,150,140,${r() * .05})`; g.fillRect(r() * S, r() * S, 3, 3); }
    for (let v = 0; v < 14; v++) {
      let x = r() * S, y = -20; const a = .08 + r() * .22; g.strokeStyle = `rgba(110,104,98,${a})`; g.lineWidth = .8 + r() * 2.6;
      g.beginPath(); g.moveTo(x, y);
      while (y < S + 20) { x += (r() - .5) * 60 + 18; y += 30 + r() * 40; g.lineTo(x, y); } g.stroke();
    }
  });
}
function grainTex(key, base, dark, light) {
  return canvasTex(key, 1024, (g, S) => {
    const r = rng(key.length * 17); g.fillStyle = base; g.fillRect(0, 0, S, S);
    for (let k = 0; k < 260; k++) {
      const x = r() * S; g.strokeStyle = (r() < .6 ? dark : light) + (.05 + r() * .12) + ')'; g.lineWidth = .5 + r() * 2.2;
      g.beginPath(); g.moveTo(x, 0); for (let y = 0; y <= S; y += 32) g.lineTo(x + Math.sin(y * .01 + k) * 6, y); g.stroke();
    }
  });
}
function noiseTex(key, base, amp) {
  return canvasTex(key, 512, (g, S) => {
    const r = rng(key.length * 13); g.fillStyle = base; g.fillRect(0, 0, S, S);
    for (let k = 0; k < 26000; k++) { g.fillStyle = `rgba(${r() < .5 ? '255,255,255' : '0,0,0'},${r() * amp})`; g.fillRect(r() * S, r() * S, 1 + r() * 2, 1 + r() * 2); }
  });
}
function skyDome() {
  const S = 4096, H = 2048, c = document.createElement('canvas'); c.width = S; c.height = H; const g = c.getContext('2d');
  const top = 853, base = 1084;                       // where the skyline photo sits; the horizon is y = 1024
  const sky = g.createLinearGradient(0, 0, 0, top + 40); sky.addColorStop(0, '#16244b'); sky.addColorStop(.6, '#33508c'); sky.addColorStop(1, '#3f62a4');
  g.fillStyle = sky; g.fillRect(0, 0, S, top + 40);
  const low = g.createLinearGradient(0, base, 0, H); low.addColorStop(0, '#2a2433'); low.addColorStop(.3, '#17151d'); low.addColorStop(1, '#0d0c11');
  g.fillStyle = low; g.fillRect(0, base, S, H - base);
  const r = rng(9); for (let k = 0; k < 4000; k++) { g.fillStyle = `rgba(255,${180 + r() * 60},${110 + r() * 70},${r() * .55})`; g.fillRect(r() * S, base + 40 + r() * (H - base - 40), 2, 2); }
  const t = new THREE.CanvasTexture(c); t.encoding = THREE.sRGBEncoding; t.wrapS = THREE.RepeatWrapping; t.anisotropy = maxAniso;
  const img = new Image(); img.onload = () => {
    const tw = S / 6, th = tw * img.height / img.width, y0 = base + 20 - th * (520 / 587);
    for (let i = 0; i < 6; i++) { g.save(); if (i % 2) { g.translate((i + 1) * tw, 0); g.scale(-1, 1); g.drawImage(img, 0, y0, tw, th); } else g.drawImage(img, i * tw, y0, tw, th); g.restore(); }
    const fade = g.createLinearGradient(0, y0, 0, y0 + 70); fade.addColorStop(0, '#3f62a4'); fade.addColorStop(1, 'rgba(63,98,164,0)');
    g.fillStyle = fade; g.fillRect(0, y0, S, 70);
    const lo = g.createLinearGradient(0, y0 + th - 40, 0, y0 + th + 10); lo.addColorStop(0, 'rgba(42,36,51,0)'); lo.addColorStop(1, '#2a2433');
    g.fillStyle = lo; g.fillRect(0, y0 + th - 40, S, 50);
    t.needsUpdate = true;
  }; img.src = 'img/skyline.jpg';
  const m = new THREE.Mesh(new THREE.SphereGeometry(200, 64, 32), new THREE.MeshBasicMaterial({ map: t, side: THREE.BackSide, toneMapped: false, fog: false }));
  m.userData.sky = true; return m;
}

/* ---- materials cut from Rockhill's renders (tex/*.jpg), with relief maps ---- */
const RTEX = ['marble', 'marble_floor', 'walnut', 'oak', 'stone', 'splash', 'balcony'];
let rtexP = null; const RT = {};
function loadRenderTextures() {
  if (!rtexP) {
    const L = new THREE.TextureLoader();
    const one = (n, srgb) => L.loadAsync('tex/' + n + '.jpg').then(t => { t.wrapS = t.wrapT = THREE.RepeatWrapping; t.anisotropy = maxAniso; if (srgb) t.encoding = THREE.sRGBEncoding; RT[n] = t; });
    rtexP = Promise.all(RTEX.flatMap(n => [one(n, true), one(n + '_n', false)])).catch(e => { rtexP = null; throw e; });
  }
  return rtexP;
}
function glowTex() {                       // soft warm wash for the LED coves
  return canvasTex('glow', 256, (g, S) => { const gr = g.createLinearGradient(0, 0, 0, S); gr.addColorStop(0, 'rgba(255,214,160,1)'); gr.addColorStop(.35, 'rgba(255,205,150,.45)'); gr.addColorStop(1, 'rgba(255,200,140,0)'); g.fillStyle = gr; g.fillRect(0, 0, S, S); });
}
/* ---- materials ---- */
let M = null;
function mats() {
  if (M) return M;
  const std = (o) => new THREE.MeshStandardMaterial(Object.assign({ envMapIntensity: .5 }, o));
  const phys = (o) => new THREE.MeshPhysicalMaterial(Object.assign({ envMapIntensity: .8 }, o));
  const tm = (m, metres) => { m.userData.tm = metres; return m; };
  const nrm = (n, sc) => ({ normalMap: RT[n + '_n'], normalScale: new THREE.Vector2(sc, sc) });
  const sheen = (m, c) => { if ('sheen' in m) m.sheen = new THREE.Color(c); return m; };
  M = {
    wall: std({ color: 0xe4ddd2, roughness: .9, vertexColors: true, envMapIntensity: .25 }), ceil: std({ color: 0xf6f3ee, roughness: .95, envMapIntensity: .2 }),
    skirt: std({ color: 0xd8d1c6, roughness: .5 }),
    mfloor: tm(phys(Object.assign({ map: RT.marble_floor, color: 0xe2ded8, roughness: .14, clearcoat: 1, clearcoatRoughness: .05, envMapIntensity: 1 }, nrm('marble_floor', .25))), 1.2),
    marble: tm(phys(Object.assign({ map: RT.marble, color: 0xf0ede8, roughness: .2, clearcoat: .7, clearcoatRoughness: .08 }, nrm('marble', .2))), 1.0),
    splash: tm(phys(Object.assign({ map: RT.splash, roughness: .2, clearcoat: .6, clearcoatRoughness: .1 }, nrm('splash', .2))), .9),
    stone: tm(std(Object.assign({ map: RT.stone, roughness: .55 }, nrm('stone', .7))), 1.0),
    walnut: tm(phys(Object.assign({ map: RT.walnut, roughness: .42, clearcoat: .35, clearcoatRoughness: .25, envMapIntensity: .6 }, nrm('walnut', .5))), 1.0),
    oak: tm(std(Object.assign({ map: RT.oak, roughness: .48, envMapIntensity: .55 }, nrm('oak', .55))), 1.6),
    balc: tm(std(Object.assign({ map: RT.balcony, roughness: .7 }, nrm('balcony', .5))), 1.2),
    lacquer: phys({ color: 0x6f675f, roughness: .45, clearcoat: .4, clearcoatRoughness: .3 }),
    gloss: phys({ color: 0xe9e6e1, roughness: .3, clearcoat: .8, clearcoatRoughness: .08, envMapIntensity: .5 }),
    fabric: sheen(phys({ map: noiseTex('fab', '#cdc5b8', .06), roughness: .95, envMapIntensity: .3 }), 0x8a8378),
    fabric2: sheen(phys({ map: noiseTex('fab2', '#56555a', .07), roughness: .9, envMapIntensity: .3 }), 0x9a9aa4),
    linen: std({ map: noiseTex('lin', '#efece7', .04), roughness: .93, envMapIntensity: .3 }),
    head: sheen(phys({ map: noiseTex('head', '#d3cec7', .06), roughness: .93, envMapIntensity: .3 }), 0xbbb4aa),
    throw: std({ map: noiseTex('thr', '#8e8a85', .08), roughness: .97 }),
    rug: std({ map: noiseTex('rug', '#a9a49d', .14), roughness: 1, envMapIntensity: .2 }),
    glass: std({ color: 0xd8e8f0, roughness: .03, metalness: .1, transparent: true, opacity: .14, depthWrite: false, envMapIntensity: 1.2 }),
    frame: std({ color: 0x2a2623, roughness: .38, metalness: .7 }),
    gold: std({ color: 0xd1a95e, roughness: .22, metalness: 1, envMapIntensity: 1.1 }),
    steel: std({ color: 0xb9b2aa, roughness: .3, metalness: 1, envMapIntensity: .9 }),
    black: std({ color: 0x0e0e10, roughness: .08, metalness: .2, envMapIntensity: 1 }),
    ceramic: phys({ color: 0xf5f5f3, roughness: .1, clearcoat: 1, clearcoatRoughness: .05, envMapIntensity: .9 }),
    mirror: std({ color: 0xc9d0d4, roughness: .05, metalness: 1, envMapIntensity: 1 }),
    leaf: std({ color: 0x3f5f36, roughness: .75 }), leaf2: std({ color: 0x55773f, roughness: .75 }), pot: std({ color: 0x2b2a2c, roughness: .5, metalness: .2 }),
    lampOn: new THREE.MeshStandardMaterial({ color: 0xfff1d6, emissive: 0xffd9a0, emissiveIntensity: 1.1, roughness: .6 }),
    down: new THREE.MeshBasicMaterial({ color: 0xfff3dc }),
    led: new THREE.MeshBasicMaterial({ color: 0xffe0aa }),
    cove: new THREE.MeshBasicMaterial({ map: glowTex(), transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, opacity: .55, toneMapped: false }),
    tv: std({ color: 0x050506, roughness: .05, metalness: .3, envMapIntensity: 1.1 }),
    door: tm(phys(Object.assign({ map: RT.walnut, roughness: .4, clearcoat: .4, clearcoatRoughness: .2 }, nrm('walnut', .5))), 1.0),
    sheer: std({ color: 0xf3eee6, roughness: .95, transparent: true, opacity: .74, side: THREE.DoubleSide, envMapIntensity: .2 }),
    drape: sheen(phys({ map: noiseTex('drp', '#6e665e', .06), roughness: .95, side: THREE.DoubleSide, envMapIntensity: .2 }), 0x9b9186),
  };
  return M;
}
let STY = {};                                   // per-home finishes, as in that home's renders
const STYLES = { S: { kLow: 'walnut', kUp: 'walnut' }, 1: { kLow: 'lacquer', kUp: 'gloss' }, 2: { kLow: 'walnut', kUp: 'walnut' } };

/* ---- geometry helpers ---- */
function uvWorld(geo, sx, sz) {           // planar UVs in metres for floor/ceiling pieces
  const p = geo.attributes.position, uv = geo.attributes.uv;
  for (let i = 0; i < p.count; i++) uv.setXY(i, p.getX(i) / sx, p.getZ(i) / sz);
  uv.needsUpdate = true;
}
function box(w, h, d, mat, x, y, z, round) {
  const g = round && THREE.RoundedBoxGeometry ? new THREE.RoundedBoxGeometry(w, h, d, 3, Math.min(round, w / 2, h / 2, d / 2)) : new THREE.BoxGeometry(w, h, d);
  if (mat.map) {                         // keep texture scale in metres
    const s = mat.userData.tm || 1, uv = g.attributes.uv, n = g.attributes.normal;
    for (let i = 0; i < uv.count; i++) {
      const ax = Math.abs(n.getX(i)), ay = Math.abs(n.getY(i));
      const sw = ax > .5 ? d : w, sh = ay > .5 ? d : h;
      uv.setXY(i, uv.getX(i) * sw / s, uv.getY(i) * sh / s);
    }
  }
  const m = new THREE.Mesh(g, mat); m.position.set(x, y, z); m.castShadow = m.receiveShadow = true; return m;
}
function wallBox(w, h, d, x, y, z) {      // vertex colours darken the wall near the floor and the ceiling, like ambient occlusion
  const g = new THREE.BoxGeometry(w, h, d, 1, Math.max(2, Math.round(h / .12)), 1), p = g.attributes.position, c = new Float32Array(p.count * 3);
  for (let i = 0; i < p.count; i++) { const wy = y + p.getY(i), v = 1 - .24 * Math.exp(-wy / .22) - .14 * Math.exp(-(CH - wy) / .22); c[i * 3] = c[i * 3 + 1] = c[i * 3 + 2] = v; }
  g.setAttribute('color', new THREE.BufferAttribute(c, 3));
  const m = new THREE.Mesh(g, M.wall); m.position.set(x, y, z); m.castShadow = m.receiveShadow = true; return m;
}
function cyl(rt, rb, h, mat, x, y, z, seg) { const m = new THREE.Mesh(new THREE.CylinderGeometry(rt, rb, h, seg || 32), mat); m.position.set(x, y, z); m.castShadow = m.receiveShadow = true; return m; }

/* ---- collision grid ---- */
function makeGrid(x0, z0, x1, z1) { const w = Math.ceil((x1 - x0) / CELL) + 2, h = Math.ceil((z1 - z0) / CELL) + 2; return { x0: x0 - CELL, z0: z0 - CELL, w, h, a: new Uint8Array(w * h) }; }
function gridRect(x0, z0, x1, z1, v) {
  const i0 = Math.max(0, Math.floor((x0 - grid.x0) / CELL)), i1 = Math.min(grid.w - 1, Math.floor((x1 - grid.x0) / CELL));
  const j0 = Math.max(0, Math.floor((z0 - grid.z0) / CELL)), j1 = Math.min(grid.h - 1, Math.floor((z1 - grid.z0) / CELL));
  for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) grid.a[j * grid.w + i] = v;
}
let wallA = null;
function markWall(x0, z0, x1, z1) {
  const i0 = Math.max(0, Math.floor((x0 - grid.x0) / CELL)), i1 = Math.min(grid.w - 1, Math.floor((x1 - grid.x0) / CELL));
  const j0 = Math.max(0, Math.floor((z0 - grid.z0) / CELL)), j1 = Math.min(grid.h - 1, Math.floor((z1 - grid.z0) / CELL));
  for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) wallA[j * grid.w + i] = 1;
}
function isWall(x, z) { const i = Math.floor((x - grid.x0) / CELL), j = Math.floor((z - grid.z0) / CELL); return i >= 0 && j >= 0 && i < grid.w && j < grid.h && wallA[j * grid.w + i] === 1; }
function cellAt(x, z) { const i = Math.floor((x - grid.x0) / CELL), j = Math.floor((z - grid.z0) / CELL); if (i < 0 || j < 0 || i >= grid.w || j >= grid.h) return 1; return grid.a[j * grid.w + i]; }
const RING = Array.from({ length: 12 }, (_, i) => [Math.cos(i / 12 * Math.PI * 2), Math.sin(i / 12 * Math.PI * 2)]);
function blocked(x, z) { if (cellAt(x, z) !== 2) return true; for (const [c, s] of RING) if (cellAt(x + c * RAD, z + s * RAD) === 1) return true; return false; }
// cell values: 0 = outside the home, 1 = solid, 2 = walkable floor

/* ---------------- build a home from the plan ---------------- */
function buildFromPlan(k, D) {
  M = mats(); STY = STYLES[k] || STYLES[1];
  const A = D[k], s = A.mpp, cx = A.w / 2, cy = A.h / 2;
  const X = px => (px - cx) * s, Z = py => (py - cy) * s;
  const g = new THREE.Group(); floors = [];
  grid = makeGrid(X(0), Z(0), X(A.w), Z(A.h)); wallA = new Uint8Array(grid.w * grid.h);
  const FMAT = { marble: M.mfloor, kitchen: M.mfloor, oak: M.oak, bath: M.stone, balcony: M.balc };
  // floors and ceilings
  for (const [name, list] of Object.entries(A.floor)) {
    const mat = FMAT[name] || M.mfloor, ts = mat.userData.tm || 1;
    for (const [x0, y0, x1, y1] of list) {
      const w = (x1 - x0) * s, d = (y1 - y0) * s, geo = new THREE.PlaneGeometry(w, d); geo.rotateX(-Math.PI / 2); geo.translate(X(x0) + w / 2, 0, Z(y0) + d / 2);
      uvWorld(geo, ts, ts);
      const f = new THREE.Mesh(geo, mat); f.receiveShadow = true; g.add(f); floors.push(f);
      const cg = new THREE.PlaneGeometry(w, d); cg.rotateX(Math.PI / 2); cg.translate(X(x0) + w / 2, CH, Z(y0) + d / 2);
      const c = new THREE.Mesh(cg, M.ceil); c.receiveShadow = true; g.add(c);
      gridRect(X(x0), Z(y0), X(x1), Z(y1), 2);
    }
  }
  // walls, with a skirting board for contact shading
  for (const [x0, y0, x1, y1] of A.walls) {
    const w = (x1 - x0) * s, d = (y1 - y0) * s, x = X(x0) + w / 2, z = Z(y0) + d / 2;
    g.add(wallBox(w, CH, d, x, CH / 2, z));
    g.add(box(w + .02, .09, d + .02, M.skirt, x, .045, z));
    gridRect(X(x0), Z(y0), X(x1), Z(y1), 1); markWall(X(x0), Z(y0), X(x1), Z(y1));
  }
  for (const [x0, y0, x1, y1] of A.lintels) {
    const w = (x1 - x0) * s, d = (y1 - y0) * s; g.add(wallBox(w, CH - 2.15, d, X(x0) + w / 2, (CH + 2.15) / 2, Z(y0) + d / 2));
  }
  // openings
  for (const [kind, list] of Object.entries(A.open)) for (const [x0, y0, x1, y1] of list) {
    const w = (x1 - x0) * s, d = (y1 - y0) * s, x = X(x0) + w / 2, z = Z(y0) + d / 2, alongX = w >= d, L = alongX ? w : d, T = alongX ? d : w;
    const piece = (a0, a1, y0_, y1_, mat, thick) => {          // a slab along the opening, from a0 to a1 metres
      const len = a1 - a0, mid = -L / 2 + a0 + len / 2, t = thick || T, bw = alongX ? len : t, bd = alongX ? t : len, px = x + (alongX ? mid : 0), pz = z + (alongX ? 0 : mid);
      return mat === M.wall ? wallBox(bw, y1_ - y0_, bd, px, (y0_ + y1_) / 2, pz) : box(bw, y1_ - y0_, bd, mat, px, (y0_ + y1_) / 2, pz);
    };
    if (kind === 'g' || kind === 'gd') {
      const open = kind === 'gd' ? Math.min(.95, L * .4) : 0, gl = L - open;
      g.add(piece(0, L, 2.55, CH, M.wall));
      g.add(piece(0, gl, 0, 2.55, M.glass, .02));
      const n = Math.max(1, Math.round(gl / 1.1));
      for (let i = 0; i <= n; i++) { const a = i * gl / n; g.add(piece(Math.max(0, a - .025), Math.min(L, a + .025), 0, 2.55, M.frame, .06)); }
      g.add(piece(0, L, 2.52, 2.56, M.frame, .07)); g.add(piece(0, L, 0, .03, M.frame, .07));
      if (open) { const sl = piece(Math.max(0, gl - .9), gl, 0, 2.55, M.glass, .02); sl.position[alongX ? 'z' : 'x'] += .07; g.add(sl); }   // the open slider, parked behind
      const inward = alongX ? Math.sign(cy - (y0 + y1) / 2) || 1 : Math.sign(cx - (x0 + x1) / 2) || 1;
      const cw = Math.min(.36, L * .15);
      for (const [a0, a1, mat, off] of [[0, cw, M.drape, .2], [L - cw, L, M.drape, .2], [cw, cw * 1.9, M.sheer, .13], [L - cw * 1.9, L - cw, M.sheer, .13]]) {
        const cu = piece(a0, a1, .02, SOF - .04, mat, .08); cu.position[alongX ? 'z' : 'x'] += inward * off; cu.castShadow = mat === M.drape; g.add(cu);
        const fo = Math.max(2, Math.round((a1 - a0) / .08)); for (let f = 0; f < fo; f++) { const fl = piece(a0 + (f + .15) * (a1 - a0) / fo, a0 + (f + .6) * (a1 - a0) / fo, .02, SOF - .04, mat, .13); fl.position[alongX ? 'z' : 'x'] += inward * off; fl.castShadow = false; g.add(fl); }
      }
      const rail = piece(0, L, SOF - .04, SOF - .01, M.frame, .03); rail.position[alongX ? 'z' : 'x'] += inward * .17; g.add(rail);
      const g0 = alongX ? [X(x0), Z(y0) - .02, X(x0) + gl, Z(y1) + .02] : [X(x0) - .02, Z(y0), X(x1) + .02, Z(y0) + gl];
      gridRect(g0[0], g0[1], g0[2], g0[3], 1);
      if (open) { const o = alongX ? [X(x0) + gl, Z(y0), X(x1), Z(y1)] : [X(x0), Z(y0) + gl, X(x1), Z(y1)]; gridRect(o[0], o[1], o[2], o[3], 2); }
    } else if (kind === 's') {
      g.add(piece(0, L, 0, .9, M.wall)); g.add(piece(0, L, 2.15, CH, M.wall)); g.add(piece(0, L, .9, 2.15, M.glass, .02));
      g.add(piece(0, L, .88, .92, M.frame, T + .04));
      gridRect(X(x0), Z(y0), X(x1), Z(y1), 1);
    } else if (kind === 'p') {
      g.add(piece(0, L, 0, 1.05, M.glass, .02)); g.add(piece(0, L, 1.03, 1.08, M.frame, .06)); g.add(piece(0, L, 0, .06, M.frame, .08));
      gridRect(X(x0) - .02, Z(y0) - .02, X(x1) + .02, Z(y1) + .02, 1);
    } else if (kind === 'd') {
      g.add(piece(0, L, 2.15, CH, M.wall)); g.add(piece(.02, L - .02, 0, 2.13, M.door, .05));
      g.add(piece(L - .16, L - .1, 1.01, 1.04, M.gold, .1));
      gridRect(X(x0), Z(y0), X(x1), Z(y1), 1);
    }
  }
  // furniture
  const placed = [];
  for (const f of A.furn) {
    const [type, x0, y0, x1, y1, face] = f;
    const W = (x1 - x0) * s, Dp = (y1 - y0) * s, x = X(x0) + W / 2, z = Z(y0) + Dp / 2;
    const rot = { n: 0, e: -Math.PI / 2, s: Math.PI, w: Math.PI / 2 }[face || 'n'];
    const side = face === 'e' || face === 'w';
    const o = FURN[type] ? FURN[type](side ? Dp : W, side ? W : Dp) : null;
    if (!o) continue;
    o.position.set(x, 0, z); o.rotation.y = rot; g.add(o);
    placed.push({ type, x, z, w: side ? Dp : W, d: side ? W : Dp, rot });
    if (type === 'counter') {                    // a splashback only where the counter stands against a wall
      const bxv = -Math.sin(rot), bzv = -Math.cos(rot), dd = (side ? W : Dp) / 2; let wall = false;
      for (let t = dd - .05; t < dd + .2; t += CELL / 2) if (isWall(x + bxv * t, z + bzv * t)) { wall = true; break; }
      if (!wall) { const sp = o.getObjectByName('splash'); if (sp) o.remove(sp); }
    }
    if (!NOCOLLIDE.has(type)) { const ins = Math.min(.06, W / 4, Dp / 4); gridRect(X(x0) + ins, Z(y0) + ins, X(x1) - ins, Z(y1) - ins, 1); }
  }
  // feature walls as in the renders: marble behind the TV, walnut with gold strips behind the bed
  for (const p of placed) {
    if (p.type !== 'tvunit' && p.type !== 'bed') continue;
    const back = { x: -Math.sin(p.rot), z: -Math.cos(p.rot) };        // local -z (the back) in world space
    let dist = null; for (let t = p.d / 2; t < p.d / 2 + .8; t += CELL / 2) if (isWall(p.x + back.x * t, p.z + back.z * t)) { dist = t; break; }
    if (dist == null) continue;
    const ax = { x: Math.cos(p.rot), z: -Math.sin(p.rot) };            // along the wall
    const want = p.type === 'bed' ? p.w + 1.5 : p.w + .9, half = want / 2;
    const reach = sgn => { let a = 0; while (a < half && isWall(p.x + back.x * (dist + .06) + ax.x * sgn * (a + .05), p.z + back.z * (dist + .06) + ax.z * sgn * (a + .05))) a += CELL; return a; };
    const l = reach(-1), r = reach(1), width = l + r; if (width < .8) continue;
    const mid = (r - l) / 2, cxw = p.x + back.x * (dist - .012) + ax.x * mid, czw = p.z + back.z * (dist - .012) + ax.z * mid;
    const panel = new THREE.Group(); panel.position.set(cxw, 0, czw); panel.rotation.y = p.rot;
    const top = SOF - .01, mat = p.type === 'bed' ? M.walnut : M.marble;
    panel.add(box(width, top, .02, mat, 0, top / 2, 0));
    const n = p.type === 'bed' ? 4 : 2;
    for (let i = 1; i <= n; i++) { const xx = -width / 2 + i * width / (n + 1) * (p.type === 'bed' ? 1 : 1); if (p.type === 'tvunit' && Math.abs(xx) < .9) continue; panel.add(box(.012, top, .03, M.gold, xx, top / 2, .006)); }
    if (p.type === 'tvunit') { panel.add(box(.012, top, .03, M.gold, -width / 2 + .25, top / 2, .006)); panel.add(box(.012, top, .03, M.gold, width / 2 - .25, top / 2, .006)); }
    g.add(panel);
  }
  // bathrooms: marble on every wall, the floor in grey stone
  for (const [bx0, by0, bx1, by1] of A.baths) {
    const x0 = X(bx0), z0 = Z(by0), x1 = X(bx1), z1 = Z(by1);
    const edges = [[x0, z0, x1, z0, 0, -1], [x0, z1, x1, z1, 0, 1], [x0, z0, x0, z1, -1, 0], [x1, z0, x1, z1, 1, 0]];
    for (const [ax0, az0, ax1, az1, nx, nz] of edges) {
      const L = Math.hypot(ax1 - ax0, az1 - az0), dx = (ax1 - ax0) / L, dz = (az1 - az0) / L; let run = null;
      const flush = (a) => { if (run == null) return; const len = a - run; if (len > .15) { const mx = ax0 + dx * (run + len / 2) - nx * .01, mz = az0 + dz * (run + len / 2) - nz * .01;
        g.add(box(Math.abs(dx) * len + Math.abs(nx) * .015, CH - .02, Math.abs(dz) * len + Math.abs(nz) * .015, M.marble, mx, (CH - .02) / 2, mz)); } run = null; };
      for (let a = 0; a <= L; a += CELL) { const wx = ax0 + dx * a + nx * .09, wz = az0 + dz * a + nz * .09; const w = isWall(wx, wz) || isWall(wx + nx * .06, wz + nz * .06);
        if (w && run == null) run = a; else if (!w) flush(a); }
      flush(L);
    }
  }
  // tray ceilings: a lowered border with a hidden warm LED cove, downlights in the border
  const trays = [];
  for (const [tx0, ty0, tx1, ty1] of A.trays) {
    const x0 = X(tx0), z0 = Z(ty0), x1 = X(tx1), z1 = Z(ty1), b = .42, h = CH - SOF;
    const W = x1 - x0, Dd = z1 - z0; trays.push([x0, z0, x1, z1]);
    for (const [cxp, czp, ww, dd] of [[(x0 + x1) / 2, z0 + b / 2, W, b], [(x0 + x1) / 2, z1 - b / 2, W, b], [x0 + b / 2, (z0 + z1) / 2, b, Dd - 2 * b], [x1 - b / 2, (z0 + z1) / 2, b, Dd - 2 * b]]) {
      const so = box(ww, h, dd, M.ceil, cxp, SOF + h / 2, czp); so.castShadow = false; g.add(so);
    }
    const iw = W - 2 * b, id = Dd - 2 * b;
    for (const [cxp, czp, ww, dd, rot] of [[(x0 + x1) / 2, z0 + b, iw, .32, 0], [(x0 + x1) / 2, z1 - b, iw, .32, Math.PI], [x0 + b, (z0 + z1) / 2, id, .32, Math.PI / 2], [x1 - b, (z0 + z1) / 2, id, .32, -Math.PI / 2]]) {
      const pg = new THREE.PlaneGeometry(ww, dd); pg.rotateX(Math.PI / 2); pg.translate(0, 0, dd / 2);
      const pm = new THREE.Mesh(pg, M.cove); pm.position.set(cxp, CH - .004, czp); pm.rotation.y = rot; pm.renderOrder = 2; g.add(pm);
      const strip = box(rot === 0 || rot === Math.PI ? ww : .015, .012, rot === 0 || rot === Math.PI ? .015 : ww, M.led, cxp, SOF + .02 + .006, czp); strip.castShadow = false; g.add(strip);
    }
    const per = 2 * (W + Dd), n = Math.max(4, Math.round(per / 1.3));
    for (let i = 0; i < n; i++) { let t = (i + .5) / n * per, px, pz;
      if (t < W) { px = x0 + t; pz = z0 + b / 2; } else if ((t -= W) < Dd) { px = x1 - b / 2; pz = z0 + t; } else if ((t -= Dd) < W) { px = x1 - t; pz = z1 - b / 2; } else { t -= W; px = x0 + b / 2; pz = z1 - t; }
      const dl = cyl(.035, .035, .01, M.down, px, SOF - .004, pz, 16); dl.castShadow = false; g.add(dl); }
    const L = new THREE.PointLight(0xffcf94, 1.0, 8, 2); L.position.set((x0 + x1) / 2, SOF - .3, (z0 + z1) / 2); g.add(L);
  }
  // downlights elsewhere (halls, kitchens, bathrooms) and a warm light per room without a tray
  const inTray = (x, z) => trays.some(([a, b2, c, d]) => x > a && x < c && z > b2 && z < d);
  for (const [name, list] of Object.entries(A.floor)) for (const [x0, y0, x1, y1] of list) {
    const w = (x1 - x0) * s, d = (y1 - y0) * s; if (w < .6 || d < .6 || name === 'balcony') continue;
    const nx = Math.max(1, Math.round(w / 1.5)), nz = Math.max(1, Math.round(d / 1.5));
    for (let i = 0; i < nx; i++) for (let j = 0; j < nz; j++) {
      const lx = X(x0) + (i + .5) * w / nx, lz = Z(y0) + (j + .5) * d / nz; if (inTray(lx, lz)) continue;
      const dl = cyl(.035, .035, .01, M.down, lx, CH - .004, lz, 16); dl.castShadow = false; g.add(dl);
    }
  }
  for (const r of A.rooms) { const rx = X(r[1]), rz = Z(r[2]); if (inTray(rx, rz)) continue;
    const L = new THREE.PointLight(0xffcf94, .85, 6.5, 2); L.position.set(rx, CH - .35, rz); g.add(L); }
  // gold ring pendants over the dining tables
  for (const p of placed) if (p.type === 'dtable') {
    const pend = new THREE.Group(); pend.position.set(p.x, 0, p.z);
    for (const [r, y] of [[.42, 2.02], [.3, 2.14], [.18, 2.24]]) {
      const ring = new THREE.Mesh(new THREE.TorusGeometry(r, .012, 10, 64), M.gold); ring.rotation.x = Math.PI / 2; ring.position.y = y; pend.add(ring);
      const glow = new THREE.Mesh(new THREE.TorusGeometry(r, .006, 6, 64), M.led); glow.rotation.x = Math.PI / 2; glow.position.y = y - .012; pend.add(glow);
    }
    for (let i = 0; i < 3; i++) { const a = i / 3 * Math.PI * 2; pend.add(cyl(.003, .003, CH - 2.02, M.gold, Math.cos(a) * .42, (CH + 2.02) / 2, Math.sin(a) * .42, 6)); }
    const pl = new THREE.PointLight(0xffd8a8, .7, 4, 2); pl.position.y = 1.9; pend.add(pl);
    g.add(pend);
  }
  // sun through the main glazing
  const gl = [...(A.open.g || []), ...(A.open.gd || [])];
  let ox = 0, oz = -1;
  if (gl.length) { let sx = 0, sz = 0; for (const [x0, y0, x1, y1] of gl) { sx += (x0 + x1) / 2 - cx; sz += (y0 + y1) / 2 - cy; } const l = Math.hypot(sx, sz) || 1; ox = sx / l; oz = sz / l; }
  const span = Math.max(A.w, A.h) * s;
  sun.position.set(ox * span * 1.2 + span * .35, span * 1.1, oz * span * 1.2 + span * .2); sun.target.position.set(0, 0, 0);
  const sc = sun.shadow.camera; sc.left = sc.bottom = -span * .8; sc.right = sc.top = span * .8; sc.near = .5; sc.far = span * 4; sc.updateProjectionMatrix();
  g.traverse(o => { if (o.isMesh && o.material === M.glass) { o.castShadow = false; } });
  const rooms = A.rooms.map(r => ({ n: r[0], x: X(r[1]), z: Z(r[2]), yaw: -r[3] * Math.PI / 180 }));
  const sp = A.spawn;
  return { group: g, rooms, spawn: { x: X(sp[0]), z: Z(sp[1]), yaw: -sp[2] * Math.PI / 180 },
    map: { img: { S: 'img/plan-studio.jpg', 1: 'img/plan-1bed.jpg', 2: 'img/plan-2bed.jpg' }[k], toPx: (x, z) => [x / s + cx, z / s + cy], toW: (px, py) => [X(px), Z(py)], w: A.w, h: A.h } };
}

/* ---- furniture, built in a local frame: width along x, depth along z, back at -z ---- */
const NOCOLLIDE = new Set(['rug', 'hob', 'sink', 'uppers']);
function grp(...items) { const g = new THREE.Group(); for (const i of items) if (i) g.add(i); return g; }
const FURN = {
  rug: (w, d) => { const m = box(w, .012, d, M.rug, 0, .006, 0); m.castShadow = false; return grp(m); },
  sofa: (w, d) => sofa(w, d, true, 0, M.fabric), sofaseg: (w, d) => sofa(w, d, false, 0, M.fabric),
  armchair: (w, d) => sofa(w, d, true, 1, M.fabric2),
  bchair: (w, d) => grp(box(w * .9, .36, d * .9, M.walnut, 0, .18, 0, .03), box(w * .82, .1, d * .78, M.linen, 0, .41, .02, .04), box(w * .82, .42, .12, M.linen, 0, .62, -d * .4 + .06, .05)),
  chair: (w, d) => { const g = grp(box(w * .9, .08, d * .8, M.head, 0, .47, .02, .03), box(w * .9, .45, .07, M.head, 0, .74, -d * .37, .03));
    for (const [a, b] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) g.add(box(.022, .44, .022, M.gold, a * w * .38, .22, b * d * .32)); return g; },
  dchair: (w, d) => grp(cyl(.2, .24, .03, M.gold, 0, .02, 0), cyl(.022, .022, .38, M.gold, 0, .24, 0), box(w * .9, .1, d * .85, M.fabric2, 0, .47, 0, .04), box(w * .9, .42, .07, M.fabric2, 0, .76, -d * .4, .03)),
  ctable: (w, d) => grp(box(w, .035, d, M.marble, 0, .41, 0, .008), box(w * .78, .36, d * .78, M.gold, 0, .2, 0, .005), box(w * .74, .37, d * .74, M.black, 0, .2, 0, .005)),
  rtable: (w, d) => { const r = Math.min(w, d) / 2; return grp(cyl(r, r, .035, M.marble, 0, .47, 0, 48), cyl(.035, .035, .45, M.gold, 0, .23, 0), cyl(r * .55, r * .6, .02, M.gold, 0, .01, 0, 32)); },
  dtable: (w, d) => { const g = grp(box(w, .04, d, M.marble, 0, .755, 0, .01)); for (const [a, b] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) g.add(box(.035, .73, .035, M.gold, a * (w / 2 - .1), .365, b * (d / 2 - .1))); return g; },
  tvunit: (w, d) => { const tw = Math.min(w * .85, 1.65), dd = Math.max(d, .4); return grp(box(w, .36, dd, M.walnut, 0, .38, 0, .006), box(w * .97, .01, .02, M.led, 0, .195, dd / 2 - .04),
    box(tw, tw * .56, .04, M.tv, 0, 1.3, -d / 2 + .05, .01)); },
  sideboard: (w, d) => grp(box(w, .6, d, M.walnut, 0, .36, 0, .006), box(w, .02, d, M.marble, 0, .67, 0), box(.02, .5, .01, M.gold, 0, .36, d / 2 + .003)),
  console: (w, d) => grp(box(w, .03, d, M.marble, 0, .8, 0), box(w * .96, .76, d * .9, M.walnut, 0, .39, 0, .006)),
  dresser: (w, d) => grp(box(w, .82, d, M.walnut, 0, .41, 0, .006), box(w * .92, .012, .02, M.gold, 0, .6, d / 2), box(w * .92, .012, .02, M.gold, 0, .32, d / 2)),
  shelf: (w, d) => grp(box(w, .46, d, M.walnut, 0, .23, 0, .006), box(w * .94, .3, d * .1, M.black, 0, .24, d * .46)),
  bed: (w, d) => {
    const g = grp(box(w, .3, d - .06, M.head, 0, .17, .03, .04), box(w * .96, .24, d * .88, M.linen, 0, .42, .06, .06),
      box(w * .99, .1, d * .64, M.linen, 0, .56, d * .17, .05), box(w * 1.0, .05, d * .2, M.throw, 0, .62, d * .34, .02));
    const hb = box(w + .1, 1.25, .12, M.head, 0, .63, -d / 2 + .06, .03); g.add(hb);
    const nb = Math.max(3, Math.round(w / .4)); for (let i = 1; i < nb; i++) g.add(box(.012, 1.0, .02, M.fabric2, -w / 2 - .05 + i * (w + .1) / nb, .72, -d / 2 + .125));
    const n = w > 1.5 ? 2 : 1;
    for (let i = 0; i < n; i++) { const px = (i - (n - 1) / 2) * w / n; g.add(box(w / n * .78, .17, .36, M.linen, px, .64, -d / 2 + .3, .07)); g.add(box(w / n * .55, .3, .12, M.fabric2, px, .7, -d / 2 + .5, .05)); }
    for (const sx of [-1, 1]) g.add(box(.04, .12, .04, M.gold, sx * (w / 2 - .1), .03, d / 2 - .12));
    return g;
  },
  nstand: (w, d) => grp(box(w, .5, d, M.black, 0, .28, 0, .006), box(w * .9, .01, .02, M.gold, 0, .4, d / 2 + .002), box(w * .9, .01, .02, M.gold, 0, .2, d / 2 + .002),
    cyl(.045, .06, .26, M.gold, 0, .66, 0, 20), box(.3, .2, .22, M.lampOn, 0, .87, 0, .01)),
  flamp: (w, d) => grp(cyl(.14, .16, .03, M.black, 0, .015, 0), cyl(.015, .015, 1.55, M.gold, 0, .79, 0, 12), cyl(.16, .22, .26, M.lampOn, 0, 1.55, 0, 28)),
  desk: (w, d) => grp(box(w, .035, d, M.walnut, 0, .75, 0, .006), box(.025, .74, d * .9, M.gold, -w / 2 + .04, .37, 0), box(.025, .74, d * .9, M.gold, w / 2 - .04, .37, 0)),
  wardrobe: (w, d) => { const g = grp(box(w, SOF - .02, d, M.walnut, 0, (SOF - .02) / 2, 0, .006)); const n = Math.max(1, Math.round(w / .5));
    for (let i = 1; i < n; i++) g.add(box(.006, SOF - .1, .01, M.black, -w / 2 + i * w / n, SOF / 2, d / 2 + .001));
    for (let i = 0; i < n; i++) g.add(box(.012, .6, .02, M.gold, -w / 2 + (i + .5) * w / n + (i % 2 ? -.07 : .07), 1.15, d / 2 + .01)); return g; },
  counter: (w, d) => grp(box(w, .78, d - .04, M[STY.kLow], 0, .48, -.02, .004), box(w, .09, d - .1, M.black, 0, .045, -.05), box(w, .035, d, M.marble, 0, .885, 0, .004),
    Object.assign(box(w, .56, .012, M.splash, 0, 1.19, -d / 2 + .006), { name: 'splash' })),
  uppers: (w, d) => { const dd = Math.min(d, .36); return grp(box(w, .72, dd, M[STY.kUp], 0, 1.86, -d / 2 + dd / 2, .004), box(w * .98, .01, .02, M.led, 0, 1.495, -d / 2 + dd - .03)); },
  fridge: (w, d) => grp(box(w, 1.95, d, M.steel, 0, .975, 0, .01), box(.02, .7, .03, M.black, w * .35, 1.3, d / 2)),
  appliance: (w, d) => grp(box(w, .86, d, M.steel, 0, .43, 0, .01), box(w * .7, .5, .01, M.black, 0, .45, d / 2 + .002)),
  hob: (w, d) => grp(box(w, .008, d, M.black, 0, .907, 0)),
  sink: (w, d) => grp(box(w, .006, d, M.steel, 0, .906, 0), cyl(.012, .012, .3, M.black, 0, 1.05, -d / 2 + .03, 12), box(.02, .02, .18, M.black, 0, 1.19, -d / 2 + .11)),
  tub: (w, d) => grp(box(w, .56, d, M.ceramic, 0, .28, 0, Math.min(w, d) * .25), box(w * .84, .04, d * .8, new THREE.MeshStandardMaterial({ color: 0xdfe6ea, roughness: .1 }), 0, .55, 0, Math.min(w, d) * .2)),
  toilet: (w, d) => grp(box(w * .9, .38, d * .8, M.ceramic, 0, .4, d * .1, .12), box(w * .95, .55, .1, M.marble, 0, .6, -d / 2 + .05, .01)),
  vanity: (w, d) => grp(box(w, .38, d, M.walnut, 0, .62, 0, .006), box(w, .04, d, M.marble, 0, .83, 0), box(Math.min(w * .6, .5), .12, d * .6, M.ceramic, 0, .91, .02, .05),
    box(w * .9, .9, .02, M.mirror, 0, 1.55, -d / 2 + .03), box(w * .94, .94, .01, M.led, 0, 1.55, -d / 2 + .018), box(w * .98, .012, .03, M.led, 0, .43, d / 2 - .03)),
  sglass: (w, d) => grp(box(w, 2.0, d, M.glass, 0, 1.0, 0), box(w, .03, d, M.black, 0, 2.0, 0)),
  plant: (w, d) => {
    const r = Math.min(w, d) / 2, g = grp(cyl(r * .62, r * .5, .42, M.pot, 0, .21, 0, 28)); const rr = rng(Math.round(w * 1000));
    for (let i = 0; i < 9; i++) { const sph = new THREE.Mesh(new THREE.IcosahedronGeometry(r * (.35 + rr() * .3), 1), i % 2 ? M.leaf : M.leaf2);
      sph.position.set((rr() - .5) * r, .55 + rr() * .55, (rr() - .5) * r); sph.scale.y = 1.2; sph.castShadow = true; g.add(sph); }
    return g;
  },
};
function sofa(w, d, arms, single, F) {
  const g = new THREE.Group(), ah = .62, aw = arms ? .16 : 0;
  g.add(box(w, .36, d, F, 0, .2, 0, .04));
  g.add(box(w, .5, .2, F, 0, .55, -d / 2 + .1, .06));
  if (arms) { g.add(box(aw, ah, d, F, -w / 2 + aw / 2, ah / 2, 0, .06)); g.add(box(aw, ah, d, F, w / 2 - aw / 2, ah / 2, 0, .06)); }
  const inner = w - aw * 2, n = single ? 1 : Math.max(1, Math.round(inner / .75));
  for (let i = 0; i < n; i++) {
    const cxp = -inner / 2 + (i + .5) * inner / n;
    g.add(box(inner / n - .02, .13, d - .26, F, cxp, .44, .08, .05));
    g.add(box(inner / n - .04, .42, .14, F, cxp, .66, -d / 2 + .24, .06));
  }
  if (!single && inner > 1.2) { g.add(box(.36, .34, .1, M.fabric2, -inner / 2 + .3, .66, -d / 2 + .34, .05)); g.add(box(.36, .34, .1, M.fabric2, inner / 2 - .3, .66, -d / 2 + .34, .05)); }
  g.add(box(.05, .06, .05, M.gold, -w / 2 + .1, .03, -d / 2 + .1)); g.add(box(.05, .06, .05, M.gold, w / 2 - .1, .03, d / 2 - .1));
  return g;
}

/* ---------------- the studio's model (.glb) ---------------- */
async function buildFromGLB(k, cfg, prog) {
  await loadGLTFLibs();
  const loader = new THREE.GLTFLoader();
  const draco = new THREE.DRACOLoader(); draco.setDecoderPath(LIB + 'draco/'); loader.setDRACOLoader(draco);
  if (window.MeshoptDecoder) loader.setMeshoptDecoder(window.MeshoptDecoder);
  const gltf = await new Promise((res, rej) => loader.load(cfg.url, res, e => e.total && prog(e.loaded / e.total), rej));
  const g = gltf.scene;
  if (cfg.scale) g.scale.setScalar(cfg.scale);
  g.updateMatrixWorld(true);
  let bb = new THREE.Box3().setFromObject(g);
  const size = bb.getSize(new THREE.Vector3());
  if (!cfg.scale && Math.max(size.x, size.z) > 80) { g.scale.setScalar(Math.max(size.x, size.z) > 800 ? .001 : .01); g.updateMatrixWorld(true); bb = new THREE.Box3().setFromObject(g); }
  const c = bb.getCenter(new THREE.Vector3()); g.position.x -= c.x; g.position.z -= c.z; g.position.y -= bb.min.y; g.updateMatrixWorld(true);
  bb = new THREE.Box3().setFromObject(g);
  floors = [];
  g.traverse(o => { if (o.isMesh) { o.castShadow = o.receiveShadow = true; floors.push(o); if (o.material && 'envMapIntensity' in o.material) o.material.envMapIntensity = .6; } });
  // collision: anything between knee and head height blocks; open floor is walkable
  grid = makeGrid(bb.min.x, bb.min.z, bb.max.x, bb.max.z);
  const floorY = cfg.floorY != null ? cfg.floorY : 0, v = new THREE.Vector3(), tri = [new THREE.Vector3(), new THREE.Vector3(), new THREE.Vector3()];
  const ray = new THREE.Raycaster(), down = new THREE.Vector3(0, -1, 0);
  for (let j = 0; j < grid.h; j += 2) for (let i = 0; i < grid.w; i += 2) {   // floor where a downward ray lands near floor height
    const x = grid.x0 + (i + 1) * CELL, z = grid.z0 + (j + 1) * CELL; ray.set(new THREE.Vector3(x, floorY + 2.2, z), down); ray.far = 2.6;
    const hit = ray.intersectObject(g, true)[0];
    if (hit && Math.abs(hit.point.y - floorY) < .12) for (let a = 0; a < 2; a++) for (let b = 0; b < 2; b++) if (i + a < grid.w && j + b < grid.h) grid.a[(j + b) * grid.w + i + a] = 2;
  }
  g.traverse(o => {
    if (!o.isMesh) return; const p = o.geometry.attributes.position, idx = o.geometry.index, n = idx ? idx.count : p.count;
    for (let t = 0; t < n; t += 3) {
      for (let q = 0; q < 3; q++) tri[q].fromBufferAttribute(p, idx ? idx.getX(t + q) : t + q).applyMatrix4(o.matrixWorld);
      const ymin = Math.min(tri[0].y, tri[1].y, tri[2].y), ymax = Math.max(tri[0].y, tri[1].y, tri[2].y);
      if (ymax < floorY + .25 || ymin > floorY + 1.8) continue;
      const x0 = Math.min(tri[0].x, tri[1].x, tri[2].x), x1 = Math.max(tri[0].x, tri[1].x, tri[2].x), z0 = Math.min(tri[0].z, tri[1].z, tri[2].z), z1 = Math.max(tri[0].z, tri[1].z, tri[2].z);
      if ((x1 - x0) * (z1 - z0) > 4) continue;            // big slanted planes (ceilings) are not obstacles
      gridRect(x0, z0, x1, z1, 1);
    }
  });
  const span = Math.max(size.x, size.z);
  sun.position.set(span, span * 1.1, span * .4); const sc = sun.shadow.camera; sc.left = sc.bottom = -span; sc.right = sc.top = span; sc.far = span * 4; sc.updateProjectionMatrix();
  let spawn = cfg.spawn ? { x: cfg.spawn[0], z: cfg.spawn[1], yaw: -cfg.spawn[2] * Math.PI / 180 } : null;
  if (!spawn) { let best = null; for (let j = 0; j < grid.h; j += 4) for (let i = 0; i < grid.w; i += 4) { const x = grid.x0 + i * CELL, z = grid.z0 + j * CELL; if (!blocked(x, z)) { const d = Math.hypot(x, z); if (!best || d < best.d) best = { x, z, d }; } } spawn = best ? { x: best.x, z: best.z, yaw: 0 } : { x: 0, z: 0, yaw: 0 }; }
  const rooms = (cfg.rooms || []).map(r => ({ n: r[0], x: r[1], z: r[2], yaw: -r[3] * Math.PI / 180 }));
  return { group: g, rooms, spawn, map: cfg.map || null };
}

/* ---------------- input ---------------- */
const ptrs = new Map(); let drag = null, joy = null;
function bindInput() {
  canvas.addEventListener('pointerdown', e => {
    if (e.button > 0) return; canvas.setPointerCapture(e.pointerId); ptrs.set(e.pointerId, { x: e.clientX, y: e.clientY, sx: e.clientX, sy: e.clientY, t: performance.now() });
    drag = { moved: false }; canvas.classList.add('drag'); hideHelp();
  });
  canvas.addEventListener('pointermove', e => {
    const p = ptrs.get(e.pointerId);
    if (!p) { if (e.pointerType === 'mouse') hover(e); return; }
    const dx = e.clientX - p.x, dy = e.clientY - p.y; p.x = e.clientX; p.y = e.clientY;
    if (Math.hypot(e.clientX - p.sx, e.clientY - p.sy) > 5) drag.moved = true;
    if (drag.moved) { const k = (touch ? .0062 : .0048) * (P.fov / 72); P.ty += dx * k; P.tp = Math.max(-1.25, Math.min(1.2, P.tp + dy * k)); marker.visible = false; }
  });
  const up = e => {
    const p = ptrs.get(e.pointerId); ptrs.delete(e.pointerId); canvas.classList.remove('drag');
    if (p && drag && !drag.moved && performance.now() - p.t < 450) clickFloor(e);
  };
  canvas.addEventListener('pointerup', up); canvas.addEventListener('pointercancel', e => { ptrs.delete(e.pointerId); canvas.classList.remove('drag'); });
  canvas.addEventListener('pointerleave', () => { if (!ptrs.size) marker.visible = false; });
  canvas.addEventListener('wheel', e => { e.preventDefault(); P.tfov = Math.max(42, Math.min(82, P.tfov + e.deltaY * .03)); }, { passive: false });
  addEventListener('keydown', e => {
    if (!running || e.target.closest && e.target.closest('input,textarea')) return;
    if (e.key === 'Escape') { opts && opts.onBack && opts.onBack(); return; }
    const k = e.key.toLowerCase();
    if (['w', 'a', 's', 'd', 'arrowup', 'arrowdown', 'arrowleft', 'arrowright', 'shift', 'q', 'e'].includes(k)) {
      if (k.startsWith('arrow') && document.activeElement && document.activeElement.closest && document.activeElement.closest('#wRooms')) return;
      keys.add(k); auto = null; hideHelp(); if (k.startsWith('arrow')) e.preventDefault();
    }
  });
  addEventListener('keyup', e => keys.delete(e.key.toLowerCase()));
  addEventListener('blur', () => keys.clear());
  const J = ui.wJoy, knob = J.querySelector('i');
  J.addEventListener('pointerdown', e => { J.setPointerCapture(e.pointerId); joy = { id: e.pointerId, x: 0, y: 0 }; auto = null; hideHelp(); moveJoy(e); });
  J.addEventListener('pointermove', e => { if (joy && joy.id === e.pointerId) moveJoy(e); });
  const jend = () => { joy = null; knob.style.transform = ''; };
  J.addEventListener('pointerup', jend); J.addEventListener('pointercancel', jend);
  function moveJoy(e) {
    const r = J.getBoundingClientRect(), R = r.width / 2; let x = (e.clientX - r.left - R) / R, y = (e.clientY - r.top - R) / R; const l = Math.hypot(x, y); if (l > 1) { x /= l; y /= l; }
    joy.x = x; joy.y = y; knob.style.transform = `translate(${x * R * .6}px,${y * R * .6}px)`;
  }
  ui.wMap.addEventListener('click', e => {
    if (!cur || !cur.map) return; const r = ui.wMap.getBoundingClientRect();
    const [x, z] = cur.map.toW((e.clientX - r.left) / r.width * cur.map.w, (e.clientY - r.top) / r.height * cur.map.h);
    const s = nearestFree(x, z); if (s) jump(s.x, s.z, null);
  });
  ui.wRooms.addEventListener('click', e => {
    const b = e.target.closest('button'); if (!b) return;
    if (b.classList.contains('back')) { opts && opts.onBack && opts.onBack(); return; }
    const r = cur.rooms[+b.dataset.r]; if (r) { const v = bestView(r.x, r.z, r.yaw); if (v) { jump(v.x, v.z, v.yaw); roomI = +b.dataset.r; ui.wRooms.querySelectorAll('[data-r]').forEach(q => q.setAttribute('aria-pressed', q === b)); } }
  });
  ui.wErrB.addEventListener('click', () => opts && opts.onBack && opts.onBack());
}
let rc = null;
function floorHit(e) {
  if (!rc) rc = new THREE.Raycaster();
  const r = canvas.getBoundingClientRect(); rc.setFromCamera({ x: (e.clientX - r.left) / r.width * 2 - 1, y: -(e.clientY - r.top) / r.height * 2 + 1 }, camera);
  const h = rc.intersectObjects(home ? [home] : [], true)[0];
  if (!h || h.point.y > .15) return null;
  return h.point;
}
let hoverT = 0;
function hover(e) {
  const now = performance.now(); if (now - hoverT < 40) return; hoverT = now;
  const p = floorHit(e); if (p && cellAt(p.x, p.z) === 2) { marker.position.set(p.x, .012, p.z); marker.visible = true; } else marker.visible = false;
}
function clickFloor(e) {
  const p = floorHit(e); if (!p) return; const s = nearestFree(p.x, p.z); if (!s) return;
  auto = { x: s.x, z: s.z, t: 0, stuck: 0 }; marker.position.set(s.x, .012, s.z); marker.visible = true; hideHelp();
}
function nearestFree(x, z) {
  if (!blocked(x, z)) return { x, z };
  for (let r = CELL; r < 1.2; r += CELL) for (let a = 0; a < 16; a++) { const nx = x + Math.cos(a / 16 * 6.283) * r, nz = z + Math.sin(a / 16 * 6.283) * r; if (!blocked(nx, nz)) return { x: nx, z: nz }; }
  return null;
}
function freeDist(x, z, dx, dz, max) { let d = 0; while (d < max) { d += .08; if (blocked(x + dx * d, z + dz * d)) return d - .08; } return max; }
function bestView(x, z, pref) {             // face the way the plan intends (within 50 degrees), toward the most open view, and stand back
  const s = nearestFree(x, z); if (!s) return null;
  let best = null;
  for (let i = 0; i < 48; i++) { const a = (pref != null ? pref - .42 + i / 47 * .84 : i / 48 * Math.PI * 2), dx = -Math.sin(a), dz = -Math.cos(a);
    let sc = 0; for (const o of [-.25, 0, .25]) sc += Math.min(5, freeDist(s.x, s.z, -Math.sin(a + o), -Math.cos(a + o), 9));
    if (pref != null) { let dd = a - pref; dd = Math.atan2(Math.sin(dd), Math.cos(dd)); sc -= Math.abs(dd) * 4; }
    if (!best || sc > best.sc) best = { a, sc, dx, dz }; }
  const back = Math.min(.8, freeDist(s.x, s.z, -best.dx, -best.dz, 3) - .3);
  return { x: s.x - best.dx * Math.max(0, back), z: s.z - best.dz * Math.max(0, back), yaw: best.a };
}
function jump(x, z, yaw) {
  auto = null; jumpAt = { x, z, t: performance.now() }; ui.wFade.style.opacity = 1;
  setTimeout(() => { P.x = x; P.z = z; P.vx = P.vz = 0; if (yaw != null) { P.yaw = P.ty = yaw; P.pitch = P.tp = -.13; } ui.wFade.style.opacity = 0; }, reduce ? 0 : 280);
}
let helpT = null;
function hideHelp() { ui.wHelp.classList.add('off'); }

/* ---------------- frame loop ---------------- */
function resize() { if (!renderer) return; const w = innerWidth, h = innerHeight; renderer.setSize(w, h, false); camera.aspect = w / h; P.tfov = P.fov = w < h ? 78 : 72; camera.updateProjectionMatrix(); }
function step(now) {
  if (!running) return;
  requestAnimationFrame(step);
  const dt = Math.min(.05, (now - last) / 1000 || .016); last = now;
  // turn with arrows / Q E
  const turn = (keys.has('arrowleft') || keys.has('q') ? 1 : 0) - (keys.has('arrowright') || keys.has('e') ? 1 : 0);
  if (turn) P.ty += turn * dt * 1.7;
  let fwd = (keys.has('w') || keys.has('arrowup') ? 1 : 0) - (keys.has('s') || keys.has('arrowdown') ? 1 : 0);
  let str = (keys.has('d') ? 1 : 0) - (keys.has('a') ? 1 : 0);
  if (joy) { fwd = -joy.y; str = joy.x; }
  const speed = keys.has('shift') ? 2.6 : 1.5;
  const sy = Math.sin(P.yaw), cyw = Math.cos(P.yaw);
  let wx = (-sy * fwd + cyw * str) * speed, wz = (-cyw * fwd - sy * str) * speed;
  if (auto) {
    const dx = auto.x - P.x, dz = auto.z - P.z, l = Math.hypot(dx, dz);
    if (l < .08) { auto = null; marker.visible = false; }
    else { const v = Math.min(1.5, l * 2.2 + .25); wx = dx / l * v; wz = dz / l * v;
      const want = Math.atan2(-dx, -dz); let dy = want - P.ty; dy = Math.atan2(Math.sin(dy), Math.cos(dy)); if (l > .6) P.ty += dy * Math.min(1, dt * 1.6); }
  }
  const a = 1 - Math.exp(-dt * 9); P.vx += (wx - P.vx) * a; P.vz += (wz - P.vz) * a;
  const ox = P.x, oz = P.z;
  let nx = P.x + P.vx * dt, nz = P.z + P.vz * dt;
  if (!blocked(nx, nz)) { P.x = nx; P.z = nz; }
  else if (!blocked(nx, P.z)) { P.x = nx; P.vz *= .5; }
  else if (!blocked(P.x, nz)) { P.z = nz; P.vx *= .5; }
  else { P.vx = P.vz = 0; }
  if (auto) { const moved = Math.hypot(P.x - ox, P.z - oz); auto.stuck = moved < .002 ? auto.stuck + dt : 0; if (auto.stuck > .35) { auto = null; marker.visible = false; } }
  const b = 1 - Math.exp(-dt * 12); P.yaw += (P.ty - P.yaw) * b; P.pitch += (P.tp - P.pitch) * b; P.fov += (P.tfov - P.fov) * b;
  camera.fov = P.fov; camera.updateProjectionMatrix();
  camera.position.set(P.x, EYE, P.z);
  camera.rotation.set(P.pitch, P.yaw, 0, 'YXZ');
  if (marker.visible) marker.material.opacity = .55 + Math.sin(now * .006) * .2;
  updateMap(); updateRoom();
  renderer.render(scene, camera);
}
let mapT = 0;
function updateMap() {
  if (!cur || !cur.map) return; const now = performance.now(); if (now - mapT < 60) return; mapT = now;
  const [px, py] = cur.map.toPx(P.x, P.z), W = cur.map.w, H = cur.map.h;
  const sx = 1000 / W, sy = 1000 / H, X = px * sx, Y = py * sy;
  ui.wDot.setAttribute('cx', X); ui.wDot.setAttribute('cy', Y);
  const hf = Math.atan(Math.tan(THREE.MathUtils.degToRad(P.fov / 2)) * camera.aspect), L = Math.max(W, H) * .16;
  const pt = a => `${X + -Math.sin(a) * L * sx},${Y + -Math.cos(a) * L * sy}`;
  ui.wCone.setAttribute('d', `M${X},${Y}L${pt(P.yaw + hf)}L${pt(P.yaw - hf)}Z`);
}
let roomI = -1, jumpAt = null;
function updateRoom() {
  if (!cur || !cur.rooms.length) return; if (jumpAt && (performance.now() - jumpAt.t < 900 || Math.hypot(P.x - jumpAt.x, P.z - jumpAt.z) < 1.0)) return; jumpAt = null; let bi = 0, bd = 1e9;
  cur.rooms.forEach((r, i) => { const d = Math.hypot(r.x - P.x, r.z - P.z); if (d < bd) { bd = d; bi = i; } });
  if (bi !== roomI) { roomI = bi; ui.wRooms.querySelectorAll('[data-r]').forEach(b => b.setAttribute('aria-pressed', +b.dataset.r === bi)); }
}

/* reflections: a 360 degree snapshot taken inside the apartment, so marble, glass and metal reflect the real rooms */
let envRT = null, pmrem = null;
function captureEnv() {
  if (!cur || !cur.rooms.length) return;
  if (!pmrem) pmrem = new THREE.PMREMGenerator(renderer);
  const r = cur.rooms[0], s = nearestFree(r.x, r.z) || r;
  const rt = new THREE.WebGLCubeRenderTarget(256, { generateMipmaps: true, minFilter: THREE.LinearMipmapLinearFilter });
  const cc = new THREE.CubeCamera(.05, 300, rt); cc.position.set(s.x, 1.45, s.z);
  const mv = marker.visible; marker.visible = false; scene.add(cc); cc.update(renderer, scene); scene.remove(cc); marker.visible = mv;
  if (envRT) envRT.dispose();
  envRT = pmrem.fromCubemap(rt.texture); rt.dispose();
  scene.environment = envRT.texture;
}
/* ---------------- public ---------------- */
function disposeHome() {
  if (!home) return; scene.remove(home);
  home.traverse(o => { if (o.geometry) o.geometry.dispose(); });
  home = null;
}
async function open(o) {
  opts = o; buildDOM();
  ui.wK.textContent = o.kicker || ''; ui.wH.textContent = o.title || 'Home'; ui.wS.textContent = o.sub || '';
  ui.wWa.href = o.wa || '#'; ui.wErr.style.display = 'none';
  ui.wLoad.classList.remove('off'); ui.wLoadB.style.width = '8%'; ui.wHelp.classList.remove('off');
  root.classList.add('open'); document.body.style.overflow = 'hidden';
  try {
    await load(); ui.wLoadB.style.width = '35%';
    if (!renderer) init();
    resize();
    const cfg = MODELS[o.type];
    disposeHome();
    if (cfg) { ui.wLoadT.textContent = 'Loading the 3D model'; cur = await buildFromGLB(o.type, cfg, f => ui.wLoadB.style.width = (35 + f * 60) + '%'); ui.wNote.textContent = cfg.note || ''; }
    else { const D = await loadData(); await loadRenderTextures(); scene.environment = envTex; ui.wLoadB.style.width = '70%'; await new Promise(r => setTimeout(r, 30)); cur = buildFromPlan(o.type, D);
      ui.wNote.textContent = 'Built to scale from Rockhill’s floor plan. Finishes and furniture are indicative.'; }
    home = cur.group; scene.add(home);
    captureEnv();
    ui.wRooms.innerHTML = cur.rooms.map((r, i) => `<button data-r="${i}" aria-pressed="false">${r.n}</button>`).join('') + '<button class="back">Back to the tower</button>';
    roomI = -1;
    if (cur.map) { ui.wMap.style.display = ''; ui.wMapImg.src = cur.map.img; ui.wMap.style.aspectRatio = cur.map.w + '/' + cur.map.h; } else ui.wMap.style.display = 'none';
    P.x = cur.spawn.x; P.z = cur.spawn.z; P.yaw = P.ty = cur.spawn.yaw; P.pitch = P.tp = -.06; P.vx = P.vz = 0; auto = null; keys.clear();
    renderer.compile(scene, camera);
    ui.wLoadB.style.width = '100%';
    if (!running) { running = true; last = performance.now(); requestAnimationFrame(step); }
    await new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)));
    ui.wLoad.classList.add('off');
    clearTimeout(helpT); helpT = setTimeout(hideHelp, 6500);
    canvas.focus({ preventScroll: true });
  } catch (err) {
    console.error(err); ui.wErr.style.display = 'block'; ui.wLoad.classList.add('off');
  }
}
function close() {
  running = false; keys.clear(); auto = null; joy = null;
  if (root) root.classList.remove('open');
  document.body.style.overflow = '';
}
window.RHWalk = { preload: () => Promise.all([load(), loadData()]), open, close, isOpen: () => running, _debug: () => ({ scene, home, grid, P }) };
})();
