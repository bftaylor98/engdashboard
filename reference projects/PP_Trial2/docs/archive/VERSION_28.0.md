# Version 28.0 - Tool Import & Form Behavior Fixes

**Release Date:** February 13, 2026

## Status
✅ Stable

## Summary
Version 28.0 addresses 6 bugs related to text formatting, tool import parsing, and form auto-lock timing. All changes are in `index.html`.

## Bug Fixes

### 1. Text Formatting Tools Now Work in General Notes
**Problem:** The text formatting toolbar (bold, italic, underline, font size, color) did not work in the "General Notes" field within each operation.

**Root Cause:** General Notes was rendered as a `<textarea>`, but the formatting system (`setupRichTextEditors()`, `applyTextFormat()`) only operates on `<div class="rich-text-editor" contenteditable="true">` elements.

**Fix:** Converted the General Notes `<textarea>` to a `<div class="rich-text-editor" contenteditable="true">` and added `generalNotes` handling in three sync functions: `syncRichTextData()`, `syncOperationData()`, and the second `syncData` function used during save.

### 2. Tool Import - SO Value No Longer Gets RAD Value
**Problem:** When importing tools from Excel, the Stickout (SO) field was incorrectly populated with the RAD value, resulting in the RAD value appearing in both fields.

**Root Cause:** In `parseToolRowsFromExcel()`, if the stickout column header didn't match any known pattern, `stickoutCol` defaulted to index 3. If `radCol` was detected at index 3, both columns pointed to the same data.

**Fix:**
- Added additional header patterns for stickout detection: `LENGTH`, `LEN`, `LGTH`
- Changed the default stickout position to `radCol + 1` instead of hardcoded `3`
- Added a collision guard: if `stickoutCol === radCol`, stickout is moved to `radCol + 1`

### 3. Tool Import - RAD Rounds Up to 3 Decimal Places
**Problem:** Imported RAD/corner values were not being rounded, unlike stickout which already had rounding logic.

**Fix:** Added `Math.ceil` rounding to 3 decimal places for the RAD/corner value in `confirmToolImport()`, matching the existing pattern used for stickout (which rounds to 2 decimal places). Leading zeros before the decimal are removed (e.g., "0.078" becomes ".078").

### 4. Tool Import - Descriptions No Longer Cut Off (HTML Parser)
**Problem:** Tool descriptions imported from HTML files were getting truncated when Excel split them across multiple `<span>` elements at the same vertical position.

**Root Cause:** The HTML parser used `!toolName` as a guard, so only the first matching span was captured. The `text.length > 3` condition also filtered out short but valid text fragments.

**Fix:** Changed the tool name extraction in both HTML parser locations (primary and fallback) from single-capture to concatenation of all spans in the tool name column range (left 0.4–2.3 inches). Removed the `text.length > 3` restriction while keeping the pure-number exclusion filter.

### 5. Tool Import - Descriptions No Longer Cut Off (Excel Parser)
**Problem:** Long tool descriptions that wrap into the next Excel row were being truncated (e.g., "6mm Hitachi Turbo Ball Endmill - 80mm Neck" imported as only "6mm Hitachi Turbo Ball Endmill -").

**Root Cause:** In `parseToolRowsFromExcel()`, continuation rows (where the tool number column is empty but the tool name column has text) were skipped entirely by the `!toolNumber` check.

**Fix:** Added continuation-row detection before the skip logic: if a row has no tool number but has tool name text, and there is already a parsed tool, the text is appended to the previous tool's `toolName`. The heuristic is that a valid new tool always has a numeric value in column A.

### 6. Auto-Lock Timer Changed to 8 Minutes
**Problem:** The form auto-locked after 3 minutes of inactivity, which was too short.

**Fix:** Changed `AUTO_LOCK_TIME` from `3 * 60 * 1000` to `8 * 60 * 1000`.

## Technical Details

### Functions Modified
- `syncRichTextData()` — Added `generalNotes` section handling
- `syncOperationData()` — Added `generalNotes` in rich-text-editor branch
- Second `syncData` function — Added `generalNotes` in rich-text-editor branch
- `parseToolRowsFromExcel()` — Added stickout header patterns, collision guard, continuation row detection
- `confirmToolImport()` — Added `Math.ceil` rounding to 3 decimal places for RAD/corner
- `parseToolImportHTML()` — Changed tool name extraction to concatenate spans (both primary and fallback parsers)

### HTML Changes
- General Notes field converted from `<textarea>` to `<div class="rich-text-editor" contenteditable="true">`
- `AUTO_LOCK_TIME` constant changed from 3 to 8 minutes
- Version footer updated to 28.0

## Files Modified

### Modified Files
- `index.html` — All 6 bug fixes applied

## Migration Notes

No migration required. All changes are backward compatible. Existing saved form data with General Notes stored as plain text will display correctly in the new contenteditable div.






