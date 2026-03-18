"""
Standalone Under Minimum Stock Report Generator
For testing and debugging before re-incorporating into master report.
Automatically opens HTML file when generated.
"""
import sys
import os

# Add parent directory to path to import sql_probe
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from sql_probe import SQLProbe
from datetime import datetime
import html
import time
import webbrowser
from pathlib import Path

# Part Number Hyperlink Library
PART_NUMBER_LINKS = {
    'OSG': lambda suffix: f"https://osgtool.com/{suffix}",
    'ALLI': lambda suffix: f"https://www.alliedmachine.com/PRODUCTS/ItemDetail.aspx?item={suffix}",
    'GARR': lambda suffix: f"https://www.garrtool.com/product-details/?EDP={suffix}",
    'GUHR': lambda suffix: f"https://guhring.com/ProductsServices/SizeDetails?EDP={suffix}",
    'HARV': lambda suffix: f"https://www.harveytool.com/products/tool-details-{suffix}",
    'INGE': lambda suffix: f"https://www.ingersoll-imc.com/product/{suffix}",
}


def parse_part_number(part_no: str) -> tuple:
    """Parse a part number to extract company prefix and suffix."""
    if not part_no or not part_no.strip():
        return None, None
    
    part_no = part_no.strip()
    
    for prefix, url_func in PART_NUMBER_LINKS.items():
        prefix_with_hyphen = f"{prefix}-"
        if part_no.upper().startswith(prefix_with_hyphen.upper()):
            suffix = part_no[len(prefix_with_hyphen):].strip()
            if suffix:
                return prefix, suffix
    
    return None, None


def get_part_number_link(part_no: str) -> str:
    """Generate a hyperlink URL for a part number if it matches a known company."""
    if not part_no or not part_no.strip():
        return None
    
    part_no = part_no.strip()
    
    for prefix, url_func in PART_NUMBER_LINKS.items():
        prefix_with_hyphen = f"{prefix}-"
        if part_no.upper().startswith(prefix_with_hyphen.upper()):
            suffix = part_no[len(prefix_with_hyphen):].strip()
            if suffix:
                return url_func(suffix)
    
    return None


def get_component_part_no(probe, comp_id):
    """Get Part No (OrderNo) for a component."""
    query = f"""
        SELECT vd.ValStr
        FROM ValData vd
        INNER JOIN FieldInfo fi ON vd.FieldId = fi.FieldId
        WHERE vd.ObjId = {comp_id}
            AND fi.ColumnName = 'OrderNo'
    """
    result = probe.execute_query(query)
    if result and result[0]:
        return result[0][0] or ""
    return ""


