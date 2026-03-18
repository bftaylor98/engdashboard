# Transaction Report with Stock Levels - Brain File

## Overview

This report (`report_item_transactions.py`) generates a comprehensive HTML report that combines:
- Transaction history (vending/issuing) for items
- Current stock levels and minimum quantities
- Below-minimum stock identification
- Price and cost-to-replenish calculations
- Average monthly usage and maximum usage statistics
- Interactive filtering and period selection

The report shows all items that have had transactions since a specified date (default: 3 years back from February 1st), with expandable rows showing detailed transaction history and monthly trend charts.

---

## Database Schema & Tables

### Primary Tables Used

1. **`dbo.ENT_ITEM_MASTER`** - Item master data
   - `ITEM_KEY` (PK) - Unique identifier
   - `ITEM_CODE` - Item code/part number
   - `ITEM_DESCRIPTION` - Item description
   - `ITEM_PRICE` - Unit price
   - `BOOL_BITUL` - Deleted flag (0 = active)

2. **`dbo.ENT_STOCK_MANAGE_LEVEL`** - Stock level management
   - `ITEM_KEY` (FK) - Links to ENT_ITEM_MASTER
   - `STOCK_QTY` - Current stock quantity
   - `MIN_QTY_OV` - Override minimum quantity (if set)
   - `MIN_QTY_CALC` - Calculated minimum quantity
   - `ORDERED_QTY` - Quantity on order
   - `BIN_KEY` (FK) - Links to bin location
   - `CABINET_KEY` (FK) - Links to cabinet location
   - `BOOL_BITUL` - Deleted flag (0 = active)

3. **`dbo.ENT_TRANSACTION_LOG`** - Transaction history
   - `TRANSACTION_KEY` (PK) - Unique identifier
   - `ITEM_KEY` (FK) - Links to item
   - `TRN_DATE` - Transaction date
   - `TRANSACTION_QTY` - Quantity (negative for vending/issuing)
   - `TRANSACTION_TYPE_KEY` (FK) - Links to transaction type
   - `BIN_KEY` (FK) - Bin location at time of transaction
   - `CABINET_KEY` (FK) - Cabinet location at time of transaction

4. **`dbo.TVL_TRANSACTION_TYPE`** - Transaction type lookup
   - `TRANSACTION_TYPE_KEY` (PK)
   - `TRANSACTION_TYPE_NAME` - Name (e.g., "Issue", "Vend")

5. **`dbo.ENT_BIN_MASTER`** - Bin location master
   - `BIN_KEY` (PK)
   - `BIN_CODE` - Bin code (e.g., "TP-01-01-08")

6. **`dbo.ENT_CABINET_MASTER`** - Cabinet location master
   - `CABINET_KEY` (PK)
   - `CABINET_CODE` - Cabinet code

---

## Query Structure

### Main Query (QUERY)

The main query uses subqueries to avoid Cartesian product issues when joining transactions with stock levels:

```sql
SELECT
    m.ITEM_DESCRIPTION,
    m.ITEM_CODE,
    m.ITEM_KEY,
    -- Transaction aggregations (from JOIN)
    ISNULL(SUM(CASE WHEN t.TRN_DATE >= ? AND ... THEN ABS(t.TRANSACTION_QTY) ELSE 0 END), 0) AS TOTAL_VENDED,
    ISNULL(COUNT(DISTINCT CASE WHEN ... THEN t.TRANSACTION_KEY ELSE NULL END), 0) AS VEND_COUNT,
    -- Stock aggregations (from subqueries to avoid Cartesian product)
    ISNULL((SELECT SUM(s2.STOCK_QTY) FROM dbo.ENT_STOCK_MANAGE_LEVEL s2 WHERE s2.ITEM_KEY = m.ITEM_KEY AND s2.BOOL_BITUL = 0), 0) AS STOCK_QTY,
    ISNULL((SELECT MAX(COALESCE(NULLIF(s2.MIN_QTY_OV, 0), s2.MIN_QTY_CALC, 0)) FROM ...), 0) AS MIN_QTY,
    ISNULL((SELECT SUM(s2.ORDERED_QTY) FROM ...), 0) AS ORDERED_QTY,
    m.ITEM_PRICE
FROM dbo.ENT_ITEM_MASTER m
LEFT JOIN dbo.ENT_TRANSACTION_LOG t ON m.ITEM_KEY = t.ITEM_KEY
LEFT JOIN dbo.TVL_TRANSACTION_TYPE tt ON t.TRANSACTION_TYPE_KEY = tt.TRANSACTION_TYPE_KEY
WHERE m.BOOL_BITUL = 0
GROUP BY m.ITEM_DESCRIPTION, m.ITEM_CODE, m.ITEM_KEY, m.ITEM_PRICE
HAVING ISNULL(COUNT(DISTINCT CASE WHEN ... THEN t.TRANSACTION_KEY ELSE NULL END), 0) > 0
ORDER BY m.ITEM_DESCRIPTION
```

