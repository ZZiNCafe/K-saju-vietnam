// Live2DBackend — real Cubism SDK for Web integration.
//
// This file bundles NO Live2D model and no Cubism Core binary — both are
// license-gated. What it DOES contain is a real integration against:
//   - The Cubism Web Framework, vendored as a compiled build of Live2D's
//     own public source at public/assets/live2d/vendor/cubism-framework/
//     (see the NOTICE.md there for exactly what was compiled and how).
//   - The official Cubism Core runtime, lazy-loaded at runtime from
//     Live2D's own CDN (https://cubism.live2d.com/sdk-web/cubismcore/
//     live2dcubismcore.min.js) — never bundled, never cached in this repo.
//
// Availability is gated through manifest.json rather than probing
// ksaju.model3.json directly: a browser logs a console error for ANY
// failed resource load (fetch/script/img alike), even one the JS handles
// gracefully — so directly probing a file that doesn't exist yet (the
// default state, with no real model shipped) would fail this project's
// "console errors == 0" bar on every single page load. manifest.json is
// checked into the repo and always exists, so reading it never 404s; it is
// the explicit switch a real Live2D integration flips on. Until it says
// modelReady:true (and the model that then points at actually loads),
// init() resolves false and CharacterEngine falls back to the sprite
// renderer automatically. This never blocks first paint: the manifest
// fetch, Core script load, and model load are all off the critical path.

const MANIFEST_URL = 'public/assets/live2d/ksaju/manifest.json';
const CORE_SRC = 'https://cubism.live2d.com/sdk-web/cubismcore/live2dcubismcore.min.js';
const MODEL_DIR = 'public/assets/live2d/ksaju/';
// Fetch()-style paths above resolve relative to the page URL (index.html,
// at the repo root) — fine as plain relative strings. Dynamic import()
// specifiers below resolve relative to *this module's own* URL
// (src/live2d/Live2DBackend.js) instead, so they need the extra `../../`
// to reach the same public/assets/live2d/vendor/cubism-framework/ dir.
const FRAMEWORK_DIR = 'public/assets/live2d/vendor/cubism-framework/';
const FRAMEWORK_IMPORT_DIR = '../../' + FRAMEWORK_DIR;
const SHADER_DIR = FRAMEWORK_DIR + 'Shaders/WebGL/';

let coreLoadPromise = null;
let frameworkModulesPromise = null;
let frameworkStarted = false;

function loadScriptOnce(src) {
  return new Promise((resolve, reject) => {
    if (document.querySelector('script[data-src="' + src + '"]')) {
      resolve();
      return;
    }
    const s = document.createElement('script');
    s.src = src;
    s.async = true;
    s.crossOrigin = 'anonymous';
    s.dataset.src = src;
    s.onload = () => resolve();
    s.onerror = () => reject(new Error('failed to load ' + src));
    document.head.appendChild(s);
  });
}

function loadFrameworkModules() {
  if (!frameworkModulesPromise) {
    frameworkModulesPromise = Promise.all([
      import(/* webpackIgnore: true */ FRAMEWORK_IMPORT_DIR + 'live2dcubismframework.js'),
      import(/* webpackIgnore: true */ FRAMEWORK_IMPORT_DIR + 'cubismdefaultparameterid.js'),
      import(/* webpackIgnore: true */ FRAMEWORK_IMPORT_DIR + 'cubismmodelsettingjson.js'),
      import(/* webpackIgnore: true */ FRAMEWORK_IMPORT_DIR + 'model/cubismusermodel.js'),
      import(/* webpackIgnore: true */ FRAMEWORK_IMPORT_DIR + 'math/cubismmatrix44.js'),
    ]).then(([fw, paramIds, settingJson, userModel, matrix]) => ({
      CubismFramework: fw.CubismFramework,
      Option: fw.Option,
      LogLevel: fw.LogLevel,
      CubismDefaultParameterId: paramIds.CubismDefaultParameterId,
      CubismModelSettingJson: settingJson.CubismModelSettingJson,
      CubismUserModel: userModel.CubismUserModel,
      CubismMatrix44: matrix.CubismMatrix44,
    }));
  }
  return frameworkModulesPromise;
}

