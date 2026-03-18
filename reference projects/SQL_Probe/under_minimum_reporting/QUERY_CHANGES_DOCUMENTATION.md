# Under Minimum Stock Query Changes Documentation

## Date: 2025-12-19

## Problem Statement

The original query was incorrectly calculating current stock by including both **stock quantity** (items in stock) and **circulation quantity** (items checked out/in use). This caused the report to miss components that were under minimum stock.

### Example Issue
- **C-1**: Stock Qty = 0, Circulation Qty = 2, Min = 2
- **Original Query**: Calculated total as 2 (0 + 2), so it didn't flag as under minimum
- **Correct Behavior**: Should flag because Stock Qty (0) < Min (2)

## Solution

Changed the query to only calculate **Stock Quantity** (Status = 0) and exclude **Circulation Quantity** (Status != 0).

## Query Changes

### Before (Incorrect)
```sql
WITH ComponentCurrentStock AS (
    -- Calculated TOTAL quantity (stock + circulation)
    SELECT 
        od.ObjId,
        COALESCE(
            (SELECT SUM(COALESCE(sb.Quantity, 0))
             FROM StorageBooking sb
             WHERE sb.ObjId = od.ObjId
               AND sb.Status IN (0, 1, 2)  -- Included circulation items
            ),
            0
        ) AS CurrentStock
    FROM ObjData od
    WHERE od.ObjType = 11
)
```

### After (Correct)
```sql
WITH ComponentStockQuantity AS (
    -- Calculate STOCK quantity only (Status = 0 = in stock)
    -- Excludes circulation quantity (items checked out/in use)
    SELECT 
        od.ObjId,
        COALESCE(
            (SELECT SUM(COALESCE(sb.Quantity, 0))
             FROM StorageBooking sb
             WHERE sb.ObjId = od.ObjId
               AND sb.Status = 0  -- Only Status 0 = In Stock
            ),
            0
        ) AS StockQuantity
    FROM ObjData od
    WHERE od.ObjType = 11
)
```

## Key Changes

1. **CTE Name**: `ComponentCurrentStock` → `ComponentStockQuantity`
2. **Column Name**: `CurrentStock` → `StockQuantity`
3. **Status Filter**: `Status IN (0, 1, 2)` → `Status = 0`
4. **Logic**: Now only counts items **in stock**, not items **in circulation**

## StorageBooking Status Values

- **Status = 0**: In Stock (available in inventory)
- **Status != 0**: In Circulation (checked out, in use, etc.)

## Impact

- **Before**: Report missed components where stock was 0 but circulation had items
- **After**: Report correctly identifies all components where stock quantity < minimum, regardless of circulation quantity

## Files Updated

1. `under_minimum_reporting/test_under_minimum_report.py` - Test script (updated)
2. `generate_master_transaction_report.py` - Master report (needs update)

## Testing

Verified with:
- **C-1**: Stock 0, Circulation 2, Min 2 → Now correctly flagged
- **C-159**: Stock 3, Circulation 0, Min 2 → Correctly not flagged (above minimum)




