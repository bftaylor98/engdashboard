import argparse
import glob
import html
import os
from datetime import datetime
from typing import Dict, List, Optional, Tuple

import pandas as pd


WORKDIR = os.path.abspath(os.path.dirname(__file__))
DEFAULT_OUTPUT = "vending_report.html"
DEFAULT_CSV = r"D:\Zoller TMS\Reports\Transaction Reports\Daily Transaction Report\Daily Transaction Report.csv"

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

# Maps normalized incoming column names to canonical keys
NORMALIZED_TO_CANONICAL: Dict[str, str] = {
    "datetime": "datetime",
    "datetimestamp": "datetime",
    "timestamp": "datetime",
    "date": "date",
    "time": "time",
    "user": "user",
    "operator": "user",
    "action": "action",
    "procedurekind": "action",
    "procedure": "action",
    "event": "action",
    "cid": "c-id",
    "articleno": "c-id",
    "articlenumber": "c-id",
    "articleid": "c-id",
    "c": "c-id",
    "description": "description",
    "articledesignation": "description",
    "itemdescription": "description",
    "details": "description",
    "quantity": "qty",
    "qty": "qty",
    "count": "qty",
    "amount": "value",
    "value": "value",
    "price": "value",
    "total": "value",
    "sales": "value",
    "partno": "part no",
    "partnumber": "part no",
    "supplierpartnumber": "part no",
    "articlenumberofthesupplier": "part no",
    "part": "part no",
    "workorder": "work order",
    "comment": "work order",
    "job": "work order",
    "wo": "work order",
}


def normalize_key(name: str) -> str:
    return "".join(ch.lower() for ch in name if ch.isalnum())


def pick_latest_csv(directory: str) -> Optional[str]:
    pattern = os.path.join(directory, "*.csv")
    candidates = glob.glob(pattern)
    if not candidates:
        return None
    return max(candidates, key=os.path.getmtime)


def load_csv(csv_path: str) -> pd.DataFrame:
    df = pd.read_csv(csv_path, dtype=str, keep_default_na=False)
    return df


def map_columns(df: pd.DataFrame) -> Tuple[pd.DataFrame, Dict[str, str]]:
    rename_map: Dict[str, str] = {}
    for col in df.columns:
        normalized = normalize_key(col)
        canonical = NORMALIZED_TO_CANONICAL.get(normalized)
        if canonical:
            rename_map[col] = canonical
    mapped = df.rename(columns=rename_map)
    return mapped, rename_map


def split_datetime(df: pd.DataFrame) -> pd.DataFrame:
    date_col = df.get("date", "")
    time_col = df.get("time", "")
    datetime_col = df.get("datetime", "")

    dates: List[str] = []
    times: List[str] = []

    for idx in range(len(df)):
        raw_date = str(date_col[idx]).strip() if isinstance(date_col, pd.Series) and len(date_col) > idx else ""
        raw_time = str(time_col[idx]).strip() if isinstance(time_col, pd.Series) and len(time_col) > idx else ""
        raw_dt = str(datetime_col[idx]).strip() if isinstance(datetime_col, pd.Series) and len(datetime_col) > idx else ""

        combined_source = raw_dt or " ".join([raw_date, raw_time]).strip()
        parsed_dt = pd.to_datetime(combined_source, errors="coerce")

        if pd.notna(parsed_dt):
            dates.append(parsed_dt.strftime("%m/%d/%Y"))
            times.append(parsed_dt.strftime("%I:%M %p").lstrip("0").replace(" 0", " "))
        else:
            dates.append(raw_date)
            times.append(raw_time)

    df["Date"] = dates
    df["Time"] = times
    return df


def currency_format(value: str) -> Tuple[str, Optional[float]]:
    if value is None:
        return "", None
    text = str(value).strip()
    if not text:
        return "", None
    try:
        numeric = float(text.replace(",", ""))
    except ValueError:
        return text, None
    return f"${numeric:,.2f}", numeric


