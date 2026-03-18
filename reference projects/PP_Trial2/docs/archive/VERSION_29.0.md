# Version 29.0 - Machinist Notes & Column Scaling Fix

**Release Date:** February 13, 2026

## Status
✅ Stable

## Summary
Version 29.0 adds a new "Machinist Notes" field to each primary operation and fixes a column-width scaling issue on monitors with different DPI settings. All changes are in `index.html`.

## New Features

### 1. Machinist Notes Field
**Description:** A new full-width "Machinist Notes" textarea has been added to each primary operation, positioned below the Part Setup Information / Part Setup View area and above the Compensation Programs section.

**Key Behavior:** The field uses an inverted editability model — it is only editable when the form is **locked** (machinist mode) and is disabled/greyed out when the form is **unlocked** (programmer mode). This follows the same pattern as Machine Coord and Initials fields.

**Implementation:**
- Added `machinistNotes: ''` property to the operation data model
- Rendered as a `<textarea>` with class `machinist-notes-field` and `data-section="machinistNotes"`
- `applyLockState()` toggles `disabled` and `editable-when-locked` class based on lock state
- `syncData()` persists the value to `operations[opIndex].machinistNotes`

## Bug Fixes

### 2. Tooling Table Columns No Longer Shrink on High-DPI Monitors
**Problem:** The C-ID, T#, Rad, Stickout, Runout, and Initials columns in the tooling table appeared very small horizontally on monitors with a native resolution of 1920x1200, even when the resolution was changed to 1920x1080.

**Root Cause:** These columns had `width` and `max-width` CSS properties but no `min-width`. With `table-layout: auto`, the browser compressed these unprotected columns when the effective viewport shrank due to DPI scaling.

**Fix:** Added `min-width` to match the existing `width` value for each affected column:
- ID (C-ID): `min-width: 70px`
- T#: `min-width: 70px`
- Rad: `min-width: 45px`
- Stickout: `min-width: 50px`
- Runout: `min-width: 60px`
- INIT / Initials (column 12): `min-width: 55px` / `min-width: 45px`

## Technical Details

### Functions Modified
- `addOperation()` — Added `machinistNotes: ''` to default operation object
- `executeInsert()` — Added `machinistNotes: ''` to inserted operation object
- `renderOperations()` — Added Machinist Notes HTML section after setup flex container
- `syncData()` — Added `machinistNotes` handling in textarea branch
- `applyLockState()` — Added `.machinist-notes-field` toggling in both locked and unlocked branches

### CSS Changes
- Added `min-width` to tooling table columns 2, 3, 5, 6, 7, and 12 (th and td rules)

### HTML Changes
- New `<h3>Machinist Notes</h3>` heading and `<textarea>` element in each primary operation
- Version footer updated to 29.0

## Files Modified

### Modified Files
- `index.html` — Machinist Notes feature and column scaling fix

## Migration Notes

No migration required. All changes are backward compatible. Existing saved form data without `machinistNotes` will render an empty textarea (the `|| ''` fallback handles missing data gracefully).






