"""
Generate HTML report for checkout transactions by date
Uses the same format as generate_report_html_v2.py but pulls data directly from database
"""
from sql_probe import SQLProbe
from datetime import datetime, timedelta
import html
import os
import sys
import subprocess
import time

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
# Maps company prefixes to URL generation functions
PART_NUMBER_LINKS = {
    'OSG': lambda suffix: f"https://osgtool.com/{suffix}",
    'ALLI': lambda suffix: f"https://www.alliedmachine.com/PRODUCTS/ItemDetail.aspx?item={suffix}",
    'GARR': lambda suffix: f"https://www.garrtool.com/product-details/?EDP={suffix}",
    'GUHR': lambda suffix: f"https://guhring.com/ProductsServices/SizeDetails?EDP={suffix}",
    'HARV': lambda suffix: f"https://www.harveytool.com/products/tool-details-{suffix}",
    'INGE': lambda suffix: f"https://www.ingersoll-imc.com/product/{suffix}",
    # Add more companies here as needed
}


def parse_part_number(part_no: str) -> tuple:
    """
    Parse a part number to extract company prefix and suffix.
    
    Args:
        part_no: Part number string (e.g., "OSG-VGM5-0162")
    
    Returns:
        Tuple of (company_prefix, part_suffix) or (None, None) if no match
    """
    if not part_no or not part_no.strip():
        return None, None
    
    part_no = part_no.strip()
    
    # Check each company prefix
    for prefix, url_func in PART_NUMBER_LINKS.items():
        # Check if part number starts with prefix followed by a hyphen
        prefix_with_hyphen = f"{prefix}-"
        if part_no.upper().startswith(prefix_with_hyphen.upper()):
            # Extract the suffix (everything after "PREFIX-")
            suffix = part_no[len(prefix_with_hyphen):].strip()
            if suffix:  # Make sure there's actually a suffix
                return prefix, suffix
    
    return None, None


def get_part_number_link(part_no: str) -> str:
    """
    Generate a hyperlink URL for a part number if it matches a known company.
    
    Args:
        part_no: Part number string (e.g., "OSG-VGM5-0162")
    
    Returns:
        URL string if match found, None otherwise
    """
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


def query_checkouts_by_date(probe, target_date=None):
    """Query all checkout events for a specific date and format for HTML report.
    
    Args:
        probe: SQLProbe instance
        target_date: Date string in 'YYYY-MM-DD' format, or None for yesterday
    """
    # Use target_date if provided, otherwise use yesterday
    if target_date:
        date_str = target_date
    else:
        yesterday = datetime.now() - timedelta(days=1)
        date_str = yesterday.strftime('%Y-%m-%d')
    
    # Query all checkout events from yesterday
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
    
    # Map to report format
    report_rows = []
    for row in rows:
        time_eastern = row[columns.index('TimeEastern')]
        comp_code = row[columns.index('ComponentCode')] or ""
        comp_desc = row[columns.index('ComponentDescription')] or ""
        comp_id = row[columns.index('ComponentId')]
        quantity = row[columns.index('Quantity')]
        comment = row[columns.index('EntryComment')] or ""
        user_name = row[columns.index('UserName')] or ""
        cost = row[columns.index('Cost')] or 0.0
        
        # Format date and time
        if time_eastern:
            dt = time_eastern if isinstance(time_eastern, datetime) else datetime.fromisoformat(str(time_eastern))
            date_str = dt.strftime("%m/%d/%Y")
            time_str = dt.strftime("%I:%M %p").lstrip("0").replace(" 0", " ")
        else:
            date_str = ""
            time_str = ""
        
        # Get Part No (OrderNo)
        part_no = get_component_part_no(probe, comp_id)
        
        # Format value
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


