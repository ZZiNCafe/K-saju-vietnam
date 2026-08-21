// Live2DBackend — Cubism SDK for Web integration point. SCAFFOLD ONLY.
//
// This file does NOT bundle the Cubism Core runtime or any Live2D model,
// and never will as part of this repo: both are proprietary, license-gated
// downloads from Live2D Inc.'s official "Cubism SDK for Web" distribution,
// and must be added manually by whoever has agreed to that license:
//
//   Core:      public/assets/live2d/vendor/live2dcubismcore.min.js
//   Framework: the Cubism Web Framework sources from the same SDK zip
//              (not referenced by path here yet — see the integration
//              point below; this backend only loads the Core script today)
//   Model:     public/assets/live2d/ksaju/ksaju.model3.json (+ .moc3,
//              textures, motions, expressions — see the README in that
//              folder for the full expected file list)
//
// Until manifest.json says modelReady:true (and the model + Core it then
// points at actually load), every method here is a safe no-op and
// init()/isAvailable() resolve to false — CharacterEngine treats that as
// "use the sprite fallback" automatically. This never blocks first paint.
//
// Availability is gated through manifest.json rather than probing
// ksaju.model3.json directly: a browser logs a console error for ANY
// failed resource load (fetch/script/img alike), even one the JS handles
// gracefully — so directly probing a file that doesn't exist yet (the
// default state, with no real model shipped) would fail this project's
// "console errors == 0" bar on every single page load. manifest.json is
// checked into the repo and always exists, so reading it never 404s; it is
// the explicit switch a real Live2D integration flips on.

const MANIFEST_URL = 'public/assets/live2d/ksaju/manifest.json';
const CORE_SRC = 'public/assets/live2d/vendor/live2dcubismcore.min.js';
const MODEL_DIR = 'public/assets/live2d/ksaju/';

let coreLoadPromise = null;

function loadScriptOnce(src) {
  return new Promise((resolve, reject) => {
    if (document.querySelector('script[data-src="' + src + '"]')) {
      resolve();
      return;
    }
    const s = document.createElement('script');
    s.src = src;
    s.async = true;
    s.dataset.src = src;
    s.onload = () => resolve();
    s.onerror = () => reject(new Error('failed to load ' + src));
    document.head.appendChild(s);
  });
}

export class Live2DBackend {
  constructor() {
    this.canvas = null;
    this.model = null; // would hold the Cubism model instance once wired in
    this.talking = false;
    this.lipSyncValue = 0;
  }

  // Cheap, non-blocking check: does manifest.json (always present) say a
  // real model has been wired in, and if so, does that model file actually
  // exist? See the file-header comment for why this goes through the
  // manifest instead of probing ksaju.model3.json directly.
  async isAvailable() {
    let manifest;
    try {
      const res = await fetch(MANIFEST_URL);
      if (!res.ok) return false;
      manifest = await res.json();
    } catch (e) {
      return false;
    }
    if (!manifest || !manifest.modelReady) return false;
    const modelUrl = MODEL_DIR + (manifest.modelPath || 'ksaju.model3.json');
    return fetch(modelUrl, { method: 'HEAD' }).then((r) => r.ok).catch(() => false);
  }

  // Returns true only if a real Live2D model ended up rendering. Returns
  // false (never throws) for every "not ready yet" reason, so callers can
  // treat it as a plain fallback signal.
  async init(mountEl) {
    this.mountEl = mountEl;
    let available = false;
    try {
      available = await this.isAvailable();
    } catch (e) {
      available = false;
    }
    if (!available) return false;

    try {
      if (!coreLoadPromise) coreLoadPromise = loadScriptOnce(CORE_SRC);
      await coreLoadPromise;
    } catch (e) {
      console.warn('[Live2DBackend] Cubism Core failed to load, falling back to sprite renderer', e);
      return false;
    }

    if (!window.Live2DCubismCore) {
      console.warn('[Live2DBackend] live2dcubismcore.min.js loaded but did not expose Live2DCubismCore, falling back');
      return false;
    }

    // ---- INTEGRATION POINT ----
    // With the official Cubism SDK for Web fully present (Core + the
    // Cubism Web Framework — CubismFramework, CubismUserModel,
    // CubismModelSettingJson, CubismMotionManager, CubismEyeBlink, a WebGL
    // renderer, …), this is where a real backend implementation would:
    //   1. CubismFramework.startUp({ logFunction, loggingLevel }), then
    //      CubismFramework.initialize().
    //   2. Create a WebGL <canvas>, size it to mountEl, append it, and get
    //      a GL context (with alpha:true so it composites over the DOM
    //      fallback image cleanly during the swap).
    //   3. fetch(MODEL_JSON), parse via CubismModelSettingJson, then load
    //      every file it references (.moc3, textures, physics3.json,
    //      motion3.json per motion, exp3.json per expression).
    //   4. Build a CubismUserModel-derived model bound to the GL context,
    //      plus a requestAnimationFrame render loop calling
    //      model.update()/model.draw() each frame.
    //   5. Hide the sprite fallback's <img id="flowGuide"> once the first
    //      frame has rendered, so there's no double-draw.
    // None of that can run without the licensed Core binary + Framework
    // sources actually being present and load-bearing, so it is
    // deliberately not implemented here — this function keeps returning
    // false (not available) even after the Core script itself loads, until
    // a real model+framework integration replaces this block.
    console.info('[Live2DBackend] Cubism Core detected, but model rendering is not implemented yet (scaffold only) — using sprite fallback.');
    return false;
  }

  async loadModel() {
    return false;
  }

  setExpression(_expression) {
    // TODO once the framework is integrated:
    // this.model.expressionManager.setExpression(_expression)
  }

  playMotion(_motion) {
    // TODO once the framework is integrated:
    // this.model.motionManager.startMotion(_motion.group, _motion.index)
  }

  lookAt(_x, _y) {
    // TODO once the framework is integrated:
    // this.model.setParameterValue('ParamAngleX', _x*30)
    // this.model.setParameterValue('ParamAngleY', _y*30)
    // this.model.setParameterValue('ParamEyeBallX', _x)
    // this.model.setParameterValue('ParamEyeBallY', _y)
  }

  setLipSync(value) {
    this.lipSyncValue = Math.max(0, Math.min(1, value || 0));
    // TODO once the framework is integrated:
    // this.model.setParameterValue('ParamMouthOpenY', this.lipSyncValue)
  }

  startTalking() {
    this.talking = true;
  }

  stopTalking() {
    this.talking = false;
    this.lipSyncValue = 0;
  }

  destroy() {
    this.model = null;
    if (this.canvas && this.canvas.parentNode) this.canvas.parentNode.removeChild(this.canvas);
    this.canvas = null;
  }
}

export function create() {
  return new Live2DBackend();
}

export { CORE_SRC, MANIFEST_URL, MODEL_DIR };