function fetchArrayBuffer(url) {
  return fetch(url).then((r) => {
    if (!r.ok) throw new Error('http ' + r.status + ' for ' + url);
    return r.arrayBuffer();
  });
}

// Compatibility shim, discovered by testing this integration end-to-end
// against a real sample model: the vendored Framework build (5-r.5) calls
// Live2DCubismCore.Version.csmGetMocVersion(mocBytes) with one argument
// (see model/cubismmoc.js in the vendored build), but the Core actually
// served today from Live2D's CDN implements
// csmGetMocVersion(moc, mocBytes) — two arguments, throwing when called
// the first way. CubismMoc._mocVersion (the only consumer of this call) is
// purely informational — nothing in the render/update path reads it — so
// on the old 1-argument call shape this falls back to reporting the
// latest known moc version rather than letting model loading crash.
function patchCoreMocVersionCompat() {
  try {
    const core = window.Live2DCubismCore;
    if (!core || !core.Version || typeof core.Version.csmGetMocVersion !== 'function') return;
    const original = core.Version.csmGetMocVersion;
    if (original.__ksajuCompatWrapped) return;
    const wrapped = function (a, b) {
      try {
        if (b === undefined) return core.Version.csmGetLatestMocVersion();
        return original.call(core.Version, a, b);
      } catch (e) {
        return core.Version.csmGetLatestMocVersion();
      }
    };
    wrapped.__ksajuCompatWrapped = true;
    core.Version.csmGetMocVersion = wrapped;
  } catch (e) {
    /* best-effort compatibility shim only */
  }
}

// Second compatibility shim, discovered the same way as the one above:
// vendored Framework 5-r.5 (this project's exact target — see NOTICE.md)
// reads a handful of Model fields that only exist on a Cubism-5.3-generation
// Core (its own CHANGELOG lists 5.3 additions like offscreen compositing
// and per-drawable blend-mode bytes), but the Core actually served today
// from the CDN (logged as "Cubism Core Version 5.1.0") predates that
// generation and doesn't populate them, so `new CubismModel(...)` crashes
// immediately. Every consumer in the Framework loops bounded by `.count` or
// treats 0/-1 as "none", so zero-length/zero-filled stubs are a faithful
// "this Core generation has none of these" representation, not guesses at
// real values:
//   - model.offscreens.*        (count, blendModes, opacities, masks, …)
//   - model.drawables.blendModes (per-drawable color/alpha blend byte pair)
//   - model.parts.offscreenIndices (per-part offscreen-layer assignment)
function patchCoreModelCompat() {
  try {
    const core = window.Live2DCubismCore;
    if (!core || !core.Model || typeof core.Model.fromMoc !== 'function') return;
    const original = core.Model.fromMoc;
    if (original.__ksajuCompatWrapped) return;
    const emptyOffscreens = () => ({
      count: 0,
      constantFlags: new Uint8Array(0),
      multiplyColors: new Float32Array(0),
      screenColors: new Float32Array(0),
      maskCounts: new Int32Array(0),
      masks: new Int32Array(0),
      blendModes: new Int32Array(0),
      ownerIndices: new Int32Array(0),
      opacities: new Float32Array(0),
    });
    const wrapped = function (moc) {
      const model = original.call(core.Model, moc);
      if (!model) return model;
      if (!model.offscreens) model.offscreens = emptyOffscreens();
      // Same Cubism-5.3-vs-5.1 gap as offscreens, on two more fields: a
      // per-drawable blend-mode byte pair (color blend in the low byte,
      // alpha blend in the high byte — see getDrawableColorBlend/
      // getDrawableAlphaBlend) and a per-part offscreen assignment. Zero
      // decodes to "Normal" blend for both channels (a safe default for a
      // Core generation that only had Normal/Additive/Multiply via
      // constantFlags bits), and -1 (NoOffscreenIndex) means "no offscreen
      // layer assigned" — both faithful defaults for a Core that predates
      // these fields, not guessed values.
      if (model.drawables && !model.drawables.blendModes) {
        model.drawables.blendModes = new Int32Array(model.drawables.count || 0);
      }
      if (model.parts && !model.parts.offscreenIndices) {
        model.parts.offscreenIndices = new Int32Array(model.parts.count || 0).fill(-1);
      }
      // getRenderOrders() (draw sequencing, needed by every draw call) is
      // also new in this Core generation. Falls back to drawable
      // definition order — moc3 files are typically authored back-to-front
      // already, so this is a reasonable default, not just "something that
      // doesn't crash"; it just can't reflect any *dynamic* reordering a
      // newer Core would compute.
      if (typeof model.getRenderOrders !== 'function') {
        model.getRenderOrders = function () {
          const count = (model.drawables && model.drawables.count) || 0;
          const orders = new Int32Array(count);
          for (let i = 0; i < count; i++) orders[i] = i;
          return orders;
        };
      }
      return model;
    };
    wrapped.__ksajuCompatWrapped = true;
    core.Model.fromMoc = wrapped;
  } catch (e) {
    /* best-effort compatibility shim only */
  }
}

