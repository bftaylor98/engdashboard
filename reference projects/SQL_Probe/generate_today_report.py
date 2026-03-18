"""
Generate Today's Transaction Report for checkout transactions
Based on Master Transaction Report script
"""
import sys
import os

# Add current directory to path to import sql_probe
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from sql_probe import SQLProbe
from datetime import datetime, timedelta
import html
import time
import re


TARGET_HEADERS = [
    "Date",
    "Time",
    "User",
    "Action",
    "C-ID",
    "Description",
    "QTY",
    "Value",
    "Part No",
    "Work Order",
]

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
    company, suffix = parse_part_number(part_no)
    if company and suffix:
        return PART_NUMBER_LINKS[company](suffix)
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


def validate_work_order(comment):
    """
    Validate work order format. Must match XX-XXXX pattern (two digits, hyphen, four digits).
    Returns the comment if valid, otherwise returns "None Specified".
    
    Args:
        comment: Work order comment string from database
    
    Returns:
        Valid work order string or "None Specified"
    """
    if not comment:
        return "None Specified"
    
    comment = str(comment).strip()
    
    # Check if it matches XX-XXXX pattern (two digits, hyphen, four digits)
    if re.match(r'^\d{2}-\d{4}$', comment):
        return comment
    
    # If it doesn't match the pattern, return "None Specified"
    return "None Specified"


def query_checkouts_today(probe):
    """Query all checkout events for today and format for HTML report."""
    today = datetime.now()
    date_str = today.strftime('%Y-%m-%d')
    
    query_checkouts = f"""
        SELECT 
            CAST(afs.Time AT TIME ZONE 'UTC' AT TIME ZONE 'Eastern Standard Time' AS DATETIME) AS TimeEastern,
            comp_od.ObjTxt AS ComponentCode,
            comp_od.DescrTxt AS ComponentDescription,
            comp_od.ObjId AS ComponentId,
            afs.Quantity,
            afs.EntryComment,
            COALESCE(user_od.ObjTxt, CAST(afs.UserObjId AS NVARCHAR(50))) AS UserName,
            afs.Cost
        FROM ArticleFlowStatistic afs
        INNER JOIN ObjData comp_od ON afs.ArticleObjId = comp_od.ObjId
        LEFT JOIN ObjData user_od ON afs.UserObjId = user_od.ObjId
        WHERE afs.EntrySubTypeId = 4  -- Checkout events
            AND CAST(CAST(afs.Time AT TIME ZONE 'UTC' AT TIME ZONE 'Eastern Standard Time' AS DATETIME) AS DATE) = '{date_str}'
        ORDER BY afs.Time DESC
    """
    
    result = probe.execute_query_with_headers(query_checkouts)
    if not result:
        return []
    
    columns, rows = result
    report_rows = []
    
    for row in rows:
        time_eastern = row[columns.index('TimeEastern')]
        comp_code = row[columns.index('ComponentCode')] or ""
        comp_desc = row[columns.index('ComponentDescription')] or ""
        comp_id = row[columns.index('ComponentId')]
        quantity = row[columns.index('Quantity')]
        comment_raw = row[columns.index('EntryComment')] or ""
        comment = validate_work_order(comment_raw)
        user_name = row[columns.index('UserName')] or ""
        cost = row[columns.index('Cost')] or 0.0
        
        if time_eastern:
            dt = time_eastern if isinstance(time_eastern, datetime) else datetime.fromisoformat(str(time_eastern))
            date_str = dt.strftime("%m/%d/%Y")
            time_str = dt.strftime("%I:%M %p").lstrip("0").replace(" 0", " ")
        else:
            date_str = ""
            time_str = ""
        
        part_no = get_component_part_no(probe, comp_id)
        
        # Get UnitPrice from ValData and calculate Value as UnitPrice * Quantity
        unit_price = get_component_unit_price(probe, comp_id)
        if unit_price is not None:
            try:
                qty_float = float(quantity) if quantity else 0.0
                value_float = unit_price * qty_float
                value_str = f"${value_float:,.2f}" if value_float > 0 else ""
            except (ValueError, TypeError):
                value_str = ""
        else:
            # Fallback to Cost if UnitPrice not available
            try:
                cost_float = float(cost) if cost else 0.0
                value_str = f"${cost_float:,.2f}" if cost_float > 0 else ""
            except (ValueError, TypeError):
                value_str = ""
        
        report_rows.append({
            'Date': date_str,
            'Time': time_str,
            'User': user_name,
            'Action': 'Checkout',
            'C-ID': comp_code,
            'Description': comp_desc,
            'QTY': str(quantity),
            'Value': value_str,
            'Part No': part_no,
            'Work Order': comment
        })
    
    return report_rows


