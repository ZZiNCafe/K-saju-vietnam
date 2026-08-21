# Cubism Web Framework — vendored, compiled build

This directory is a **compiled build** of Live2D's official, public
Cubism Web Framework — not hand-written, not a reimplementation.

- Source: https://github.com/Live2D/CubismWebFramework
- Commit: `d4da0aa07e47d2c1e4f5fa7ea6047861ea5e5d0b`
- Framework version: `5-r.5` (per its `CHANGELOG.md`) — matches the
  `CubismSdkForWeb-5-r.5` SDK this project targets.
- License: Live2D Open Software License / Cubism SDK Release License —
  see `LICENSE.txt` in this directory (copied verbatim from the source
  repo's `LICENSE.md`). **Businesses with >¥10,000,000 annual gross
  revenue must obtain a separate Cubism SDK Release License before
  commercial use** — review this before shipping to production.

## How this build was produced

The Framework's TypeScript source (`src/**/*.ts`) was compiled as-is with
`tsc` (target `es2017`, module `es2015`) against a **locally-authored**,
deliberately permissive ambient type declaration for the `Live2DCubismCore`
global (`any`-typed throughout) — not Live2D's real, proprietary
`live2dcubismcore.d.ts`, which this project has no access to and does not
attempt to reproduce. That stub only exists to satisfy the TypeScript
compiler; it carries no runtime behavior and ships nothing to the browser.
The actual Core implementation is the real, official
`live2dcubismcore.min.js`, lazy-loaded at runtime from Live2D's CDN (see
`../README.md`) — never from anything in this repo.

Relative `import`/`export` specifiers were rewritten to include explicit
`.js` extensions after compiling (plain `tsc` output omits them, which
works with bundlers but not with native browser `<script type="module">`
loading, which this project uses instead of a build step).

No application/orchestration logic lives here — this is purely the
reusable Framework (`CubismFramework`, `CubismUserModel`,
`CubismRenderer_WebGL`, motion/expression/physics managers, math/JSON
utilities, …). The code that actually loads `ksaju.model3.json` and wires
it into `CharacterEngine` is `src/live2d/Live2DBackend.js`, one level up
in this repo — not part of this vendored build.

## Updating this vendored build

1. Re-clone/pull `https://github.com/Live2D/CubismWebFramework` at the
   commit/tag you want.
2. `tsc` its `src/**/*.ts` against the same permissive `Live2DCubismCore`
   stub (see this project's build notes / ask for the compile script used
   originally), targeting `es2017`/module `es2015`.
3. Post-process the output to add `.js` extensions to relative imports.
4. Replace the contents of this directory (keep this NOTICE, update the
   commit hash above) and re-copy `Shaders/WebGL/*` from the source repo.