// Third compatibility shim, same root cause as the two above: the vendored
// Framework's CubismColorBlend enum (model/cubismmodel.ts) is initialized
// from `Live2DCubismCore.ColorBlendType_Normal`,
// `Live2DCubismCore.ColorBlendType_AddGlow`, … — an entire family of
// named blend-mode constants that Cubism 5.3 Core exposes and this
// project's target Core generation (5.1.0, confirmed by scanning the
// fetched live2dcubismcore.min.js — it has zero `ColorBlendType_*`
// properties) does not. Every member evaluates to `undefined`, and
// `CubismShader_WebGL`'s constructor crashes trying to `.toString()` one
// of them during its own static setup — this runs unconditionally, before
// any drawable is even considered, so it can't be avoided by the
// blendModes stub above alone.
//
// This assigns distinct placeholder integers to every constant (not
// Live2D's real internal values, which this project has no way to know)
// with ColorBlendType_Normal pinned to 0 to match
// patchCoreModelCompat()'s zero-filled `drawables.blendModes` stub —
// together they make every drawable resolve to Normal blending, the
// correct behavior for a Core generation that never had per-drawable
// custom blend modes to begin with. The rest only need to be distinct
// integers so CubismShader_WebGL's own number->name lookup map stays
// internally consistent; nothing outside this shim ever reads them.
function patchCoreColorBlendConstantsCompat() {
  try {
    const core = window.Live2DCubismCore;
    if (!core) return;
    const names = [
      'ColorBlendType_Normal',
      'ColorBlendType_AddGlow',
      'ColorBlendType_Add',
      'ColorBlendType_Darken',
      'ColorBlendType_Multiply',
      'ColorBlendType_ColorBurn',
      'ColorBlendType_LinearBurn',
      'ColorBlendType_Lighten',
      'ColorBlendType_Screen',
      'ColorBlendType_ColorDodge',
      'ColorBlendType_Overlay',
      'ColorBlendType_SoftLight',
      'ColorBlendType_HardLight',
      'ColorBlendType_LinearLight',
      'ColorBlendType_Hue',
      'ColorBlendType_Color',
      'ColorBlendType_AddCompatible',
      'ColorBlendType_MultiplyCompatible',
    ];
    names.forEach((name, i) => {
      if (core[name] === undefined) core[name] = i; // Normal (index 0) -> 0
    });
  } catch (e) {
    /* best-effort compatibility shim only */
  }
}

function getWebGLContext(canvas) {
  const attrs = { alpha: true, premultipliedAlpha: true, antialias: true };
  return (
    canvas.getContext('webgl2', attrs) ||
    canvas.getContext('webgl', attrs) ||
    canvas.getContext('experimental-webgl', attrs) ||
    null
  );
}

