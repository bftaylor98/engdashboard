"""
report_stock_grid.py
Generates a visual grid report showing stock locations in an 8x10 grid format.
Each cell shows the part number and quantity for that location.
Combines under minimum reporting with usage reporting.
"""

import sys
import io
import re
import math
import calendar
from datetime import datetime, date
import pyodbc
from config import get_connection_string

# Avoid encoding errors when printing Unicode to the Windows console
sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding="utf-8", errors="replace")

# Calculate date for usage reporting - last 12 months
now = datetime.now()
since_date = date(now.year - 1, now.month, 1)  # 12 months of usage data

QUERY = """
    SELECT
        m.ITEM_CODE,
        m.ITEM_DESCRIPTION,
        s.STOCK_QTY,
        -- Use override min if it exists, otherwise use calculated min
        COALESCE(NULLIF(s.MIN_QTY_OV, 0), s.MIN_QTY_CALC, 0) AS MIN_QTY,
        s.ORDERED_QTY,
        b.BIN_CODE,
        c.CABINET_CODE,
        m.ITEM_KEY
    FROM dbo.ENT_STOCK_MANAGE_LEVEL s
    INNER JOIN dbo.ENT_ITEM_MASTER m ON s.ITEM_KEY = m.ITEM_KEY
    LEFT JOIN dbo.ENT_BIN_MASTER b ON s.BIN_KEY = b.BIN_KEY
    LEFT JOIN dbo.ENT_CABINET_MASTER c ON s.CABINET_KEY = c.CABINET_KEY
    WHERE m.BOOL_BITUL = 0
        AND s.BOOL_BITUL = 0
        AND b.BIN_CODE IS NOT NULL
    ORDER BY b.BIN_CODE
"""

USAGE_QUERY = """
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
"""


def parse_bin_location(bin_code):
    """
    Parse bin code like TP-01-01-08 to extract row and pocket.
    Format: CABINET-XX-YY-ZZ where YY is row (01-08) and ZZ is pocket (01-10)
    Returns (row, pocket) as integers, or (None, None) if invalid
    """
    if not bin_code:
        return None, None
    
    # Split by dashes
    parts = bin_code.split('-')
    if len(parts) >= 4:
        try:
            # Third segment is row (01-08), fourth is pocket (01-10)
            row = int(parts[2])
            pocket = int(parts[3])
            # Validate range
            if 1 <= row <= 8 and 1 <= pocket <= 10:
                return row, pocket
        except (ValueError, IndexError):
            pass
    
    return None, None


def calculate_usage(cursor, item_key):
    """Calculate average monthly usage for last 12 months."""
    try:
        cursor.execute(USAGE_QUERY, item_key, since_date)
        monthly_data = cursor.fetchall()
        
        # Create a dictionary of months with data
        monthly_dict = {}
        for month_row in monthly_data:
            year = month_row[0]
            month = month_row[1]
            qty = float(month_row[2]) if month_row[2] else 0.0
            key = f"{year}-{month:02d}"
            monthly_dict[key] = qty
        
        # Calculate last 12 months usage
        current_year = now.year
        current_month = now.month
        total_vended_12mo = 0.0
        months_with_data = 0
        
        # Count back 12 months
        for i in range(12):
            year = current_year
            month = current_month - i
            while month < 1:
                month += 12
                year -= 1
            
            key = f"{year}-{month:02d}"
            qty = monthly_dict.get(key, 0.0)
            total_vended_12mo += qty
            if qty > 0:
                months_with_data += 1
        
        # Calculate average monthly usage (round UP)
        avg_monthly = math.ceil(total_vended_12mo / months_with_data) if months_with_data > 0 else 0
        return avg_monthly, total_vended_12mo
    except Exception as e:
        print(f"Error calculating usage for item {item_key}: {e}")
        return 0, 0.0