def diagnose_component_stock(probe, component_code):
    """
    Diagnostic function to check how current stock is calculated for a specific component.
    Shows CountInv, StorageBooking quantities by status, and totals.
    """
    query = f"""
        SELECT 
            od.ObjId,
            od.ObjTxt,
            od.CountInv,
            sb.Status,
            sb.Quantity,
            sb.StorageQuantityMin,
            sb.StorageQuantityMax,
            sb.StoragePlace,
            sb.DT
        FROM ObjData od
        LEFT JOIN StorageBooking sb ON od.ObjId = sb.ObjId
        WHERE od.ObjType = 11
          AND od.ObjTxt = '{component_code}'
        ORDER BY sb.Status, sb.DT DESC
    """
    
    result = probe.execute_query_with_headers(query)
    if not result:
        print(f"No data found for {component_code}")
        return
    
    columns, rows = result
    if not rows:
        print(f"Component {component_code} not found")
        return
    
    comp_id = rows[0][columns.index('ObjId')]
    count_inv = rows[0][columns.index('CountInv')]
    
    print(f"\n{'='*60}")
    print(f"Diagnostic for {component_code} (ObjId: {comp_id})")
    print(f"{'='*60}")
    print(f"ObjData.CountInv: {count_inv}")
    print(f"\nStorageBooking records:")
    
    total_by_status = {}
    total_all = 0
    
    for row in rows:
        status = row[columns.index('Status')]
        qty = row[columns.index('Quantity')]
        min_qty = row[columns.index('StorageQuantityMin')]
        max_qty = row[columns.index('StorageQuantityMax')]
        place = row[columns.index('StoragePlace')]
        dt = row[columns.index('DT')]
        
        if status is not None:
            if status not in total_by_status:
                total_by_status[status] = 0
            total_by_status[status] += (qty or 0)
            total_all += (qty or 0)
            
            print(f"  Status {status}: Qty={qty}, Min={min_qty}, Max={max_qty}, Place={place}, DT={dt}")
    
    print(f"\nTotals by Status:")
    for status, total in sorted(total_by_status.items()):
        print(f"  Status {status}: {total}")
    
    # Common pattern: Status 0 = In Stock, Status 1+ = In Circulation
    # But we'll show both so user can confirm
    stock_qty = total_by_status.get(0, 0)  # Status 0 typically = in stock
    circulation_qty = sum(total_by_status.get(s, 0) for s in total_by_status.keys() if s != 0)
    
    print(f"\nBreakdown:")
    print(f"  Stock Quantity (Status 0): {stock_qty}")
    print(f"  Circulation Quantity (Status != 0): {circulation_qty}")
    print(f"  Total (all statuses): {total_all}")
    print(f"  Total (Status IN 0,1,2): {sum(total_by_status.get(s, 0) for s in [0, 1, 2])}")
    print(f"{'='*60}\n")


def get_component_unit_price(probe, comp_id):
    """Get UnitPrice for a component from ValData."""
    query = f"""
        SELECT vd.ValNum
        FROM ValData vd
        INNER JOIN FieldInfo fi ON vd.FieldId = fi.FieldId
        WHERE vd.ObjId = {comp_id}
            AND fi.ColumnName = 'UnitPrice'
    """
    result = probe.execute_query(query)
    if result and result[0] and result[0][0] is not None:
        try:
            return float(result[0][0])
        except (ValueError, TypeError):
            return None
    return None


