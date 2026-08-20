#!/usr/bin/env python3
"""Generate real animated WebP files for the K-SAJU character states.

Source: a single static illustration (assets/character/idle.webp, currently
identical across all 7 state placeholders). Since no separate art layers
exist, each state's "animation" is built entirely from whole-image
transforms applied to that one source frame: a moving/zooming crop window
sampled from within the source's own pixels (never revealing empty edges,
never fabricating new pixel content) plus light brightness/color grading.
No fake eyes/mouth/DOM overlay shapes are drawn — see CLAUDE.md and the
2026-08-21 task for why that approach was retired.

Run: python3 scripts/generate_character_animations.py
Output: assets/character/{state}.webp (animated), overwriting the
temporary static placeholders from the previous round.
"""
import math
import os
from PIL import Image, ImageEnhance

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SRC = os.path.join(ROOT, 'assets', 'character', 'idle.webp')
OUT_DIR = os.path.join(ROOT, 'assets', 'character')

W, H = 300, 260
CENTER = (0.5, 0.5)
# Face sits in the upper-center area of the source art (eyes/nose/mouth),
# used to bias the "talking" rhythm toward the face/upper body instead of
# the whole frame.
FACE = (0.52, 0.36)


def load_source():
    im = Image.open(SRC).convert('RGB')
    assert im.size == (W, H), f'unexpected source size {im.size}'
    return im


def build_frame(src, scale, cx, cy, brightness=1.0, color=1.0, contrast=1.0):
    """Crop a (300/scale x 260/scale) window centered at fractional (cx,cy)
    from src, clamped to stay inside the source bounds (no distortion, no
    revealed edges), then resize back up to 300x260 and grade it."""
    scale = max(scale, 1.0)
    cw, ch = W / scale, H / scale
    cx_px, cy_px = cx * W, cy * H
    left = cx_px - cw / 2
    top = cy_px - ch / 2
    right = left + cw
    bottom = top + ch
    if left < 0:
        right -= left
        left = 0
    if top < 0:
        bottom -= top
        top = 0
    if right > W:
        left -= (right - W)
        right = W
    if bottom > H:
        top -= (bottom - H)
        bottom = H
    left = max(0, left)
    top = max(0, top)
    frame = src.crop((left, top, right, bottom)).resize((W, H), Image.LANCZOS)
    if brightness != 1.0:
        frame = ImageEnhance.Brightness(frame).enhance(brightness)
    if color != 1.0:
        frame = ImageEnhance.Color(frame).enhance(color)
    if contrast != 1.0:
        frame = ImageEnhance.Contrast(frame).enhance(contrast)
    return frame


def sine_frames(n, base_scale, amp_scale, anchor, amp_xy=(0.0, 0.0),
                 phase=0.0, brightness_amp=0.0, color_amp=0.0, contrast_amp=0.0):
    """Build a smooth looping cycle of (scale, cx, cy, brightness, color,
    contrast) tuples. Scale uses a *unipolar* wave (base_scale ..
    base_scale+amp_scale) so it never dips to/below 1.0 and gets clamped by
    build_frame()'s zoom floor -- a bipolar wave collapses every clamped
    frame to the same full, unpanned source image, silently deduping
    otherwise-distinct frames once encoded (verified against md5 of the
    rendered pixels)."""
    frames = []
    for i in range(n):
        t = (i / n) * 2 * math.pi + phase
        wave = math.sin(t)
        s = base_scale + amp_scale * (0.5 + 0.5 * wave)
        dx = amp_xy[0] * wave
        dy = amp_xy[1] * math.sin(t + math.pi / 2)
        br = 1.0 + brightness_amp * wave
        co = 1.0 + color_amp * wave
        ct = 1.0 + contrast_amp * wave
        frames.append((s, anchor[0] + dx, anchor[1] + dy, br, co, ct))
    return frames


def render(src, frame_params):
    return [build_frame(src, s, cx, cy, br, co, ct)
            for (s, cx, cy, br, co, ct) in frame_params]


def dedupe_frames(frames):
    """Guarantee every frame is pixel-distinct from the ones before it.
    Some states (e.g. 'surprise') deliberately hold a few frames at the
    same baseline crop/brightness, and very low-amplitude cycles can round
    to identical pixels after crop+resize; without this, WebP's encoder
    would silently merge those identical frames and the saved file would
    have fewer frames than intended. This is a safety net -- the frame
    generation parameters below are chosen to need it as little as
    possible, since a brightness nudge alone doesn't restore real motion."""
    orig_seen = {}
    used_hashes = set()
    out = []
    for f in frames:
        h0 = hash(f.tobytes())
        occurrence = orig_seen.get(h0, 0)
        orig_seen[h0] = occurrence + 1
        if occurrence > 0:
            bump = occurrence
            while True:
                candidate = ImageEnhance.Brightness(f).enhance(1.0 + 0.002 * bump)
                h2 = hash(candidate.tobytes())
                if h2 not in used_hashes:
                    f = candidate
                    break
                bump += 1
        h_final = hash(f.tobytes())
        used_hashes.add(h_final)
        out.append(f)
    return out