def generate_grid_report():
    conn_str = get_connection_string()

    print("Connecting to EST100 ...")
    try:
        conn = pyodbc.connect(conn_str, timeout=10)
    except pyodbc.Error as e:
        print(f"Connection failed: {e}")
        return

    cursor = conn.cursor()
    print("Connected. Generating stock grid report with usage data ...\n")

    try:
        cursor.execute(QUERY)
    except pyodbc.ProgrammingError as e:
        print(f"Query error:\n{e}")
        cursor.close()
        conn.close()
        return

    rows = cursor.fetchall()

    # Initialize 8x10 grid (rows 1-8, pockets 1-10)
    # Grid is indexed as grid[row-1][pocket-1]
    grid = [[None for _ in range(10)] for _ in range(8)]
    
    # Track items that don't fit in grid
    unmapped_items = []
    total_items = 0
    total_qty = 0
    
    # Track items below minimum for the summary section
    items_below_minimum = []

    print("Processing stock entries and calculating usage...")
    for row_data in rows:
        item_code = str(row_data[0]) if row_data[0] else ""
        item_desc = str(row_data[1]) if row_data[1] else ""
        stock_qty = float(row_data[2]) if row_data[2] is not None else 0.0
        min_qty = float(row_data[3]) if row_data[3] is not None else 0.0
        ordered_qty = float(row_data[4]) if row_data[4] is not None else 0.0
        bin_code = str(row_data[5]) if row_data[5] else ""
        cabinet = str(row_data[6]) if row_data[6] else ""
        item_key = row_data[7] if row_data[7] else None
        
        total_items += 1
        total_qty += stock_qty
        
        # Calculate usage if item has a key
        avg_monthly_usage = 0
        total_usage_12mo = 0.0
        if item_key:
            avg_monthly_usage, total_usage_12mo = calculate_usage(cursor, item_key)
        
        # Check if below minimum (and not on order)
        is_below_minimum = (min_qty > 0 and stock_qty < min_qty and 
                           (ordered_qty is None or ordered_qty == 0))
        shortage = (min_qty - stock_qty) if is_below_minimum else 0
        
        row_num, pocket_num = parse_bin_location(bin_code)
        
        cell_data = {
            'item_code': item_code,
            'item_desc': item_desc,
            'qty': stock_qty,
            'min_qty': min_qty,
            'bin': bin_code,
            'cabinet': cabinet,
            'is_below_minimum': is_below_minimum,
            'shortage': shortage,
            'avg_monthly_usage': avg_monthly_usage,
            'total_usage_12mo': total_usage_12mo
        }
        
        if row_num and pocket_num:
            # Convert to 0-based index
            row_idx = row_num - 1
            pocket_idx = pocket_num - 1
            
            # If cell already has an item, combine them
            if grid[row_idx][pocket_idx] is None:
                grid[row_idx][pocket_idx] = cell_data
            else:
                # Multiple items in same location - combine
                existing = grid[row_idx][pocket_idx]
                existing['qty'] += stock_qty
                existing['item_code'] += f" / {item_code}"
                # Update below minimum status if either is below
                if is_below_minimum:
                    existing['is_below_minimum'] = True
                    existing['shortage'] = max(existing.get('shortage', 0), shortage)
        else:
            unmapped_items.append(cell_data)
        
        # Track items below minimum for summary section
        if is_below_minimum:
            items_below_minimum.append(cell_data)

    cursor.close()
    conn.close()

    print(f"Processed {total_items} stock entries")
    print(f"Total quantity: {total_qty:.0f} units")
    print(f"Mapped to grid: {total_items - len(unmapped_items)}")
    if unmapped_items:
        print(f"Unmapped items: {len(unmapped_items)}")
    print(f"Items below minimum: {len(items_below_minimum)}")
    
    # Generate HTML
    print("Generating HTML grid report...")
    html = generate_html_grid(grid, unmapped_items, items_below_minimum, total_items, total_qty)
    
    # Write HTML file
    filename = f"stock_grid_report_{datetime.now().strftime('%Y%m%d_%H%M%S')}.html"
    with open(filename, 'w', encoding='utf-8') as f:
        f.write(html)
    
    print(f"HTML grid report saved to: {filename}")
    
    return grid


