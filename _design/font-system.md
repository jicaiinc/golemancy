# Font System Design

## Overview

Three font roles, each with distinct purpose and CJK strategy:

| Role | CSS Variable | Purpose | Latin Font | CJK Font |
|------|-------------|---------|-----------|----------|
| **Arcade** | `--font-arcade` | Logo "Golemancy", ASCII art (`> _ <`, `{}`, `#`) | Press Start 2P | N/A (CJK never appears) |
| **Pixel** | `--font-pixel` | Titles, badges, section headers, form labels | Press Start 2P | Fusion Pixel 12px |
| **Mono** | `--font-mono` | Body, buttons, inputs, chat, code | JetBrains Mono | Noto Sans Mono CJK |

---

## Font Metrics (measured via fontTools)

### Raw Metrics

| Font | UPM | hhea Asc | hhea Dsc | typo Asc | typo Dsc | Win Asc | Win Dsc | Cap H | x-H |
|------|-----|----------|----------|----------|----------|---------|---------|-------|-----|
| Press Start 2P | 1000 | 1000 | 0 | 1000 | 0 | 1000 | 374 | 1000 | 750 |
| JetBrains Mono | 1000 | 1020 | -300 | 1020 | -300 | 1020 | 300 | 730 | 550 |
| Fusion Pixel ZH-Hans | 1200 | 1000 | -200 | 1000 | -200 | 1000 | 200 | 800 | 600 |
| Fusion Pixel JA | 1200 | 1000 | -200 | 1000 | -200 | 1000 | 200 | 800 | 600 |
| Fusion Pixel KO | 1200 | 1000 | -200 | 1000 | -200 | 1000 | 200 | 800 | 600 |
| Noto Sans Mono CJK SC | 1000 | 1160 | -288 | 880 | -120 | 1160 | 288 | 733 | 543 |
| Cascadia Next SC | 2048 | 2217 | -240 | 1760 | -240 | 2217 | 240 | 1420 | 1060 |
| M PLUS 1 Code | 1000 | 1000 | -235 | 1000 | -235 | 1235 | 270 | 730 | 520 |
| Cubic 11 | 1200 | 1000 | -400 | 1000 | -400 | 1000 | 400 | 800 | 500 |

### Normalized (/ UPM)

| Font | ascent | descent | total | cap/em | x/em |
|------|--------|---------|-------|--------|------|
| Press Start 2P | 1.000 | 0.000 | 1.000 | **1.000** | 0.750 |
| JetBrains Mono | 1.020 | 0.300 | 1.320 | **0.730** | 0.550 |
| Fusion Pixel (all) | 0.833 | 0.167 | 1.000 | **0.667** | 0.500 |
| Noto Sans Mono CJK SC | 1.160 | 0.288 | 1.448 | **0.733** | 0.543 |
| Cascadia Next SC | 1.083 | 0.117 | 1.200 | 0.693 | 0.518 |
| M PLUS 1 Code | 1.000 | 0.235 | 1.235 | 0.730 | 0.520 |
| Cubic 11 | 0.833 | 0.333 | 1.167 | 0.667 | 0.417 |

### At font-size: 13px (project default)

| Font | Cap Height (px) | x-Height (px) | Line Height (px) |
|------|----------------|---------------|------------------|
| Press Start 2P | **13.0** | 9.8 | 13.0 |
| JetBrains Mono | **9.5** | 7.1 | 17.2 |
| Fusion Pixel (all) | **8.7** | 6.5 | 13.0 |
| Noto Sans Mono CJK SC | **9.5** | 7.1 | 18.8 |

Key: Press Start 2P cap fills 100% of em (unusual). Fusion Pixel only fills 67%.

### size-adjust Required

| CJK Font | cap/em | To match Press Start 2P | To match JetBrains Mono |
|----------|--------|------------------------|------------------------|
| Fusion Pixel (all variants) | 0.667 | **150.0%** | 109.5% |
| Noto Sans Mono CJK SC | 0.733 | 136.4% | **99.6% (natural match)** |
| Cascadia Next SC | 0.693 | 144.2% | 105.3% |
| M PLUS 1 Code | 0.730 | 137.0% | 100.0% |
| Cubic 11 | 0.667 | 150.0% | 109.5% |