def query_under_minimum_items(probe):
    """
    Query components that are under their minimum stock requirements.
    Uses StorageQuantityMin and StorageQuantityMax from StorageBooking.
    
    Stock Quantity calculation: Only items with Status = 0 (in stock)
    Excludes items in circulation (Status != 0) which are checked out/in use.
    
    We only care about STOCK quantity being under minimum, not total (stock + circulation).
    """
    query = """
        WITH ComponentStockQuantity AS (
            -- Calculate STOCK quantity only (Status = 0 = in stock)
            -- Excludes circulation quantity (items checked out/in use)
            SELECT 
                od.ObjId,
                COALESCE(
                    (SELECT SUM(COALESCE(sb.Quantity, 0))
                     FROM StorageBooking sb
                     WHERE sb.ObjId = od.ObjId
                       AND sb.Status = 0  -- Status 0 = In Stock (not in circulation)
                    ),
                    0
                ) AS StockQuantity
            FROM ObjData od
            WHERE od.ObjType = 11
        ),
        ComponentMinimums AS (
            -- Get minimum stock from StorageBooking.StorageQuantityMin
            -- Include ALL components that have a minimum set, even if CountInv is 0
            SELECT DISTINCT
                od.ObjId,
                (SELECT MIN(sb.StorageQuantityMin)
                 FROM StorageBooking sb 
                 WHERE sb.ObjId = od.ObjId 
                   AND sb.StorageQuantityMin IS NOT NULL 
                   AND sb.StorageQuantityMin > 0
                ) AS MinimumStock
            FROM ObjData od
            WHERE od.ObjType = 11
              AND EXISTS (
                  SELECT 1 FROM StorageBooking sb 
                  WHERE sb.ObjId = od.ObjId 
                    AND sb.StorageQuantityMin IS NOT NULL 
                    AND sb.StorageQuantityMin > 0
              )
        ),
        ComponentMaximums AS (
            -- Get maximum stock from StorageBooking.StorageQuantityMax
            SELECT DISTINCT
                od.ObjId,
                (SELECT MAX(sb.StorageQuantityMax)
                 FROM StorageBooking sb 
                 WHERE sb.ObjId = od.ObjId 
                   AND sb.StorageQuantityMax IS NOT NULL 
                   AND sb.StorageQuantityMax > 0
                ) AS MaximumStock
            FROM ObjData od
            WHERE od.ObjType = 11
        )
        SELECT 
            od.ObjId AS ComponentId,
            od.ObjTxt AS ComponentCode,
            od.DescrTxt AS ComponentDescription,
            csq.StockQuantity,
            cm.MinimumStock,
            COALESCE(cmax.MaximumStock, 0) AS MaximumStock
        FROM ObjData od
        INNER JOIN ComponentStockQuantity csq ON od.ObjId = csq.ObjId
        INNER JOIN ComponentMinimums cm ON od.ObjId = cm.ObjId
        LEFT JOIN ComponentMaximums cmax ON od.ObjId = cmax.ObjId
        WHERE od.ObjType = 11
          AND cm.MinimumStock IS NOT NULL
          AND cm.MinimumStock > 0
          AND csq.StockQuantity < cm.MinimumStock  -- Only check STOCK quantity, not total
        ORDER BY od.ObjTxt
    """
    
    result = probe.execute_query_with_headers(query)
    if not result:
        return []
    
    columns, rows = result
    report_rows = []
    
    for row in rows:
        comp_id = row[columns.index('ComponentId')]
        comp_code = row[columns.index('ComponentCode')] or ""
        comp_desc = row[columns.index('ComponentDescription')] or ""
        stock_quantity = row[columns.index('StockQuantity')] or 0
        minimum_stock = row[columns.index('MinimumStock')] or 0
        maximum_stock = row[columns.index('MaximumStock')] or 0
        
        try:
            stock_qty_int = int(stock_quantity)
            minimum_stock_int = int(minimum_stock)
            maximum_stock_int = int(maximum_stock) if maximum_stock else 0
            
            if stock_qty_int < minimum_stock_int:
                # Under Min = stock - minimum (negative value)
                under_min = stock_qty_int - minimum_stock_int
                
                # To Max = maximum - stock (positive value, how many needed to reach max)
                to_max = max(0, maximum_stock_int - stock_qty_int) if maximum_stock_int > 0 else 0
                
                # Get additional component info
                part_no = get_component_part_no(probe, comp_id)
                
                # Get unit price for value calculation
                unit_price = get_component_unit_price(probe, comp_id)
                value = unit_price if unit_price is not None else 0.0
                
                # Price to Fill = value * to_max
                price_to_fill = value * to_max if to_max > 0 else 0.0
                
                report_rows.append({
                    'C-ID': comp_code,
                    'Description': comp_desc,
                    'Part No': part_no,
                    'Value': value,
                    'Current Stock': stock_qty_int,  # Stock quantity only (not circulation)
                    'Under Min': under_min,
                    'To Max': to_max,
                    'Price to Fill': price_to_fill,
                })
        except (ValueError, TypeError) as e:
            print(f"Error processing component {comp_code}: {e}")
            continue
    
    return report_rows


def format_currency(value):
    """Format a numeric value as currency."""
    if value is None:
        return "$0.00"
    try:
        return f"${float(value):,.2f}"
    except (ValueError, TypeError):
        return "$0.00"