def save_anim(frames, durations, path, quality=92):
    """Encode and verify. Lossy quantization can occasionally converge two
    genuinely-distinct raw frames to byte-identical compressed output --
    invisible to dedupe_frames() since that only inspects pre-encode
    pixels -- which the WebP muxer then silently merges. Re-open the saved
    file and check its real n_frames; if the encoder dropped any, nudge
    every other frame's brightness by a small, increasing amount (breaks
    whichever pair was quantizing identically) and re-encode."""
    if isinstance(durations, int):
        durations = [durations] * len(frames)
    expected = len(frames)
    working = list(frames)
    for attempt in range(6):
        working[0].save(
            path, format='WEBP', save_all=True, append_images=working[1:],
            duration=durations, loop=0, quality=quality, method=6,
            minimize_size=False,
        )
        got = Image.open(path).n_frames
        if got == expected:
            return
        working = [
            ImageEnhance.Brightness(f).enhance(1.0 + 0.01 * (attempt + 1) * (1 if i % 2 else -1))
            for i, f in enumerate(frames)
        ]
    raise RuntimeError(f'{path}: could not preserve {expected} distinct frames (last got {got})')


def main():
    src = load_source()
    specs = {}

    # idle: natural breathing, subtle vertical drift, ~1.5s loop.
    n = 16
    total_ms = 1500
    specs['idle'] = (
        sine_frames(n, base_scale=1.006, amp_scale=0.03, anchor=CENTER,
                    amp_xy=(0.0, 0.012), brightness_amp=0.01),
        total_ms // n,
    )

    # listening: slight lean-in / focus, less movement than idle.
    n = 8
    total_ms = 900
    specs['listening'] = (
        sine_frames(n, base_scale=1.012, amp_scale=0.02,
                    anchor=(0.51, 0.44), amp_xy=(0.0, 0.01)),
        total_ms // n,
    )

    # thinking: slow pan + weak zoom, mysterious, not shaky.
    n = 16
    total_ms = 2800
    specs['thinking'] = (
        sine_frames(n, base_scale=1.024, amp_scale=0.026, anchor=CENTER,
                    amp_xy=(0.03, 0.01), color_amp=-0.04),
        total_ms // n,
    )

    # talking: lively rhythm during TTS, 0.9s loop, face/upper-body
    # centered scale-pulse only (no left-right whole-image shake).
    n = 10
    total_ms = 900
    specs['talking'] = (
        sine_frames(n, base_scale=1.026, amp_scale=0.035, anchor=FACE,
                    amp_xy=(0.0, 0.012)),
        total_ms // n,
    )

    # happy: brighter + gentle bounce after a good result.
    n = 12
    total_ms = 1150
    specs['happy'] = (
        sine_frames(n, base_scale=1.02, amp_scale=0.032,
                    anchor=(0.51, 0.42), amp_xy=(0.0, 0.018),
                    brightness_amp=0.04, color_amp=0.045),
        total_ms // n,
    )

    # surprise: quick small zoom-in then settle back, no exaggeration.
    scales =     [1.0, 1.02, 1.045, 1.055, 1.045, 1.02, 1.0, 1.0, 1.0, 1.0]
    durations =  [70,   55,    55,    80,    60,    60,  90, 110, 110, 110]
    brights =    [1.0, 1.012, 1.02,  1.025, 1.018, 1.008, 1.0, 1.0, 1.0, 1.0]
    anchor = (0.515, 0.40)
    surprise_params = [(s, anchor[0], anchor[1], b, 1.0, 1.0) for s, b in zip(scales, brights)]
    specs['surprise'] = (surprise_params, durations)

    # serious: minimal movement, slow settle, slightly cooler/darker tone.
    n = 14
    total_ms = 3000
    specs['serious'] = (
        sine_frames(n, base_scale=1.006, amp_scale=0.009, anchor=CENTER,
                    amp_xy=(0.0, 0.004), brightness_amp=-0.02, color_amp=-0.03),
        total_ms // n,
    )

    print(f'{"state":<10} {"frames":>7} {"size(KB)":>9}  duration(ms)')
    for state, (params, durations) in specs.items():
        frames = dedupe_frames(render(src, params))
        out_path = os.path.join(OUT_DIR, f'{state}.webp')
        save_anim(frames, durations, out_path)
        size_kb = os.path.getsize(out_path) / 1024
        im_check = Image.open(out_path)
        n_frames = getattr(im_check, 'n_frames', 1)
        assert n_frames == len(frames), f'{state}: frame count mismatch {n_frames} != {len(frames)}'
        print(f'{state:<10} {n_frames:>7} {size_kb:>9.1f}  {durations}')


if __name__ == '__main__':
    main()