**Key Points:**
- Uses subqueries for stock data to prevent multiplication when items have many transactions
- Filters transactions to only "Issue", "Vend", or negative quantities
- Only includes items that have at least one qualifying transaction
- Date parameter (`?`) is used 3 times (for filtering transactions)

### Transaction Query (TRANSACTION_QUERY)

Fetches individual transaction records for an item:

```sql
SELECT
    t.TRN_DATE,
    ABS(t.TRANSACTION_QTY) AS VENDED_QTY,
    b.BIN_CODE,
    c.CABINET_CODE,
    tt.TRANSACTION_TYPE_NAME
FROM dbo.ENT_TRANSACTION_LOG t
LEFT JOIN dbo.ENT_BIN_MASTER b ON t.BIN_KEY = b.BIN_KEY
LEFT JOIN dbo.ENT_CABINET_MASTER c ON t.CABINET_KEY = c.CABINET_KEY
LEFT JOIN dbo.TVL_TRANSACTION_TYPE tt ON t.TRANSACTION_TYPE_KEY = tt.TRANSACTION_TYPE_KEY
WHERE t.ITEM_KEY = ?
    AND t.TRN_DATE >= ?
    AND (tt.TRANSACTION_TYPE_NAME LIKE '%Issue%' OR tt.TRANSACTION_TYPE_NAME LIKE '%Vend%' OR t.TRANSACTION_QTY < 0)
ORDER BY t.TRN_DATE DESC
```

**Parameters:**
- `?` (first) - ITEM_KEY
- `?` (second) - since_date (cutoff date)

### Monthly Query (MONTHLY_QUERY)

Aggregates transactions by month for charting:

```sql
SELECT
    YEAR(t.TRN_DATE) AS YEAR,
    MONTH(t.TRN_DATE) AS MONTH,
    SUM(ABS(t.TRANSACTION_QTY)) AS VENDED_QTY
FROM dbo.ENT_TRANSACTION_LOG t
LEFT JOIN dbo.TVL_TRANSACTION_TYPE tt ON t.TRANSACTION_TYPE_KEY = tt.TRANSACTION_TYPE_KEY
WHERE t.ITEM_KEY = ?
    AND t.TRN_DATE >= ?
    AND (tt.TRANSACTION_TYPE_NAME LIKE '%Issue%' OR tt.TRANSACTION_TYPE_NAME LIKE '%Vend%' OR t.TRANSACTION_QTY < 0)
GROUP BY YEAR(t.TRN_DATE), MONTH(t.TRN_DATE)
ORDER BY YEAR(t.TRN_DATE), MONTH(t.TRN_DATE)
```

**Parameters:**
- `?` (first) - ITEM_KEY
- `?` (second) - since_date (cutoff date)

---

## Data Processing Flow

### 1. Main Query Execution

```python
cursor.execute(QUERY, since_date, since_date, since_date)
items = cursor.fetchall()
```

Returns one row per item with:
- Index 0: ITEM_DESCRIPTION
- Index 1: ITEM_CODE
- Index 2: ITEM_KEY
- Index 3: TOTAL_VENDED
- Index 4: VEND_COUNT
- Index 5: STOCK_QTY
- Index 6: MIN_QTY
- Index 7: ORDERED_QTY
- Index 8: ITEM_PRICE

### 2. Per-Item Processing Loop

For each item, the code:

#### a. Extracts Stock Information
```python
stock_qty = float(item[5])
min_qty = float(item[6])
ordered_qty = float(item[7])
item_price = float(item[8])
```

#### b. Calculates Below-Minimum Status
```python
is_below_minimum = (min_qty > 0 and stock_qty < min_qty and 
                   (ordered_qty is None or ordered_qty == 0))
shortage = (min_qty - stock_qty) if is_below_minimum else 0.0
cost_to_replenish = shortage * item_price if is_below_minimum else 0.0
```

**Logic:**
- Item is below minimum if:
  - Minimum quantity is set (> 0)
  - Stock is less than minimum
  - Not currently on order (ORDERED_QTY is 0 or NULL)

#### c. Fetches Transaction Details
```python
cursor.execute(TRANSACTION_QUERY, item_key, since_date)
transactions = cursor.fetchall()
```

Gets individual transaction records with date, quantity, location, and type.

#### d. Fetches Monthly Aggregated Data
```python
cursor.execute(MONTHLY_QUERY, item_key, since_date)
monthly_data = cursor.fetchall()
```

Gets monthly totals for charting.

#### e. Builds Monthly List
Creates a complete list of all months from `since_date` to current date, filling in zeros for months with no transactions:

```python
monthly_list = []
# Loop through all months from since_date to now
while (year < current_year) or (year == current_year and month <= current_month):
    key = f"{year}-{month:02d}"
    qty = monthly_dict.get(key, 0.0)  # Get from query results or default to 0
    month_label = f"{month_abbr}. {year_abbr}'"  # Format: "Jan. 25'"
    monthly_list.append({
        'month': month_label,
        'month_sort': key,  # For sorting: "2025-01"
        'qty': qty
    })
```

#### f. Calculates Statistics

**Average Monthly (Last 12 Months):**
```python
# Only counts last 12 months
if 0 <= months_ago < 12:
    total_vended_12mo += qty
    if qty > 0:
        months_with_data += 1
avg_monthly = math.ceil(total_vended_12mo / months_with_data) if months_with_data > 0 else 0
```

**Average Monthly Use (Full Period):**
```python
total_vended_period = sum(d['qty'] for d in monthly_list)
months_in_period = len(monthly_list)
avg_monthly_use = math.ceil(total_vended_period / months_in_period) if months_in_period > 0 else 0
```

**Max Usage:**
```python
max_usage = max((d['qty'] for d in monthly_list), default=0.0)
max_usage = math.ceil(max_usage) if max_usage > 0 else 0
```

#### g. Builds Data Structure
```python
items_with_data.append({
    'item': item,                    # Raw query result row
    'transactions': tx_list,          # List of transaction dicts
    'monthly_data': monthly_list,     # List of monthly data dicts
    'avg_monthly_12mo': avg_monthly,  # Last 12 months average
    'avg_monthly_use': avg_monthly_use,  # Full period average
    'max_usage': max_usage,           # Maximum single month
    'stock_qty': stock_qty,
    'min_qty': min_qty,
    'shortage': shortage,
    'is_below_minimum': is_below_minimum,
    'item_price': item_price,
    'cost_to_replenish': cost_to_replenish
})
```

---

## HTML Generation

### Template Structure

The HTML is generated using string replacement in `generate_html_report()`:

1. **Header Section** - Title and subtitle
2. **Summary Section** - Total items, below minimum count, shortage, cost
3. **Period Controls** - Buttons for 1yr/3yr and All Items/Below Minimum Only
4. **Table Section** - Main data table with expandable rows
5. **Footer Section** - Instructions and timestamp

### Table Row Generation

Each item generates two rows:

#### 1. Data Row
```html
<tr class="data-row below-minimum" id="item0" 
    data-tx-data='[...]' 
    data-monthly-data='[...]' 
    data-below-minimum="true">
    <td><span class="expand-icon">▶</span></td>
    <td>Item Description</td>
    <td>Item Code</td>
    <td>Current Stock</td>
    <td>Minimum</td>
    <td>Shortage</td>
    <td>Unit Price</td>
    <td>Cost to Replenish</td>
    <td id="avg-monthly-item0">Avg Monthly Use</td>
    <td id="max-usage-item0">Max Usage</td>
</tr>
```