def generate_html_report(report_rows, output_html):
    """Generate HTML report from report rows."""
    if not report_rows:
        print("No data to generate report")
        return
    
    # Prepare rows for HTML
    rows_html = []
    row_values = []
    total_value = 0.0
    has_value = False
    first_date = None
    
    for row_data in report_rows:
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
        if numeric is not None:
            has_value = True
            total_value += numeric
        
        if not first_date and date_val:
            try:
                parsed = datetime.strptime(date_val, "%m/%d/%Y")
                first_date = parsed.strftime("%m/%d/%y")
            except ValueError:
                first_date = date_val
        
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
    
    subtitle_date = first_date or ""
    total_value = total_value if has_value else None
    
    # Extract unique values for dropdown filters
    sortable_cols = [4, 3, 2, 1]  # C-ID, Action, User, Time
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
            
            # Build data attributes
            attrs = []
            if idx in filterable_cols:
                attrs.append(f'data-filter="{cell_lower}"')
            if idx == 7:  # Value column
                attrs.append(f'data-value="{row_values[row_idx] or 0}"')
            
            data_attrs = ' ' + ' '.join(attrs) if attrs else ''
            
            # Make part number a hyperlink if it matches a known company
            if idx == 8 and cell.strip():  # Part No column (index 8)
                part_link = get_part_number_link(cell)
                if part_link:
                    cells.append(f'<td{data_attrs}><a href="{html.escape(part_link)}" target="_blank">{cell_text}</a></td>')
                else:
                    cells.append(f'<td{data_attrs}>{cell_text}</td>')
            # Make work order a hyperlink if it has a value
            elif idx == 9 and cell.strip():  # Work Order column (index 9)
                wo_url = f"https://est.adionsystems.com/procnc/workorders/{cell.strip()}"
                cells.append(f'<td{data_attrs}><a href="{html.escape(wo_url)}" target="_blank">{cell_text}</a></td>')
            else:
                cells.append(f'<td{data_attrs}>{cell_text}</td>')
        body_rows.append(f'<tr data-row-value="{row_values[row_idx] or 0}">{"".join(cells)}</tr>')
    
    total_html = ""
    initial_total = 0
    if total_value is not None:
        initial_total = total_value
        total_html = f'Total Value: ${total_value:,.2f}'
    
    html_content = f"""<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Daily Zoller Transaction Report</title>
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

        /* Hide print button on mobile */
        @media screen and (max-width: 768px) {{
            .print-button {{
                display: none;
            }}
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

        .filter-group select option {{
            background-color: white;
            color: #333;
        }}

        body.dark-mode .filter-group select option {{
            background-color: #2d2d2d;
            color: #e0e0e0;
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

        tr.filtered-out {{
            display: none;
        }}

        table.filtered tr:not(.filtered-out) {{
            background-color: #fffacd;
        }}

        body.dark-mode table.filtered tr:not(.filtered-out) {{
            background-color: #3a3520;
        }}

        table.filtered tr:not(.filtered-out):nth-child(even) {{
            background-color: #fff8dc;
        }}

        body.dark-mode table.filtered tr:not(.filtered-out):nth-child(even) {{
            background-color: #4a4328;
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

        /* Mobile Responsive Styles */
        @media screen and (max-width: 768px) {{
            body {{
                padding: 10px;
            }}

            body.dark-mode {{
                background-color: #1a1a1a;
            }}

            .container {{
                padding: 15px;
            }}

            body.dark-mode .container {{
                background-color: #2d2d2d;
            }}

            .header-controls {{
                position: static;
                justify-content: center;
                margin-top: 10px;
            }}

            .control-button {{
                padding: 8px 16px;
                font-size: 12px;
            }}

            .header-section {{
                flex-direction: column;
                gap: 10px;
            }}

            .logo {{
                max-height: 60px;
                max-width: 200px;
            }}

            h1 {{
                font-size: 24px;
            }}

            .subtitle {{
                font-size: 16px;
            }}

            .filters {{
                flex-direction: column;
                gap: 10px;
            }}

            .filter-group {{
                min-width: 100%;
            }}

            .filter-group label {{
                font-size: 12px;
            }}

            .filter-group select {{
                font-size: 16px; /* Prevents zoom on iOS */
                padding: 10px;
            }}

            .table-wrapper {{
                overflow-x: auto;
                -webkit-overflow-scrolling: touch;
            }}

            table {{
                font-size: 12px;
                min-width: 800px; /* Keep table wide for horizontal scroll */
            }}

            th {{
                font-size: 11px;
                padding: 8px 5px;
                position: sticky;
                top: 0;
            }}

            td {{
                padding: 8px 5px;
                font-size: 11px;
            }}

            .col-date {{ width: 12%; }}
            .col-time {{ width: 10%; }}
            .col-user {{ width: 10%; }}
            .col-action {{ width: 10%; }}
            .col-cid {{ width: 8%; }}
            .col-desc {{ width: 20%; font-size: 10px; }}
            .col-qty {{ width: 6%; }}
            .col-value {{ width: 7%; }}
            .col-part {{ width: 10%; font-size: 10px; }}
            .col-wo {{ width: 12%; }}

            .total {{
                font-size: 16px;
                padding: 10px;
            }}

            .filtered-indicator {{
                font-size: 12px;
                padding: 8px;
            }}
        }}

        /* Small Mobile Devices */
        @media screen and (max-width: 480px) {{
            body {{
                padding: 5px;
            }}

            body.dark-mode {{
                background-color: #1a1a1a;
            }}

            .container {{
                padding: 10px;
            }}

            body.dark-mode .container {{
                background-color: #2d2d2d;
            }}

            h1 {{
                font-size: 20px;
            }}

            .subtitle {{
                font-size: 14px;
            }}

            table {{
                font-size: 10px;
            }}

            th {{
                font-size: 9px;
                padding: 6px 3px;
            }}

            td {{
                padding: 6px 3px;
                font-size: 9px;
            }}

            .total {{
                font-size: 14px;
                padding: 8px;
            }}
        }}

        @media print {{
            @page {{
                size: landscape;
                margin: 0.5in;
            }}

            * {{
                -webkit-print-color-adjust: exact !important;
                print-color-adjust: exact !important;
                color-adjust: exact !important;
            }}

            body {{
                background-color: white !important;
                padding: 0 !important;
                margin: 0 !important;
                color: #000 !important;
            }}

            .container {{
                box-shadow: none !important;
                padding: 0 !important;
                margin: 0 !important;
                background: white !important;
                max-width: 100% !important;
            }}

            .header-controls {{
                display: none !important;
            }}

            .filters {{
                display: none !important;
            }}

            .filtered-indicator {{
                display: none !important;
            }}

            .header-section {{
                margin-bottom: 15px !important;
                page-break-after: avoid;
            }}

            .logo {{
                max-height: 60px !important;
            }}

            h1 {{
                font-size: 24pt !important;
                color: #000 !important;
                margin-bottom: 5px !important;
            }}

            .subtitle {{
                font-size: 14pt !important;
                color: #000 !important;
            }}

            .table-wrapper {{
                overflow: visible !important;
                margin-bottom: 20px !important;
            }}

            table {{
                width: 100% !important;
                min-width: 100% !important;
                max-width: 100% !important;
                page-break-inside: auto !important;
                font-size: 9pt !important;
                border-collapse: collapse !important;
            }}

            thead {{
                display: table-header-group !important;
            }}

            tbody {{
                display: table-row-group !important;
            }}

            tr {{
                page-break-inside: avoid !important;
                page-break-after: auto !important;
            }}

            th {{
                position: static !important;
                background-color: #e0e0e0 !important;
                color: #000 !important;
                border: 1px solid #000 !important;
                font-size: 10pt !important;
                padding: 8px 6px !important;
                font-weight: bold !important;
            }}

            td {{
                border: 1px solid #000 !important;
                color: #000 !important;
                background-color: white !important;
                font-size: 9pt !important;
                padding: 6px 4px !important;
            }}

            tr:nth-child(even) td {{
                background-color: #f5f5f5 !important;
            }}

            tr:hover {{
                background-color: transparent !important;
            }}

            tr:hover td {{
                background-color: #f5f5f5 !important;
            }}

            .total {{
                background-color: #e0e0e0 !important;
                color: #000 !important;
                border: 1px solid #000 !important;
                font-size: 12pt !important;
                padding: 10px !important;
                page-break-inside: avoid !important;
            }}

            /* Remove all transitions and animations for print */
            * {{
                transition: none !important;
                animation: none !important;
            }}
        }}

    </style>
</head>
<body>
    <div class="container">
        <div class="header-section">
            <img src="Vectorized Logo - Transparent Background  (09-25-23).png" alt="Logo" class="logo">
            <div class="title-section">
                <h1>Daily Zoller Transaction Report</h1>
                <div class="subtitle">Date: {html.escape(subtitle_date)}</div>
            </div>
            <div class="header-controls">
                <button class="control-button" id="darkModeToggle" onclick="toggleDarkMode()" title="Toggle Dark Mode">🌙</button>
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
        
        <div class="total" id="totalValue">{total_html}</div>
        <script>
            const INITIAL_TOTAL = {initial_total};
        </script>
    </div>

    <script>
        // Dark Mode Toggle
        function toggleDarkMode() {{
            const body = document.body;
            const toggleButton = document.getElementById('darkModeToggle');
            
            body.classList.toggle('dark-mode');
            
            // Update button icon
            if (body.classList.contains('dark-mode')) {{
                toggleButton.textContent = '☀️';
                localStorage.setItem('darkMode', 'enabled');
            }} else {{
                toggleButton.textContent = '🌙';
                localStorage.setItem('darkMode', 'disabled');
            }}
        }}

        // Load saved dark mode preference
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

        // Column indices: 0=Date, 1=Time, 2=User, 3=Action, 4=C-ID, 5=Description, 6=QTY, 7=Value, 8=Part No, 9=Work Order
        const SORTABLE_COLS = [4, 3, 2, 1]; // C-ID, Action, User, Time
        const FILTER_COLS = {{
            2: 'filterUser',      // User
            3: 'filterAction',    // Action
            9: 'filterWorkOrder'  // Work Order
        }};

        let currentSort = {{ col: null, dir: 'asc' }};

        // Add column classes for styling
        document.addEventListener('DOMContentLoaded', function() {{
            const headers = document.querySelectorAll('th');
            const classes = ['col-date', 'col-time', 'col-user', 'col-action', 'col-cid', 
                           'col-desc', 'col-qty', 'col-value', 'col-part', 'col-wo'];
            
            headers.forEach((th, index) => {{
                if (classes[index]) {{
                    th.classList.add(classes[index]);
                }}
            }});

            const rows = document.querySelectorAll('tbody tr');
            rows.forEach(row => {{
                const cells = row.querySelectorAll('td');
                cells.forEach((td, index) => {{
                    if (classes[index]) {{
                        td.classList.add(classes[index]);
                    }}
                }});
            }});

            // Setup sorting
            document.querySelectorAll('th.sortable').forEach(th => {{
                th.addEventListener('click', function() {{
                    const col = parseInt(this.getAttribute('data-col'));
                    sortTable(col);
                }});
            }});

            // Setup filtering
            document.getElementById('filterUser').addEventListener('change', applyFilters);
            document.getElementById('filterAction').addEventListener('change', applyFilters);
            document.getElementById('filterWorkOrder').addEventListener('change', applyFilters);
        }});

        function sortTable(col) {{
            const table = document.getElementById('dataTable');
            const tbody = table.querySelector('tbody');
            const rows = Array.from(tbody.querySelectorAll('tr'));

            // Determine sort direction
            if (currentSort.col === col) {{
                currentSort.dir = currentSort.dir === 'asc' ? 'desc' : 'asc';
            }} else {{
                currentSort.col = col;
                currentSort.dir = 'asc';
            }}

            // Update sort indicators
            document.querySelectorAll('th.sortable').forEach(th => {{
                th.classList.remove('sort-asc', 'sort-desc');
            }});
            const header = document.querySelector(`th[data-col="${{col}}"]`);
            header.classList.add(`sort-${{currentSort.dir}}`);

            // Sort rows
            rows.sort((a, b) => {{
                const aCell = a.querySelectorAll('td')[col];
                const bCell = b.querySelectorAll('td')[col];
                const aText = aCell ? aCell.textContent.trim() : '';
                const bText = bCell ? bCell.textContent.trim() : '';

                // Try numeric comparison for C-ID
                if (col === 4) {{
                    const aNum = parseFloat(aText.replace(/[^0-9.-]/g, '')) || 0;
                    const bNum = parseFloat(bText.replace(/[^0-9.-]/g, '')) || 0;
                    return currentSort.dir === 'asc' ? aNum - bNum : bNum - aNum;
                }}

                // Time comparison (column 1)
                if (col === 1) {{
                    const parseTime = (timeStr) => {{
                        if (!timeStr) return 0;
                        // Parse format like "1:22 PM" or "10:18 AM"
                        const match = timeStr.match(/(\\d+):(\\d+)\\s*(AM|PM)/i);
                        if (!match) return 0;
                        let hours = parseInt(match[1]);
                        const minutes = parseInt(match[2]);
                        const ampm = match[3].toUpperCase();
                        if (ampm === 'PM' && hours !== 12) hours += 12;
                        if (ampm === 'AM' && hours === 12) hours = 0;
                        return hours * 60 + minutes; // Convert to minutes for easy comparison
                    }};
                    const aTime = parseTime(aText);
                    const bTime = parseTime(bText);
                    return currentSort.dir === 'asc' ? aTime - bTime : bTime - aTime;
                }}

                // String comparison
                const comparison = aText.localeCompare(bText);
                return currentSort.dir === 'asc' ? comparison : -comparison;
            }});

            // Re-append sorted rows
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

                // Get cell text (strip whitespace for comparison)
                const userText = userCell ? (userCell.textContent.trim()) : '';
                const actionText = actionCell ? (actionCell.textContent.trim()) : '';
                // For work order, get text from link if present
                const woLink = woCell ? woCell.querySelector('a') : null;
                const woText = woCell ? (woLink ? woLink.textContent.trim() : woCell.textContent.trim()) : '';

                // Exact match (empty filter means show all)
                const matches = (!userFilter || userText === userFilter) &&
                               (!actionFilter || actionText === actionFilter) &&
                               (!woFilter || woText === woFilter);

                if (matches) {{
                    row.classList.remove('filtered-out');
                    visibleCount++;
                    const rowValue = parseFloat(row.getAttribute('data-row-value')) || 0;
                    totalValue += rowValue;
                }} else {{
                    row.classList.add('filtered-out');
                }}
            }});

            // Update filtered indicator
            const isFiltered = userFilter || actionFilter || woFilter;
            const indicator = document.getElementById('filteredIndicator');
            const totalDiv = document.getElementById('totalValue');

            if (isFiltered) {{
                indicator.classList.add('active');
                table.classList.add('filtered');
                const formatted = totalValue.toFixed(2).replace(/\\B(?=(\\d{{3}})+(?!\\d))/g, ",");
                totalDiv.innerHTML = "Total Value (Filtered): $" + formatted;
            }} else {{
                indicator.classList.remove('active');
                table.classList.remove('filtered');
                const displayTotal = typeof INITIAL_TOTAL !== 'undefined' && INITIAL_TOTAL > 0 ? INITIAL_TOTAL : totalValue;
                const formatted = displayTotal.toFixed(2).replace(/\\B(?=(\\d{{3}})+(?!\\d))/g, ",");
                totalDiv.innerHTML = "Total Value: $" + formatted;
            }}
        }}
    </script>
</body>
</html>"""
    
    with open(output_html, 'w', encoding='utf-8') as f:
        f.write(html_content)
    
    print(f"Saved HTML report to {os.path.abspath(output_html)}")
    print(f"Generated report with {len(report_rows)} transactions")