def currency_format(value: str) -> tuple:
    """Format currency value."""
    if not value or value.strip() == "":
        return "", None
    text = str(value).strip().replace("$", "").replace(",", "")
    if not text:
        return "", None
    try:
        numeric = float(text)
    except ValueError:
        return value, None
    return f"${numeric:,.2f}", numeric


def generate_html_report(rows, output_html):
    """Generate HTML report from transaction rows."""
    if not rows:
        print("No data to generate report")
        return
    
    # Calculate total
    total = 0.0
    has_value = False
    
    for row_data in rows:
        value_raw = row_data.get('Value', '').strip()
        _, numeric = currency_format(value_raw)
        if numeric is not None:
            has_value = True
            total += numeric
    
    # Prepare rows for HTML
    rows_html = []
    row_values = []
    
    for row_data in rows:
        date_val = row_data.get('Date', '').strip()
        time_val = row_data.get('Time', '').strip()
        user_val = row_data.get('User', '').strip()
        action_val = row_data.get('Action', '').strip()
        cid_val = row_data.get('C-ID', '').strip()
        desc_val = row_data.get('Description', '').strip()
        qty_val = row_data.get('QTY', '').strip()
        value_raw = row_data.get('Value', '').strip()
        part_val = row_data.get('Part No', '').strip()
        wo_val = row_data.get('Work Order', '').strip()
        
        currency_str, numeric = currency_format(value_raw)
        row_values.append(numeric)
        
        rows_html.append([
            date_val,
            time_val,
            user_val,
            action_val,
            cid_val,
            desc_val,
            qty_val,
            currency_str,
            part_val,
            wo_val,
        ])
    
    # Get date for subtitle
    if rows:
        first_row = rows[0]
        subtitle = f"Date: {first_row.get('Date', '')}"
    else:
        subtitle = "Date: N/A"
    
    # Extract unique values for dropdown filters
    sortable_cols = [4, 3, 2, 1, 0]  # C-ID, Action, User, Time, Date
    filterable_cols = [2, 3, 9]  # User, Action, Work Order
    
    unique_users = sorted(set(row[2] for row in rows_html if row[2].strip()), key=str.lower)
    unique_actions = sorted(set(row[3] for row in rows_html if row[3].strip()), key=str.lower)
    unique_work_orders = sorted(set(row[9] for row in rows_html if row[9].strip()), key=str.lower)
    
    # Build header row
    header_cells = []
    for idx, header in enumerate(TARGET_HEADERS):
        header_text = html.escape(header)
        if idx in sortable_cols:
            header_text += ' <span class="sort-indicator">⇅</span>'
            header_cells.append(f'<th class="sortable" data-col="{idx}">{header_text}</th>')
        else:
            header_cells.append(f'<th data-col="{idx}">{header_text}</th>')
    header_row = "<tr>" + "".join(header_cells) + "</tr>"
    
    # Build body rows
    body_rows = []
    for row_idx, row in enumerate(rows_html):
        cells = []
        for idx, cell in enumerate(row):
            cell_text = html.escape(cell)
            cell_lower = cell.lower()
            
            attrs = []
            if idx in filterable_cols:
                attrs.append(f'data-filter="{cell_lower}"')
            if idx == 7:  # Value column
                attrs.append(f'data-value="{row_values[row_idx] or 0}"')
            
            data_attrs = ' ' + ' '.join(attrs) if attrs else ''
            
            if idx == 8 and cell.strip():  # Part No column
                part_link = get_part_number_link(cell)
                if part_link:
                    cells.append(f'<td{data_attrs}><a href="{html.escape(part_link)}" target="_blank">{cell_text}</a></td>')
                else:
                    cells.append(f'<td{data_attrs}>{cell_text}</td>')
            elif idx == 9 and cell.strip() and cell != "None Specified":  # Work Order column - valid work order
                wo_url = f"https://est.adionsystems.com/procnc/workorders/{cell.strip()}"
                cells.append(f'<td{data_attrs}><a href="{html.escape(wo_url)}" target="_blank">{cell_text}</a></td>')
            elif idx == 9:  # Work Order column - "None Specified" or empty
                cells.append(f'<td{data_attrs} class="wo-none-specified">{cell_text}</td>')
            else:
                cells.append(f'<td{data_attrs}>{cell_text}</td>')
        body_rows.append(f'<tr data-row-value="{row_values[row_idx] or 0}">{"".join(cells)}</tr>')
    
    # Calculate initial total
    initial_total = total if has_value else 0
    count = len(rows)
    initial_total_html = f'Total Value: ${initial_total:,.2f} | Transactions Shown: {count}' if has_value else f'Total Value: $0.00 | Transactions Shown: {count}'
    
    # Use the same HTML template structure as master report (simplified for single day)
    html_content = f"""<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Today's Transaction Report</title>
    <style>
        * {{
            margin: 0;
            padding: 0;
            box-sizing: border-box;
        }}

        body {{
            font-family: Arial, sans-serif;
            padding: 30px;
            background-color: #f5f5f5;
            color: #333;
            transition: background-color 0.3s ease, color 0.3s ease;
        }}

        body.dark-mode {{
            background-color: #1a1a1a;
            color: #e0e0e0;
        }}

        .container {{
            max-width: 2000px;
            margin: 0 auto;
            background: white;
            padding: 40px;
            box-shadow: 0 2px 10px rgba(0,0,0,0.1);
            border-radius: 8px;
            transition: background-color 0.3s ease, box-shadow 0.3s ease;
        }}

        body.dark-mode .container {{
            background: #2d2d2d;
            box-shadow: 0 2px 10px rgba(0,0,0,0.5);
        }}

        .header-section {{
            display: flex;
            align-items: center;
            justify-content: center;
            gap: 20px;
            margin-bottom: 20px;
            position: relative;
        }}

        .header-controls {{
            position: absolute;
            top: 0;
            right: 0;
            display: flex;
            gap: 10px;
            align-items: center;
        }}

        .control-button {{
            padding: 10px;
            font-size: 20px;
            border: none;
            border-radius: 5px;
            background-color: transparent;
            color: #333;
            cursor: pointer;
            transition: all 0.3s ease;
            width: 40px;
            height: 40px;
            display: flex;
            align-items: center;
            justify-content: center;
        }}

        .control-button:hover {{
            background-color: rgba(0, 0, 0, 0.1);
            transform: translateY(-2px);
        }}

        .control-button:active {{
            transform: translateY(0);
        }}

        body.dark-mode .control-button {{
            color: #e0e0e0;
        }}

        body.dark-mode .control-button:hover {{
            background-color: rgba(255, 255, 255, 0.1);
        }}

        .logo {{
            max-height: 80px;
            max-width: 300px;
        }}

        .title-section {{
            flex: 1;
        }}

        h1 {{
            font-size: 36px;
            margin-bottom: 8px;
            color: #333;
            text-align: center;
            transition: color 0.3s ease;
        }}

        body.dark-mode h1 {{
            color: #ffffff;
        }}

        .subtitle {{
            font-size: 20px;
            margin-bottom: 0;
            color: #666;
            text-align: center;
            transition: color 0.3s ease;
        }}

        body.dark-mode .subtitle {{
            color: #b0b0b0;
        }}

        .filters {{
            display: flex;
            gap: 15px;
            margin-bottom: 20px;
            padding: 15px;
            background-color: #f9f9f9;
            border: 2px solid #ddd;
            border-radius: 5px;
            flex-wrap: wrap;
            transition: background-color 0.3s ease, border-color 0.3s ease;
        }}

        body.dark-mode .filters {{
            background-color: #3a3a3a;
            border: 2px solid #555;
        }}

        .filter-group {{
            display: flex;
            flex-direction: column;
            gap: 5px;
            flex: 1;
            min-width: 200px;
        }}

        .filter-group label {{
            font-weight: bold;
            font-size: 14px;
            color: #333;
            transition: color 0.3s ease;
        }}

        body.dark-mode .filter-group label {{
            color: #e0e0e0;
        }}

        .filter-group select {{
            padding: 8px;
            font-size: 14px;
            border: 1px solid #ccc;
            border-radius: 3px;
            background-color: white;
            color: #333;
            cursor: pointer;
            transition: all 0.3s ease;
        }}

        body.dark-mode .filter-group select {{
            border: 1px solid #555;
            background-color: #2d2d2d;
            color: #e0e0e0;
        }}

        .filter-group select:focus {{
            outline: none;
            border-color: #0066cc;
        }}

        body.dark-mode .filter-group select:focus {{
            border-color: #4a9eff;
            background-color: #353535;
        }}

        .filtered-indicator {{
            display: none;
            padding: 10px;
            background-color: #fff3cd;
            border: 2px solid #ffc107;
            border-radius: 5px;
            margin-bottom: 15px;
            font-weight: bold;
            color: #856404;
            text-align: center;
            transition: all 0.3s ease;
        }}

        body.dark-mode .filtered-indicator {{
            background-color: #4a3d1a;
            color: #ffc107;
        }}

        .filtered-indicator.active {{
            display: block;
        }}

        .table-wrapper {{
            overflow-x: auto;
            margin-bottom: 30px;
        }}

        table {{
            width: 100%;
            border-collapse: collapse;
            font-size: 16px;
            min-width: 1600px;
        }}

        th {{
            background-color: #f2f2f2;
            font-weight: bold;
            font-size: 18px;
            padding: 12px 10px;
            text-align: center;
            border: 1px solid #ddd;
            position: sticky;
            top: 0;
            z-index: 10;
            color: #333;
            transition: all 0.3s ease;
        }}

        body.dark-mode th {{
            background-color: #1e1e1e;
            border: 1px solid #444;
            color: #ffffff;
        }}

        th.sortable {{
            cursor: pointer;
            user-select: none;
        }}

        th.sortable:hover {{
            background-color: #e0e0e0;
        }}

        body.dark-mode th.sortable:hover {{
            background-color: #2a2a2a;
        }}

        .sort-indicator {{
            font-size: 14px;
            color: #666;
            margin-left: 5px;
            transition: color 0.3s ease;
        }}

        body.dark-mode .sort-indicator {{
            color: #888;
        }}

        th.sort-asc .sort-indicator::after {{
            content: " ↑";
            color: #0066cc;
        }}

        body.dark-mode th.sort-asc .sort-indicator::after {{
            color: #4a9eff;
        }}

        th.sort-desc .sort-indicator::after {{
            content: " ↓";
            color: #0066cc;
        }}

        body.dark-mode th.sort-desc .sort-indicator::after {{
            color: #4a9eff;
        }}

        td {{
            padding: 12px 10px;
            border: 1px solid #ddd;
            vertical-align: middle;
            text-align: center;
            color: #333;
            transition: all 0.3s ease;
        }}

        body.dark-mode td {{
            border: 1px solid #444;
            color: #e0e0e0;
        }}

        td a {{
            color: #0066cc;
            text-decoration: underline;
            transition: color 0.3s ease;
        }}

        body.dark-mode td a {{
            color: #6bb6ff;
        }}

        td a:hover {{
            color: #004499;
            text-decoration: none;
        }}

        body.dark-mode td a:hover {{
            color: #4a9eff;
        }}

        tr:nth-child(even) {{
            background-color: #e6f0ff;
        }}

        body.dark-mode tr:nth-child(even) {{
            background-color: #353535;
        }}

        tr:hover {{
            background-color: #d6e9ff;
        }}

        body.dark-mode tr:hover {{
            background-color: #404040;
        }}

        .col-date {{ width: 10%; }}
        .col-time {{ width: 8%; }}
        .col-user {{ width: 9%; }}
        .col-action {{ width: 9%; }}
        .col-cid {{ width: 7%; }}
        .col-desc {{ width: 25%; }}
        .col-qty {{ width: 5%; }}
        .col-value {{ width: 6%; }}
        .col-part {{ width: 9%; white-space: nowrap; }}
        .col-wo {{ width: 10%; }}

        .wo-none-specified {{
            color: #dc3545;
            font-weight: bold;
            background-color: #ffe6e6;
        }}

        body.dark-mode .wo-none-specified {{
            color: #ff6b6b;
            background-color: #4a1f1f;
        }}

        .total {{
            margin-top: 20px;
            font-size: 20px;
            font-weight: bold;
            text-align: center;
            padding: 15px;
            background-color: #f2f2f2;
            border: 1px solid #ddd;
            color: #333;
            transition: all 0.3s ease;
        }}

        body.dark-mode .total {{
            background-color: #1e1e1e;
            border: 1px solid #444;
            color: #ffffff;
        }}

        @media print {{
            .header-controls {{
                display: none !important;
            }}

            .filters {{
                display: none !important;
            }}

            .filtered-indicator {{
                display: none !important;
            }}
        }}
    </style>
</head>
<body>
    <div class="container">
        <div class="header-section">
            <img src="daily_trans/logo.png" alt="Logo" class="logo">
            <div class="title-section">
                <h1>Today's Transaction Report</h1>
                <div class="subtitle" id="subtitle">{html.escape(subtitle)}</div>
            </div>
            <div class="header-controls">
                <button class="control-button" id="darkModeToggle" onclick="toggleDarkMode()" title="Toggle Dark Mode">🌙</button>
                <button class="control-button" onclick="exportToCSV()" title="Export to CSV">📥</button>
                <button class="control-button print-button" onclick="window.print()" title="Print Report">🖨️</button>
            </div>
        </div>

        <div class="filtered-indicator" id="filteredIndicator">
            Table is filtered - showing only matching rows
        </div>

        <div class="filters">
            <div class="filter-group">
                <label for="filterUser">Filter by User:</label>
                <select id="filterUser">
                    <option value="">All Users</option>
                    {"".join(f'<option value="{html.escape(user)}">{html.escape(user)}</option>' for user in unique_users)}
                </select>
            </div>
            <div class="filter-group">
                <label for="filterAction">Filter by Action:</label>
                <select id="filterAction">
                    <option value="">All Actions</option>
                    {"".join(f'<option value="{html.escape(action)}">{html.escape(action)}</option>' for action in unique_actions)}
                </select>
            </div>
            <div class="filter-group">
                <label for="filterWorkOrder">Filter by Work Order:</label>
                <select id="filterWorkOrder">
                    <option value="">All Work Orders</option>
                    {"".join(f'<option value="{html.escape(wo)}">{html.escape(wo)}</option>' for wo in unique_work_orders)}
                </select>
            </div>
        </div>
        
        <div class="table-wrapper">
            <table id="dataTable">
                <thead>
                    {header_row}
                </thead>
                <tbody>
                    {"".join(body_rows)}
                </tbody>
            </table>
        </div>
        
        <div class="total" id="totalValue">{initial_total_html}</div>
        <script>
            const TOTAL = {initial_total};
            const COUNT = {count};
        </script>
    </div>

    <script>
        // CSV Export Function
        function exportToCSV() {{
            const table = document.getElementById('dataTable');
            const rows = table.querySelectorAll('tbody tr');
            const subtitle = document.getElementById('subtitle').textContent;
            
            // Get headers
            const headers = [];
            table.querySelectorAll('thead th').forEach(th => {{
                const headerText = th.textContent.replace(' ⇅', '').trim();
                headers.push(headerText);
            }});
            
            // Get visible rows
            const visibleRows = [];
            rows.forEach(row => {{
                const isVisible = row.style.display !== 'none' && !row.classList.contains('filtered-out');
                
                if (isVisible) {{
                    const cells = row.querySelectorAll('td');
                    const rowData = [];
                    cells.forEach(cell => {{
                        let cellText = cell.textContent.trim();
                        const link = cell.querySelector('a');
                        if (link) {{
                            cellText = link.textContent.trim();
                        }}
                        if (cellText.includes(',') || cellText.includes('"') || cellText.includes('\\n')) {{
                            cellText = '"' + cellText.replace(/"/g, '""') + '"';
                        }}
                        rowData.push(cellText);
                    }});
                    visibleRows.push(rowData);
                }}
            }});
            
            // Build CSV content
            let csvContent = 'Today\\'s Transaction Report\\n';
            csvContent += subtitle + '\\n';
            csvContent += '\\n';
            csvContent += headers.join(',') + '\\n';
            
            visibleRows.forEach(row => {{
                csvContent += row.join(',') + '\\n';
            }});
            
            // Create download link
            const blob = new Blob([csvContent], {{ type: 'text/csv;charset=utf-8;' }});
            const link = document.createElement('a');
            const url = URL.createObjectURL(blob);
            link.setAttribute('href', url);
            
            // Generate filename
            const dateStr = new Date().toISOString().split('T')[0].replace(/-/g, '_');
            link.setAttribute('download', `today_report_${{dateStr}}.csv`);
            
            link.style.visibility = 'hidden';
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);
        }}

        // Dark Mode Toggle
        function toggleDarkMode() {{
            const body = document.body;
            const toggleButton = document.getElementById('darkModeToggle');
            
            body.classList.toggle('dark-mode');
            
            if (body.classList.contains('dark-mode')) {{
                toggleButton.textContent = '☀️';
                localStorage.setItem('darkMode', 'enabled');
            }} else {{
                toggleButton.textContent = '🌙';
                localStorage.setItem('darkMode', 'disabled');
            }}
        }}

        document.addEventListener('DOMContentLoaded', function() {{
            const savedMode = localStorage.getItem('darkMode');
            const toggleButton = document.getElementById('darkModeToggle');
            
            if (savedMode === 'enabled') {{
                document.body.classList.add('dark-mode');
                toggleButton.textContent = '☀️';
            }} else {{
                toggleButton.textContent = '🌙';
            }}
        }});

        const SORTABLE_COLS = [4, 3, 2, 1, 0];
        const FILTER_COLS = {{
            2: 'filterUser',
            3: 'filterAction',
            9: 'filterWorkOrder'
        }};

        let currentSort = {{ col: null, dir: 'asc' }};

        document.addEventListener('DOMContentLoaded', function() {{
            const headers = document.querySelectorAll('th');
            const classes = ['col-date', 'col-time', 'col-user', 'col-action', 'col-cid', 
                           'col-desc', 'col-qty', 'col-value', 'col-part', 'col-wo'];
            
            headers.forEach((th, index) => {{
                if (classes[index]) {{
                    th.classList.add(classes[index]);
                }}
            }});

            const allTableRows = document.querySelectorAll('tbody tr');
            allTableRows.forEach(row => {{
                const cells = row.querySelectorAll('td');
                cells.forEach((td, index) => {{
                    if (classes[index]) {{
                        td.classList.add(classes[index]);
                    }}
                }});
            }});

            document.querySelectorAll('th.sortable').forEach(th => {{
                th.addEventListener('click', function() {{
                    const col = parseInt(this.getAttribute('data-col'));
                    sortTable(col);
                }});
            }});

            document.getElementById('filterUser').addEventListener('change', applyFilters);
            document.getElementById('filterAction').addEventListener('change', applyFilters);
            document.getElementById('filterWorkOrder').addEventListener('change', applyFilters);
            
            applyFilters();
        }});

        function sortTable(col) {{
            const table = document.getElementById('dataTable');
            const tbody = table.querySelector('tbody');
            const rows = Array.from(tbody.querySelectorAll('tr')).filter(row => row.style.display !== 'none');

            if (rows.length === 0) return;

            if (currentSort.col === col) {{
                currentSort.dir = currentSort.dir === 'asc' ? 'desc' : 'asc';
            }} else {{
                currentSort.col = col;
                currentSort.dir = 'asc';
            }}

            document.querySelectorAll('th.sortable').forEach(th => {{
                th.classList.remove('sort-asc', 'sort-desc');
            }});
            const header = document.querySelector(`th[data-col="${{col}}"]`);
            if (header) {{
                header.classList.add(`sort-${{currentSort.dir}}`);
            }}

            rows.sort((a, b) => {{
                const aCell = a.querySelectorAll('td')[col];
                const bCell = b.querySelectorAll('td')[col];
                const aText = aCell ? aCell.textContent.trim() : '';
                const bText = bCell ? bCell.textContent.trim() : '';

                if (col === 4) {{
                    const aNum = parseFloat(aText.replace(/[^0-9.-]/g, '')) || 0;
                    const bNum = parseFloat(bText.replace(/[^0-9.-]/g, '')) || 0;
                    return currentSort.dir === 'asc' ? aNum - bNum : bNum - aNum;
                }}

                if (col === 1) {{
                    const parseTime = (timeStr) => {{
                        if (!timeStr) return 0;
                        const match = timeStr.match(/(\\d+):(\\d+)\\s*(AM|PM)/i);
                        if (!match) return 0;
                        let hours = parseInt(match[1]);
                        const minutes = parseInt(match[2]);
                        const ampm = match[3].toUpperCase();
                        if (ampm === 'PM' && hours !== 12) hours += 12;
                        if (ampm === 'AM' && hours === 12) hours = 0;
                        return hours * 60 + minutes;
                    }};
                    const aTime = parseTime(aText);
                    const bTime = parseTime(bText);
                    return currentSort.dir === 'asc' ? aTime - bTime : bTime - aTime;
                }}

                if (col === 0) {{
                    const parseDate = (dateStr) => {{
                        if (!dateStr) return 0;
                        const match = dateStr.match(/(\\d+)\\/(\\d+)\\/(\\d+)/);
                        if (!match) return 0;
                        const month = parseInt(match[1]);
                        const day = parseInt(match[2]);
                        const year = parseInt(match[3]);
                        return new Date(year, month - 1, day).getTime();
                    }};
                    const aDate = parseDate(aText);
                    const bDate = parseDate(bText);
                    return currentSort.dir === 'asc' ? aDate - bDate : bDate - aDate;
                }}

                const comparison = aText.localeCompare(bText);
                return currentSort.dir === 'asc' ? comparison : -comparison;
            }});

            rows.forEach(row => tbody.appendChild(row));
        }}

        function applyFilters() {{
            const userFilter = document.getElementById('filterUser').value;
            const actionFilter = document.getElementById('filterAction').value;
            const woFilter = document.getElementById('filterWorkOrder').value;

            const table = document.getElementById('dataTable');
            const rows = table.querySelectorAll('tbody tr');
            let visibleCount = 0;
            let totalValue = 0;

            rows.forEach(row => {{
                const userCell = row.querySelectorAll('td')[2];
                const actionCell = row.querySelectorAll('td')[3];
                const woCell = row.querySelectorAll('td')[9];

                const userText = userCell ? (userCell.textContent.trim()) : '';
                const actionText = actionCell ? (actionCell.textContent.trim()) : '';
                const woLink = woCell ? woCell.querySelector('a') : null;
                const woText = woCell ? (woLink ? woLink.textContent.trim() : woCell.textContent.trim()) : '';

                const matches = (!userFilter || userText === userFilter) &&
                               (!actionFilter || actionText === actionFilter) &&
                               (!woFilter || woText === woFilter);

                if (matches) {{
                    row.style.display = '';
                    row.classList.remove('filtered-out');
                    visibleCount++;
                    const rowValue = parseFloat(row.getAttribute('data-row-value')) || 0;
                    totalValue += rowValue;
                }} else {{
                    row.style.display = 'none';
                    row.classList.add('filtered-out');
                }}
            }});

            const isFiltered = userFilter || actionFilter || woFilter;
            const indicator = document.getElementById('filteredIndicator');
            const totalDiv = document.getElementById('totalValue');

            if (isFiltered) {{
                indicator.classList.add('active');
                table.classList.add('filtered');
                const formatted = totalValue.toFixed(2).replace(/\\B(?=(\\d{{3}})+(?!\\d))/g, ",");
                totalDiv.innerHTML = `Total Value (Filtered): ${{formatted}} | Transactions Shown: ${{visibleCount}}`;
            }} else {{
                indicator.classList.remove('active');
                table.classList.remove('filtered');
                const formatted = TOTAL.toFixed(2).replace(/\\B(?=(\\d{{3}})+(?!\\d))/g, ",");
                totalDiv.innerHTML = `Total Value: ${{formatted}} | Transactions Shown: ${{COUNT}}`;
            }}
        }}
    </script>
</body>
</html>"""
    
    with open(output_html, 'w', encoding='utf-8') as f:
        f.write(html_content)
    
    print(f"Saved HTML report to {os.path.abspath(output_html)}")
    print(f"Generated report with {len(rows)} transactions")


