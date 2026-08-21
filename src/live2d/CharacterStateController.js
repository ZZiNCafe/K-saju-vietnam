// CharacterStateController — single source of truth for the app's 7
// character states, and how each one maps onto a Live2D motion/expression.
//
// This is intentionally just a data table + two lookup helpers. It doesn't
// know about Cubism, doesn't touch the DOM, and has no dependency on which
// backend (Live2DBackend or the sprite fallback) is actually active — both
// CharacterEngine and Live2DBackend read it, nothing else needs to.

export const STATES = ['idle', 'listening', 'thinking', 'talking', 'happy', 'surprise', 'serious'];

// Motion group/index and expression names are placeholders that match a
// TYPICAL Cubism model3.json layout (an "Idle" motion group for ambient
// loops that should never fully stop, a "Gesture" group for one-shot
// reactions, and one expression file per emotion). This is a *default
// assumption*, not an SDK requirement — once a real ksaju.model3.json
// exists, update STATE_MAP below to match its actual Motions/Expressions
// definitions (see public/assets/live2d/ksaju/README.md).
const STATE_MAP = {
  idle:      { motion: { group: 'Idle', index: 0 },    expression: 'idle',      loop: true },
  listening: { motion: { group: 'Idle', index: 0 },    expression: 'listening', loop: true },
  thinking:  { motion: { group: 'Idle', index: 0 },    expression: 'thinking',  loop: true },
  talking:   { motion: { group: 'Idle', index: 0 },    expression: 'talking',   loop: true },
  happy:     { motion: { group: 'Gesture', index: 0 }, expression: 'happy',     loop: false },
  surprise:  { motion: { group: 'Gesture', index: 1 }, expression: 'surprise',  loop: false },
  serious:   { motion: { group: 'Idle', index: 0 },    expression: 'serious',  loop: true },
};

export function isValidState(state) {
  return STATES.indexOf(state) >= 0;
}

// Returns { motion:{group,index}, expression, loop } for a state, falling
// back to the idle mapping for anything unrecognized.
export function resolve(state) {
  return STATE_MAP[state] || STATE_MAP.idle;
}

export { STATE_MAP };