def prepare_rows(df: pd.DataFrame) -> Tuple[List[List[str]], List[Optional[float]], Optional[float], Optional[str]]:
    df = df.fillna("")

    if "Date" not in df or "Time" not in df:
        df = split_datetime(df)

    rows: List[List[str]] = []
    row_values: List[Optional[float]] = []  # Store numeric value for each row
    total_value = 0.0
    has_value = False
    first_date_for_subtitle: Optional[str] = None

    for _, row in df.iterrows():
        date_val = str(row.get("Date", "")).strip()
        time_val = str(row.get("Time", "")).strip()
        user_val = str(row.get("user", row.get("User", ""))).strip()
        action_val = str(row.get("action", row.get("Action", ""))).strip()
        cid_val = str(row.get("c-id", row.get("C-ID", ""))).strip()
        desc_val = str(row.get("description", row.get("Description", ""))).strip()
        qty_val = str(row.get("qty", row.get("QTY", ""))).strip()
        value_raw = str(row.get("value", row.get("Value", ""))).strip()
        part_val = str(row.get("part no", row.get("Part No", ""))).strip()
        wo_val = str(row.get("work order", row.get("Work Order", ""))).strip()

        currency_str, numeric = currency_format(value_raw)
        row_values.append(numeric)
        if numeric is not None:
            has_value = True
            total_value += numeric

        if not first_date_for_subtitle and date_val:
            try:
                parsed = datetime.strptime(date_val, "%m/%d/%Y")
                first_date_for_subtitle = parsed.strftime("%m/%d/%y")
            except ValueError:
                first_date_for_subtitle = date_val

        rows.append(
            [
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
            ]
        )

    subtitle_date = first_date_for_subtitle or ""
    total_value = total_value if has_value else None
    return rows, row_values, total_value, subtitle_date


