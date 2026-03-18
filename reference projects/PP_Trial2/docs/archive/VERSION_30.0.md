# Version 30.0 - Ctrl+Click Multi-Expand for Operations

**Release Date:** February 13, 2026

## Status
✅ Stable

## Summary
Version 30.0 adds a Ctrl+Click modifier to the operation accordion so that users can expand multiple operations simultaneously without changing the default one-at-a-time behavior.

## New Features

### 1. Ctrl+Click Multi-Expand
**Description:** By default, clicking an operation's collapse arrow still uses accordion behavior — expanding one operation collapses all others. Holding **Ctrl** (or **Cmd** on Mac) while clicking allows the user to expand or collapse individual operations independently, so multiple operations can be open at the same time.

**Use Case:** Accommodates users who need to view or reference multiple operations side by side without changing the default behavior for all users.

**Key Behavior:**
- **Normal click** — accordion mode (only one operation expanded at a time, unchanged default)
- **Ctrl+Click** — multi-expand mode (toggle the clicked operation without affecting others)
- Works for both primary operations and secondary processes

**Implementation:**
- `toggleOperation(index)` signature changed to `toggleOperation(index, event)`
- Added `const multiExpand = event && (event.ctrlKey || event.metaKey)` check
- The "collapse all others" loop is skipped when `multiExpand` is true
- Updated `querySelector` selector for collapse icons to match the new `onclick` signature
- Both onclick handlers in `renderOperations()` updated to pass `event`

## Technical Details

### Functions Modified
- `toggleOperation()` — Added `event` parameter, Ctrl/Cmd key detection, and conditional accordion logic

### HTML Changes
- Secondary process collapse button `onclick` updated to `toggleOperation(${index}, event)`
- Primary operation collapse button `onclick` updated to `toggleOperation(${index}, event)`
- Version footer updated to 30.0

## Files Modified

### Modified Files
- `index.html` — Ctrl+Click multi-expand feature and version bump

## Migration Notes

No migration required. All changes are backward compatible. Default behavior is completely unchanged — the Ctrl+Click modifier is purely additive.






