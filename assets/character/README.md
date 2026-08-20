# Character animation assets

2026-08-21: these 7 files were regenerated from the single-pose guide artwork
into real **animated WebP** loops (Python + Pillow, see
`scripts/generate_character_animations.py`). No separate art layers exist yet,
so each animation is built entirely from whole-image transforms — a
moving/zooming crop window sampled from within the source image's own pixels
(never revealing empty edges, never fabricating new content) plus light
brightness/color grading. No fake eyes/mouth/DOM overlay shapes are drawn.
`CharacterRenderer` (see `index.html`, search `CharacterRenderer`) preloads and
swaps between them per state; if a file is ever missing, it falls back to the
inline base guide image, so a state is never left blank.

| file | state | trigger | frames | loop | size |
|---|---|---|---|---|---|
| `idle.webp` | idle | default / no active conversation | 16 | ~1.5s | ~368KB |
| `listening.webp` | listening | right after the user picks a choice/card | 8 | ~0.9s | ~183KB |
| `thinking.webp` | thinking | brief pause before the next line renders | 16 | ~2.8s | ~369KB |
| `talking.webp` | talking | character is speaking (TTS active) | 10 | ~0.9s | ~217KB |
| `happy.webp` | happy | positive result emotion | 12 | ~1.15s | ~270KB |
| `surprise.webp` | surprise | surprised result emotion | 10 | asymmetric, ~0.77s | ~225KB |
| `serious.webp` | serious | serious/neutral result emotion | 14 | ~3.0s | ~314KB |

All loop infinitely (`loop=0`), 300x260, well under the 1MB/file budget
(2.0MB total). Regenerate with `python3 scripts/generate_character_animations.py`
after installing Pillow (`pip3 install Pillow`) — it overwrites these files in
place and asserts each output's real (post-encode) frame count matches what
was requested before finishing.

## Format notes
- WebP, animated, loops natively via the `<img>` tag — no JS changes needed
  regardless of frame count or duration.
- 300x260 aspect ratio kept so `object-fit:cover` framing in
  `.stage .stageGuide` doesn't need retuning.
- Lossy encoding (`quality=92`) rather than lossless: true lossless barely
  compresses this photographic/gradient-heavy artwork (~1.5MB for 16 frames)
  and blows the size budget. At the amplitudes used here, quality=92 keeps
  every frame distinct after decoding while landing well under 1MB.

## Replacing with real hand-authored art
Drop a new animated (or static) WebP at the same path/state name — no code
changes required. Keep the ~300x260 aspect ratio; frame count/duration are
free to differ from the table above.

## Future backends
`CharacterRenderer` is a thin wrapper (`loadAssets/setState/playOnce/stop`)
around a swappable `backend`. The sprite/WebP backend above is the first
implementation; a Rive or Live2D backend can be added as a second
implementation behind the same 4-method interface without touching the flow
engine or call sites.