// One loaded, drawable model. Subclasses CubismUserModel (from the real,
// vendored Framework) so all of loadModel/loadExpression/loadPhysics/
// loadMotion/createRenderer/getRenderer/getModel come from the actual SDK,
// not reimplemented here.
function createModelClass(CubismUserModel) {
  return class Live2DModel extends CubismUserModel {
    constructor() {
      super();
      this.modelHomeDir = '';
      this.modelSetting = null;
      this.motions = new Map();
      this.expressions = new Map();
      this.lookX = 0;
      this.lookY = 0;
      this.lipSyncValue = 0;
      this.paramIds = null; // {angleX, angleY, eyeBallX, eyeBallY, bodyAngleX, mouthOpenY}
    }

    async loadAssets(dir, fileName, { CubismModelSettingJson }) {
      this.modelHomeDir = dir;
      const settingBuf = await fetchArrayBuffer(dir + fileName);
      const setting = new CubismModelSettingJson(settingBuf, settingBuf.byteLength);
      this.modelSetting = setting;

      const modelFileName = setting.getModelFileName();
      if (!modelFileName) throw new Error('model3.json has no Model file reference');
      const mocBuf = await fetchArrayBuffer(dir + modelFileName);
      this.loadModel(mocBuf, false);
      if (!this.getModel()) throw new Error('failed to build model from .moc3');

      const expCount = setting.getExpressionCount();
      for (let i = 0; i < expCount; i++) {
        const name = setting.getExpressionName(i);
        const file = setting.getExpressionFileName(i);
        if (!file) continue;
        try {
          const buf = await fetchArrayBuffer(dir + file);
          const motion = this.loadExpression(buf, buf.byteLength, name);
          if (motion) this.expressions.set(name, motion);
        } catch (e) {
          console.warn('[Live2DBackend] expression "' + name + '" failed to load, skipping', e);
        }
      }

      const physicsFile = setting.getPhysicsFileName();
      if (physicsFile) {
        try {
          const buf = await fetchArrayBuffer(dir + physicsFile);
          this.loadPhysics(buf, buf.byteLength);
        } catch (e) {
          console.warn('[Live2DBackend] physics failed to load, skipping', e);
        }
      }

      // Every loaded motion needs its eye-blink/lip-sync target parameter
      // IDs wired up via setEffectIds() — CubismMotion.doUpdateParameters()
      // dereferences these unconditionally on every tick(), even for
      // motions/models that don't actually use automatic eye-blink or
      // lip-sync, and they default to null (not an empty array), so
      // skipping this crashes the very first frame.
      const eyeBlinkIds = [];
      for (let i = 0; i < setting.getEyeBlinkParameterCount(); i++) eyeBlinkIds.push(setting.getEyeBlinkParameterId(i));
      const lipSyncIds = [];
      for (let i = 0; i < setting.getLipSyncParameterCount(); i++) lipSyncIds.push(setting.getLipSyncParameterId(i));

      const groupCount = setting.getMotionGroupCount();
      for (let g = 0; g < groupCount; g++) {
        const group = setting.getMotionGroupName(g);
        const count = setting.getMotionCount(group);
        for (let i = 0; i < count; i++) {
          const file = setting.getMotionFileName(group, i);
          if (!file) continue;
          try {
            const buf = await fetchArrayBuffer(dir + file);
            const motion = this.loadMotion(buf, buf.byteLength, group + '_' + i, undefined, undefined, setting, group, i, false);
            if (motion) {
              motion.setEffectIds(eyeBlinkIds, lipSyncIds);
              this.motions.set(group + '_' + i, motion);
            }
          } catch (e) {
            console.warn('[Live2DBackend] motion "' + group + '#' + i + '" failed to load, skipping', e);
          }
        }
      }

      this.setInitialized(true);
      this.setUpdating(false);
    }

    setupGL(gl, width, height) {
      this.createRenderer(width, height);
      this.getRenderer().startUp(gl);
      this.getRenderer().setIsPremultipliedAlpha(true);
      this.getRenderer().loadShaders(SHADER_DIR);
    }

    // Loads every texture model3.json references and binds it into the
    // renderer's texture units. Without this the model still builds and
    // draws its real mesh geometry, just with no texture bound — every
    // drawable samples as solid black.
    loadTextures(gl) {
      const usePremultiply = true;
      const count = this.modelSetting.getTextureCount();
      const loads = [];
      for (let i = 0; i < count; i++) {
        const file = this.modelSetting.getTextureFileName(i);
        if (!file) continue;
        const url = this.modelHomeDir + file;
        const textureUnit = i;
        loads.push(
          new Promise((resolve) => {
            const img = new Image();
            img.onload = () => {
              try {
                const tex = gl.createTexture();
                gl.bindTexture(gl.TEXTURE_2D, tex);
                gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR_MIPMAP_LINEAR);
                gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
                if (usePremultiply) gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, 1);
                gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, img);
                gl.generateMipmap(gl.TEXTURE_2D);
                gl.bindTexture(gl.TEXTURE_2D, null);
                this.getRenderer().bindTexture(textureUnit, tex);
              } catch (e) {
                console.warn('[Live2DBackend] texture "' + url + '" failed to bind, skipping', e);
              }
              resolve();
            };
            img.onerror = () => {
              console.warn('[Live2DBackend] texture "' + url + '" failed to load, skipping');
              resolve();
            };
            img.src = url;
          })
        );
      }
      this.getRenderer().setIsPremultipliedAlpha(usePremultiply);
      return Promise.all(loads);
    }

    // Resolve {group,index} (CharacterStateController's motion hint) to a
    // loaded motion, falling back to motion index 0 in that group, then to
    // any loaded motion at all, so an unfamiliar model (whose motion group
    // names don't match our idle/happy/etc. defaults) still animates
    // instead of freezing on a T-pose.
    resolveMotion(motion) {
      if (!motion) return null;
      const exact = this.motions.get(motion.group + '_' + motion.index);
      if (exact) return exact;
      const first = this.motions.get(motion.group + '_0');
      if (first) return first;
      const any = this.motions.values().next();
      return any.done ? null : any.value;
    }

    playMotion(motion, priority) {
      const m = this.resolveMotion(motion);
      if (!m || !this._motionManager) return false;
      this._motionManager.startMotionPriority(m, false, priority == null ? 2 : priority);
      return true;
    }

    setExpressionByName(name) {
      const m = this.expressions.get(name);
      if (!m || !this._expressionManager) return false;
      this._expressionManager.startMotion(m, false);
      return true;
    }

    setLookTarget(x, y) {
      this.lookX = Math.max(-1, Math.min(1, x || 0));
      this.lookY = Math.max(-1, Math.min(1, y || 0));
    }

    setLipSyncValue(v) {
      this.lipSyncValue = Math.max(0, Math.min(1, v || 0));
    }

    // Keeps a motion always playing (idle by default) so the model never
    // sits frozen when nothing else is queued.
    ensureIdleMotion() {
      if (!this._motionManager || !this._motionManager.isFinished()) return;
      const idle = this.resolveMotion({ group: 'Idle', index: 0 }) || this.motions.values().next().value;
      if (idle) this._motionManager.startMotionPriority(idle, false, 1);
    }

    tick(deltaTimeSeconds) {
      if (!this.isInitialized || !this.getModel || !this.getModel()) return;
      const model = this.getModel();
      model.loadParameters();
      this.ensureIdleMotion();
      this._motionManager && this._motionManager.updateMotion(model, deltaTimeSeconds);
      model.saveParameters();
      if (this._expressionManager) this._expressionManager.updateMotion(model, deltaTimeSeconds);
      if (this._physics) this._physics.evaluate(model, deltaTimeSeconds);

      if (this.paramIds) {
        model.setParameterValueById(this.paramIds.angleX, this.lookX * 30);
        model.setParameterValueById(this.paramIds.angleY, this.lookY * 30);
        model.setParameterValueById(this.paramIds.bodyAngleX, this.lookX * 10);
        model.setParameterValueById(this.paramIds.eyeBallX, this.lookX);
        model.setParameterValueById(this.paramIds.eyeBallY, this.lookY);
        model.setParameterValueById(this.paramIds.mouthOpenY, this.lipSyncValue);
      }
      model.update();
    }

    draw(gl, canvas, projection) {
      if (!this.getModel || !this.getModel()) return;
      const matrix = this._cloneMatrix(projection);
      matrix.multiplyByMatrix(this.getModelMatrix());
      this.getRenderer().setMvpMatrix(matrix);
      this.getRenderer().setRenderState(gl.getParameter(gl.FRAMEBUFFER_BINDING), [0, 0, canvas.width, canvas.height]);
      this.getRenderer().drawModel(SHADER_DIR);
    }

    _cloneMatrix(src) {
      const CubismMatrix44 = Object.getPrototypeOf(src).constructor;
      const m = new CubismMatrix44();
      m.setMatrix(src.getArray().slice());
      return m;
    }
  };
}

