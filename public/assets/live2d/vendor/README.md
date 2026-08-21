# Vendor directory

## Cubism Core — loaded from Live2D's CDN, never stored here

`src/live2d/Live2DBackend.js` lazy-loads the Cubism Core runtime directly
from Live2D's own official CDN at runtime:

```
https://cubism.live2d.com/sdk-web/cubismcore/live2dcubismcore.min.js
```

Core is proprietary (part of Live2D Inc.'s licensed Cubism SDK for Web) and
is intentionally **never** downloaded into or served from this repository —
there is nothing to place in this directory for Core. The script tag is
only injected once `manifest.json` (in `../ksaju/`) says `modelReady:true`,
so it never loads — and never blocks first paint — while no real model is
wired in.

## cubism-framework/ — vendored, compiled Framework build

`cubism-framework/` **is** committed here: it's a compiled build of Live2D's
own public, open-source Cubism Web Framework
(https://github.com/Live2D/CubismWebFramework), not proprietary. See
`cubism-framework/NOTICE.md` for exactly what commit it was built from, the
license terms, and how to rebuild/update it.
