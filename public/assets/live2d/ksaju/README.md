# Live2D model placement — K-SAJU

This directory is where the real Cubism model goes once it exists. Until
then, `Live2DBackend` (`src/live2d/Live2DBackend.js`) always reports "not
available" here, and `CharacterEngine` transparently falls back to the
existing WebP sprite renderer (`assets/character/`, `CharacterRenderer` in
`index.html`) — nothing in this folder is required for the app to run.

## Expected files

Drop the exported Cubism 3/4 model bundle directly into this folder, named
`ksaju.*`:

**After adding the files below, also set `"modelReady": true` in
`manifest.json` in this folder.** `Live2DBackend` checks that manifest
first (it always exists, so reading it never fails) and only looks for
`ksaju.model3.json` once `modelReady` is true — this is deliberate: a
browser logs a console error for any failed resource load even when the JS
handles it gracefully, so probing a file that doesn't exist yet (the
default, no-model state) would fail this project's "console errors == 0"
bar on every page load. Flipping the manifest is the actual on/off switch.

| file | required | notes |
|---|---|---|
| `manifest.json` | already present | flip `modelReady` to `true` here once everything below is in place |
| `ksaju.model3.json` | yes | top-level model settings, referenced by `manifest.json`'s `modelPath` |
| `ksaju.moc3` | yes | compiled model geometry, referenced by model3.json |
| `ksaju.physics3.json` | if used | physics simulation settings |
| `ksaju.pose3.json` | if used | part opacity / pose groups |
| `ksaju.cdi3.json` | optional | editor display info only, not required at runtime |
| `textures/texture_00.png` (…) | yes | referenced by model3.json's `FileReferences.Textures` |
| `motions/*.motion3.json` | yes, per state you want animated | see motion group naming below |
| `expressions/*.exp3.json` | yes, per emotion | see expression naming below |

## Motion/expression naming this app expects

`src/live2d/CharacterStateController.js` maps the app's 7 states to motion
groups/expression names. Update that file's `STATE_MAP` to match whatever
your `model3.json` actually defines — the table below is only the *default*
this scaffold assumes, not an SDK requirement:

| app state | motion group / index | expression |
|---|---|---|
| idle | `Idle` / 0 | `idle` |
| listening | `Idle` / 0 | `listening` |
| thinking | `Idle` / 0 | `thinking` |
| talking | `Idle` / 0 (+ live lip sync via `setLipSync`) | `talking` |
| happy | `Gesture` / 0 | `happy` |
| surprise | `Gesture` / 1 | `surprise` |
| serious | `Idle` / 0 | `serious` |

## Cubism Core — nothing to add here

Unlike earlier versions of this scaffold, `Live2DBackend` no longer expects
a local Core file at all. It lazy-loads the official Cubism Core runtime
straight from Live2D's own CDN at runtime:

```
https://cubism.live2d.com/sdk-web/cubismcore/live2dcubismcore.min.js
```

That script tag is only injected once `manifest.json` says
`modelReady:true`, so it never loads (and never blocks first paint) while
no real model is wired in. See `../vendor/README.md`.

## Cubism Web Framework — already vendored and wired in

`Live2DBackend.js` is a real integration against the Cubism Web Framework —
not a scaffold. The Framework itself (a compiled build of Live2D's public
`CubismWebFramework` source) lives at
`../vendor/cubism-framework/` and is already committed; see its `NOTICE.md`
for provenance. Once real model files exist here and `manifest.json` is
flipped to `modelReady:true`, `Live2DBackend.init()` will actually:
`CubismFramework.startUp`/`initialize`, create a WebGL canvas inside
`#charLayer`, parse `model3.json` via `CubismModelSettingJson`, load the
`.moc3` via `CubismUserModel.loadModel`, then every texture/physics/motion/
expression file the settings reference, build a renderer, and start a
`requestAnimationFrame` render loop — hiding the WebP `<img id="flowGuide">`
once the first frame is ready. Any failure at any of those steps (missing
file, WebGL unavailable, Core failing to load, …) is caught and falls back
to the WebP sprite renderer immediately, restoring `#flowGuide`.

If your model's actual motion group / expression names differ from the
table above, update `src/live2d/CharacterStateController.js`'s `STATE_MAP`
to match — `Live2DBackend` also degrades gracefully (falls back to any
loaded motion, or no-ops) if a requested group/expression name isn't found,
rather than erroring.