def generate_html_report(under_minimum_rows, output_html):
    """Generate standalone HTML report for under minimum stock items."""
    
    # Calculate total price to fill
    total_price_to_fill = sum(row.get('Price to Fill', 0) for row in under_minimum_rows)
    total_price_to_fill_str = format_currency(total_price_to_fill)
    
    # Generate timestamp
    timestamp = datetime.now().strftime("%m/%d/%Y %I:%M %p")
    
    # Build table rows
    table_rows = []
    for row in under_minimum_rows:
        cid = html.escape(str(row.get('C-ID', '')))
        desc = html.escape(str(row.get('Description', '')))
        part_no = str(row.get('Part No', '')).strip()
        value = format_currency(row.get('Value', 0))
        current_stock = str(row.get('Current Stock', 0))
        under_min = row.get('Under Min', 0)
        to_max = str(row.get('To Max', 0))
        price_to_fill = format_currency(row.get('Price to Fill', 0))
        
        # Part number with hyperlink
        if part_no:
            part_link = get_part_number_link(part_no)
            if part_link:
                part_no_html = f'<a href="{html.escape(part_link)}" target="_blank">{html.escape(part_no)}</a>'
            else:
                part_no_html = html.escape(part_no)
        else:
            part_no_html = ""
        
        # Under Min styling (negative values highlighted)
        under_min_class = 'under-minimum-negative' if under_min < 0 else ''
        under_min_str = str(under_min)
        
        table_rows.append(f"""
            <tr>
                <td>{cid}</td>
                <td>{html.escape(desc)}</td>
                <td>{part_no_html}</td>
                <td style="text-align: right;">{value}</td>
                <td style="text-align: right;">{current_stock}</td>
                <td class="{under_min_class}" style="text-align: right;">{under_min_str}</td>
                <td style="text-align: right;">{to_max}</td>
                <td style="text-align: right;">{price_to_fill}</td>
            </tr>
        """)
    
    # Empty state message
    if not under_minimum_rows:
        empty_message = """
            <div class="empty-state">
                <p style="text-align: center; color: #666; font-style: italic; padding: 40px;">
                    No items currently under minimum stock.
                </p>
            </div>
        """
        table_html = empty_message
    else:
        table_html = f"""
            <table class="under-minimum-table" id="reportTable">
                <thead>
                    <tr>
                        <th class="sortable" style="text-align: center;" onclick="sortTable(0)">C-ID <span class="sort-indicator" id="sort-0">⇅</span></th>
                        <th style="text-align: center;">Description</th>
                        <th style="text-align: center;">Part No</th>
                        <th style="text-align: center;">Value</th>
                        <th style="text-align: center;">Current Stock</th>
                        <th style="text-align: center;">Under Min</th>
                        <th style="text-align: center;">To Max</th>
                        <th style="text-align: center;">Price to Fill</th>
                    </tr>
                </thead>
                <tbody>
                    {''.join(table_rows)}
                </tbody>
            </table>
            <div class="under-minimum-total">
                Total Price to Fill: {total_price_to_fill_str}
            </div>
        """
    
    html_content = f"""<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Under Minimum Stock Report - Test</title>
    <style>
        * {{
            margin: 0;
            padding: 0;
            box-sizing: border-box;
        }}

        body {{
            font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
            padding: 20px;
            background-color: #f5f5f5;
            color: #333;
        }}

        .container {{
            max-width: 1800px;
            margin: 0 auto;
            background: white;
            padding: 30px;
            box-shadow: 0 2px 10px rgba(0,0,0,0.1);
            border-radius: 8px;
        }}

        .header {{
            text-align: center;
            margin-bottom: 30px;
            border-bottom: 3px solid #0066cc;
            padding-bottom: 20px;
        }}

        h1 {{
            font-size: 32px;
            color: #0066cc;
            margin-bottom: 10px;
        }}

        .subtitle {{
            font-size: 16px;
            color: #666;
            font-style: italic;
        }}

        .stats {{
            background-color: #fff3cd;
            border: 2px solid #ffc107;
            border-radius: 5px;
            padding: 15px;
            margin-bottom: 20px;
            text-align: center;
            font-weight: bold;
            color: #856404;
            font-size: 18px;
        }}

        .table-wrapper {{
            overflow-x: auto;
            margin-bottom: 20px;
        }}

        .under-minimum-table {{
            width: 100%;
            border-collapse: collapse;
            font-size: 14px;
            min-width: 1400px;
        }}

        .under-minimum-table th {{
            background-color: #0066cc;
            color: white;
            font-weight: bold;
            padding: 12px 10px;
            border: 1px solid #0052a3;
            position: sticky;
            top: 0;
            z-index: 10;
        }}

        .under-minimum-table th.sortable {{
            cursor: pointer;
            user-select: none;
            position: relative;
        }}

        .under-minimum-table th.sortable:hover {{
            background-color: #0052a3;
        }}

        .sort-indicator {{
            margin-left: 5px;
            font-size: 12px;
            opacity: 0.7;
        }}

        .sort-indicator.active {{
            opacity: 1;
        }}

        .under-minimum-table td {{
            padding: 10px;
            border: 1px solid #ddd;
        }}

        .under-minimum-table tr:nth-child(even) {{
            background-color: #f9f9f9;
        }}

        .under-minimum-table tr:hover {{
            background-color: #f0f0f0;
        }}

        .under-minimum-negative {{
            background-color: #ffebee !important;
            color: #c62828;
            font-weight: bold;
        }}

        .under-minimum-total {{
            text-align: right;
            font-size: 18px;
            font-weight: bold;
            color: #0066cc;
            padding: 15px;
            background-color: #e3f2fd;
            border-radius: 5px;
            margin-top: 20px;
        }}

        a {{
            color: #0066cc;
            text-decoration: none;
        }}

        a:hover {{
            text-decoration: underline;
        }}

        .timestamp {{
            text-align: center;
            color: #666;
            font-size: 12px;
            margin-top: 20px;
            padding-top: 20px;
            border-top: 1px solid #ddd;
        }}

        .empty-state {{
            padding: 40px;
            text-align: center;
        }}
    </style>
</head>
<body>
    <div class="container">
        <div class="header">
            <h1>⚠️ Under Minimum Stock Report</h1>
            <div class="subtitle">Test Report - Standalone Generator</div>
        </div>
        
        <div class="stats">
            Total Items Under Minimum: {len(under_minimum_rows)}
        </div>
        
        <div class="table-wrapper">
            {table_html}
        </div>
        
        <div class="timestamp">
            Report Generated: {timestamp}
        </div>
    </div>
    
    <script>
        let sortColumn = -1;
        let sortDirection = 1; // 1 = ascending, -1 = descending

        function sortTable(columnIndex) {{
            const table = document.getElementById('reportTable');
            const tbody = table.querySelector('tbody');
            const rows = Array.from(tbody.querySelectorAll('tr'));
            
            // Toggle direction if clicking the same column
            if (sortColumn === columnIndex) {{
                sortDirection *= -1;
            }} else {{
                sortColumn = columnIndex;
                sortDirection = 1; // Start with ascending
            }}
            
            // Sort rows
            rows.sort((a, b) => {{
                const aText = a.cells[columnIndex].textContent.trim();
                const bText = b.cells[columnIndex].textContent.trim();
                
                // For C-ID column (column 0), extract numeric part for proper numerical sorting
                if (columnIndex === 0) {{
                    // Extract number from C-ID format (e.g., "C-1" -> 1, "C-104" -> 104)
                    // Handles formats like "C-1", "C-17", "C-104", etc.
                    const aMatch = aText.match(/^C-(\d+)$/i);
                    const bMatch = bText.match(/^C-(\d+)$/i);
                    
                    if (aMatch && bMatch) {{
                        const aNum = parseInt(aMatch[1], 10);
                        const bNum = parseInt(bMatch[1], 10);
                        if (!isNaN(aNum) && !isNaN(bNum)) {{
                            return (aNum - bNum) * sortDirection;
                        }}
                    }}
                    // If regex doesn't match, fall through to string comparison
                }}
                
                // Fallback to string comparison for other columns or non-matching C-ID format
                return aText.localeCompare(bText) * sortDirection;
            }});
            
            // Re-append sorted rows
            rows.forEach(row => tbody.appendChild(row));
            
            // Update sort indicators
            updateSortIndicators();
        }}
        
        // Sort by C-ID (column 0) ascending by default when page loads
        document.addEventListener('DOMContentLoaded', function() {{
            sortTable(0); // Sort by C-ID column on page load
        }});
        
        function updateSortIndicators() {{
            // Update the C-ID column indicator
            const cidIndicator = document.getElementById('sort-0');
            if (cidIndicator) {{
                if (sortColumn === 0) {{
                    cidIndicator.textContent = sortDirection === 1 ? ' ↑' : ' ↓';
                    cidIndicator.classList.add('active');
                }} else {{
                    cidIndicator.textContent = ' ⇅';
                    cidIndicator.classList.remove('active');
                }}
            }}
        }}
    </script>
</body>
</html>"""
    
    with open(output_html, 'w', encoding='utf-8') as f:
        f.write(html_content)
    
    print(f"✓ HTML report saved to: {os.path.abspath(output_html)}")
    return os.path.abspath(output_html)