def main():
    """Main function to generate today's report."""
    SERVER = r"ESTSS01\ZOLLERSQLEXPRESS"
    DATABASE = "ZOLLERDB3"
    CREDENTIALS = [
        ("Brad Taylor", "Falcon 9"),
        ("SA", "Zollerdb3")
    ]
    
    probe = None
    connected = False
    
    conn_start = time.time()
    for username, password in CREDENTIALS:
        probe = SQLProbe(SERVER, DATABASE, username, password)
        if probe.connect():
            connected = True
            break
    conn_time = time.time() - conn_start
    
    if not connected:
        print("ERROR: Could not connect to database")
        return
    
    try:
        today = datetime.now()
        date_str = today.strftime('%Y-%m-%d')
        
        print(f"Querying today's checkout transactions for {date_str}...")
        query_start = time.time()
        rows = query_checkouts_today(probe)
        query_time = time.time() - query_start
        print(f"Query completed in {query_time:.2f} seconds ({len(rows)} transactions)")
        
        if not rows:
            print(f"No checkout transactions found for today")
            return
        
        # Generate output filename
        date_for_filename = date_str.replace('-', '_')
        output_html = f"today_report_{date_for_filename}.html"
        
        # Generate HTML report
        print(f"\n{'='*60}")
        print("Generating HTML Report...")
        print(f"{'='*60}")
        html_start = time.time()
        generate_html_report(rows, output_html)
        html_time = time.time() - html_start
        print(f"HTML generation completed in {html_time:.2f} seconds")
        
        print(f"\n{'='*60}")
        print("SUCCESS: Report generated!")
        print(f"{'='*60}")
        print(f"Performance Summary:")
        print(f"  Database connection: {conn_time:.2f} seconds")
        print(f"  Database query: {query_time:.2f} seconds")
        print(f"  HTML generation: {html_time:.2f} seconds")
        
    except Exception as e:
        print(f"ERROR: {e}")
        import traceback
        traceback.print_exc()
    finally:
        probe.disconnect()


if __name__ == "__main__":
    start_time = time.time()
    main()
    total_time = time.time() - start_time
    print(f"\n{'='*60}")
    print(f"Total execution time: {total_time:.2f} seconds")
    print(f"{'='*60}")