**Decision**: Fusion Pixel needs `size-adjust: 150%` for font-pixel. Noto Sans Mono CJK needs no adjustment for font-mono (natural 100% match with JetBrains Mono).

---

## Language × Font Role × Character Type Matrix

### font-arcade (no language switching)

All languages → Press Start 2P. CJK characters never appear in arcade contexts.

### font-pixel

| Language | Latin chars | CJK Ideographs (U+4E00-9FFF) | Hiragana/Katakana (U+3040-30FF) | Hangul (U+AC00-D7AF) | Mechanism |
|----------|-----------|------|------|------|------|
| **en / es / de ...** | Press Start 2P | Fusion Pixel ZH-Hans | Fusion Pixel JA | Fusion Pixel KO | unicode-range fallback |
| **zh** | Fusion Pixel ZH-Hans | Fusion Pixel ZH-Hans | Fusion Pixel JA | Fusion Pixel KO | `:lang(zh)` + unicode-range |
| **zh-TW / zh-HK** | Fusion Pixel ZH-Hant | Fusion Pixel ZH-Hant | Fusion Pixel JA | Fusion Pixel KO | `:lang(zh-TW)` + unicode-range |
| **ja** | Fusion Pixel JA | Fusion Pixel JA | Fusion Pixel JA | Fusion Pixel KO | `:lang(ja)` + unicode-range |
| **ko** | Fusion Pixel KO | Fusion Pixel KO | Fusion Pixel JA | Fusion Pixel KO | `:lang(ko)` + unicode-range |

In CJK language modes, Fusion Pixel is first in font stack → renders ALL characters (Latin + CJK) → baseline perfectly aligned. All Fusion Pixel `@font-face` declarations use `size-adjust: 150%`.

### font-mono

| Language | Latin chars | CJK Ideographs (U+4E00-9FFF) | Hiragana/Katakana (U+3040-30FF) | Hangul (U+AC00-D7AF) | Mechanism |
|----------|-----------|------|------|------|------|
| **en / es / de ...** | JetBrains Mono | Noto Sans Mono CJK SC | Noto Sans Mono CJK JP | Noto Sans Mono CJK KR | unicode-range fallback |
| **zh** | JetBrains Mono | Noto Sans Mono CJK SC | Noto Sans Mono CJK JP | Noto Sans Mono CJK KR | `:lang(zh)` |
| **zh-TW / zh-HK** | JetBrains Mono | Noto Sans Mono CJK TC | Noto Sans Mono CJK JP | Noto Sans Mono CJK KR | `:lang(zh-TW)` |
| **ja** | JetBrains Mono | Noto Sans Mono CJK JP | Noto Sans Mono CJK JP | Noto Sans Mono CJK KR | `:lang(ja)` |
| **ko** | JetBrains Mono | Noto Sans Mono CJK KR | Noto Sans Mono CJK JP | Noto Sans Mono CJK KR | `:lang(ko)` |

JetBrains Mono always first (handles Latin). Noto Sans Mono CJK handles CJK fallback. Cap height naturally matches (99.6%), no size-adjust needed. `:lang()` only switches Noto language variant for correct CJK ideograph glyph forms.

---

## Baseline Alignment Summary

| Scenario | Alignment | Detail |
|----------|-----------|--------|
| font-arcade | Perfect | Single font, no CJK |
| font-pixel · CJK lang mode | Perfect | Fusion Pixel renders everything (size-adjust: 150%) |
| font-pixel · non-CJK lang, typing CJK | Minor offset | Press Start 2P + Fusion Pixel mixed (edge case) |
| font-mono · all modes | Excellent | JetBrains Mono + Noto Sans Mono CJK (cap height 100% match) |

---

## CSS Implementation Structure