def send_to_powerautomate(html_file_path, wait_seconds=30):
    """
    Send HTML file to Power Automate.
    
    Args:
        html_file_path: Path to HTML file
        wait_seconds: Wait time before sending (default: 30)
    
    Returns:
        True if successful, False otherwise
    """
    # Wait for file to be fully written
    if wait_seconds > 0:
        print(f"\nWaiting {wait_seconds} seconds for HTML to be fully generated...")
        for i in range(wait_seconds, 0, -1):
            print(f"  Waiting... {i} seconds remaining", end='\r')
            time.sleep(1)
        print("  Waiting complete!                    ")
    
    # Check if file exists
    if not os.path.exists(html_file_path):
        print(f"ERROR: HTML file not found: {html_file_path}", file=sys.stderr)
        return False
    
    # Get script directory
    script_dir = os.path.dirname(os.path.abspath(__file__))
    send_script = os.path.join(script_dir, 'send_to_powerautomate.py')
    
    if not os.path.exists(send_script):
        print(f"ERROR: send_to_powerautomate.py not found at {send_script}", file=sys.stderr)
        return False
    
    # Run send script
    try:
        print(f"\n{'='*60}")
        print("Sending to Power Automate...")
        print(f"{'='*60}")
        
        result = subprocess.run(
            [sys.executable, send_script, '--html-file', html_file_path],
            check=True,
            capture_output=False,
            text=True
        )
        
        if result.returncode == 0:
            print(f"\n{'='*60}")
            print("SUCCESS: Report sent to Power Automate!")
            print(f"{'='*60}")
            return True
        else:
            print(f"\nERROR: Failed to send to Power Automate (return code: {result.returncode})", file=sys.stderr)
            return False
            
    except subprocess.CalledProcessError as e:
        print(f"\nERROR: Failed to send to Power Automate: {e}", file=sys.stderr)
        return False
    except FileNotFoundError:
        print(f"\nERROR: Python executable not found", file=sys.stderr)
        return False