export class Live2DBackend {
  constructor() {
    this.canvas = null;
    this.gl = null;
    this.model = null;
    this.mods = null;
    this.talking = false;
    this.lipSyncValue = 0;
    this.rafId = null;
    this.lastFrameTime = 0;
    this.resizeObserver = null;
    this.imgEl = null;
  }

  // Cheap, non-blocking check: does manifest.json (always present) say a
  // real model has been wired in?
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

  // Returns true only if a real Live2D model ended up rendering a frame.
  // Returns false (never throws) for every "not ready/failed" reason, so
  // callers can treat it as a plain fallback signal.
  async init(mountEl) {
    this.mountEl = mountEl;

    let available = false;
    try {
      available = await this.isAvailable();
    } catch (e) {
      available = false;
    }
    if (!available) return false;

    // Test real WebGL context creation up front, before spending a network
    // round-trip on Core/Framework — `'WebGLRenderingContext' in window`
    // alone is not a reliable signal, since some low-end/blocklisted
    // devices still expose the constructor but fail every getContext()
    // call (driver blocklist, 2D-only compositor, …).
    const probeCanvas = document.createElement('canvas');
    const gl = getWebGLContext(probeCanvas);
    if (!gl) {
      console.warn('[Live2DBackend] could not acquire a WebGL context (unsupported device/browser), falling back');
      return false;
    }

    let mods;
    try {
      if (!coreLoadPromise) coreLoadPromise = loadScriptOnce(CORE_SRC);
      await coreLoadPromise;
      if (!window.Live2DCubismCore) throw new Error('live2dcubismcore.min.js loaded but did not expose Live2DCubismCore');
      patchCoreMocVersionCompat();
      patchCoreModelCompat();
      patchCoreColorBlendConstantsCompat();
      mods = await loadFrameworkModules();
    } catch (e) {
      console.warn('[Live2DBackend] Cubism Core/Framework failed to load, falling back to sprite renderer', e);
      return false;
    }
    this.mods = mods;

    try {
      if (!frameworkStarted) {
        const ok = mods.CubismFramework.startUp(new mods.Option());
        if (!ok) throw new Error('CubismFramework.startUp returned false');
        mods.CubismFramework.initialize();
        frameworkStarted = true;
      }
    } catch (e) {
      console.warn('[Live2DBackend] CubismFramework.startUp/initialize failed, falling back', e);
      return false;
    }

    const canvas = probeCanvas;
    canvas.className = 'live2dCanvas';

    const ModelClass = createModelClass(mods.CubismUserModel);
    const model = new ModelClass();
    try {
      await model.loadAssets(MODEL_DIR, (await this._manifestModelPath()), mods);
    } catch (e) {
      console.warn('[Live2DBackend] model failed to load, falling back to sprite renderer', e);
      return false;
    }

    try {
      model.paramIds = this._resolveParamIds(mods);
      mountEl.appendChild(canvas);
      this.canvas = canvas;
      this.gl = gl;
      this.model = model;
      this._resize();
      model.setupGL(gl, canvas.width, canvas.height);
      await model.loadTextures(gl);
      this.resizeObserver = new ResizeObserver(() => this._resize());
      this.resizeObserver.observe(mountEl);
    } catch (e) {
      console.warn('[Live2DBackend] renderer setup failed, falling back', e);
      this.destroy();
      return false;
    }

    this.imgEl = document.getElementById('flowGuide');
    if (this.imgEl) this.imgEl.style.display = 'none';
    canvas.style.display = 'block';

    this._startLoop();
    return true;
  }

