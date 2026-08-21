# Cubism Core — not included

Place the official Cubism Core runtime here as:

```
public/assets/live2d/vendor/live2dcubismcore.min.js
```

This file ships as part of Live2D Inc.'s official "Cubism SDK for Web"
download, which requires agreeing to their SDK license before download. It
is proprietary and is intentionally **not** bundled in this repository —
`src/live2d/Live2DBackend.js` only references this path and loads it lazily
if present; nothing else in the app depends on it existing.