def generate_html_report(input_csv: str, output_html: str) -> None:
    df_raw = load_csv(input_csv)
    df_mapped, rename_map = map_columns(df_raw)

    # Ensure required columns exist, even if empty
    for canonical in set(NORMALIZED_TO_CANONICAL.values()):
        if canonical not in df_mapped:
            df_mapped[canonical] = ""

    rows, row_values, total_value, subtitle_date = prepare_rows(df_mapped)

    # Extract unique values for dropdown filters
    # Column indices: 0=Date, 1=Time, 2=User, 3=Action, 4=C-ID, 5=Description, 6=QTY, 7=Value, 8=Part No, 9=Work Order
    sortable_cols = [4, 3, 2]  # C-ID, Action, User (indices)
    filterable_cols = [2, 3, 9]  # User, Action, Work Order (indices)
    
    # Get unique values for each filterable column
    unique_users = sorted(set(row[2] for row in rows if row[2].strip()), key=str.lower)
    unique_actions = sorted(set(row[3] for row in rows if row[3].strip()), key=str.lower)
    unique_work_orders = sorted(set(row[9] for row in rows if row[9].strip()), key=str.lower)
    
    header_cells = []
    for idx, header in enumerate(TARGET_HEADERS):
        header_text = html.escape(header)
        if idx in sortable_cols:
            header_text += ' <span class="sort-indicator">⇅</span>'
            header_cells.append(f'<th class="sortable" data-col="{idx}">{header_text}</th>')
        else:
            header_cells.append(f'<th data-col="{idx}">{header_text}</th>')
    header_row = "<tr>" + "".join(header_cells) + "</tr>"
    
    body_rows = []
    for row_idx, row in enumerate(rows):
        cells = []
        for idx, cell in enumerate(row):
            cell_text = html.escape(cell)
            cell_lower = cell.lower()  # For case-insensitive filtering
            
            # Build data attributes
            attrs = []
            if idx in filterable_cols:
                attrs.append(f'data-filter="{cell_lower}"')
            if idx == 7:  # Value column
                attrs.append(f'data-value="{row_values[row_idx] or 0}"')
            
            data_attrs = ' ' + ' '.join(attrs) if attrs else ''
            
            # Make work order (last column, index 9) a hyperlink if it has a value
            if idx == 9 and cell.strip():  # Work Order column
                wo_url = f"https://est.adionsystems.com/procnc/workorders/{cell.strip()}"
                cells.append(f'<td{data_attrs}><a href="{html.escape(wo_url)}" target="_blank">{cell_text}</a></td>')
            else:
                cells.append(f'<td{data_attrs}>{cell_text}</td>')
        body_rows.append(f"<tr data-row-value=\"{row_values[row_idx] or 0}\">{''.join(cells)}</tr>")

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
        }}

        .container {{
            max-width: 2000px;
            margin: 0 auto;
            background: white;
            padding: 40px;
            box-shadow: 0 2px 10px rgba(0,0,0,0.1);
        }}

        .header-section {{
            display: flex;
            align-items: center;
            justify-content: center;
            gap: 20px;
            margin-bottom: 20px;
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
        }}

        .subtitle {{
            font-size: 20px;
            margin-bottom: 0;
            color: #666;
            text-align: center;
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
        }}

        .filter-group select {{
            padding: 8px;
            font-size: 14px;
            border: 1px solid #ccc;
            border-radius: 3px;
            background-color: white;
            cursor: pointer;
        }}

        .filter-group select:focus {{
            outline: none;
            border-color: #0066cc;
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
        }}

        th.sortable {{
            cursor: pointer;
            user-select: none;
        }}

        th.sortable:hover {{
            background-color: #e0e0e0;
        }}

        .sort-indicator {{
            font-size: 14px;
            color: #666;
            margin-left: 5px;
        }}

        th.sort-asc .sort-indicator::after {{
            content: " ↑";
            color: #0066cc;
        }}

        th.sort-desc .sort-indicator::after {{
            content: " ↓";
            color: #0066cc;
        }}

        tr.filtered-out {{
            display: none;
        }}

        table.filtered tr:not(.filtered-out) {{
            background-color: #fffacd;
        }}

        table.filtered tr:not(.filtered-out):nth-child(even) {{
            background-color: #fff8dc;
        }}

        td {{
            padding: 12px 10px;
            border: 1px solid #ddd;
            vertical-align: middle;
            text-align: center;
        }}

        td a {{
            color: #0066cc;
            text-decoration: underline;
        }}

        td a:hover {{
            color: #004499;
            text-decoration: none;
        }}

        tr:nth-child(even) {{
            background-color: #e6f0ff;
        }}

        tr:hover {{
            background-color: #d6e9ff;
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
        }}

        @media print {{
            body {{
                background-color: white;
                padding: 0;
            }}

            .container {{
                box-shadow: none;
                padding: 0;
            }}

            .table-wrapper {{
                overflow: visible;
            }}

            table {{
                min-width: 100%;
                page-break-inside: avoid;
            }}

            th {{
                position: static;
            }}
        }}

        @page {{
            size: landscape;
            margin: 0.5in;
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
        // Column indices: 0=Date, 1=Time, 2=User, 3=Action, 4=C-ID, 5=Description, 6=QTY, 7=Value, 8=Part No, 9=Work Order
        const SORTABLE_COLS = [4, 3, 2]; // C-ID, Action, User
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
    if rename_map:
        print(f"Mapped columns: {rename_map}")
    else:
        print("Warning: no columns matched expected headers.")
    print("\nTo convert to PDF: Open the HTML file in your browser and use Print > Save as PDF")


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Generate Daily Zoller Transaction HTML report.")
    parser.add_argument("input_csv", nargs="?", help="Input CSV path. Defaults to newest CSV in working directory.")
    parser.add_argument("output_html", nargs="?", help="Output HTML path. Defaults to vending_report.html in working directory.")
    return parser.parse_args()


def main() -> None:
    args = parse_args()

    input_csv = args.input_csv
    if not input_csv:
        # Use default CSV path
        input_csv = DEFAULT_CSV
        print(f"Using default CSV: {input_csv}")

    if not os.path.isabs(input_csv):
        input_csv = os.path.join(WORKDIR, input_csv)

    if not os.path.exists(input_csv):
        raise SystemExit(f"CSV not found: {input_csv}")

    output_html = args.output_html or os.path.join(WORKDIR, DEFAULT_OUTPUT)
    if not os.path.isabs(output_html):
        output_html = os.path.join(WORKDIR, output_html)

    generate_html_report(input_csv, output_html)


if __name__ == "__main__":
    main()