  async _manifestModelPath() {
    try {
      const res = await fetch(MANIFEST_URL);
      const manifest = await res.json();
      return manifest.modelPath || 'ksaju.model3.json';
    } catch (e) {
      return 'ksaju.model3.json';
    }
  }

  _resolveParamIds(mods) {
    const idManager = mods.CubismFramework.getIdManager();
    const P = mods.CubismDefaultParameterId;
    return {
      angleX: idManager.getId(P.ParamAngleX),
      angleY: idManager.getId(P.ParamAngleY),
      bodyAngleX: idManager.getId(P.ParamBodyAngleX),
      eyeBallX: idManager.getId(P.ParamEyeBallX),
      eyeBallY: idManager.getId(P.ParamEyeBallY),
      mouthOpenY: idManager.getId(P.ParamMouthOpenY),
    };
  }

  _resize() {
    if (!this.canvas || !this.mountEl) return;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const rect = this.mountEl.getBoundingClientRect();
    const w = Math.max(1, Math.round(rect.width * dpr));
    const h = Math.max(1, Math.round(rect.height * dpr));
    if (this.canvas.width !== w || this.canvas.height !== h) {
      this.canvas.width = w;
      this.canvas.height = h;
    }
    this.canvas.style.width = '100%';
    this.canvas.style.height = '100%';
    if (this.gl) this.gl.viewport(0, 0, this.canvas.width, this.canvas.height);
    if (this.model) this._buildProjection();
  }

