// CharacterEngine — the one thing flow code (in index.html) is allowed to
// talk to for anything character-related. It owns the decision of WHICH
// renderer is actually driving the character (Live2D if a real model is
// present and loads, otherwise the existing WebP sprite renderer) so that
// flow code never has to know or care which one is active.
//
// Public API (matches the spec this module was built against):
//   init()            -> Promise<'live2d'|'sprite-fallback'>
//   loadModel()       -> Promise<boolean>
//   setState(state)
//   setExpression(expression)
//   playMotion(motion)
//   lookAt(x, y)       // x,y expected roughly in [-1, 1]
//   setLipSync(value)  // 0..1
//   startTalking()
//   stopTalking()
//   destroy()
//
// States: idle | listening | thinking | talking | happy | surprise | serious

import { isValidState, resolve as resolveState } from './CharacterStateController.js';
import { create as createLive2DBackend } from './Live2DBackend.js';

const MOUNT_SELECTOR = '#charLayer';

// The fallback backend is a thin adapter over the existing, already-tested
// CharacterRenderer (WebP sprite swapper, defined inline in index.html and
// exposed as window.CharacterRenderer). Until a real Live2D model is ready,
// this backend shows a single static character image and nothing else —
// no fake CSS motion (translate/pulse/filter) standing in for real
// lookAt/lipSync. lookAt()/setLipSync()/startTalking()/stopTalking() are
// intentional no-ops here; they only do real work once the Live2D backend
// (a real Cubism model) is active.
function createSpriteFallback() {
  return {
    kind: 'sprite-fallback',
    async init() {
      if (!window.CharacterRenderer) return false;
      try {
        await window.CharacterRenderer.loadAssets();
      } catch (e) {
        // CharacterRenderer already falls back to the inline base image
        // per-state on its own load failures; nothing more to do here.
      }
      return true;
    },
    async loadModel() {
      return true;
    },
    setState(state) {
      if (window.CharacterRenderer) window.CharacterRenderer.setState(state);
    },
    setExpression() {
      // No separate expression channel in the sprite backend — the active
      // state IS the expression (see CharacterRenderer's per-state assets).
    },
    playMotion() {
      // No distinct one-shot motion channel either; setState() already
      // swaps to the state's dedicated static WebP image.
    },
    lookAt() {
      // No-op: a static fallback image has no gaze to redirect. Real
      // lookAt only happens once a Live2D model (ParamAngleX/ParamEyeBallX/Y)
      // is actually driving the character.
    },
    setLipSync() {
      // No-op: no fake mouth movement on the static fallback image. Real
      // lip sync only happens once a Live2D model (ParamMouthOpenY) is
      // actually driving the character.
    },
    startTalking() {
      // No-op: setState('talking') (called separately by index.html around
      // TTS start) already switches to the talking-state static image.
    },
    stopTalking() {
      // No-op.
    },
    destroy() {
      if (window.CharacterRenderer && window.CharacterRenderer.stop) window.CharacterRenderer.stop();
    },
  };
}

class CharacterEngine {
  constructor() {
    this.backend = null;
    this.backendKind = 'none';
    this.current = 'idle';
    this.ready = false;
    this._initPromise = null;
  }

  init() {
    if (this._initPromise) return this._initPromise;
    this._initPromise = this._doInit();
    return this._initPromise;
  }

  async _doInit() {
    const mountEl = document.querySelector(MOUNT_SELECTOR);
    const live2d = createLive2DBackend();
    let live2dOk = false;
    try {
      live2dOk = await live2d.init(mountEl);
    } catch (e) {
      console.warn('[CharacterEngine] Live2D backend threw during init, falling back', e);
      live2dOk = false;
    }
    if (live2dOk) {
      this.backend = live2d;
      this.backendKind = 'live2d';
    } else {
      const fallback = createSpriteFallback();
      const fallbackOk = await fallback.init().catch(() => false);
      if (!fallbackOk) console.warn('[CharacterEngine] sprite fallback init found no CharacterRenderer either — character will be static');
      this.backend = fallback;
      this.backendKind = 'sprite-fallback';
    }
    this.ready = true;
    // Re-apply whatever the flow already requested while we were loading,
    // so a slow Live2D probe never leaves the character stuck un-styled.
    this.setState(this.current);
    return this.backendKind;
  }

  async loadModel() {
    if (this.backend && this.backend.loadModel) return this.backend.loadModel();
    return false;
  }

  setState(state) {
    if (!isValidState(state)) return;
    this.current = state;
    if (!this.backend) return;
    if (this.backendKind === 'live2d') {
      const hint = resolveState(state);
      this.backend.playMotion(hint.motion);
      this.backend.setExpression(hint.expression);
    } else {
      this.backend.setState(state);
    }
  }

  setExpression(expression) {
    if (this.backend) this.backend.setExpression(expression);
  }

  playMotion(motion) {
    if (this.backend) this.backend.playMotion(motion);
  }

  lookAt(x, y) {
    if (this.backend) this.backend.lookAt(x, y);
  }

  setLipSync(value) {
    if (this.backend) this.backend.setLipSync(value);
  }

  startTalking() {
    if (this.backend && this.backend.startTalking) this.backend.startTalking();
  }

  stopTalking() {
    if (this.backend && this.backend.stopTalking) this.backend.stopTalking();
  }

  destroy() {
    if (this.backend && this.backend.destroy) this.backend.destroy();
    this.backend = null;
    this.ready = false;
  }

  get state() {
    return this.current;
  }

  get isReady() {
    return this.ready;
  }

  get activeBackend() {
    return this.backendKind;
  }
}

const engine = new CharacterEngine();
window.CharacterEngine = engine;
engine.init().catch((e) => console.error('[CharacterEngine] init failed', e));

export default engine;
