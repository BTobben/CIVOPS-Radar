# UI Layout Refactor Plan

## Objective
Deliver a mobile-first responsive dashboard that works on Android 8 browsers/WebView and desktop screens without panel overlap.

## Layout model
- **Header row** for identity + high-level state.
- **Three-pane desktop grid**: network list | radar | stats/controls.
- **Single-column mobile stack** under 960px with radar centered.

## Design constraints
- Radar size controlled via CSS variable `--radar-size` and viewport bounds.
- Safe-area insets (`env(safe-area-inset-*)`) applied globally.
- Reduced motion mode disables sweep/pulse animations.

## Current implementation status
- Radar template split to dedicated static CSS + JS assets.
- Absolute-positioned panel layout replaced with grid/flex composition.
- Radar plotting logic updated to compute center/radius from rendered size.