  _buildProjection() {
    const CubismMatrix44 = this.mods.CubismMatrix44;
    const projection = new CubismMatrix44();
    projection.loadIdentity();
    const model = this.model.getModel();
    const canvas = this.canvas;
    if (model && canvas.width > 0 && canvas.height > 0) {
      const modelW = model.getCanvasWidth();
      const modelH = model.getCanvasHeight();
      const modelAspect = modelW / modelH;
      const canvasAspect = canvas.width / canvas.height;
      if (canvasAspect > modelAspect) {
        projection.scale(modelAspect / canvasAspect, 1.0);
      } else {
        projection.scale(1.0, canvasAspect / modelAspect);
      }
    }
    this.projection = projection;
  }

  _startLoop() {
    this.lastFrameTime = performance.now();
    const loop = (now) => {
      const dt = Math.min(0.1, (now - this.lastFrameTime) / 1000);
      this.lastFrameTime = now;
      if (this.model && this.gl) {
        try {
          this.model.tick(dt);
          const gl = this.gl;
          gl.clearColor(0, 0, 0, 0);
          gl.enable(gl.BLEND);
          gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
          gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
          if (!this.projection) this._buildProjection();
          this.model.draw(gl, this.canvas, this.projection);
        } catch (e) {
          console.error('[Live2DBackend] render loop error, stopping and falling back', e);
          this.destroy();
          return;
        }
      }
      this.rafId = requestAnimationFrame(loop);
    };
    this.rafId = requestAnimationFrame(loop);
  }

  async loadModel() {
    return !!this.model;
  }

  setExpression(expression) {
    if (this.model) this.model.setExpressionByName(expression);
  }

  playMotion(motion) {
    if (this.model) this.model.playMotion(motion);
  }

  lookAt(x, y) {
    if (this.model) this.model.setLookTarget(x, y);
  }

  setLipSync(value) {
    this.lipSyncValue = Math.max(0, Math.min(1, value || 0));
    if (this.model) this.model.setLipSyncValue(this.lipSyncValue);
  }

  startTalking() {
    this.talking = true;
  }

  stopTalking() {
    this.talking = false;
    this.setLipSync(0);
  }

  destroy() {
    if (this.rafId != null) cancelAnimationFrame(this.rafId);
    this.rafId = null;
    if (this.resizeObserver) this.resizeObserver.disconnect();
    this.resizeObserver = null;
    if (this.model && this.model.deleteRenderer) {
      try {
        this.model.deleteRenderer();
      } catch (e) {
        /* ignore */
      }
    }
    this.model = null;
    if (this.canvas && this.canvas.parentNode) this.canvas.parentNode.removeChild(this.canvas);
    this.canvas = null;
    this.gl = null;
    if (this.imgEl) this.imgEl.style.display = '';
  }
}

export function create() {
  return new Live2DBackend();
}

export { CORE_SRC, MANIFEST_URL, MODEL_DIR, FRAMEWORK_DIR };