def main():
    """Main function to generate under minimum stock report."""
    SERVER = r"ESTSS01\ZOLLERSQLEXPRESS"
    DATABASE = "ZOLLERDB3"
    CREDENTIALS = [
        ("SA", "Zollerdb3")
    ]
    
    probe = None
    connected = False
    
    print("="*60)
    print("Under Minimum Stock Report - Standalone Test")
    print("="*60)
    print()
    
    # Connect to database
    print("Connecting to database...")
    conn_start = time.time()
    for username, password in CREDENTIALS:
        probe = SQLProbe(SERVER, DATABASE, username, password)
        if probe.connect():
            connected = True
            print(f"✓ Connected as {username}")
            break
    conn_time = time.time() - conn_start
    
    if not connected:
        print("✗ ERROR: Could not connect to database")
        return
    
    try:
        # Diagnostic: Check C-1 and C-159 to understand stock vs circulation
        print()
        print("Running diagnostics to understand stock vs circulation...")
        diagnose_component_stock(probe, "C-1")
        diagnose_component_stock(probe, "C-159")
        
        # Query under minimum items
        print()
        print("Querying components under minimum stock requirements...")
        query_start = time.time()
        under_minimum_rows = query_under_minimum_items(probe)
        query_time = time.time() - query_start
        
        print(f"✓ Query completed in {query_time:.2f} seconds")
        print(f"✓ Found {len(under_minimum_rows)} items under minimum stock")
        
        if not under_minimum_rows:
            print()
            print("No items found under minimum stock requirements.")
            print("Report will show empty state message.")
        
        # Generate output filename
        timestamp = datetime.now().strftime("%Y_%m_%d_%H%M%S")
        output_html = f"under_minimum_stock_test_{timestamp}.html"
        output_path = os.path.join(os.path.dirname(__file__), output_html)
        
        # Generate HTML report
        print()
        print("Generating HTML report...")
        html_start = time.time()
        html_path = generate_html_report(under_minimum_rows, output_path)
        html_time = time.time() - html_start
        print(f"✓ HTML generation completed in {html_time:.2f} seconds")
        
        # Open HTML file automatically
        print()
        print("Opening report in browser...")
        try:
            webbrowser.open(f"file:///{html_path.replace(os.sep, '/')}")
            print(f"✓ Report opened in default browser")
        except Exception as e:
            print(f"⚠ Warning: Could not open browser automatically: {e}")
            print(f"  Please open manually: {html_path}")
        
        # Performance summary
        print()
        print("="*60)
        print("SUCCESS: Report generated!")
        print("="*60)
        print(f"Performance Summary:")
        print(f"  Database connection: {conn_time:.2f} seconds")
        print(f"  Database query: {query_time:.2f} seconds")
        print(f"  HTML generation: {html_time:.2f} seconds")
        print(f"  Total time: {conn_time + query_time + html_time:.2f} seconds")
        print()
        print(f"Report file: {html_path}")
        print("="*60)
        
    except Exception as e:
        print(f"✗ ERROR: {e}")
        import traceback
        traceback.print_exc()
    finally:
        if probe:
            probe.disconnect()


if __name__ == "__main__":
    start_time = time.time()
    main()
    total_time = time.time() - start_time
    print()
    print(f"Total execution time: {total_time:.2f} seconds")