```
Layer 1: @font-face declarations
─────────────────────────────────
  Fusion Pixel ZH-Hans/ZH-Hant/JA/KO    (existing, per-language, for :lang() use)
  "Pixel CJK" × 3 @font-face            (unicode-range: CJK ideographs / kana / hangul)
    → size-adjust: 150%                  (match Press Start 2P visual size)
  "Mono CJK" × 3 @font-face             (unicode-range: CJK ideographs / kana / hangul)
    → no size-adjust needed

Layer 2: @theme base variables (all languages)
──────────────────────────────────────────────
  --font-arcade: "Press Start 2P", monospace
  --font-pixel:  "Press Start 2P", "Pixel CJK", monospace
  --font-mono:   "JetBrains Mono", "Mono CJK", Menlo, Consolas, monospace

Layer 3: :lang() overrides (CJK language modes)
────────────────────────────────────────────────
  :lang(zh)    → --font-pixel: "Fusion Pixel ZH-Hans", "Pixel CJK", "Press Start 2P", monospace
               → --font-mono:  "JetBrains Mono", "Noto Sans Mono CJK SC", "Mono CJK", Menlo, Consolas, monospace
  :lang(zh-TW) → --font-pixel: "Fusion Pixel ZH-Hant", "Pixel CJK", "Press Start 2P", monospace
               → --font-mono:  "JetBrains Mono", "Noto Sans Mono CJK TC", "Mono CJK", Menlo, Consolas, monospace
  :lang(ja)    → --font-pixel: "Fusion Pixel JA", "Pixel CJK", "Press Start 2P", monospace
               → --font-mono:  "JetBrains Mono", "Noto Sans Mono CJK JP", "Mono CJK", Menlo, Consolas, monospace
  :lang(ko)    → --font-pixel: "Fusion Pixel KO", "Pixel CJK", "Press Start 2P", monospace
               → --font-mono:  "JetBrains Mono", "Noto Sans Mono CJK KR", "Mono CJK", Menlo, Consolas, monospace

Priority: :lang() > unicode-range fallback > @theme base
```

---

## Font Files Inventory

### Already in project (packages/ui/src/assets/fonts/)

| File | Size | Usage |
|------|------|-------|
| fusion-pixel-12px-zh_hans.woff2 | 708 KB | Pixel CJK: Simplified Chinese |
| fusion-pixel-12px-zh_hant.woff2 | 707 KB | Pixel CJK: Traditional Chinese |
| fusion-pixel-12px-ja.woff2 | 716 KB | Pixel CJK: Japanese |
| fusion-pixel-12px-ko.woff2 | 720 KB | Pixel CJK: Korean |

### To add (Noto Sans Mono CJK, convert from OTF to woff2)

| File | Size (woff2) | Source | Usage |
|------|-------------|--------|-------|
| NotoSansMonoCJKsc-Regular.woff2 | ~11 MB | notofonts/noto-cjk Sans2.004 | Mono CJK: Simplified Chinese |
| NotoSansMonoCJKtc-Regular.woff2 | ~11 MB | notofonts/noto-cjk Sans2.004 | Mono CJK: Traditional Chinese |
| NotoSansMonoCJKjp-Regular.woff2 | ~11 MB | notofonts/noto-cjk Sans2.004 | Mono CJK: Japanese |
| NotoSansMonoCJKkr-Regular.woff2 | ~11 MB | notofonts/noto-cjk Sans2.004 | Mono CJK: Korean |

### npm packages (already installed)

| Package | Font | Via |
|---------|------|-----|
| @fontsource/press-start-2p | Press Start 2P | import in App.tsx |
| @fontsource/jetbrains-mono | JetBrains Mono 400/500/600/700 | import in App.tsx |

---

## Rejected Alternatives (with reasons)

| Font | Why rejected |
|------|-------------|
| Zpix (最像素) | Proprietary license, not OFL |
| Silver | CC BY 4.0 (not OFL), incomplete CJK coverage |
| Sarasa Mono | 15-20 MB/weight, Latin half is Iosevka (not JetBrains Mono) |
| Source Han Mono | 116 MB TTC, impractical for web |
| IBM Plex Sans CJK | Proportional, not monospace |
| Cascadia Next SC | Pre-release, no Korean, cap height 5% off from JBM |
| M PLUS 1 Code | Japanese only, no Chinese/Korean |

---

## Unicode Ranges for @font-face

```
CJK Ideographs (shared zh/ja/ko):  U+4E00-9FFF, U+3400-4DBF, U+F900-FAFF
CJK Symbols & Punctuation:          U+3000-303F, U+FE30-FE4F
Fullwidth Forms:                     U+FF00-FFEF
CJK Radicals Supplement:            U+2E80-2EFF
Hiragana:                            U+3040-309F
Katakana:                            U+30A0-30FF, U+31F0-31FF
Hangul Syllables:                    U+AC00-D7AF
Hangul Jamo:                         U+1100-11FF
Hangul Compatibility Jamo:           U+3130-318F
```