def generate_html_grid(grid, unmapped_items, items_below_minimum, total_items, total_qty):
    """Generate HTML with visual grid layout and below minimum section."""
    
    html = """<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Stock Location Grid - EST100</title>
    <style>
        * {
            margin: 0;
            padding: 0;
            box-sizing: border-box;
        }
        body {
            font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
            background: #f0f0f0;
            padding: 20px;
            color: #333;
        }
        .container {
            max-width: 1600px;
            margin: 0 auto;
            background: white;
            border-radius: 8px;
            box-shadow: 0 2px 10px rgba(0,0,0,0.1);
            overflow: hidden;
        }
        .header {
            background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
            color: white;
            padding: 30px;
            text-align: center;
        }
        .header h1 {
            font-size: 28px;
            margin-bottom: 10px;
        }
        .header .subtitle {
            font-size: 14px;
            opacity: 0.9;
        }
        .summary {
            background: #f8f9fa;
            padding: 20px 30px;
            border-bottom: 2px solid #e9ecef;
            display: flex;
            justify-content: space-around;
            flex-wrap: wrap;
        }
        .summary-item {
            text-align: center;
        }
        .summary-item .label {
            font-size: 12px;
            color: #6c757d;
            text-transform: uppercase;
            letter-spacing: 1px;
            margin-bottom: 5px;
        }
        .summary-item .value {
            font-size: 24px;
            font-weight: bold;
            color: #495057;
        }
        .summary-item .value.highlight {
            color: #dc3545;
        }
        .grid-container {
            padding: 30px;
        }
        .grid-header {
            display: grid;
            grid-template-columns: 80px repeat(10, 1fr);
            gap: 8px;
            margin-bottom: 8px;
        }
        .grid-header-cell {
            text-align: center;
            font-weight: bold;
            color: #495057;
            font-size: 14px;
            padding: 8px;
        }
        .grid {
            display: grid;
            grid-template-columns: 80px repeat(10, 1fr);
            gap: 8px;
        }
        .row-label {
            display: flex;
            align-items: center;
            justify-content: center;
            font-weight: bold;
            color: #495057;
            background: #f8f9fa;
            border: 2px solid #dee2e6;
            border-radius: 4px;
            font-size: 16px;
        }
        .pocket {
            aspect-ratio: 1;
            border: 2px solid #dee2e6;
            border-radius: 6px;
            padding: 8px;
            background: white;
            display: flex;
            flex-direction: column;
            justify-content: space-between;
            transition: all 0.2s;
            min-height: 120px;
        }
        .pocket:hover {
            transform: scale(1.05);
            box-shadow: 0 4px 12px rgba(0,0,0,0.15);
            z-index: 10;
            position: relative;
        }
        .pocket.empty {
            background: #f8f9fa;
            border-color: #e9ecef;
        }
        .pocket.has-stock {
            background: #e7f5e7;
            border-color: #28a745;
        }
        .pocket.low-stock {
            background: #fff3cd;
            border-color: #ffc107;
        }
        .pocket.below-minimum {
            background: #f8d7da;
            border-color: #dc3545;
            border-width: 3px;
        }
        .pocket.no-stock {
            background: #f8d7da;
            border-color: #dc3545;
        }
        .pocket-code {
            font-size: 10px;
            color: #6c757d;
            text-align: right;
            margin-bottom: 4px;
        }
        .pocket-item {
            font-size: 11px;
            font-weight: 600;
            color: #212529;
            word-break: break-word;
            line-height: 1.3;
            flex-grow: 1;
            overflow: hidden;
        }
        .pocket.no-stock .pocket-item {
            color: #212529;
            font-weight: 600;
        }
        .pocket-qty {
            font-size: 18px;
            font-weight: bold;
            color: #495057;
            text-align: center;
            margin-top: 4px;
        }
        .pocket-qty.zero {
            color: #dc3545;
        }
        .pocket-min {
            font-size: 9px;
            color: #6c757d;
            text-align: center;
            margin-top: 2px;
        }
        .below-minimum-section {
            padding: 20px 30px;
            background: #fff3cd;
            border-top: 2px solid #ffc107;
        }
        .below-minimum-section h2 {
            color: #856404;
            margin-bottom: 15px;
            font-size: 20px;
        }
        .below-minimum-table {
            width: 100%;
            border-collapse: collapse;
            background: white;
            border-radius: 4px;
            overflow: hidden;
        }
        .below-minimum-table thead {
            background: #dc3545;
            color: white;
        }
        .below-minimum-table th {
            padding: 12px;
            text-align: left;
            font-weight: 600;
            font-size: 12px;
            text-transform: uppercase;
        }
        .below-minimum-table td {
            padding: 10px 12px;
            border-bottom: 1px solid #e9ecef;
            font-size: 13px;
        }
        .below-minimum-table tbody tr:hover {
            background: #f8f9fa;
        }
        .below-minimum-table .item-code {
            font-family: 'Courier New', monospace;
            font-weight: 600;
        }
        .below-minimum-table .qty {
            text-align: right;
            font-family: 'Courier New', monospace;
        }
        .below-minimum-table .shortage {
            color: #dc3545;
            font-weight: bold;
        }
        .below-minimum-table .usage {
            text-align: right;
            font-family: 'Courier New', monospace;
            color: #495057;
        }
        .unmapped-section {
            padding: 20px 30px;
            background: #fff3cd;
            border-top: 2px solid #ffc107;
        }
        .unmapped-section h2 {
            color: #856404;
            margin-bottom: 15px;
            font-size: 18px;
        }
        .unmapped-list {
            display: grid;
            grid-template-columns: repeat(auto-fill, minmax(300px, 1fr));
            gap: 10px;
        }
        .unmapped-item {
            background: white;
            padding: 10px;
            border-radius: 4px;
            border: 1px solid #ffc107;
            font-size: 12px;
        }
        .unmapped-item code {
            font-weight: 600;
            color: #495057;
        }
        .footer {
            background: #f8f9fa;
            padding: 15px 30px;
            text-align: center;
            color: #6c757d;
            font-size: 12px;
            border-top: 1px solid #e9ecef;
        }
        @media print {
            @page {
                size: 11in 17in landscape;
                margin: 0.3in;
            }
            body {
                background: white;
                padding: 0;
            }
            .container {
                box-shadow: none;
                border-radius: 0;
            }
            .header {
                padding: 15px 20px;
                page-break-after: avoid;
            }
            .header h1 {
                font-size: 20px;
                margin-bottom: 5px;
            }
            .header .subtitle {
                font-size: 12px;
            }
            .summary {
                padding: 10px 20px;
                page-break-after: avoid;
            }
            .summary-item .value {
                font-size: 18px;
            }
            .grid-container {
                padding: 10px 20px;
            }
            .grid-header {
                gap: 4px;
                margin-bottom: 4px;
            }
            .grid-header-cell {
                font-size: 10px;
                padding: 4px;
            }
            .grid {
                gap: 4px;
            }
            .row-label {
                font-size: 12px;
                padding: 4px;
            }
            .pocket {
                min-height: 0;
                aspect-ratio: 1;
                padding: 4px;
                border-width: 1px;
                page-break-inside: avoid;
            }
            .pocket:hover {
                transform: none;
                box-shadow: none;
            }
            .pocket-code {
                font-size: 8px;
                margin-bottom: 2px;
            }
            .pocket-item {
                font-size: 9px;
                line-height: 1.2;
                overflow: visible;
            }
            .pocket-qty {
                font-size: 14px;
                margin-top: 2px;
            }
            .below-minimum-section {
                page-break-before: always;
                padding: 10px 20px;
            }
            .unmapped-section {
                page-break-before: always;
                padding: 10px 20px;
            }
            .footer {
                padding: 8px 20px;
                font-size: 10px;
                page-break-inside: avoid;
            }
        }
    </style>
</head>
<body>
    <div class="container">
        <div class="header">
            <h1>Stock Location Grid</h1>
            <div class="subtitle">EST100 Inventory Database - 8 Rows × 10 Pockets</div>
        </div>
        <div class="summary">
            <div class="summary-item">
                <div class="label">Total Items</div>
                <div class="value">{total_items}</div>
            </div>
            <div class="summary-item">
                <div class="label">Total Quantity</div>
                <div class="value">{total_qty:.0f} units</div>
            </div>
            <div class="summary-item">
                <div class="label">Items Below Minimum</div>
                <div class="value highlight">{below_min_count}</div>
            </div>
            <div class="summary-item">
                <div class="label">Report Generated</div>
                <div class="value">{timestamp}</div>
            </div>
        </div>
        <div class="grid-container">
            <div class="grid-header">
                <div class="grid-header-cell"></div>
                <div class="grid-header-cell">Pocket 1</div>
                <div class="grid-header-cell">Pocket 2</div>
                <div class="grid-header-cell">Pocket 3</div>
                <div class="grid-header-cell">Pocket 4</div>
                <div class="grid-header-cell">Pocket 5</div>
                <div class="grid-header-cell">Pocket 6</div>
                <div class="grid-header-cell">Pocket 7</div>
                <div class="grid-header-cell">Pocket 8</div>
                <div class="grid-header-cell">Pocket 9</div>
                <div class="grid-header-cell">Pocket 10</div>
            </div>
            <div class="grid">
{grid_cells}
            </div>
        </div>
{below_minimum_section}
{unmapped_section}
        <div class="footer">
            Grid shows stock locations in format Row-Pocket (e.g., 08-08 = Row 8, Pocket 8). Items below minimum are highlighted in red. Generated on {timestamp}
        </div>
    </div>
</body>
</html>"""

    # Generate grid cells
    grid_cells = ""
    for row_idx in range(8):
        row_num = row_idx + 1
        grid_cells += f'                <div class="row-label">Row {row_num}</div>\n'
        
        for pocket_idx in range(10):
            pocket_num = pocket_idx + 1
            cell_data = grid[row_idx][pocket_idx]
            
            if cell_data:
                item_desc = cell_data['item_desc']
                qty = cell_data['qty']
                min_qty = cell_data.get('min_qty', 0)
                is_below_minimum = cell_data.get('is_below_minimum', False)
                
                # Determine cell class based on quantity and minimum status
                if qty == 0:
                    cell_class = "no-stock"
                elif is_below_minimum:
                    cell_class = "below-minimum"
                elif qty < 10:
                    cell_class = "low-stock"
                else:
                    cell_class = "has-stock"
                
                qty_class = "zero" if qty == 0 else ""
                min_display = f"Min: {min_qty:.0f}" if min_qty > 0 else ""
                
                grid_cells += f'''                <div class="pocket {cell_class}" title="{cell_data['item_code']} - {cell_data['item_desc']} - {cell_data['bin']}">
                    <div class="pocket-code">{row_num:02d}-{pocket_num:02d}</div>
                    <div class="pocket-item">{item_desc}</div>
                    <div class="pocket-qty {qty_class}">{qty:.0f}</div>
                    {f'<div class="pocket-min">{min_display}</div>' if min_display else ''}
                </div>
'''
            else:
                # Truly empty pocket - no item assigned
                grid_cells += f'''                <div class="pocket no-stock" title="Empty - No item assigned - {row_num:02d}-{pocket_num:02d}">
                    <div class="pocket-code">{row_num:02d}-{pocket_num:02d}</div>
                    <div class="pocket-item">(Empty)</div>
                    <div class="pocket-qty zero">0</div>
                </div>
'''

    # Generate below minimum section
    below_minimum_section = ""
    if items_below_minimum:
        # Sort by shortage amount (descending)
        items_below_minimum.sort(key=lambda x: x.get('shortage', 0), reverse=True)
        
        total_shortage = sum(item.get('shortage', 0) for item in items_below_minimum)
        
        table_rows = ""
        for item in items_below_minimum:
            location = f"{item['cabinet']} / {item['bin']}" if item['cabinet'] and item['bin'] else (item['cabinet'] if item['cabinet'] else (item['bin'] if item['bin'] else "-"))
            avg_usage = item.get('avg_monthly_usage', 0)
            total_usage = item.get('total_usage_12mo', 0.0)
            
            table_rows += f"""
                    <tr>
                        <td class="item-code">{item['item_code']}</td>
                        <td class="item-desc">{item['item_desc']}</td>
                        <td class="qty">{item['qty']:.0f}</td>
                        <td class="qty">{item['min_qty']:.0f}</td>
                        <td class="qty shortage">{item['shortage']:.0f}</td>
                        <td class="usage">{avg_usage:.0f}/mo</td>
                        <td class="usage">{total_usage:.0f}</td>
                        <td>{location}</td>
                    </tr>"""
        
        below_minimum_section = f'''
        <div class="below-minimum-section">
            <h2>Items Below Minimum Stock ({len(items_below_minimum)} items, Total Shortage: {total_shortage:.0f} units)</h2>
            <table class="below-minimum-table">
                <thead>
                    <tr>
                        <th>Item Code</th>
                        <th>Description</th>
                        <th class="qty">Current Stock</th>
                        <th class="qty">Minimum</th>
                        <th class="qty">Shortage</th>
                        <th class="usage">Avg Monthly Usage</th>
                        <th class="usage">Total Usage (12mo)</th>
                        <th>Location</th>
                    </tr>
                </thead>
                <tbody>
{table_rows}
                </tbody>
            </table>
        </div>'''

    # Generate unmapped items section
    unmapped_section = ""
    if unmapped_items:
        unmapped_html = ""
        for item in unmapped_items:
            unmapped_html += f'''
                <div class="unmapped-item">
                    <code>{item['item_code']}</code> - {item['item_desc'][:40]}<br>
                    Qty: {item['qty']:.0f} | Bin: {item['bin']} | Cabinet: {item['cabinet']}
                </div>'''
        
        unmapped_section = f'''
        <div class="unmapped-section">
            <h2>Items Not Mapped to Grid ({len(unmapped_items)} items)</h2>
            <div class="unmapped-list">
{unmapped_html}
            </div>
        </div>'''

    # Fill in template
    timestamp = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
    html = html.replace('{total_items}', str(total_items))
    html = html.replace('{total_qty:.0f}', f"{total_qty:.0f}")
    html = html.replace('{below_min_count}', str(len(items_below_minimum)))
    html = html.replace('{timestamp}', timestamp)
    html = html.replace('{grid_cells}', grid_cells)
    html = html.replace('{below_minimum_section}', below_minimum_section)
    html = html.replace('{unmapped_section}', unmapped_section)
    
    return html


if __name__ == "__main__":
    generate_grid_report()
