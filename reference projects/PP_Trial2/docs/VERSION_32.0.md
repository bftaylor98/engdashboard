# Version 32.0 - Light Mode Toggle

**Release Date:** February 18, 2026

## Status
✅ Stable

## Summary
Version 32.0 adds a Light Mode toggle to the Process Packet form, allowing users to switch between the existing dark theme and a new light theme for better readability in bright environments. The implementation was rebased onto the stable V31 baseline to ensure all V27–V31 features (Help widget, Info Box widget, Tools Locked parent widget, IndexedDB file handle persistence, 8-minute auto-lock) are intact.

## New Features

### 1. Light Mode Toggle
**Description:** A new sun icon button in the header toolbar toggles the form between dark mode (default) and light mode. Light mode replaces the black-based gradients with white-based gradients and inverts text from white to black.

**Key Behavior:**
- Click the sun icon (next to the lock button) to toggle light mode on/off
- Dark mode: black-to-blue gradient (Hurco) or black-to-orange gradient (Mazak)
- Light mode: white-to-blue gradient (Hurco) or white-to-orange gradient (Mazak)
- All white text becomes black; all dark backgrounds become light
- Light mode is a **display preference only** — it does not save with the form
- The sun button works in both locked and unlocked states

**Visual Changes in Light Mode:**
- Body background gradient switches from `#1a1a1a` base to `#ffffff` base
- Container, widget, and operation block backgrounds become white/light gray
- All table cells (`td`) get light backgrounds (`#f8f9fa` / `#eef1f5` alternating)
- Section headers (`h2`) switch from dark gradient to light gradient (`#e8ecf0` to `#f5f7fa`)
- Inputs, selects, and textareas get light backgrounds with subtle borders
- Header buttons, scrollbars, modals, and all other elements are themed
- Help widget text colors adapt for readability
- Info Box widget colors adapt for readability

### 2. Help Widget Light Mode Instructions
Added a new "Light Mode" section to the Help widget (visible when form is locked) explaining how to use the toggle, that it's display-only, and that it defaults to dark mode on each open.

## Bug Fixes

### User Display Overlap
The user display name was overlapping the new light mode button. Fixed by shifting `.user-display` from `right: 200px` to `right: 250px`.

### Performance Lag on Toggle
Expanding, collapsing, adding, and deleting operations lagged after toggling light mode. Root cause: `updateBackgroundColor()` called `renderShapes()` on every invocation, and `toggleLightMode()` calls `updateBackgroundColor()`. Fixed by removing the `renderShapes()` call from `updateBackgroundColor()` — shape rendering is still triggered by `applyLockState()` and other appropriate callers.

### h2 Header Backgrounds Not Converting
Section headers like "Job Information" and "Revision Log" retained their dark gradient background in light mode. Added `background`, `box-shadow`, and Mazak `border-left-color` overrides to the `body.light-mode h2` CSS rule.

### Form-Locked Button Opacity Split
The `.form-locked` CSS rule previously applied `opacity: 0.6` to inputs, selects, textareas, and buttons together, causing locked form text to appear grey. Split into two rules: inputs/selects/textareas no longer get opacity reduction, while buttons (excluding unlock and light mode) retain `opacity: 0.6`.

## Technical Details

### Functions Added
- `toggleLightMode()` — Toggles the `light-mode` class on `<body>` and calls `updateBackgroundColor()`

### Functions Modified
- `updateBackgroundColor()` — Now checks for `light-mode` class and uses `#ffffff` base instead of `#1a1a1a`; removed `renderShapes()` call; adds `backgroundAttachment: fixed`
- `generateHTMLWithData()` — Strips `light-mode` class before generating save HTML, restores it after; ensures saved files always open in dark mode
- `applyLockState()` — Already had image button inline style handling from V31; no additional changes needed

### CSS Changes
- Added ~480 lines of `body.light-mode` CSS overrides covering all UI elements
- Added `body.light-mode.mazak-theme` variants for orange-themed elements
- Added `.header-button svg circle` to stroke rules (for sun icon)
- Added `.light-mode-button` exclusion to `.form-locked` button rules
- Added `.form-locked .header-button.light-mode-button` allow-rule

### HTML Changes
- Added sun icon button to `.header-buttons` div after unlock button
- Added "Light Mode" section to Help widget content
- Version footer updated to 32.0

## Files Modified

### Modified Files
- `index.html` — Light mode feature, CSS overrides, JS functions, Help widget text, version bump
- `README.md` — Updated to Version 32.0 with full version history
- `AGENT_GUIDE.md` — Updated to Version 32.0 with light mode guidance
- `FEATURE_LIST.md` — Added Light Mode feature, updated ISO footer version

### Deleted Files
- `V31_reference.html` — Temporary reference file used during rebase, removed after completion

## Migration Notes

No migration required. Light mode is purely additive CSS/JS with no data structure changes. All saved files remain backward compatible. Light mode state is not persisted — forms always open in dark mode.