**Data Attributes:**
- `data-tx-data` - JSON array of all transactions (for period filtering)
- `data-monthly-data` - JSON array of monthly data (for period filtering)
- `data-below-minimum` - Boolean string for filtering

**CSS Classes:**
- `data-row` - Base class for all data rows
- `below-minimum` - Added if item is below minimum (red highlighting)

#### 2. Transaction Detail Row (Hidden by default)
```html
<tr class="transaction-row" id="tx-item0">
    <td colspan="10" class="transaction-cell">
        <div class="chart-section">
            <canvas data-chart='[...]'></canvas>
        </div>
        <table class="transaction-table">
            <!-- Individual transaction rows -->
        </table>
    </td>
</tr>
```

**CSS Classes:**
- `transaction-row` - Hidden by default (`display: none`)
- `transaction-row.expanded` - Shown when expanded (`display: table-row`)

### Chart Data

Chart.js is used for monthly trend visualization. Data is embedded as JSON in the canvas element:

```javascript
{
    "labels": ["Jan. 23'", "Feb. 23'", ...],
    "data": [10, 15, 8, ...]
}
```

---

## JavaScript Functionality

### 1. Sortable Table (`sortTable(columnIndex)`)

**Purpose:** Allows clicking column headers to sort the table

**Process:**
1. Gets all data rows (excludes transaction rows)
2. Determines current sort direction
3. Sorts rows by column value (numeric or string)
4. Reorders DOM elements (maintaining transaction row relationships)
5. Updates header classes to show sort direction

**Key Points:**
- Only sorts `tr.data-row` elements
- Preserves transaction rows next to their parent data row
- Handles numeric and string comparisons

### 2. Toggle Transactions (`toggleTransactions(rowId)`)

**Purpose:** Expands/collapses transaction detail rows

**Process:**
1. Gets transaction row and icon element
2. Toggles `expanded` class on transaction row
3. Changes icon from ▶ to ▼ (or vice versa)
4. If expanding, creates Chart.js chart if it doesn't exist

**Chart Creation:**
- Reads chart data from `data-chart` attribute
- Parses JSON (handling HTML entity encoding)
- Creates line chart with Chart.js
- Stores chart instance on canvas element for reuse

### 3. Period Filtering (`setPeriod(years)`)

**Purpose:** Filters data to show 1 year or 3 years of transactions

**Process:**
1. Calculates cutoff date (February 1st, X years ago)
2. For each data row:
   - Filters transaction data to period
   - Filters transaction table rows
   - Updates chart data
   - **Recalculates Avg Monthly Use and Max Usage**

**Avg Monthly Use Recalculation:**
```javascript
// Get monthly data from data attribute
const monthlyDataList = JSON.parse(row.getAttribute('data-monthly-data'));

// Filter to selected period
const filteredMonthlyData = monthlyDataList.filter(month => {
    // Parse month label and compare to cutoff date
    return monthDate >= cutoffDate;
});

// Calculate average
const totalVendedPeriod = filteredMonthlyData.reduce((sum, m) => sum + m.qty, 0);
const monthsInPeriod = filteredMonthlyData.length;
const avgMonthlyUse = monthsInPeriod > 0 ? Math.ceil(totalVendedPeriod / monthsInPeriod) : 0;

// Update cell
document.getElementById('avg-monthly-' + rowId).textContent = avgMonthlyUse;
```

**Max Usage Recalculation:**
```javascript
const maxUsage = filteredMonthlyData.length > 0 
    ? Math.ceil(Math.max(...filteredMonthlyData.map(m => m.qty))) 
    : 0;
document.getElementById('max-usage-' + rowId).textContent = maxUsage;
```

**Chart Update:**
- Filters chart labels and data arrays
- Updates Chart.js instance
- Maintains full data in `data-chart-full` attribute

### 4. Item Filtering (`setFilter(filter)`)

**Purpose:** Shows all items or only below-minimum items

**Process:**
1. Updates button active states
2. For each data row:
   - Checks `data-below-minimum` attribute
   - Shows/hides row based on filter
   - Hides transaction row if parent is hidden

---

## Key Functions Reference

### `generate_report()`

**Main entry point.** Orchestrates the entire report generation.

