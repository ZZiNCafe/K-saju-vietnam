# Character animation assets — replacement point

These 7 files are **placeholders**. Each is currently a byte-identical copy of the
existing single-pose guide artwork (300x260 WebP), so today's visuals are
unchanged. `CharacterRenderer` (see `index.html`, search `CharacterRenderer`)
already loads and swaps between them per state — dropping in real art at these
exact paths is the only step needed to activate real per-state animation, no
code changes required.

| file | state | trigger |
|---|---|---|
| `idle.webp` | idle | default / no active conversation |
| `listening.webp` | listening | right after the user picks a choice/card |
| `thinking.webp` | thinking | brief pause before the next line renders |
| `talking.webp` | talking | character is speaking (TTS active or text revealing) |
| `happy.webp` | happy | positive result emotion |
| `surprise.webp` | surprise | surprised result emotion |
| `serious.webp` | serious | serious/neutral result emotion |

## Format notes for real assets
- WebP (static or **animated** WebP both work — an animated WebP loops natively
  via the `<img>` tag with no JS changes).
- Recommended to keep the current 300x260 aspect ratio so `object-fit:cover`
  framing in `.stage .stageGuide` doesn't need retuning.
- If a file is missing or fails to load, `CharacterRenderer` automatically
  falls back to the inline base guide image — a state is never left blank.

## Future backends
`CharacterRenderer` is a thin wrapper (`loadAssets/setState/playOnce/stop`)
around a swappable `backend`. The sprite/WebP backend above is the first
implementation; a Rive or Live2D backend can be added as a second
implementation behind the same 4-method interface without touching the flow
engine or call sites.
