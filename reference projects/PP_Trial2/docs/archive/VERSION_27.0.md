# Version 27.0 - Multi-Bug Fix Release

**Release Date:** February 12, 2026

## Status
✅ Stable

## Summary
Version 27.0 addresses 9 bugs spanning dropdown population, lock/unlock behavior, time parsing, and program name generation. All changes are in `index.html`.

## Bug Fixes

### 1. Programmer Dropdown Missing on Non-First Operations
**Problem:** The programmer name dropdown only appeared on Primary Operation 1. Additional primary operations did not show the dropdown, particularly when secondary processes were present in the operations list.

**Root Cause:** `populateDatalist()` had no null check. When iterating all operations (including secondary ones), calling `populateDatalist('programmerList_N', ...)` crashed on secondary processes that lack that datalist element, halting the loop and preventing subsequent primary operations from being populated.

**Fix:** Added a null guard in `populateDatalist()` that returns silently if the datalist element is not found.

### 2. Save Buttons Not Greyed Out When Locked
**Problem:** Save and Save As buttons remained fully clickable when the form was locked.

**Root Cause:** CSS explicitly overrode the lock behavior for `.form-locked .header-button.save-button` with `opacity: 1 !important; pointer-events: auto !important;`.

**Fix:** Removed the CSS override so save buttons follow the standard locked behavior (greyed out, not clickable). The unlock button retains its own exception.

### 3. Material Field Now Typeable
**Problem:** The Material field in Job Information was a `<select>` dropdown that did not allow free-text entry for uncommon materials.

**Fix:** Converted the `<select id="material">` to an `<input type="text" id="material" list="materialList">` with a `<datalist>`. Users can now type custom material names or select from the predefined dropdown. Updated `loadReferenceData()` and `loadFormData()` to work with the new input element.

### 4. Machine Coord Fields Greyed Out When Unlocked
**Problem:** Machine Coordinate fields were usable when the form was unlocked, interfering with programmer workflow and tabbing.

**Fix:** In `applyLockState()`, machine coord fields are now explicitly disabled (with dimmed styling) when the form is unlocked, and re-enabled with `editable-when-locked` class when locked. This keeps them out of the tab order for programmers while remaining usable for shop floor staff.

### 5. X/Y/Z Axis Dropdown Restored
**Problem:** The X, Y, and Z axis fields used to have dropdown suggestions but the dropdowns stopped appearing.

**Root Cause:** The axis fields were `<div contenteditable="true">` elements with `list` attributes pointing to `<datalist>` elements. However, `datalist` only works with `<input>` elements — it has no effect on contenteditable divs.

**Fix:** Converted the X/Y/Z (and W) axis fields from `<div contenteditable>` to `<input type="text" list="...">` elements, matching the pattern used by the Fixture field. The axis suggestion data (`axisSuggestions` in `referenceData`) was already present and the datalists were already being populated — now the native browser dropdown appears correctly.

### 6. Improved Time Reformatting for Decimal Hours
**Problem:** Entering times like "1.75 hr", "1.75hrs", or ".5hrs" was not properly reformatted. The parser used `parseInt` which truncated decimals, and "minutes" was not recognized as a suffix.

**Fix:** Updated `parseRuntimeToMinutes()`:
- Hour regex changed to `/(\d*\.?\d+)\s*hrs?\b/i` with `parseFloat` to capture decimal hours
- Minute regex changed to `/(\d+)\s*(?:m(?:in(?:ute)?s?)?)\b/i` to recognize "m", "min", "mins", "minute", "minutes"

**Example conversions:**
- "1.75 hr" / "1.75hrs" → "1hr 45m"
- ".5hrs" → "30m"
- "45 minutes" → "45m"

### 7. INIT Fields Editable When Locked
**Problem:** The INIT (Initials) fields in tooling tables were not editable when the form was locked, despite being intended for shop floor sign-off.

**Root Cause:** The `applyLockState()` function used a fragile column-index-based approach to find INIT columns by matching header text, which was unreliable due to timing and table structure variations.

**Fix:** INIT inputs are now marked with `data-init-field="true"` directly during `renderTable()`. The `applyLockState()` function simply queries for `input[data-init-field="true"]` and adds the `editable-when-locked` class. This works reliably regardless of column order, timing, or table type (tooling and compensation).

### 8. Secondary Operations No Longer Affect Total Program Time
**Problem:** Adding secondary operations was incorrectly contributing to the total program time calculated in the Job Information section.

**Root Cause:** `calculateTotalRuntime()` iterated ALL operations including secondary ones. `calculateOperationRuntime()` also attempted to write to `programInfo.operationRuntime` which doesn't exist on secondary processes, potentially causing errors.

**Fix:** Added `if (op.type === 'secondary') return;` in both `calculateTotalRuntime()` and `calculateOperationRuntime()`, plus a guard check for `programInfo` before writing to it.

### 9. Program Names No Longer Interrupted by Secondary Processes
**Problem:** When a secondary process was inserted between two primary operations, the second primary operation received letter "C" instead of "B" in its auto-generated program name (e.g., "C-PartNumber" instead of "B-PartNumber").

**Root Cause:** Both `updateProgramNames()` and `updateOperationTitlesAndProgramNames()` used `String.fromCharCode(65 + index)` where `index` was the position in the full operations array (including secondary processes).

**Fix:** Replaced the raw array index with a `primaryIndex` counter that only increments for primary operations. Secondary processes are skipped entirely in the lettering logic.

## Technical Details

### Functions Modified
- `populateDatalist()` — Added null guard
- `applyLockState()` — Simplified INIT detection; added machine coord unlock disable logic
- `parseRuntimeToMinutes()` — Enhanced regex for decimal hours and "minutes" suffix
- `calculateOperationRuntime()` — Added secondary process guard and programInfo null check
- `calculateTotalRuntime()` — Added secondary process skip
- `updateProgramNames()` — Uses primaryIndex counter instead of array index
- `updateOperationTitlesAndProgramNames()` — Uses primaryIndex counter instead of array index
- `renderTable()` — Marks initials inputs with `data-init-field="true"`
- `loadReferenceData()` — Updated for material datalist instead of select

### HTML Changes
- Material field converted from `<select>` to `<input type="text">` with `<datalist>`
- X/Y/Z/W axis fields converted from `<div contenteditable>` to `<input type="text">` with `<datalist>`
- Save button CSS override removed
- Version footer updated to 27.0

## Files Modified

### Modified Files
- `index.html` — All 9 bug fixes applied

## Migration Notes

No migration required. All changes are backward compatible. Existing saved form data will load correctly — material values and axis values stored as plain text will populate the new input fields without issue.