**Steps:**
1. Connects to database
2. Executes main query
3. For each item:
   - Fetches transaction details
   - Fetches monthly data
   - Calculates statistics
   - Builds data structure
4. Generates HTML
5. Writes to file

**Returns:** List of item data dictionaries

### `generate_html_report(items_with_data, since_date, total_below_minimum, total_shortage, total_cost)`

**Generates the HTML report.**

**Parameters:**
- `items_with_data` - List of processed item dictionaries
- `since_date` - Cutoff date for transactions
- `total_below_minimum` - Count of items below minimum
- `total_shortage` - Total shortage quantity
- `total_cost` - Total cost to replenish

**Process:**
1. Builds HTML template with placeholders
2. Generates table rows for each item
3. Replaces placeholders with actual data
4. Returns complete HTML string

**Key Placeholders:**
- `{total_items}` - Number of items
- `{below_min_count}` - Items below minimum
- `{total_shortage:.0f}` - Total shortage
- `{total_cost:.2f}` - Total cost
- `{timestamp}` - Generation timestamp
- `{table_rows}` - Generated table HTML

---

## Integration Points

### To Integrate into Another Report

#### 1. Extract Query Logic

You can reuse the query structure:

```python
# Main query for items with transactions
QUERY = """..."""

# Per-item transaction query
TRANSACTION_QUERY = """..."""

# Per-item monthly aggregation
MONTHLY_QUERY = """..."""
```

#### 2. Extract Data Processing

The per-item processing loop can be adapted:

```python
for item in items:
    item_key = item[2]
    
    # Get stock info
    stock_qty = float(item[5])
    min_qty = float(item[6])
    # ... calculate below-minimum status
    
    # Get transactions
    cursor.execute(TRANSACTION_QUERY, item_key, since_date)
    transactions = cursor.fetchall()
    
    # Get monthly data
    cursor.execute(MONTHLY_QUERY, item_key, since_date)
    monthly_data = cursor.fetchall()
    
    # Process and calculate statistics
    # ...
```

#### 3. Extract HTML Components

**Table Structure:**
- Copy the table header structure
- Adapt the row generation loop
- Modify columns as needed

**JavaScript Functions:**
- `sortTable()` - Generic, reusable
- `toggleTransactions()` - Adaptable for any expandable row
- `setPeriod()` - Can be adapted for different date ranges
- `setFilter()` - Generic filtering function

#### 4. Customization Points

**Date Range:**
```python
since_date = date(now.year - 3, 2, 1)  # Change years or month
```

**Transaction Filtering:**
```python
# Current: Issue, Vend, or negative quantities
AND (tt.TRANSACTION_TYPE_NAME LIKE '%Issue%' OR 
     tt.TRANSACTION_TYPE_NAME LIKE '%Vend%' OR 
     t.TRANSACTION_QTY < 0)

# Could be modified to:
AND tt.TRANSACTION_TYPE_NAME = 'Specific Type'
```

**Below Minimum Logic:**
```python
# Current: excludes items on order
is_below_minimum = (min_qty > 0 and stock_qty < min_qty and 
                   (ordered_qty is None or ordered_qty == 0))

# Could include items on order:
is_below_minimum = (min_qty > 0 and stock_qty < min_qty)
```

**Statistics Calculation:**
- Modify `avg_monthly_use` calculation (currently full period average)
- Modify `max_usage` calculation (currently max of all months)
- Add new statistics (e.g., median, standard deviation)

---

## Data Structures

### Item Data Dictionary

```python
{
    'item': tuple,              # Raw query result (9 elements)
    'transactions': list,        # List of transaction dicts
    'monthly_data': list,       # List of monthly data dicts
    'avg_monthly_12mo': int,    # Last 12 months average
    'avg_monthly_use': int,     # Full period average
    'max_usage': int,           # Maximum single month
    'stock_qty': float,         # Current stock
    'min_qty': float,           # Minimum quantity
    'shortage': float,          # Shortage amount
    'is_below_minimum': bool,   # Below minimum flag
    'item_price': float,        # Unit price
    'cost_to_replenish': float  # Cost to replenish
}
```

### Transaction Dictionary