def main():
    """Main function to generate report."""
    import argparse
    
    parser = argparse.ArgumentParser(
        description="Generate HTML report for checkout transactions and optionally send to Power Automate",
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog="""
Examples:
  # Generate report for yesterday
  python generate_yesterday_checkout_report.py

  # Generate report for specific date
  python generate_yesterday_checkout_report.py --date 2025-12-17

  # Generate and send to Power Automate
  python generate_yesterday_checkout_report.py --send

  # Generate for specific date and send
  python generate_yesterday_checkout_report.py --date 2025-12-17 --send
        """
    )
    
    parser.add_argument(
        '--date',
        help='Date to query (YYYY-MM-DD format). Defaults to yesterday.'
    )
    parser.add_argument(
        '--send',
        action='store_true',
        help='Send report to Power Automate after generation'
    )
    parser.add_argument(
        '--wait',
        type=int,
        default=30,
        help='Wait time in seconds before sending to Power Automate (default: 30)'
    )
    parser.add_argument(
        '--output',
        help='Output HTML filename (default: auto-generated based on date)'
    )
    
    args = parser.parse_args()
    
    SERVER = r"ESTSS01\ZOLLERSQLEXPRESS"
    DATABASE = "ZOLLERDB3"
    CREDENTIALS = [
        ("Brad Taylor", "Falcon 9"),
        ("SA", "Zollerdb3")
    ]
    
    probe = None
    connected = False
    
    for username, password in CREDENTIALS:
        probe = SQLProbe(SERVER, DATABASE, username, password)
        if probe.connect():
            connected = True
            break
    
    if not connected:
        print("ERROR: Could not connect to database")
        return
    
    try:
        # Determine target date
        if args.date:
            target_date = args.date
        else:
            yesterday = datetime.now() - timedelta(days=1)
            target_date = yesterday.strftime('%Y-%m-%d')
        
        print(f"Querying checkout transactions for {target_date}...")
        report_rows = query_checkouts_by_date(probe, target_date)
        
        if not report_rows:
            print(f"No checkout transactions found for {target_date}")
            return
        
        # Generate output filename
        if args.output:
            output_html = args.output
        else:
            date_for_filename = target_date.replace('-', '_')
            output_html = f"checkout_report_{date_for_filename}.html"
        
        # Generate HTML report
        print(f"\n{'='*60}")
        print("Generating HTML Report...")
        print(f"{'='*60}")
        generate_html_report(report_rows, output_html)
        
        # Send to Power Automate if requested
        if args.send:
            send_to_powerautomate(output_html, args.wait)
        else:
            print(f"\n{'='*60}")
            print("SUCCESS: Report generated!")
            print(f"{'='*60}")
            print(f"\nTo send to Power Automate, run:")
            print(f"  python generate_yesterday_checkout_report.py --date {target_date} --send")
        
    except Exception as e:
        print(f"ERROR: {e}")
        import traceback
        traceback.print_exc()
    finally:
        probe.disconnect()


if __name__ == "__main__":
    main()

