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

## Cubism Core

The Cubism Core runtime (`live2dcubismcore.min.js`) is a separate, license-
gated file from Live2D Inc.'s official "Cubism SDK for Web" distribution —
it is **not** included in this repo and must be downloaded manually after
agreeing to Live2D's SDK license. Place it at:

```
public/assets/live2d/vendor/live2dcubismcore.min.js
```

`Live2DBackend` only attempts to load it lazily, after confirming both the
Core script and `ksaju.model3.json` are reachable (`HEAD` requests) — so its
absence never blocks or slows down the app's first paint.

## What still needs real engineering work

Even with the Core + model files in place, `Live2DBackend.init()` currently
stops short of actually instantiating a Cubism model — see the
`---- INTEGRATION POINT ----` comment in `src/live2d/Live2DBackend.js` for
exactly what's left (WebGL canvas setup, `CubismFramework.startUp/initialize`,
loading the model3.json's referenced files, a render loop). That part
requires the official Cubism Web Framework sources (also part of the SDK
download, not just the Core binary) and was intentionally left as a scaffold
rather than guessed at without the real SDK available to test against.