```python
{
    'date': str,        # "YYYY-MM-DD HH:MM:SS"
    'qty': float,       # Quantity vended
    'bin': str,         # Bin code
    'cabinet': str,     # Cabinet code
    'type': str         # Transaction type name
}
```

### Monthly Data Dictionary

```python
{
    'month': str,         # "Jan. 25'" (formatted label)
    'month_sort': str,  # "2025-01" (for sorting)
    'qty': float        # Quantity for that month
}
```

---

## CSS Classes Reference

### Row Classes
- `.data-row` - Base class for all data rows
- `.data-row.below-minimum` - Items below minimum (red background)
- `.transaction-row` - Hidden transaction detail rows
- `.transaction-row.expanded` - Visible transaction detail rows

### Cell Classes
- `.item-code` - Monospace font for item codes
- `.item-desc` - Item description styling
- `.number` - Right-aligned, monospace for numbers
- `.price` - Right-aligned, monospace for prices
- `.cost` - Red, bold for cost to replenish
- `.shortage` - Red, bold for shortage amounts

### Interactive Elements
- `.expand-icon` - Clickable arrow icon (▶/▼)
- `.period-btn` - Period filter buttons
- `.period-btn.active` - Active period button
- `.sortable` - Sortable column headers

---

## JavaScript Data Attributes

### Row Attributes
- `data-tx-data` - JSON array of all transactions
- `data-monthly-data` - JSON array of monthly data
- `data-below-minimum` - "true" or "false" string

### Canvas Attributes
- `data-chart` - JSON chart data (labels and data arrays)
- `data-chart-full` - Full chart data (stored on load for filtering)

### Cell IDs
- `avg-monthly-{rowId}` - Average monthly use cell
- `max-usage-{rowId}` - Max usage cell
- `icon-{rowId}` - Expand/collapse icon
- `tx-{rowId}` - Transaction detail row

---

## Dependencies

### Python Packages
- `pyodbc` - Database connectivity
- `json` - JSON encoding/decoding
- `math` - Math functions (ceil)
- `datetime` - Date handling
- `calendar` - Month name abbreviations

### External JavaScript Libraries
- **Chart.js 4.4.0** - Charting library (loaded from CDN)
  - URL: `https://cdn.jsdelivr.net/npm/chart.js@4.4.0/dist/chart.umd.min.js`

### Configuration
- `config.py` - Contains `get_connection_string()` function
  - Returns ODBC connection string for SQL Server

---

## File Output

**Output File:** `item_transactions_report.html`

**Location:** Same directory as script

**Format:** Complete HTML document with embedded CSS and JavaScript

**Size:** Varies based on number of items and transactions (can be large for many items)

---

## Performance Considerations

### Database Queries
- Main query: 1 query for all items
- Per-item queries: 2 queries per item (transactions + monthly)
- **Total queries:** 1 + (N × 2) where N = number of items

**Optimization Opportunities:**
- Could batch transaction queries
- Could use CTEs or temp tables for complex aggregations
- Consider pagination for large datasets

### Data Processing
- Monthly list generation: O(M) where M = months in period (~36 months)
- Statistics calculation: O(M) per item
- **Total complexity:** O(N × M) where N = items, M = months

### HTML Generation
- String concatenation for table rows
- JSON encoding for data attributes
- **Memory usage:** Grows with number of items and transactions

---

## Error Handling

### Database Errors
- Connection errors: Prints error and returns None
- Query errors: Prints error, closes connection, returns None
- Transaction query errors: Caught in try/except, returns empty list

### Data Processing Errors
- Missing data: Uses default values (0.0, empty strings)
- Type conversion: Wrapped in try/except with defaults

### JavaScript Errors
- JSON parsing: Wrapped in try/catch with console.error
- Chart creation: Wrapped in try/catch with console.error
- Missing elements: Null checks before DOM manipulation

---

## Testing Scenarios

### Edge Cases to Test
1. **No transactions** - Item should not appear (HAVING clause filters)
2. **No stock records** - Stock quantities should be 0
3. **Multiple stock locations** - Stock should be summed correctly
4. **Zero price** - Price should display as "-"
5. **No monthly data** - Avg and max should be 0
6. **Single transaction** - Should still calculate correctly
7. **Very old transactions** - Should respect date cutoff
8. **Future dates** - Should handle gracefully

