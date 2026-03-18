# Under Minimum Stock Reporting

This directory contains scripts for generating reports on items that are under their minimum stock requirements.

## Purpose

The under minimum stock report queries the ZOLLERSQLEXPRESS database to identify components that have fallen below their minimum stock thresholds. This helps with inventory management and reordering decisions.

## Files

- `test_under_minimum_report.py` - **Standalone test script** (RECOMMENDED)
  - For debugging and testing under minimum stock reporting
  - Automatically opens HTML report in browser when generated
  - Does NOT send to Power Automate
  - Uses same query logic as master report for consistency
  - Use this for testing before re-incorporating into master report

- `generate_under_minimum_report_legacy.py` - Legacy standalone script (DEPRECATED)
  - Older implementation, kept for reference only
  - Use `test_under_minimum_report.py` instead

## Usage

### Test Script (Recommended)

Run the standalone test script from the SQL_Probe directory:

```bash
python under_minimum_reporting/test_under_minimum_report.py
```

The test script will:
1. Connect to the ZOLLERSQLEXPRESS database
2. Query all components with minimum stock requirements
3. Compare current stock against minimum stock requirements
4. Generate an HTML report listing items that are under minimum
5. **Automatically open the report in your default browser**

### Legacy Script (Deprecated)

The legacy script `generate_under_minimum_report_legacy.py` is kept for reference only. Use `test_under_minimum_report.py` instead.

## Output

The test script generates an HTML file named `under_minimum_stock_test_YYYY_MM_DD_HHMMSS.html` with:
- Component ID (C-ID)
- Description
- Part Number (with hyperlinks to manufacturer websites)
- Value (UnitPrice from ValData)
- Current Stock
- Under Min (negative values highlighted in red)
- To Max (quantity needed to reach maximum)
- Price to Fill (Value × To Max)
- Total Price to Fill summary

The report automatically opens in your default browser when generated.

## Database Query Logic

The test script uses the same query logic as the master report:

1. **Stock Quantity**: Calculated from `StorageBooking.Quantity` where `Status = 0` (in stock only)
   - **Important**: Only counts items **in stock** (Status = 0), NOT items in circulation (Status != 0)
   - This ensures we flag components where stock is low, even if circulation has items
2. **Minimum Stock**: From `StorageBooking.StorageQuantityMin` (minimum value if multiple records exist)
3. **Maximum Stock**: From `StorageBooking.StorageQuantityMax` (maximum value if multiple records exist)
4. **Unit Price**: From `ValData` where `FieldInfo.ColumnName = 'UnitPrice'`

Only components with:
- A defined `StorageQuantityMin` > 0
- **Stock quantity** < Minimum stock (not total quantity)
- Are included in the report

**See `QUERY_CHANGES_DOCUMENTATION.md` for detailed explanation of the query changes.**

## Testing Workflow

1. **Run the test script**: `python under_minimum_reporting/test_under_minimum_report.py`
2. **Review the generated HTML report** (automatically opens in browser)
3. **Verify data accuracy**: Check that items shown are actually under minimum
4. **Test edge cases**: Empty results, components with missing data, etc.
5. **Once satisfied**: Re-incorporate the working query logic into the master report

## Integration with Master Report

Once the test script is working correctly, the same `query_under_minimum_items()` function logic can be re-incorporated into `generate_master_transaction_report.py`. The master report already has this function but may need updates based on testing results.