### Browser Compatibility
- Tested with modern browsers (Chrome, Edge, Firefox)
- Uses ES6 features (arrow functions, const/let)
- Chart.js handles browser differences

---

## Future Enhancement Ideas

1. **Export to CSV/Excel** - Add export functionality
2. **Pagination** - For large datasets
3. **Search/Filter** - By item code or description
4. **Date Range Picker** - Custom date ranges instead of fixed 1yr/3yr
5. **Multiple Periods** - Compare different time periods
6. **Trend Analysis** - Show increasing/decreasing usage trends
7. **Reorder Suggestions** - Based on usage and lead time
8. **Email Reports** - Automated report generation and delivery
9. **PDF Export** - Printable format
10. **Real-time Updates** - WebSocket integration for live data

---

## Common Modifications

### Change Date Range
```python
# Current: 3 years from February 1st
since_date = date(now.year - 3, 2, 1)

# Example: 1 year from January 1st
since_date = date(now.year - 1, 1, 1)

# Example: 6 months from current date
since_date = date(now.year, now.month - 6, 1)
```

### Add New Column
1. Add to query SELECT clause
2. Extract in processing loop
3. Add to items_with_data dictionary
4. Add table header
5. Add table cell in row generation
6. Update colspan in transaction-row

### Change Below Minimum Logic
```python
# Current: excludes items on order
is_below_minimum = (min_qty > 0 and stock_qty < min_qty and 
                   (ordered_qty is None or ordered_qty == 0))

# Include items on order:
is_below_minimum = (min_qty > 0 and stock_qty < min_qty)

# Add buffer (e.g., 10% above minimum):
is_below_minimum = (min_qty > 0 and stock_qty < (min_qty * 1.1) and 
                   (ordered_qty is None or ordered_qty == 0))
```

### Modify Statistics
```python
# Current: Average of all months in period
avg_monthly_use = math.ceil(total_vended_period / months_in_period)

# Alternative: Average of months with data only
months_with_data = len([m for m in monthly_list if m['qty'] > 0])
avg_monthly_use = math.ceil(total_vended_period / months_with_data) if months_with_data > 0 else 0

# Alternative: Weighted average
# (would need to implement weighting logic)
```

---

## Integration Example

### Minimal Integration

```python
from report_item_transactions import generate_report

# Generate report
items_data = generate_report()

# Access the data
for item in items_data:
    print(f"{item['item'][1]}: Stock={item['stock_qty']}, Below Min={item['is_below_minimum']}")
```

### Custom Report Using Same Logic

```python
import pyodbc
from config import get_connection_string
from datetime import date, datetime

# Use the same queries
QUERY = """..."""  # Copy from report_item_transactions.py

conn = pyodbc.connect(get_connection_string())
cursor = conn.cursor()

# Execute query
cursor.execute(QUERY, since_date, since_date, since_date)
items = cursor.fetchall()

# Process items (simplified)
for item in items:
    item_key = item[2]
    stock_qty = float(item[5])
    min_qty = float(item[6])
    
    # Your custom processing here
    # ...
```

---

## Notes

- All quantities are rounded UP using `math.ceil()`
- Dates are formatted as "Jan. 25'" for display
- Prices are formatted as currency with 2 decimal places
- Stock quantities are summed across all stock management levels
- Minimum quantity uses override if set, otherwise calculated minimum
- Transaction quantities use absolute value (ABS) for vending/issuing
- HTML uses UTF-8 encoding for special characters
- Console output uses UTF-8 encoding wrapper to handle Windows console

---

## Version History

- **Initial Version:** Basic transaction report with expandable details
- **Added:** Stock level information and below-minimum highlighting
- **Added:** Price and cost-to-replenish columns
- **Added:** Average monthly use and max usage columns
- **Removed:** Location (bin/cabinet) column
- **Fixed:** Stock quantity multiplication issue (Cartesian product)
- **Fixed:** Collapse functionality for transaction rows

---

## Contact & Support

For questions or modifications, refer to:
- Database schema: `probe_schema.py`
- Configuration: `config.py`
- Other reports: `report_low_stock.py`, `report_stock_grid.py`

