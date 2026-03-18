"""
Generate Crib Report for checkout transactions
Supports both Daily History (single day) and Monthly History (last 30 days) report types
"""
import sys
import os

# Add current directory to path to import sql_probe
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from sql_probe import SQLProbe
from datetime import datetime, timedelta, date
import html
import time
import re
import xml.etree.ElementTree as ET
import json
import math
from pathlib import Path
import subprocess
import base64
from calendar import month_abbr

# Try to import pyodbc for Matrix Vending database connection
try:
    import pyodbc
    PYODBC_AVAILABLE = True
except ImportError:
    PYODBC_AVAILABLE = False
    print("Warning: 'pyodbc' library not found. Matrix Vending report will be disabled.")
    print("Install it with: pip install pyodbc")

# Matrix Vending Database Configuration
MATRIX_VENDING_SERVER = r"192.168.1.36"
MATRIX_VENDING_DATABASE = "EST100"
MATRIX_VENDING_USERNAME = "ITM2005"
MATRIX_VENDING_PASSWORD = "ITM"
MATRIX_VENDING_ENABLED = True

# Try to import requests for Power Automate integration
try:
    import requests
    REQUESTS_AVAILABLE = True
except ImportError:
    REQUESTS_AVAILABLE = False
    print("Warning: 'requests' library not found. Power Automate integration will be disabled.")
    print("Install it with: pip install requests")


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

# Default Power Automate webhook URL (can be overridden via environment variable or command line)
DEFAULT_WEBHOOK_URL = os.environ.get('POWER_AUTOMATE_WEBHOOK_URL', 
    'https://default8b194f6d59c94b4287861c626d1ec2.e6.environment.api.powerplatform.com:443/powerautomate/automations/direct/workflows/a38ca15b93a14fbc828548f238c01a72/triggers/manual/paths/invoke?api-version=1&sp=%2Ftriggers%2Fmanual%2Frun&sv=1.0&sig=fYpVDxg9Ky55mHwgPlHPS3ngg7qVoIMV9Dx0tJf9_9s')

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


def get_image_mime_type(image_path: str) -> str:
    """Determine MIME type based on file extension."""
    ext = os.path.splitext(image_path)[1].lower()
    mime_types = {
        '.png': 'image/png',
        '.jpg': 'image/jpeg',
        '.jpeg': 'image/jpeg',
        '.gif': 'image/gif',
        '.svg': 'image/svg+xml',
        '.webp': 'image/webp'
    }
    return mime_types.get(ext, 'image/png')


def embed_images_in_html(html_content: str, html_dir: str) -> str:
    """
    Embed referenced images as base64 data URIs in HTML content.
    
    Args:
        html_content: The HTML content as a string
        html_dir: Directory where the HTML file is located (for resolving relative paths)
    
    Returns:
        HTML content with embedded images
    """
    # Find all img tags with src attributes
    img_pattern = r'<img\s+([^>]*src=["\']([^"\']+)["\'][^>]*)>'
    
    def replace_image(match):
        full_match = match.group(0)
        attributes = match.group(1)
        src_path = match.group(2)
        
        # Skip if already a data URI
        if src_path.startswith('data:'):
            return full_match
        
        # Resolve image path
        if not os.path.isabs(src_path):
            image_path = os.path.join(html_dir, src_path)
        else:
            image_path = src_path
        
        # Check if image exists
        if not os.path.exists(image_path):
            print(f"Warning: Image not found: {image_path}, keeping original reference")
            return full_match
        
        # Read and encode image
        try:
            with open(image_path, 'rb') as img_file:
                image_data = img_file.read()
                image_base64 = base64.b64encode(image_data).decode('utf-8')
                mime_type = get_image_mime_type(image_path)
                data_uri = f"data:{mime_type};base64,{image_base64}"
                
                # Replace src in attributes
                new_attributes = re.sub(
                    r'src=["\'][^"\']+["\']',
                    f'src="{data_uri}"',
                    attributes
                )
                return f'<img {new_attributes}>'
        except Exception as e:
            print(f"Warning: Failed to embed image {image_path}: {e}, keeping original reference")
            return full_match
    
    # Replace all image references
    embedded_html = re.sub(img_pattern, replace_image, html_content)
    return embedded_html


def send_to_powerautomate(html_file_path: str, webhook_url: str = None) -> bool:
    """
    Send HTML file to Power Automate webhook.
    
    Args:
        html_file_path: Path to HTML file to send
        webhook_url: Power Automate webhook URL (or None to use default)
    
    Returns:
        True if successful, False otherwise
    """
    if not REQUESTS_AVAILABLE:
        print("ERROR: 'requests' library not available. Cannot send to Power Automate.", file=sys.stderr)
        return False
    
    # Get webhook URL from argument, environment variable, or default
    if not webhook_url:
        webhook_url = os.environ.get('POWER_AUTOMATE_WEBHOOK_URL', DEFAULT_WEBHOOK_URL)
        if not webhook_url:
            print("ERROR: Webhook URL not provided and POWER_AUTOMATE_WEBHOOK_URL environment variable not set", file=sys.stderr)
            return False
    
    # Validate URL format
    if not webhook_url.startswith('http://') and not webhook_url.startswith('https://'):
        print(f"ERROR: Invalid webhook URL format. Must start with http:// or https://", file=sys.stderr)
        print(f"URL provided: {webhook_url[:100]}...", file=sys.stderr)
        return False
    
    # Check if file exists
    if not os.path.exists(html_file_path):
        print(f"ERROR: HTML file not found: {html_file_path}", file=sys.stderr)
        return False
    
    # Read HTML file as text (UTF-8)
    try:
        with open(html_file_path, 'r', encoding='utf-8') as f:
            html_content = f.read()
    except Exception as e:
        print(f"ERROR: Failed to read HTML file: {e}", file=sys.stderr)
        return False
    
    # Embed images (like logo) as base64 data URIs
    html_dir = os.path.dirname(os.path.abspath(html_file_path))
    html_content = embed_images_in_html(html_content, html_dir)
    
    # Get filename
    filename = os.path.basename(html_file_path)
    
    # Base64 encode the HTML content (encode string to bytes first, then base64)
    html_bytes = html_content.encode('utf-8')
    html_base64 = base64.b64encode(html_bytes).decode('utf-8')
    
    # Prepare JSON payload according to Power Automate schema
    # Note: Field names are lowercase: "filename" and "content"
    payload = {
        "filename": filename,
        "content": html_base64
    }
    
    # Ensure content is not None/empty
    if not html_base64 or not filename:
        print(f"ERROR: Missing required data - filename: {filename}, content length: {len(html_base64) if html_base64 else 0}", file=sys.stderr)
        return False
    
    # Send to Power Automate
    try:
        print(f"Reading HTML file: {html_file_path}")
        file_size = os.path.getsize(html_file_path)
        print(f"File size: {file_size:,} bytes ({file_size / 1024:.2f} KB)")
        print(f"Webhook URL: {webhook_url}")
        print(f"Base64 content size: {len(html_base64):,} bytes ({len(html_base64) / 1024:.2f} KB)")
        print(f"Payload keys: {list(payload.keys())}")
        print(f"Filename in payload: {payload['filename']}")
        print(f"Content preview (first 100 chars): {html_base64[:100]}...")
        print(f"Sending to Power Automate...")
        
        response = requests.post(
            webhook_url,
            json=payload,
            headers={
                "Content-Type": "application/json"
            },
            timeout=60  # Increased timeout for large files
        )
        
        print(f"Response received. Status code: {response.status_code}")
        response.raise_for_status()
        
        print(f"Success! Status code: {response.status_code}")
        if response.text:
            print(f"Response: {response.text[:500]}")
        return True
        
    except requests.exceptions.Timeout:
        print(f"ERROR: Request timed out after 60 seconds. The file may be too large.", file=sys.stderr)
        return False
    except requests.exceptions.RequestException as e:
        print(f"ERROR: Failed to send to Power Automate: {e}", file=sys.stderr)
        if hasattr(e, 'response') and e.response is not None:
            print(f"Response status: {e.response.status_code}", file=sys.stderr)
            try:
                print(f"Response text: {e.response.text[:500]}", file=sys.stderr)
            except:
                print(f"Could not read response text", file=sys.stderr)
        else:
            print(f"No response received. Check network connection and webhook URL.", file=sys.stderr)
        return False
    except Exception as e:
        print(f"ERROR: Unexpected error: {e}", file=sys.stderr)
        import traceback
        traceback.print_exc()
        return False


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
    Returns the comment as-is (valid or invalid format), or "None Specified" if blank.
    
    Args:
        comment: Work order comment string from database
    
    Returns:
        Original comment string if it has content, "None Specified" if blank
    """
    if not comment:
        return "None Specified"
    
    comment = str(comment).strip()
    
    # If blank after stripping, return "None Specified"
    if not comment:
        return "None Specified"
    
    # Return the comment as-is (will be styled based on format match in HTML generation)
    return comment


def get_target_dates(target_date=None):
    """
    Calculate target date(s) for the report.
    - If Monday: Returns Friday, Saturday, Sunday (3 days)
    - If Tuesday-Friday: Returns yesterday (1 day)
    - If target_date is provided: Uses that date
    
    Returns:
        tuple: (start_date_str, end_date_str, list of date strings)
    """
    if target_date:
        # Use provided date
        date_obj = datetime.strptime(target_date, '%Y-%m-%d').date()
        return (target_date, target_date, [target_date])
    
    today = datetime.now().date()
    weekday = today.weekday()  # Monday is 0, Sunday is 6
    
    if weekday == 0:  # Monday - get Friday, Saturday, Sunday
        # Go back to Friday (3 days ago)
        friday = today - timedelta(days=3)
        saturday = today - timedelta(days=2)
        sunday = today - timedelta(days=1)
        start_date = friday
        end_date = sunday
        date_list = [
            friday.strftime('%Y-%m-%d'),
            saturday.strftime('%Y-%m-%d'),
            sunday.strftime('%Y-%m-%d')
        ]
    else:  # Tuesday-Friday - get yesterday
        yesterday = today - timedelta(days=1)
        start_date = yesterday
        end_date = yesterday
        date_list = [yesterday.strftime('%Y-%m-%d')]
    
    return (start_date.strftime('%Y-%m-%d'), end_date.strftime('%Y-%m-%d'), date_list)


def query_checkouts_by_date(probe, target_date=None, start_date=None, end_date=None):
    """Query all checkout events for a date range and format for HTML report."""
    if start_date and end_date:
        start_date_str = start_date
        end_date_str = end_date
    elif target_date:
        start_date_str = target_date
        end_date_str = target_date
    else:
        yesterday = datetime.now() - timedelta(days=1)
        start_date_str = yesterday.strftime('%Y-%m-%d')
        end_date_str = start_date_str
    
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
            AND CAST(CAST(afs.Time AT TIME ZONE 'UTC' AT TIME ZONE 'Eastern Standard Time' AS DATETIME) AS DATE) >= '{start_date_str}'
            AND CAST(CAST(afs.Time AT TIME ZONE 'UTC' AT TIME ZONE 'Eastern Standard Time' AS DATETIME) AS DATE) <= '{end_date_str}'
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


def query_checkouts_last_30_days(probe):
    """Query all checkout events for the last 30 days and format for HTML report."""
    end_date = datetime.now()
    start_date = end_date - timedelta(days=30)
    
    start_date_str = start_date.strftime('%Y-%m-%d')
    end_date_str = end_date.strftime('%Y-%m-%d')
    
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
            AND CAST(CAST(afs.Time AT TIME ZONE 'UTC' AT TIME ZONE 'Eastern Standard Time' AS DATETIME) AS DATE) >= '{start_date_str}'
            AND CAST(CAST(afs.Time AT TIME ZONE 'UTC' AT TIME ZONE 'Eastern Standard Time' AS DATETIME) AS DATE) <= '{end_date_str}'
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


def run_door_unlocks_script():
    """Run the door unlocks query script to generate JSON files."""
    script_dir = Path(__file__).parent
    door_script = script_dir.parent / "Ubiquiti_Scripts" / "query_door_unlocks.py"
    
    if not door_script.exists():
        print(f"Warning: Door unlocks script not found: {door_script}")
        return False
    
    try:
        print(f"Running door unlocks script: {door_script}")
        result = subprocess.run(
            [sys.executable, str(door_script)],
            cwd=str(door_script.parent),
            capture_output=True,
            text=True,
            timeout=60  # 60 second timeout
        )
        
        if result.returncode == 0:
            print("[OK] Door unlocks script completed successfully")
            return True
        else:
            print(f"Warning: Door unlocks script returned error code {result.returncode}")
            if result.stderr:
                print(f"Error output: {result.stderr}")
            return False
    except subprocess.TimeoutExpired:
        print("Warning: Door unlocks script timed out after 60 seconds")
        return False
    except Exception as e:
        print(f"Warning: Error running door unlocks script: {e}")
        return False


def load_door_unlocks(json_path):
    """Load door unlock data from JSON file."""
    if not json_path.exists():
        print(f"Warning: Door unlocks JSON file not found: {json_path}")
        return None
    
    try:
        with open(json_path, 'r', encoding='utf-8') as f:
            data = json.load(f)
        return data
    except Exception as e:
        print(f"Warning: Error reading door unlocks JSON file: {e}")
        return None


def load_ipad_submissions(jsonl_path=None):
    """Load iPad form submissions from JSONL file."""
    if jsonl_path is None:
        # Default path: ../Crib iPad Scripts/backend/data/submissions.jsonl
        script_dir = Path(__file__).parent.absolute()
        jsonl_path = script_dir.parent / "Crib iPad Scripts" / "backend" / "data" / "submissions.jsonl"
    
    submissions = []
    if not Path(jsonl_path).exists():
        print(f"Warning: iPad submissions file not found at {jsonl_path}")
        return submissions
    
    try:
        with open(jsonl_path, 'r', encoding='utf-8') as f:
            for line in f:
                line = line.strip()
                if line:
                    try:
                        submissions.append(json.loads(line))
                    except json.JSONDecodeError:
                        continue
    except Exception as e:
        print(f"Warning: Error reading iPad submissions: {e}")
    
    return submissions


def filter_submissions_by_date(submissions, target_date=None, days_back=1, date_list=None):
    """Filter submissions by date range or date list."""
    if not submissions:
        return []
    
    filtered = []
    for sub in submissions:
        sub_date_str = sub.get('date', '')
        if not sub_date_str:
            continue
        
        # Strip whitespace and normalize
        sub_date_str = str(sub_date_str).strip()
        
        try:
            sub_date = datetime.strptime(sub_date_str, '%Y-%m-%d').date()
            
            # If date_list is provided, use it (for Monday case with multiple dates)
            if date_list:
                target_dates = [datetime.strptime(d, '%Y-%m-%d').date() for d in date_list]
                if sub_date in target_dates:
                    filtered.append(sub)
            elif days_back == 1:
                # Single day match - use target_date if provided, otherwise yesterday
                if target_date:
                    try:
                        target_dt = datetime.strptime(str(target_date).strip(), '%Y-%m-%d').date()
                    except ValueError as e:
                        continue
                else:
                    target_dt = (datetime.now() - timedelta(days=1)).date()
                
                if sub_date == target_dt:
                    filtered.append(sub)
            else:
                # Date range match (for monthly - last 30 days)
                end_date = datetime.now().date()
                start_date = end_date - timedelta(days=days_back)
                if start_date <= sub_date <= end_date:
                    filtered.append(sub)
        except ValueError as e:
            continue
    
    return filtered


def generate_ipad_submissions_html(daily_submissions, monthly_submissions, default_type='daily'):
    """Generate HTML section for iPad form submissions with separate tables for each type."""
    # Always show the section, even if empty (so users know it's working)
    # But return empty string if truly no data at all
    if not daily_submissions and not monthly_submissions:
        return ""
    
    # Determine initial visibility
    daily_visible = 'block' if default_type == 'daily' else 'none'
    monthly_visible = 'block' if default_type == 'monthly' else 'none'
    
    html_content = """
        <div class="ipad-submissions-section">
            <h2 class="section-toggle" onclick="toggleSection('ipadSubmissions')">
                <span id="ipadSubmissionsIcon">\u25B6</span> \U0001f4f1 iPad Kiosk Form Submissions
            </h2>
            <div id="ipadSubmissionsContent" style="display: none;">
"""
    
    # Helper function to generate a table for a specific type
    def generate_table(submissions, title, table_id, visible_style, submission_type, report_type):
        """Generate a table for either accidental vend or inventory error submissions."""
        # Filter submissions by type
        filtered = [s for s in submissions if submission_type in s.get('form_version', '')]
        
        if not filtered:
            return f"""
            <div class="submissions-details" data-report-type="{report_type}" style="display: {visible_style};">
                <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 10px;">
                    <h3 style="margin: 0;">{title}</h3>
                    <button class="control-button" onclick="exportSubmissionsToCSV('{table_id}', '{title}')" title="Export to CSV" style="display: none;">📥</button>
                </div>
                <p style="text-align: center; color: #666; font-style: italic; padding: 20px;">No {title.lower()} submissions for this period.</p>
            </div>
"""
        
        # Sort by date/time (newest first)
        sorted_subs = sorted(filtered, key=lambda x: (
            x.get('date', ''),
            x.get('time', '')
        ), reverse=True)
        
        # Determine if this is an inventory error table (no quantity column)
        is_inventory = submission_type == 'inventory-error'
        
        # Build header row
        if is_inventory:
            header_row = """                        <tr>
                            <th style="text-align: center;">Date</th>
                            <th style="text-align: center;">Time</th>
                            <th style="text-align: center;">User</th>
                            <th style="text-align: center;">Component ID</th>
                            <th style="text-align: center;">Description</th>
                            <th style="text-align: center;">Addressed</th>
                        </tr>"""
        else:
            header_row = """                        <tr>
                            <th style="text-align: center;">Date</th>
                            <th style="text-align: center;">Time</th>
                            <th style="text-align: center;">User</th>
                            <th style="text-align: center;">Component ID</th>
                            <th style="text-align: center;">Quantity</th>
                            <th style="text-align: center;">Description</th>
                            <th style="text-align: center;">Addressed</th>
                        </tr>"""
        
        table_html = f"""
            <div class="submissions-details" data-report-type="{report_type}" style="display: {visible_style};">
                <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 10px;">
                    <h3 style="margin: 0;">{title}</h3>
                    <button class="control-button" onclick="exportSubmissionsToCSV('{table_id}', '{title}')" title="Export to CSV">📥</button>
                </div>
                <table class="submissions-table" id="{table_id}">
                    <thead>
{header_row}
                    </thead>
                    <tbody>
"""
        
        for sub in sorted_subs:
            # Format date from YYYY-MM-DD to MM/DD/YYYY
            raw_date = sub.get('date', 'N/A')
            if raw_date != 'N/A' and raw_date:
                try:
                    date_obj = datetime.strptime(str(raw_date).strip(), '%Y-%m-%d')
                    date_str = date_obj.strftime('%m/%d/%Y')
                except:
                    date_str = str(raw_date)
            else:
                date_str = 'N/A'
            
            # Format time from 24-hour (HH:MM) to 12-hour AM/PM format
            raw_time = sub.get('time', 'N/A')
            if raw_time != 'N/A' and raw_time:
                try:
                    # Parse time in format HH:MM
                    time_obj = datetime.strptime(str(raw_time).strip(), '%H:%M')
                    time_str = time_obj.strftime('%I:%M %p').lstrip('0').replace(' 0', ' ')
                except:
                    time_str = str(raw_time)
            else:
                time_str = 'N/A'
            
            user_name = sub.get('name', 'N/A')
            comp_id = sub.get('componentId', 'N/A')
            
            # Get addressed status - show checkmark if addressed, blank if not
            addressed = sub.get('addressed', False)
            addressed_display = '✓' if addressed else ''
            addressed_class = 'addressed-yes' if addressed else ''
            
            if submission_type == 'accidental-vend':
                quantity = sub.get('quantity', 'N/A')
                # Leave description blank if empty (don't show "No description")
                description = sub.get('whatHappened', '') or ''
                type_class = 'type-accidental'
            else:  # inventory-error
                description = sub.get('stockErrorDescription', '') or 'No description'
                type_class = 'type-inventory'
            
            if is_inventory:
                table_html += f"""                        <tr class="{type_class}">
                            <td>{html.escape(str(date_str))}</td>
                            <td>{html.escape(str(time_str))}</td>
                            <td>{html.escape(str(user_name))}</td>
                            <td>{html.escape(str(comp_id))}</td>
                            <td>{html.escape(str(description))}</td>
                            <td class="{addressed_class}" style="text-align: center;">{html.escape(str(addressed_display))}</td>
                        </tr>
"""
            else:
                table_html += f"""                        <tr class="{type_class}">
                            <td>{html.escape(str(date_str))}</td>
                            <td>{html.escape(str(time_str))}</td>
                            <td>{html.escape(str(user_name))}</td>
                            <td>{html.escape(str(comp_id))}</td>
                            <td>{html.escape(str(quantity))}</td>
                            <td>{html.escape(str(description))}</td>
                            <td class="{addressed_class}" style="text-align: center;">{html.escape(str(addressed_display))}</td>
                        </tr>
"""
        
        table_html += """                    </tbody>
                </table>
            </div>
"""
        return table_html
    
    # Generate daily tables
    if daily_submissions:
        html_content += generate_table(
            daily_submissions,
            "Daily Accidental Vend",
            "dailyAccidentalVendTable",
            daily_visible,
            'accidental-vend',
            'daily'
        )
        html_content += generate_table(
            daily_submissions,
            "Daily Inventory Error",
            "dailyInventoryErrorTable",
            daily_visible,
            'inventory-error',
            'daily'
        )
    
    # Generate monthly tables
    if monthly_submissions:
        html_content += generate_table(
            monthly_submissions,
            "Monthly Accidental Vend (Last 30 Days)",
            "monthlyAccidentalVendTable",
            monthly_visible,
            'accidental-vend',
            'monthly'
        )
        html_content += generate_table(
            monthly_submissions,
            "Monthly Inventory Error (Last 30 Days)",
            "monthlyInventoryErrorTable",
            monthly_visible,
            'inventory-error',
            'monthly'
        )
    
    html_content += """
            </div>
        </div>
    """
    
    return html_content


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


def get_component_storage_location(probe, comp_id):
    """Get StorageLocation for a component."""
    query = f"""
        SELECT vd.ValStr
        FROM ValData vd
        INNER JOIN FieldInfo fi ON vd.FieldId = fi.FieldId
        WHERE vd.ObjId = {comp_id}
            AND fi.ColumnName = 'StorageLocation'
    """
    result = probe.execute_query(query)
    if result and result[0]:
        return result[0][0] or ""
    return ""


def get_component_supplier(probe, comp_id):
    """Get Supplier for a component."""
    query = f"""
        SELECT vd.ValStr
        FROM ValData vd
        INNER JOIN FieldInfo fi ON vd.FieldId = fi.FieldId
        WHERE vd.ObjId = {comp_id}
            AND fi.ColumnName = 'Supplier'
    """
    result = probe.execute_query(query)
    if result and result[0]:
        return result[0][0] or ""
    return ""


def generate_under_minimum_html(under_minimum_rows, default_type='daily'):
    """Generate HTML sub-section for under minimum stock items (used inside Stock Reports widget)."""
    if not under_minimum_rows:
        return """
            <div class="under-minimum-section">
                <h3 style="text-align: center; margin-bottom: 10px;">\u26a0\ufe0f Zoller Under Minimum Stock</h3>
            <p class="under-minimum-stats" style="text-align: center; color: #666; font-style: italic;">No items currently under minimum stock.</p>
        </div>
"""
    
    # Calculate total price to fill
    total_price_to_fill = sum(row.get('Price to Fill', 0) for row in under_minimum_rows)
    
    html_content = f"""
            <div class="under-minimum-section">
                <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 10px;">
                    <h3 style="margin: 0;">\u26a0\ufe0f Zoller Under Minimum Stock ({len(under_minimum_rows)} items)</h3>
                <div style="display: flex; gap: 10px;">
                        <button class="control-button" onclick="emailUnderMinimum()" title="Email Under Minimum Stock List">\u2709\ufe0f</button>
                        <button class="control-button" onclick="exportUnderMinimumToCSV()" title="Export Under Minimum Stock to CSV">\U0001f4e5</button>
                </div>
            </div>
            <p class="under-minimum-stats">Total Items Under Minimum: {len(under_minimum_rows)}</p>
            <table class="under-minimum-table" id="underMinimumTable">
                <thead>
                    <tr>
                            <th class="sortable" style="text-align: center; cursor: pointer;" onclick="sortUnderMinimumTable(0)" title="Click to sort by C-ID">C-ID <span class="sort-indicator" id="um-sort-0">\u21c5</span></th>
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
"""
    
    for row in under_minimum_rows:
        cid = row.get('C-ID', '')
        desc = row.get('Description', '')
        part_no = row.get('Part No', '')
        value = row.get('Value', 0.0)
        current_stock = row.get('Current Stock', 0)
        under_min = row.get('Under Min', 0)
        to_max = row.get('To Max', 0)
        price_to_fill = row.get('Price to Fill', 0.0)
        
        # Format value and price to fill as currency
        value_str = f"${value:,.2f}" if value > 0 else ""
        price_to_fill_str = f"${price_to_fill:,.2f}" if price_to_fill > 0 else "$0.00"
        
        # Check if under_min is negative for styling
        under_min_class = 'under-minimum-negative' if under_min < 0 else ''
        
        # Generate part number link if available
        part_no_link = get_part_number_link(part_no)
        if part_no_link and part_no:
            part_no_cell = f'<td><a href="{html.escape(part_no_link)}" target="_blank">{html.escape(part_no)}</a></td>'
        else:
            part_no_cell = f'<td>{html.escape(part_no)}</td>'
        
        html_content += f"""                        <tr>
                        <td>{html.escape(str(cid))}</td>
                        <td>{html.escape(str(desc))}</td>
                        {part_no_cell}
                        <td>{html.escape(value_str)}</td>
                        <td>{html.escape(str(current_stock))}</td>
                        <td class="{under_min_class}">{html.escape(str(under_min))}</td>
                        <td>{html.escape(str(to_max))}</td>
                        <td>{html.escape(price_to_fill_str)}</td>
                    </tr>
"""
    
    # Add total row
    total_price_to_fill_str = f"${total_price_to_fill:,.2f}"
    html_content += f"""                    </tbody>
            </table>
            <div class="under-minimum-total">Total Price to Fill: {html.escape(total_price_to_fill_str)}</div>
        </div>
"""
    
    return html_content


def generate_door_unlocks_html(daily_door_data, monthly_door_data, default_type='daily'):
    """Generate HTML section for door unlock events."""
    # Determine initial visibility
    daily_visible = 'block' if default_type == 'daily' else 'none'
    monthly_visible = 'block' if default_type == 'monthly' else 'none'
    
    # Return message if no data at all
    if not daily_door_data and not monthly_door_data:
        return f"""
        <div class="door-unlocks-section">
            <h2 class="section-toggle" onclick="toggleSection('doorSection')">
                <span id="doorSectionIcon">\u25B6</span> \U0001f6aa Tool Crib Door Access
            </h2>
            <div id="doorSectionContent" style="display: none;">
            <p style="text-align: center; color: #666; font-style: italic; padding: 20px;">No door access data available.</p>
            </div>
        </div>
"""
    
    html_content = """
        <div class="door-unlocks-section">
            <h2 class="section-toggle" onclick="toggleSection('doorSection')">
                <span id="doorSectionIcon">▶</span> 🚪 Tool Crib Door Access
            </h2>
            <div id="doorSectionContent" style="display: none;">
"""
    
    # Helper function to generate a door unlocks table
    def generate_door_table(door_data, title, table_id, visible_style, report_type):
        """Generate a table for door unlock events, combining entry/exit pairs."""
        if not door_data or 'events' not in door_data:
            return f"""
            <div class="door-unlocks-details" data-report-type="{report_type}" style="display: {visible_style};">
                <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 10px;">
                    <h3 style="margin: 0;">{title}</h3>
                    <button class="control-button" onclick="exportDoorUnlocksToCSV('{table_id}', '{title}')" title="Export to CSV" style="display: none;">📥</button>
                </div>
                <p style="text-align: center; color: #666; font-style: italic; padding: 20px;">No door access events for this period.</p>
            </div>
"""
        
        events = door_data.get('events', [])
        total_events = door_data.get('total_events', len(events))
        
        # Process events to combine entry/exit pairs
        combined_records = []
        pending_entries = {}  # Track pending entries by (user, door) key
        
        for event in events:
            user = event.get('user', 'N/A')
            door = event.get('door', 'N/A')
            entry_exit = event.get('entry_exit', 'N/A')
            datetime_str = event.get('datetime', '')
            date_str = event.get('date', 'N/A')
            time_str = event.get('time', 'N/A')
            access_method = event.get('access_method', 'N/A')
            
            key = (user, door)
            
            # Parse datetime for time calculations
            try:
                if datetime_str:
                    # Handle timezone-aware datetime strings
                    if datetime_str.endswith('Z'):
                        event_dt = datetime.fromisoformat(datetime_str.replace('Z', '+00:00'))
                    elif '+' in datetime_str or datetime_str.count('-') > 2:
                        event_dt = datetime.fromisoformat(datetime_str)
                    else:
                        # Try parsing without timezone
                        event_dt = datetime.strptime(datetime_str, '%Y-%m-%dT%H:%M:%S')
                else:
                    event_dt = None
            except:
                event_dt = None
            
            if entry_exit == 'Entry':
                # Check if there's a pending entry for this user/door
                if key in pending_entries:
                    # Another entry before exit - add the pending entry as standalone
                    pending = pending_entries[key]
                    combined_records.append({
                        'date': pending['date'],
                        'entry_time': pending['time'],
                        'exit_time': None,
                        'user': pending['user'],
                        'door': pending['door'],
                        'entry_access': pending['access_method'],
                        'exit_access': None,
                        'time_in_room': None,
                        'status': 'entry_only'
                    })
                
                # Store this entry as pending
                pending_entries[key] = {
                    'date': date_str,
                    'time': time_str,
                    'user': user,
                    'door': door,
                    'access_method': access_method,
                    'datetime': event_dt
                }
            
            elif entry_exit == 'Exit':
                if key in pending_entries:
                    # Found matching entry - check if within 15 minutes
                    pending = pending_entries[key]
                    should_combine = True
                    
                    if pending['datetime'] and event_dt:
                        time_diff = (event_dt - pending['datetime']).total_seconds()
                        # If more than 15 minutes (900 seconds), don't combine
                        if time_diff > 900:
                            should_combine = False
                            # Add pending entry as standalone
                            combined_records.append({
                                'date': pending['date'],
                                'entry_time': pending['time'],
                                'exit_time': None,
                                'user': pending['user'],
                                'door': pending['door'],
                                'entry_access': pending['access_method'],
                                'exit_access': None,
                                'time_in_room': None,
                                'status': 'entry_only'
                            })
                            # Remove from pending and add exit as standalone
                            del pending_entries[key]
                            combined_records.append({
                                'date': date_str,
                                'entry_time': None,
                                'exit_time': time_str,
                                'user': user,
                                'door': door,
                                'entry_access': None,
                                'exit_access': access_method,
                                'time_in_room': None,
                                'status': 'exit_only'
                            })
                    
                    if should_combine:
                        # Combine them
                        time_in_room = event.get('time_in_room', '')
                        
                        combined_records.append({
                            'date': pending['date'],
                            'entry_time': pending['time'],
                            'exit_time': time_str,
                            'user': user,
                            'door': door,
                            'entry_access': pending['access_method'],
                            'exit_access': access_method,
                            'time_in_room': time_in_room,
                            'status': 'complete'
                        })
                        
                        # Remove from pending
                        del pending_entries[key]
                else:
                    # Exit without matching entry - add as standalone exit
                    combined_records.append({
                        'date': date_str,
                        'entry_time': None,
                        'exit_time': time_str,
                        'user': user,
                        'door': door,
                        'entry_access': None,
                        'exit_access': access_method,
                        'time_in_room': None,
                        'status': 'exit_only'
                    })
        
        # Add any remaining pending entries as standalone
        for key, pending in pending_entries.items():
            combined_records.append({
                'date': pending['date'],
                'entry_time': pending['time'],
                'exit_time': None,
                'user': pending['user'],
                'door': pending['door'],
                'entry_access': pending['access_method'],
                'exit_access': None,
                'time_in_room': None,
                'status': 'entry_only'
            })
        
        # Sort combined records by date and time (chronological)
        def parse_time_to_minutes(time_str):
            """Convert 12-hour time string to minutes since midnight for proper sorting."""
            if not time_str:
                return 0
            try:
                # Handle formats like "06:09:47 AM" or "6:09 AM"
                time_str = time_str.strip()
                parts = time_str.split()
                if len(parts) != 2:
                    return 0
                time_part, ampm = parts[0], parts[1].upper()
                time_components = time_part.split(':')
                hours = int(time_components[0])
                minutes = int(time_components[1]) if len(time_components) > 1 else 0
                seconds = int(time_components[2]) if len(time_components) > 2 else 0
                if ampm == 'PM' and hours != 12:
                    hours += 12
                if ampm == 'AM' and hours == 12:
                    hours = 0
                return hours * 3600 + minutes * 60 + seconds
            except (ValueError, IndexError):
                return 0
        
        combined_records.sort(key=lambda x: (
            x['date'],
            parse_time_to_minutes(x['entry_time'] or x['exit_time'] or '')
        ))
        
        table_html = f"""
            <div class="door-unlocks-details" data-report-type="{report_type}" style="display: {visible_style};">
                <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 10px;">
                    <h3 style="margin: 0;">{title}</h3>
                    <button class="control-button" onclick="exportDoorUnlocksToCSV('{table_id}', '{title}')" title="Export to CSV">📥</button>
                </div>
                <p class="door-stats">Total Events: {total_events} | Combined Records: {len(combined_records)}</p>
                <div class="door-legend" style="margin-bottom: 15px; font-size: 13px;">
                    <span style="display: inline-block; margin-right: 20px;">
                        <span style="display: inline-block; width: 20px; height: 12px; background-color: #e6faf0; border: 1px solid #ccc; vertical-align: middle; margin-right: 5px;"></span>
                        <strong>Complete:</strong> Entry and Exit paired
                    </span>
                    <span style="display: inline-block; margin-right: 20px;">
                        <span style="display: inline-block; width: 20px; height: 12px; background-color: #e6f2ff; border: 1px solid #ccc; vertical-align: middle; margin-right: 5px;"></span>
                        <strong>Entry Only:</strong> Entry without matching exit
                    </span>
                    <span style="display: inline-block;">
                        <span style="display: inline-block; width: 20px; height: 12px; background-color: #fff4e6; border: 1px solid #ccc; vertical-align: middle; margin-right: 5px;"></span>
                        <strong>Exit Only:</strong> Exit without matching entry
                    </span>
                </div>
                <table class="door-unlocks-table" id="{table_id}">
                    <thead>
                        <tr>
                            <th style="text-align: center;">Date</th>
                            <th style="text-align: center;">Entry Time</th>
                            <th style="text-align: center;">Exit Time</th>
                            <th style="text-align: center;">User</th>
                            <th style="text-align: center;">Door</th>
                            <th style="text-align: center;">Time in Room</th>
                            <th style="text-align: center;">Entry Method</th>
                            <th style="text-align: center;">Exit Method</th>
                        </tr>
                    </thead>
                    <tbody>
"""
        
        for record in combined_records:
            # Format date from MM-DD-YYYY to MM/DD/YYYY (door unlock JSON uses MM-DD-YYYY)
            raw_date = record['date']
            if raw_date and raw_date != '-':
                try:
                    # Try MM-DD-YYYY format first (from door unlock JSON)
                    date_obj = datetime.strptime(str(raw_date).strip(), '%m-%d-%Y')
                    date_str = date_obj.strftime('%m/%d/%Y')
                except:
                    try:
                        # Try YYYY-MM-DD format as fallback
                        date_obj = datetime.strptime(str(raw_date).strip(), '%Y-%m-%d')
                        date_str = date_obj.strftime('%m/%d/%Y')
                    except:
                        date_str = str(raw_date)
            else:
                date_str = '-'
            
            # Times from door unlock JSON are already in 12-hour format, but ensure consistency
            entry_time = record['entry_time'] or '-'
            exit_time = record['exit_time'] or '-'
            
            user = record['user']
            door = record['door']
            time_in_room = record['time_in_room'] or '-'
            entry_access = record['entry_access'] or '-'
            exit_access = record['exit_access'] or '-'
            status = record['status']
            
            # Determine row class based on status
            if status == 'complete':
                row_class = 'door-complete'
            elif status == 'entry_only':
                row_class = 'door-entry-only'
            else:  # exit_only
                row_class = 'door-exit-only'
            
            table_html += f"""                        <tr class="{row_class}">
                            <td>{html.escape(str(date_str))}</td>
                            <td>{html.escape(str(entry_time))}</td>
                            <td>{html.escape(str(exit_time))}</td>
                            <td>{html.escape(str(user))}</td>
                            <td>{html.escape(str(door))}</td>
                            <td>{html.escape(str(time_in_room))}</td>
                            <td>{html.escape(str(entry_access))}</td>
                            <td>{html.escape(str(exit_access))}</td>
                        </tr>
"""
        
        table_html += """                    </tbody>
                </table>
            </div>
"""
        return table_html
    
    # Generate daily table
    if daily_door_data:
        html_content += generate_door_table(
            daily_door_data,
            "Daily Door Access",
            "dailyDoorUnlocksTable",
            daily_visible,
            'daily'
        )
    
    # Generate monthly table
    if monthly_door_data:
        html_content += generate_door_table(
            monthly_door_data,
            "Monthly Door Access (Last 30 Days)",
            "monthlyDoorUnlocksTable",
            monthly_visible,
            'monthly'
        )
    
    html_content += """
            </div>
        </div>
    """
    
    return html_content


# Matrix Vending Database Queries
MATRIX_VENDING_QUERY = """
SELECT
    m.ITEM_DESCRIPTION,
    m.ITEM_CODE,
    m.ITEM_KEY,
    ISNULL(SUM(CASE 
        WHEN t.TRN_DATE >= ? 
            AND (tt.TRANSACTION_TYPE_NAME LIKE '%Issue%' 
                 OR tt.TRANSACTION_TYPE_NAME LIKE '%Vend%' 
                 OR t.TRANSACTION_QTY < 0)
        THEN ABS(t.TRANSACTION_QTY) 
        ELSE 0 
    END), 0) AS TOTAL_VENDED,
    ISNULL(COUNT(DISTINCT CASE 
        WHEN t.TRN_DATE >= ? 
            AND (tt.TRANSACTION_TYPE_NAME LIKE '%Issue%' 
                 OR tt.TRANSACTION_TYPE_NAME LIKE '%Vend%' 
                 OR t.TRANSACTION_QTY < 0)
        THEN t.TRANSACTION_KEY 
        ELSE NULL 
    END), 0) AS VEND_COUNT,
    ISNULL((SELECT SUM(s2.STOCK_QTY) 
            FROM dbo.ENT_STOCK_MANAGE_LEVEL s2 
            INNER JOIN dbo.ENT_BIN_MASTER b2 ON s2.BIN_KEY = b2.BIN_KEY
            WHERE s2.ITEM_KEY = m.ITEM_KEY 
              AND s2.BOOL_BITUL = 0
              AND b2.BIN_CODE IS NOT NULL), 0) AS STOCK_QTY,
    ISNULL((SELECT MAX(COALESCE(NULLIF(s2.MIN_QTY_OV, 0), s2.MIN_QTY_CALC, 0)) 
            FROM dbo.ENT_STOCK_MANAGE_LEVEL s2 
            WHERE s2.ITEM_KEY = m.ITEM_KEY 
              AND s2.BOOL_BITUL = 0), 0) AS MIN_QTY,
    ISNULL((SELECT MAX(COALESCE(NULLIF(s2.MAX_QTY_OV, 0), s2.MAX_QTY_CALC, 0)) 
            FROM dbo.ENT_STOCK_MANAGE_LEVEL s2 
            WHERE s2.ITEM_KEY = m.ITEM_KEY 
              AND s2.BOOL_BITUL = 0), 0) AS MAX_QTY,
    ISNULL((SELECT SUM(s2.ORDERED_QTY) 
            FROM dbo.ENT_STOCK_MANAGE_LEVEL s2 
            INNER JOIN dbo.ENT_BIN_MASTER b2 ON s2.BIN_KEY = b2.BIN_KEY
            WHERE s2.ITEM_KEY = m.ITEM_KEY 
              AND s2.BOOL_BITUL = 0
              AND b2.BIN_CODE IS NOT NULL), 0) AS ORDERED_QTY,
    m.ITEM_PRICE
FROM dbo.ENT_ITEM_MASTER m
LEFT JOIN dbo.ENT_TRANSACTION_LOG t ON m.ITEM_KEY = t.ITEM_KEY
LEFT JOIN dbo.TVL_TRANSACTION_TYPE tt ON t.TRANSACTION_TYPE_KEY = tt.TRANSACTION_TYPE_KEY
WHERE m.BOOL_BITUL = 0
GROUP BY m.ITEM_DESCRIPTION, m.ITEM_CODE, m.ITEM_KEY, m.ITEM_PRICE
HAVING ISNULL(COUNT(DISTINCT CASE 
    WHEN t.TRN_DATE >= ? 
        AND (tt.TRANSACTION_TYPE_NAME LIKE '%Issue%' 
             OR tt.TRANSACTION_TYPE_NAME LIKE '%Vend%' 
             OR t.TRANSACTION_QTY < 0)
    THEN t.TRANSACTION_KEY 
    ELSE NULL 
END), 0) > 0
ORDER BY m.ITEM_DESCRIPTION
"""

MATRIX_VENDING_MONTHLY_QUERY = """
SELECT
    YEAR(t.TRN_DATE) AS YEAR,
    MONTH(t.TRN_DATE) AS MONTH,
    SUM(ABS(t.TRANSACTION_QTY)) AS VENDED_QTY
FROM dbo.ENT_TRANSACTION_LOG t
LEFT JOIN dbo.TVL_TRANSACTION_TYPE tt ON t.TRANSACTION_TYPE_KEY = tt.TRANSACTION_TYPE_KEY
WHERE t.ITEM_KEY = ?
    AND t.TRN_DATE >= ?
    AND (tt.TRANSACTION_TYPE_NAME LIKE '%Issue%' 
         OR tt.TRANSACTION_TYPE_NAME LIKE '%Vend%' 
         OR t.TRANSACTION_QTY < 0)
GROUP BY YEAR(t.TRN_DATE), MONTH(t.TRN_DATE)
ORDER BY YEAR(t.TRN_DATE), MONTH(t.TRN_DATE)
"""


MATRIX_VENDING_GRID_QUERY = """
    SELECT
        m.ITEM_CODE,
        m.ITEM_DESCRIPTION,
        s.STOCK_QTY,
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


def parse_bin_location(bin_code):
    """Parse bin code like TP-01-01-08 to extract row and pocket.
    Format: CABINET-XX-YY-ZZ where YY is row (01-08) and ZZ is pocket (01-10).
    Returns (row, pocket) as integers, or (None, None) if invalid."""
    if not bin_code:
        return None, None
    parts = bin_code.split('-')
    if len(parts) >= 4:
        try:
            row = int(parts[2])
            pocket = int(parts[3])
            if 1 <= row <= 8 and 1 <= pocket <= 10:
                return row, pocket
        except (ValueError, IndexError):
            pass
    return None, None


def query_matrix_vending_grid():
    """Query the Matrix Vending DB and return an 8x10 grid of stock locations."""
    if not PYODBC_AVAILABLE or not MATRIX_VENDING_ENABLED:
        return None
    
    conn = connect_to_matrix_vending_db()
    if not conn:
        return None
    
    try:
        cursor = conn.cursor()
        cursor.execute(MATRIX_VENDING_GRID_QUERY)
        rows = cursor.fetchall()
        
        grid = [[None for _ in range(10)] for _ in range(8)]
        
        for row_data in rows:
            item_code = str(row_data[0]) if row_data[0] else ""
            item_desc = str(row_data[1]) if row_data[1] else ""
            stock_qty = float(row_data[2]) if row_data[2] is not None else 0.0
            min_qty = float(row_data[3]) if row_data[3] is not None else 0.0
            ordered_qty = float(row_data[4]) if row_data[4] is not None else 0.0
            bin_code = str(row_data[5]) if row_data[5] else ""
            
            is_below_minimum = (min_qty > 0 and stock_qty < min_qty and
                               (ordered_qty is None or ordered_qty == 0))
            
            row_num, pocket_num = parse_bin_location(bin_code)
            
            cell_data = {
                'item_code': item_code,
                'item_desc': item_desc,
                'qty': stock_qty,
                'min_qty': min_qty,
                'bin': bin_code,
                'is_below_minimum': is_below_minimum,
            }
            
            if row_num and pocket_num:
                row_idx = row_num - 1
                pocket_idx = pocket_num - 1
                if grid[row_idx][pocket_idx] is None:
                    grid[row_idx][pocket_idx] = cell_data
                else:
                    existing = grid[row_idx][pocket_idx]
                    existing['qty'] += stock_qty
                    existing['item_code'] += f" / {item_code}"
                    if is_below_minimum:
                        existing['is_below_minimum'] = True
        
        cursor.close()
        return grid
    except Exception as e:
        print(f"Warning: Error querying Matrix Vending grid: {e}")
        return None
    finally:
        if conn:
            conn.close()


def generate_matrix_grid_html(grid):
    """Generate an HTML snippet for the 8x10 stock location grid."""
    if grid is None:
        return ""
    
    grid_cells = ""
    for row_idx in range(8):
        row_num = row_idx + 1
        grid_cells += f'<div class="mv-row-label">Row {row_num}</div>\n'
        
        for pocket_idx in range(10):
            pocket_num = pocket_idx + 1
            cell_data = grid[row_idx][pocket_idx]
            
            if cell_data:
                qty = cell_data['qty']
                min_qty = cell_data.get('min_qty', 0)
                is_below_minimum = cell_data.get('is_below_minimum', False)
                
                if qty == 0:
                    cell_class = "mv-no-stock"
                elif is_below_minimum:
                    cell_class = "mv-below-minimum"
                elif qty < 10:
                    cell_class = "mv-low-stock"
                else:
                    cell_class = "mv-has-stock"
                
                qty_class = " mv-zero" if qty == 0 else ""
                min_display = f'<div class="mv-pocket-min">Min: {min_qty:.0f}</div>' if min_qty > 0 else ""
                
                grid_cells += f'''<div class="mv-pocket {cell_class}" title="{html.escape(cell_data["item_code"])} - {html.escape(cell_data["item_desc"])} - {cell_data["bin"]}">
                    <div class="mv-pocket-code">{row_num:02d}-{pocket_num:02d}</div>
                    <div class="mv-pocket-item">{html.escape(cell_data["item_desc"])}</div>
                    <div class="mv-pocket-qty{qty_class}">{qty:.0f}</div>
                    {min_display}
                </div>\n'''
            else:
                grid_cells += f'''<div class="mv-pocket mv-empty" title="Empty - {row_num:02d}-{pocket_num:02d}">
                    <div class="mv-pocket-code">{row_num:02d}-{pocket_num:02d}</div>
                    <div class="mv-pocket-item" style="color: #999;">(Empty)</div>
                    <div class="mv-pocket-qty mv-zero">0</div>
                </div>\n'''
    
    grid_html = f"""
            <div class="mv-grid-container" style="margin-top: 30px;">
                <h4 class="section-toggle" onclick="toggleSection('matrixGrid')" style="margin-bottom: 0; font-size: 18px;">
                    <span id="matrixGridIcon">\u25B6</span> Stock Location Grid (8 Rows x 10 Pockets)
                </h4>
                <div id="matrixGridContent" style="display: none; margin-top: 15px;">
                    <div class="mv-grid-header">
                        <div class="mv-grid-header-cell"></div>
                        {''.join(f'<div class="mv-grid-header-cell">Pocket {i}</div>' for i in range(1, 11))}
                    </div>
                    <div class="mv-grid">
                        {grid_cells}
                    </div>
                    <div style="display: flex; gap: 20px; justify-content: center; margin-top: 10px; font-size: 12px; color: #666;">
                        <span><span style="display:inline-block;width:12px;height:12px;background:#e7f5e7;border:1px solid #28a745;border-radius:2px;vertical-align:middle;"></span> In Stock</span>
                        <span><span style="display:inline-block;width:12px;height:12px;background:#fff3cd;border:1px solid #ffc107;border-radius:2px;vertical-align:middle;"></span> Low Stock</span>
                        <span><span style="display:inline-block;width:12px;height:12px;background:#f8d7da;border:2px solid #dc3545;border-radius:2px;vertical-align:middle;"></span> Below Minimum / Empty</span>
                    </div>
                </div>
            </div>
"""
    return grid_html


def connect_to_matrix_vending_db():
    """Connect to Matrix Vending database."""
    if not PYODBC_AVAILABLE or not MATRIX_VENDING_ENABLED:
        return None
    
    try:
        connection_string = (
            f"DRIVER={{ODBC Driver 17 for SQL Server}};"
            f"SERVER={MATRIX_VENDING_SERVER};"
            f"DATABASE={MATRIX_VENDING_DATABASE};"
            f"UID={MATRIX_VENDING_USERNAME};"
            f"PWD={MATRIX_VENDING_PASSWORD};"
        )
        conn = pyodbc.connect(connection_string, timeout=10)
        return conn
    except Exception as e:
        print(f"Warning: Could not connect to Matrix Vending database: {e}")
        return None


def build_matrix_monthly_list(monthly_data, since_date):
    """Build complete monthly list from since_date to now, filling zeros."""
    monthly_dict = {}
    for row in monthly_data:
        year = row[0]
        month = row[1]
        qty = float(row[2])
        key = f"{year}-{month:02d}"
        monthly_dict[key] = qty
    
    monthly_list = []
    current_date = datetime.now()
    current_year = current_date.year
    current_month = current_date.month
    
    if isinstance(since_date, str):
        since_date_obj = datetime.strptime(since_date, '%Y-%m-%d').date()
    else:
        since_date_obj = since_date
    
    year = since_date_obj.year
    month = since_date_obj.month
    
    while (year < current_year) or (year == current_year and month <= current_month):
        key = f"{year}-{month:02d}"
        qty = monthly_dict.get(key, 0.0)
        
        month_abbr_name = month_abbr[month] if month <= 12 else ""
        year_abbr = str(year)[-2:]
        month_label = f"{month_abbr_name}. {year_abbr}'"
        
        monthly_list.append({
            'month': month_label,
            'month_sort': key,
            'qty': qty
        })
        
        month += 1
        if month > 12:
            month = 1
            year += 1
    
    return monthly_list


def calculate_matrix_statistics(monthly_list):
    """Calculate average monthly use and max usage for Matrix Vending."""
    total_vended_period = sum(d['qty'] for d in monthly_list)
    months_in_period = len(monthly_list)
    avg_monthly_use = math.ceil(total_vended_period / months_in_period) if months_in_period > 0 else 0
    
    max_usage = max((d['qty'] for d in monthly_list), default=0.0)
    max_usage = math.ceil(max_usage) if max_usage > 0 else 0
    
    return avg_monthly_use, max_usage


def query_matrix_vending_items(since_date=None):
    """
    Query Matrix Vending items with transactions and stock levels.
    Returns processed items data structure or None if connection fails.
    """
    if not PYODBC_AVAILABLE or not MATRIX_VENDING_ENABLED:
        return None
    
    conn = connect_to_matrix_vending_db()
    if not conn:
        return None
    
    try:
        # Calculate since_date (3 years back from February 1st by default)
        if since_date is None:
            now = datetime.now()
            since_date = date(now.year - 3, 2, 1)
        
        if isinstance(since_date, date):
            since_date_str = since_date.strftime('%Y-%m-%d')
        else:
            since_date_str = str(since_date)
        
        # Query items
        cursor = conn.cursor()
        cursor.execute(MATRIX_VENDING_QUERY, since_date_str, since_date_str, since_date_str)
        items = cursor.fetchall()
        
        if not items:
            return []
        
        items_with_data = []
        
        for item in items:
            item_description = item[0] or ""
            item_code = item[1] or ""
            item_key = item[2]
            stock_qty = float(item[5] or 0)
            min_qty = float(item[6] or 0)
            max_qty = float(item[7] or 0)
            ordered_qty = float(item[8] or 0)
            item_price = float(item[9] or 0)
            
            # Calculate below-minimum status
            is_below_minimum = (min_qty > 0 and stock_qty < min_qty and 
                               (ordered_qty is None or ordered_qty == 0))
            shortage = (min_qty - stock_qty) if is_below_minimum else 0.0
            cost_to_replenish = shortage * item_price if is_below_minimum else 0.0
            
            # Fetch monthly aggregated data
            monthly_data = []
            try:
                cursor.execute(MATRIX_VENDING_MONTHLY_QUERY, item_key, since_date_str)
                monthly_data = cursor.fetchall()
            except Exception as e:
                print(f"Warning: Error fetching monthly data for item {item_key}: {e}")
            
            monthly_list = build_matrix_monthly_list(monthly_data, since_date_str)
            avg_monthly_use, max_usage = calculate_matrix_statistics(monthly_list)
            
            items_with_data.append({
                'item_description': item_description,
                'item_code': item_code,
                'item_key': item_key,
                'stock_qty': stock_qty,
                'min_qty': min_qty,
                'max_qty': max_qty,
                'shortage': shortage,
                'is_below_minimum': is_below_minimum,
                'item_price': item_price,
                'cost_to_replenish': cost_to_replenish,
                'monthly_data': monthly_list,
                'avg_monthly_use': avg_monthly_use,
                'max_usage': max_usage
            })
        
        return items_with_data
        
    except Exception as e:
        print(f"Error querying Matrix Vending database: {e}")
        return None
    finally:
        if conn:
            conn.close()


def generate_matrix_vending_html(matrix_vending_data, default_type='daily', grid_html=''):
    """Generate HTML sub-section for Matrix Vending report (used inside Stock Reports widget)."""
    if matrix_vending_data is None:
        return """
            <div class="matrix-vending-section">
                <h3 style="text-align: center; margin-bottom: 10px;">\U0001f4e6 Matrix Vending</h3>
                <p style="text-align: center; color: #666; font-style: italic; padding: 20px;">
                    Matrix Vending database not configured or unavailable.
                </p>
            </div>
"""
    
    if not matrix_vending_data:
        return """
            <div class="matrix-vending-section">
                <h3 style="text-align: center; margin-bottom: 10px;">\U0001f4e6 Matrix Vending</h3>
                <p style="text-align: center; color: #666; font-style: italic; padding: 20px;">
                    No Matrix Vending data available.
                </p>
            </div>
"""
    
    # Calculate totals
    total_items = len(matrix_vending_data)
    total_below_minimum = sum(1 for item in matrix_vending_data if item['is_below_minimum'])
    total_shortage = sum(item['shortage'] for item in matrix_vending_data)
    total_cost = sum(item['cost_to_replenish'] for item in matrix_vending_data)
    
    # Generate table rows
    table_rows = []
    for idx, item_data in enumerate(matrix_vending_data):
        below_min_class = " below-minimum" if item_data['is_below_minimum'] else ""
        row_id = f"matrix_row_{idx}"
        
        stock_qty_str = f"{item_data['stock_qty']:.0f}" if item_data['stock_qty'] > 0 else "0"
        shortage_str = f"{item_data['shortage']:.0f}" if item_data['shortage'] > 0 else "-"
        min_qty_str = f"{item_data['min_qty']:.0f}" if item_data['min_qty'] > 0 else "-"
        max_qty_str = f"{item_data['max_qty']:.0f}" if item_data.get('max_qty', 0) > 0 else "-"
        price_str = f"${item_data['item_price']:.2f}" if item_data['item_price'] > 0 else "-"
        cost_str = f"${item_data['cost_to_replenish']:.2f}" if item_data['cost_to_replenish'] > 0 else "-"
        
        # Prepare monthly chart data
        monthly_data = item_data.get('monthly_data', [])
        chart_labels = html.escape(json.dumps([m['month'] for m in monthly_data]))
        chart_values = html.escape(json.dumps([m['qty'] for m in monthly_data]))
        
        data_row = f"""
                        <tr class="data-row{below_min_class}" onclick="toggleMatrixTransactions('{row_id}')" style="cursor: pointer;">
                            <td><span class="expand-icon" id="{row_id}_icon">\u25B6</span></td>
                            <td class="item-desc">{html.escape(item_data['item_description'])}</td>
                            <td class="item-code">{html.escape(item_data['item_code'])}</td>
                            <td class="number group-start">{stock_qty_str}</td>
                            <td class="number shortage">{shortage_str}</td>
                            <td class="number group-start">{min_qty_str}</td>
                            <td class="number">{max_qty_str}</td>
                            <td class="price group-start">{price_str}</td>
                            <td class="cost">{cost_str}</td>
                            <td class="number group-start">{item_data['avg_monthly_use']}</td>
                            <td class="number">{item_data['max_usage']}</td>
                        </tr>
                        <tr class="transaction-row" id="{row_id}" style="display: none;">
                            <td colspan="12" class="transaction-cell">
                                <div class="chart-section">
                                    <h4>Monthly Usage - {html.escape(item_data['item_description'])}</h4>
                                    <canvas id="{row_id}_chart" width="400" height="200"
                                        data-labels="{chart_labels}"
                                        data-values="{chart_values}"></canvas>
                                </div>
                            </td>
                        </tr>
        """
        
        table_rows.append(data_row)
    
    table_rows_html = "".join(table_rows)
    
    html_content = f"""
            <div class="matrix-vending-section" style="margin-top: 30px;">
                <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 10px;">
                    <h3 style="margin: 0;">\U0001f4e6 Matrix Vending ({total_items} items)</h3>
                    <button class="control-button" onclick="exportMatrixVendingToCSV()" title="Export Matrix Vending to CSV">\U0001f4e5</button>
                </div>
                <div class="summary" style="margin-bottom: 15px;">
                    <div class="summary-grid">
                        <div class="summary-item">
                            <div class="summary-label">Total Items</div>
                            <div class="summary-value">{total_items}</div>
                        </div>
                        <div class="summary-item">
                            <div class="summary-label">Below Minimum</div>
                            <div class="summary-value">{total_below_minimum}</div>
                        </div>
                        <div class="summary-item">
                            <div class="summary-label">Total Shortage</div>
                            <div class="summary-value">{total_shortage:.0f}</div>
                        </div>
                        <div class="summary-item">
                            <div class="summary-label">Cost to Replenish</div>
                            <div class="summary-value">${total_cost:.2f}</div>
                        </div>
                    </div>
                </div>
                <table class="matrix-vending-table" id="matrixVendingTable">
                    <thead>
                        <tr>
                            <th></th>
                            <th class="sortable" onclick="sortMatrixTable(1)">Item Description</th>
                            <th class="sortable" onclick="sortMatrixTable(2)">Item Code</th>
                            <th class="sortable group-start" onclick="sortMatrixTable(3)">Current Stock</th>
                            <th class="sortable" onclick="sortMatrixTable(4)">Shortage</th>
                            <th class="sortable group-start" onclick="sortMatrixTable(5)">Minimum</th>
                            <th class="sortable" onclick="sortMatrixTable(6)">Maximum</th>
                            <th class="sortable group-start" onclick="sortMatrixTable(7)">Unit Price</th>
                            <th class="sortable" onclick="sortMatrixTable(8)">Cost to Replenish</th>
                            <th class="sortable group-start" onclick="sortMatrixTable(9)">Avg Monthly Use</th>
                            <th class="sortable" onclick="sortMatrixTable(10)">Max Usage</th>
                        </tr>
                    </thead>
                    <tbody>
                        {table_rows_html}
                    </tbody>
                </table>
                {grid_html}
            </div>
"""
    
    return html_content


def generate_html_report(daily_rows, monthly_rows, output_html, default_type='daily', daily_submissions=None, monthly_submissions=None, daily_door_data=None, monthly_door_data=None, under_minimum_rows=None, matrix_vending_data=None):
    """Generate HTML report from both daily and monthly rows."""
    if daily_submissions is None:
        daily_submissions = []
    if monthly_submissions is None:
        monthly_submissions = []
    if under_minimum_rows is None:
        under_minimum_rows = []
    # Combine rows and mark with report type
    all_rows = []
    for row_data in daily_rows:
        row_data['report_type'] = 'daily'
        all_rows.append(row_data)
    for row_data in monthly_rows:
        row_data['report_type'] = 'monthly'
        all_rows.append(row_data)
    
    if not all_rows:
        print("No data to generate report")
        return
    
    # Calculate totals for each type
    daily_total = 0.0
    monthly_total = 0.0
    daily_has_value = False
    monthly_has_value = False
    
    for row_data in daily_rows:
        value_raw = row_data.get('Value', '').strip()
        _, numeric = currency_format(value_raw)
        if numeric is not None:
            daily_has_value = True
            daily_total += numeric
    
    for row_data in monthly_rows:
        value_raw = row_data.get('Value', '').strip()
        _, numeric = currency_format(value_raw)
        if numeric is not None:
            monthly_has_value = True
            monthly_total += numeric
    
    # Prepare rows for HTML
    rows_html = []
    row_values = []
    row_types = []
    
    for row_data in all_rows:
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
        row_types.append(row_data.get('report_type', 'daily'))
        
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
    
    # Get date ranges for subtitles
    daily_subtitle = ""
    monthly_subtitle = ""
    
    if daily_rows:
        # Get date from first daily row
        first_daily = daily_rows[0]
        daily_date = first_daily.get('Date', '')
        daily_subtitle = f"Date: {daily_date}"
    
    if monthly_rows:
        # Calculate date range for monthly
        dates = [row.get('Date', '') for row in monthly_rows if row.get('Date')]
        if dates:
            try:
                date_objs = [datetime.strptime(d, "%m/%d/%Y") for d in dates if d]
                if date_objs:
                    min_date = min(date_objs)
                    max_date = max(date_objs)
                    monthly_subtitle = f"Period: {min_date.strftime('%m/%d/%Y')} - {max_date.strftime('%m/%d/%Y')}"
            except:
                monthly_subtitle = "Last 30 Days"
    
    # Extract unique values for dropdown filters (from all rows)
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
            elif idx == 9:  # Work Order column
                if cell.strip() == "None Specified":
                    # Blank/empty work order - red highlight
                    cells.append(f'<td{data_attrs} class="wo-none-specified">{cell_text}</td>')
                elif re.match(r'^\d{2}-\d{4}$', cell.strip()):
                    # Valid format - create link
                    wo_url = f"https://est.adionsystems.com/procnc/workorders/{cell.strip()}"
                    cells.append(f'<td{data_attrs}><a href="{html.escape(wo_url)}" target="_blank">{cell_text}</a></td>')
                else:
                    # Invalid format but has content - bold and orange
                    cells.append(f'<td{data_attrs} class="wo-invalid-format">{cell_text}</td>')
            else:
                cells.append(f'<td{data_attrs}>{cell_text}</td>')
        # Add data-report-type attribute to each row
        report_type = row_types[row_idx]
        body_rows.append(f'<tr data-row-value="{row_values[row_idx] or 0}" data-report-type="{report_type}">{"".join(cells)}</tr>')
    
    # Calculate initial totals based on default type
    initial_daily_total = daily_total if daily_has_value else 0
    initial_monthly_total = monthly_total if monthly_has_value else 0
    
    # Set initial subtitle and total based on default type
    if default_type == 'daily':
        initial_subtitle = daily_subtitle if daily_subtitle else "Date: N/A"
        initial_total = initial_daily_total
        daily_count = len(daily_rows)
        initial_total_html = f'Total Value: ${initial_daily_total:,.2f} | Transactions Shown: {daily_count}' if daily_has_value else f'Total Value: $0.00 | Transactions Shown: {daily_count}'
    else:
        initial_subtitle = monthly_subtitle if monthly_subtitle else "Last 30 Days"
        initial_total = initial_monthly_total
        monthly_count = len(monthly_rows)
        initial_total_html = f'Total Value: ${initial_monthly_total:,.2f} | Transactions Shown: {monthly_count}' if monthly_has_value else f'Total Value: $0.00 | Transactions Shown: {monthly_count}'
    
    # Generate under minimum stock HTML (sub-section)
    under_minimum_inner = generate_under_minimum_html(under_minimum_rows, default_type) if under_minimum_rows else ""
    
    # Query and generate Matrix Vending grid
    matrix_grid = query_matrix_vending_grid()
    matrix_grid_html = generate_matrix_grid_html(matrix_grid) if matrix_grid else ""
    
    # Generate Matrix Vending HTML (sub-section)
    matrix_vending_inner = generate_matrix_vending_html(matrix_vending_data, default_type, matrix_grid_html) if matrix_vending_data is not None else ""
    
    # Combine into a single Stock Reports collapsible widget
    if under_minimum_inner or matrix_vending_inner:
        stock_reports_html = f"""
        <div class="stock-reports-section" data-report-type="daily" style="display: {'block' if default_type == 'daily' else 'none'};">
            <h2 class="section-toggle" onclick="toggleSection('stockReports')">
                <span id="stockReportsIcon">\u25B6</span> \U0001f4e6 Stock Reports
            </h2>
            <div id="stockReportsContent" style="display: none;">
                {under_minimum_inner}
                {matrix_vending_inner}
            </div>
        </div>
"""
    else:
        stock_reports_html = ""
    
    # Generate iPad submissions HTML
    ipad_submissions_html = generate_ipad_submissions_html(daily_submissions, monthly_submissions, default_type)
    
    # Generate door unlocks HTML
    door_unlocks_html = generate_door_unlocks_html(daily_door_data, monthly_door_data, default_type)
    
    html_content = f"""<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Tooling Inventory Report</title>
    <script src="https://cdn.jsdelivr.net/npm/chart.js@4.4.0/dist/chart.umd.min.js"></script>

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

        .report-type-selector {{
            position: absolute;
            top: 0;
            right: 200px;
            display: flex;
            flex-direction: column;
            gap: 5px;
            min-width: 150px;
        }}

        .report-type-selector label {{
            font-weight: bold;
            font-size: 14px;
            color: #333;
            transition: color 0.3s ease;
        }}

        body.dark-mode .report-type-selector label {{
            color: #e0e0e0;
        }}

        .report-type-selector select {{
            padding: 8px 12px;
            font-size: 14px;
            border: 1px solid #ccc;
            border-radius: 3px;
            background-color: white;
            color: #333;
            cursor: pointer;
            transition: all 0.3s ease;
        }}

        body.dark-mode .report-type-selector select {{
            border: 1px solid #555;
            background-color: #2d2d2d;
            color: #e0e0e0;
        }}

        .report-type-selector select:focus {{
            outline: none;
            border-color: #0066cc;
        }}

        body.dark-mode .report-type-selector select:focus {{
            border-color: #4a9eff;
            background-color: #353535;
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

        @media screen and (max-width: 768px) {{
            .print-button {{
                display: none;
            }}
            
            .control-button {{
                font-size: 18px;
            }}
        }}

        .title-section {{
            flex: 1;
        }}

        .section-toggle {{
            cursor: pointer;
            user-select: none;
            padding: 12px 20px;
            margin: 0;
            border-radius: 8px;
            background-color: #f0f4f8;
            border: 1px solid #d0d7de;
            transition: background-color 0.2s ease, border-color 0.2s ease;
            font-size: 22px;
            display: flex;
            align-items: center;
            gap: 10px;
        }}

        .section-toggle:hover {{
            background-color: #e1e7ed;
            border-color: #b0b8c0;
        }}

        body.dark-mode .section-toggle {{
            background-color: #2a2d35;
            border-color: #444;
            color: #e0e0e0;
        }}

        body.dark-mode .section-toggle:hover {{
            background-color: #353840;
            border-color: #666;
        }}

        .collapsible-section {{
            margin-top: 30px;
            padding-top: 20px;
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

        .wo-none-specified {{
            color: #dc3545;
            font-weight: bold;
            background-color: #ffe6e6;
        }}

        body.dark-mode .wo-none-specified {{
            color: #ff6b6b;
            background-color: #4a1f1f;
        }}

        .wo-invalid-format {{
            color: #ff6600;
            font-weight: bold;
            background-color: #fff4e6;
        }}

        body.dark-mode .wo-invalid-format {{
            color: #ff8800;
            background-color: #3a2a1a;
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

        body.dark-mode             .total {{
                background-color: #1e1e1e;
                border: 1px solid #444;
                color: #ffffff;
            }}

            .ipad-submissions-section {{
                margin-top: 30px;
                padding-top: 20px;
                border-top: 3px solid #ddd;
                transition: border-color 0.3s ease;
                page-break-before: always;
            }}

            body.dark-mode .ipad-submissions-section {{
                border-top-color: #555;
            }}

            .stock-reports-section {{
                margin-top: 30px;
                padding-top: 20px;
                border-top: 3px solid #ddd;
                transition: border-color 0.3s ease;
            }}

            body.dark-mode .stock-reports-section {{
                border-top-color: #555;
            }}

            .under-minimum-section {{
                padding: 20px;
                background-color: #fff9e6;
                border-radius: 8px;
                border: 2px solid #ffc107;
            }}

            body.dark-mode .under-minimum-section {{
                background-color: #3a2a1a;
                border-color: #ff9800;
            }}

            .under-minimum-section h3 {{
                font-size: 22px;
                margin-bottom: 15px;
                color: #856404;
                text-align: center;
            }}

            body.dark-mode .under-minimum-section h3 {{
                color: #ff9800;
            }}

            .under-minimum-stats {{
                font-size: 16px;
                color: #856404;
                font-weight: bold;
                text-align: center;
                margin-bottom: 15px;
            }}

            body.dark-mode .under-minimum-stats {{
                color: #ff9800;
            }}

            .under-minimum-table {{
                width: 100%;
                border-collapse: collapse;
                font-size: 14px;
                margin-top: 15px;
            }}

            .under-minimum-table th {{
                background-color: #fff3cd;
                font-weight: bold;
                padding: 10px;
                text-align: center;
                border: 1px solid #ffc107;
                color: #856404;
            }}

            .under-minimum-table th.sortable {{
                cursor: pointer;
                user-select: none;
                position: relative;
            }}

            .under-minimum-table th.sortable:hover {{
                background-color: #ffeaa7;
            }}

            body.dark-mode .under-minimum-table th.sortable:hover {{
                background-color: #4a3a2a;
            }}

            body.dark-mode .under-minimum-table th {{
                background-color: #3a2a1a;
                border-color: #ff9800;
                color: #ff9800;
            }}

            .under-minimum-table .sort-indicator {{
                margin-left: 5px;
                font-size: 12px;
                opacity: 0.7;
            }}

            .under-minimum-table .sort-indicator.active {{
                opacity: 1;
            }}

            .under-minimum-table td {{
                padding: 10px;
                border: 1px solid #ffc107;
                color: #333;
            }}

            body.dark-mode .under-minimum-table td {{
                border-color: #ff9800;
                color: #e0e0e0;
            }}

            .under-minimum-table tr:nth-child(even) {{
                background-color: #fffbf0;
            }}

            body.dark-mode .under-minimum-table tr:nth-child(even) {{
                background-color: #2a1a0a;
            }}

            .under-minimum-table tr:hover {{
                background-color: #ffeaa7;
            }}

            body.dark-mode .under-minimum-table tr:hover {{
                background-color: #4a3a2a;
            }}

            .under-minimum-negative {{
                color: #c62828;
                font-weight: bold;
                background-color: #ffebee;
            }}

            body.dark-mode .under-minimum-negative {{
                color: #ff6b6b;
                background-color: #4a1f1f;
            }}

            .under-minimum-total {{
                margin-top: 20px;
                font-size: 20px;
                font-weight: bold;
                text-align: center;
                padding: 15px;
                background-color: #f2f2f2;
                border: 2px solid #ffc107;
                border-radius: 5px;
                color: #333;
            }}

            body.dark-mode .under-minimum-total {{
                background-color: #1e1e1e;
                border: 2px solid #ff9800;
                color: #ffffff;
            }}

            .ipad-submissions-section h2 {{
                margin-bottom: 20px;
            }}

            .ipad-submissions-section h3 {{
                font-size: 20px;
                margin-bottom: 15px;
                color: #333;
                transition: color 0.3s ease;
            }}

            body.dark-mode .ipad-submissions-section h3 {{
                color: #e0e0e0;
            }}

            .submissions-summary {{
                display: flex;
                gap: 20px;
                margin-bottom: 30px;
                flex-wrap: wrap;
            }}

            .summary-card {{
                flex: 1;
                min-width: 300px;
                background-color: #f9f9f9;
                border: 2px solid #ddd;
                border-radius: 8px;
                padding: 20px;
                transition: all 0.3s ease;
            }}

            body.dark-mode .summary-card {{
                background-color: #3a3a3a;
                border-color: #555;
            }}

            .summary-stats {{
                display: flex;
                flex-direction: column;
                gap: 10px;
            }}

            .stat-box {{
                display: flex;
                justify-content: space-between;
                align-items: center;
                padding: 10px;
                background-color: white;
                border-radius: 5px;
                transition: background-color 0.3s ease;
            }}

            body.dark-mode .stat-box {{
                background-color: #2d2d2d;
            }}

            .stat-label {{
                font-weight: bold;
                color: #666;
                transition: color 0.3s ease;
            }}

            body.dark-mode .stat-label {{
                color: #b0b0b0;
            }}

            .stat-value {{
                font-size: 18px;
                font-weight: bold;
            }}

            .stat-value.accidental-vend {{
                color: #4a9eff;
            }}

            .stat-value.inventory-error {{
                color: #48d597;
            }}

            .stat-value.total {{
                color: #333;
                font-size: 20px;
            }}

            body.dark-mode .stat-value.total {{
                color: #ffffff;
            }}

            .submissions-details {{
                margin-top: 30px;
            }}

            .submissions-table {{
                width: 100%;
                border-collapse: collapse;
                font-size: 14px;
                margin-top: 15px;
            }}

            .submissions-table th {{
                background-color: #f2f2f2;
                font-weight: bold;
                padding: 10px;
                text-align: left;
                border: 1px solid #ddd;
                color: #333;
                transition: all 0.3s ease;
            }}

            body.dark-mode .submissions-table th {{
                background-color: #1e1e1e;
                border-color: #444;
                color: #ffffff;
            }}

            .submissions-table td {{
                padding: 10px;
                border: 1px solid #ddd;
                color: #333;
                transition: all 0.3s ease;
            }}

            body.dark-mode .submissions-table td {{
                border-color: #444;
                color: #e0e0e0;
            }}

            .submissions-table tr.type-accidental {{
                background-color: #e6f2ff;
            }}

            body.dark-mode .submissions-table tr.type-accidental {{
                background-color: #1a2a3a;
            }}

            .submissions-table tr.type-inventory {{
                background-color: #e6faf0;
            }}

            body.dark-mode .submissions-table tr.type-inventory {{
                background-color: #1a3a2a;
            }}

            .submissions-table tr:hover {{
                background-color: #d6e9ff;
            }}

            body.dark-mode .submissions-table tr:hover {{
                background-color: #404040;
            }}

            .submissions-table tr.total-row {{
                background-color: #f0f0f0;
                font-weight: bold;
                border-top: 2px solid #333;
            }}

            body.dark-mode .submissions-table tr.total-row {{
                background-color: #2a2a2a;
                border-top-color: #666;
            }}

            .door-unlocks-section {{
                margin-top: 30px;
                padding-top: 20px;
                border-top: 3px solid #ddd;
                transition: border-color 0.3s ease;
                page-break-before: always;
            }}

            body.dark-mode .door-unlocks-section {{
                border-top-color: #555;
            }}

            .matrix-vending-section {{
                padding: 20px;
                background-color: #f9f9f9;
                border-radius: 8px;
            }}

            body.dark-mode .matrix-vending-section {{
                background-color: #2a2a2a;
            }}

            .matrix-vending-section .data-row.below-minimum {{
                background: #ffe6e6;
            }}

            body.dark-mode .matrix-vending-section .data-row.below-minimum {{
                background: #4a2c2c;
            }}

            .matrix-vending-section .matrix-vending-table {{
                width: 100%;
                border-collapse: collapse;
                font-size: 14px;
            }}

            .matrix-vending-section .matrix-vending-table th,
            .matrix-vending-section .matrix-vending-table td {{
                padding: 8px 12px;
                border: 1px solid #ddd;
                text-align: left;
            }}

            .matrix-vending-section .matrix-vending-table th {{
                background-color: #f2f2f2;
                font-weight: bold;
            }}

            body.dark-mode .matrix-vending-section .matrix-vending-table th {{
                background-color: #4a4a4a;
            }}

            body.dark-mode .matrix-vending-section .matrix-vending-table td {{
                border-color: #555;
            }}

            .matrix-vending-section .matrix-vending-table th.group-start,
            .matrix-vending-section .matrix-vending-table td.group-start {{
                border-left: 3px solid #999;
            }}

            body.dark-mode .matrix-vending-section .matrix-vending-table th.group-start,
            body.dark-mode .matrix-vending-section .matrix-vending-table td.group-start {{
                border-left-color: #777;
            }}

            .matrix-vending-section .matrix-vending-table th.sortable {{
                cursor: pointer;
            }}

            .matrix-vending-section .matrix-vending-table th.sortable:hover {{
                background-color: #e0e0e0;
            }}

            body.dark-mode .matrix-vending-section .matrix-vending-table th.sortable:hover {{
                background-color: #555;
            }}

            .matrix-vending-section .data-row:hover {{
                background-color: #f0f0f0;
            }}

            body.dark-mode .matrix-vending-section .data-row:hover {{
                background-color: #3a3a3a;
            }}

            .matrix-vending-section .expand-icon {{
                cursor: pointer;
                font-size: 12px;
                color: #666;
                user-select: none;
                display: inline-block;
                width: 20px;
                text-align: center;
            }}

            body.dark-mode .matrix-vending-section .expand-icon {{
                color: #aaa;
            }}

            .matrix-vending-section .transaction-row {{
                background: #fafafa;
            }}

            body.dark-mode .matrix-vending-section .transaction-row {{
                background: #2a2a2a;
            }}

            .matrix-vending-section .transaction-cell {{
                padding: 15px 20px;
            }}

            .matrix-vending-section .chart-section {{
                margin-bottom: 20px;
                height: 300px;
            }}

            .matrix-vending-section .chart-section h4 {{
                text-align: center;
                margin-bottom: 10px;
                color: #333;
            }}

            body.dark-mode .matrix-vending-section .chart-section h4 {{
                color: #ddd;
            }}

            .matrix-vending-section .summary {{
                background: #ecf0f1;
                padding: 15px;
                border-radius: 5px;
            }}

            body.dark-mode .matrix-vending-section .summary {{
                background: #3a3a3a;
            }}

            .matrix-vending-section .summary-grid {{
                display: grid;
                grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
                gap: 15px;
            }}

            .matrix-vending-section .summary-label {{
                font-size: 0.9em;
                color: #7f8c8d;
                margin-bottom: 5px;
            }}

            body.dark-mode .matrix-vending-section .summary-label {{
                color: #b0b0b0;
            }}

            .matrix-vending-section .summary-value {{
                font-size: 1.5em;
                font-weight: bold;
                color: #2c3e50;
            }}

            body.dark-mode .matrix-vending-section .summary-value {{
                color: #e0e0e0;
            }}

            /* Matrix Vending Stock Grid */
            .mv-grid-container {{
                background: #fff;
                border-radius: 8px;
                padding: 20px;
                border: 1px solid #ddd;
            }}

            body.dark-mode .mv-grid-container {{
                background: #2a2a2a;
                border-color: #555;
            }}

            .mv-grid-header {{
                display: grid;
                grid-template-columns: 60px repeat(10, 1fr);
                gap: 4px;
                margin-bottom: 4px;
            }}

            .mv-grid-header-cell {{
                text-align: center;
                font-weight: bold;
                color: #495057;
                font-size: 11px;
                padding: 4px;
            }}

            body.dark-mode .mv-grid-header-cell {{
                color: #bbb;
            }}

            .mv-grid {{
                display: grid;
                grid-template-columns: 60px repeat(10, 1fr);
                gap: 4px;
            }}

            .mv-row-label {{
                display: flex;
                align-items: center;
                justify-content: center;
                font-weight: bold;
                color: #495057;
                background: #f8f9fa;
                border: 1px solid #dee2e6;
                border-radius: 4px;
                font-size: 12px;
            }}

            body.dark-mode .mv-row-label {{
                color: #bbb;
                background: #333;
                border-color: #555;
            }}

            .mv-pocket {{
                aspect-ratio: 1;
                border: 2px solid #dee2e6;
                border-radius: 4px;
                padding: 4px;
                background: white;
                display: flex;
                flex-direction: column;
                justify-content: space-between;
                min-height: 80px;
                transition: transform 0.15s, box-shadow 0.15s;
            }}

            .mv-pocket:hover {{
                transform: scale(1.08);
                box-shadow: 0 3px 10px rgba(0,0,0,0.15);
                z-index: 10;
                position: relative;
            }}

            body.dark-mode .mv-pocket {{
                background: #333;
                border-color: #555;
            }}

            .mv-pocket.mv-empty {{
                background: #f8f9fa;
                border-color: #e9ecef;
            }}

            body.dark-mode .mv-pocket.mv-empty {{
                background: #2a2a2a;
                border-color: #444;
            }}

            .mv-pocket.mv-has-stock {{
                background: #e7f5e7;
                border-color: #28a745;
            }}

            body.dark-mode .mv-pocket.mv-has-stock {{
                background: #1e3a1e;
                border-color: #28a745;
            }}

            .mv-pocket.mv-low-stock {{
                background: #fff3cd;
                border-color: #ffc107;
            }}

            body.dark-mode .mv-pocket.mv-low-stock {{
                background: #3a351a;
                border-color: #ffc107;
            }}

            .mv-pocket.mv-below-minimum {{
                background: #f8d7da;
                border-color: #dc3545;
                border-width: 3px;
            }}

            body.dark-mode .mv-pocket.mv-below-minimum {{
                background: #3a1e1e;
                border-color: #dc3545;
            }}

            .mv-pocket.mv-no-stock {{
                background: #f8d7da;
                border-color: #dc3545;
            }}

            body.dark-mode .mv-pocket.mv-no-stock {{
                background: #3a1e1e;
                border-color: #dc3545;
            }}

            .mv-pocket-code {{
                font-size: 8px;
                color: #6c757d;
                text-align: right;
            }}

            body.dark-mode .mv-pocket-code {{
                color: #999;
            }}

            .mv-pocket-item {{
                font-size: 9px;
                font-weight: 600;
                color: #212529;
                word-break: break-word;
                line-height: 1.2;
                flex-grow: 1;
                overflow: hidden;
            }}

            body.dark-mode .mv-pocket-item {{
                color: #ddd;
            }}

            .mv-pocket-qty {{
                font-size: 16px;
                font-weight: bold;
                color: #495057;
                text-align: center;
            }}

            body.dark-mode .mv-pocket-qty {{
                color: #ddd;
            }}

            .mv-pocket-qty.mv-zero {{
                color: #dc3545;
            }}

            .mv-pocket-min {{
                font-size: 8px;
                color: #6c757d;
                text-align: center;
            }}

            body.dark-mode .mv-pocket-min {{
                color: #999;
            }}

            .door-unlocks-details {{
                margin-top: 30px;
            }}

            .door-stats {{
                font-size: 14px;
                color: #666;
                margin-bottom: 10px;
            }}

            body.dark-mode .door-stats {{
                color: #aaa;
            }}

            .door-unlocks-table {{
                width: 100%;
                border-collapse: collapse;
                font-size: 14px;
                margin-top: 15px;
            }}

            .door-unlocks-table th {{
                background-color: #f2f2f2;
                font-weight: bold;
                padding: 10px;
                text-align: left;
                border: 1px solid #ddd;
                color: #333;
            }}

            body.dark-mode .door-unlocks-table th {{
                background-color: #1e1e1e;
                border-color: #444;
                color: #ffffff;
            }}

            .door-unlocks-table td {{
                padding: 10px;
                border: 1px solid #ddd;
                color: #333;
            }}

            body.dark-mode .door-unlocks-table td {{
                border-color: #444;
                color: #e0e0e0;
            }}

            .door-unlocks-table tr.door-complete {{
                background-color: #e6faf0;
            }}

            body.dark-mode .door-unlocks-table tr.door-complete {{
                background-color: #1a3a2a;
            }}

            .door-unlocks-table tr.door-entry-only {{
                background-color: #e6f2ff;
            }}

            body.dark-mode .door-unlocks-table tr.door-entry-only {{
                background-color: #1a2a3a;
            }}

            .door-unlocks-table tr.door-exit-only {{
                background-color: #fff4e6;
            }}

            body.dark-mode .door-unlocks-table tr.door-exit-only {{
                background-color: #3a2a1a;
            }}

            .door-unlocks-table tr:hover {{
                background-color: #d6e9ff;
            }}

            body.dark-mode .door-unlocks-table tr:hover {{
                background-color: #404040;
            }}

            .entry-exit-badge {{
                display: inline-block;
                padding: 4px 10px;
                border-radius: 4px;
                font-size: 12px;
                font-weight: bold;
            }}

            .entry-exit-badge.door-entry {{
                background-color: #4a9eff;
                color: white;
            }}

            .entry-exit-badge.door-exit {{
                background-color: #ff9800;
                color: white;
            }}

            .type-badge {{
                display: inline-block;
                padding: 4px 10px;
                border-radius: 4px;
                font-size: 12px;
                font-weight: bold;
                text-transform: uppercase;
            }}

            .type-badge.type-accidental {{
                background-color: #4a9eff;
                color: white;
            }}

            .type-badge.type-inventory {{
                background-color: #48d597;
                color: white;
            }}

            .addressed-yes {{
                color: #28a745;
                font-weight: bold;
            }}

            body.dark-mode .addressed-yes {{
                color: #48d597;
            }}

            .addressed-no {{
                color: #dc3545;
                font-weight: bold;
            }}

            body.dark-mode .addressed-no {{
                color: #ff6b6b;
            }}

            @media screen and (max-width: 768px) {{
                .submissions-summary {{
                    flex-direction: column;
                }}

                .summary-card {{
                    min-width: 100%;
                }}

                .submissions-table {{
                    font-size: 12px;
                }}

                .submissions-table th,
                .submissions-table td {{
                    padding: 6px;
                }}
            }}

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

            .report-type-selector {{
                position: static;
                width: 100%;
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
                font-size: 16px;
                padding: 10px;
            }}

            .table-wrapper {{
                overflow-x: auto;
                -webkit-overflow-scrolling: touch;
            }}

            table {{
                font-size: 12px;
                min-width: 800px;
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

            /* Expand all collapsible sections when printing */
            .section-toggle {{
                background-color: transparent !important;
                border: none !important;
                padding: 5px 0 !important;
            }}

            #transactionLogContent,
            #stockReportsContent,
            #ipadSubmissionsContent,
            #doorSectionContent,
            #matrixGridContent {{
                display: block !important;
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

            .report-type-selector {{
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

            td.wo-none-specified {{
                color: #000 !important;
                background-color: #ffe6e6 !important;
                font-weight: bold !important;
            }}

            td.wo-invalid-format {{
                color: #000 !important;
                background-color: #fff4e6 !important;
                font-weight: bold !important;
            }}

            tr:nth-child(even) td {{
                background-color: #f5f5f5 !important;
            }}

            tr:nth-child(even) td.wo-none-specified {{
                background-color: #ffe6e6 !important;
            }}

            td.wo-invalid-format {{
                color: #000 !important;
                background-color: #fff4e6 !important;
                font-weight: bold !important;
            }}

            tr:nth-child(even) td.wo-invalid-format {{
                background-color: #fff4e6 !important;
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

            .under-minimum-total {{
                background-color: #e0e0e0 !important;
                color: #000 !important;
                border: 1px solid #000 !important;
                font-size: 12pt !important;
                padding: 10px !important;
                page-break-inside: avoid !important;
            }}

            .control-button {{
                display: none !important;
            }}

            .stock-reports-section {{
                page-break-before: always !important;
            }}

            .under-minimum-section {{
                page-break-inside: avoid !important;
            }}

            .matrix-vending-section {{
                page-break-before: always !important;
            }}

            .ipad-submissions-section {{
                page-break-before: always !important;
            }}

            .door-unlocks-section {{
                page-break-before: always !important;
            }}

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
            <div class="title-section">
                <h1>Tooling Inventory Report</h1>
                <div class="subtitle" id="subtitle">{html.escape(initial_subtitle)}</div>
            </div>
            <div class="report-type-selector">
                <label for="reportType">Report Type:</label>
                <select id="reportType" onchange="changeReportType()">
                    <option value="daily" {"selected" if default_type == "daily" else ""}>Daily History</option>
                    <option value="monthly" {"selected" if default_type == "monthly" else ""}>Monthly History</option>
                </select>
            </div>
            <div class="header-controls">
                <button class="control-button" id="darkModeToggle" onclick="toggleDarkMode()" title="Toggle Dark Mode">🌙</button>
                <button class="control-button" onclick="exportToCSV()" title="Export Transactions to CSV">📥</button>
                <button class="control-button print-button" onclick="window.print()" title="Print Report">🖨️</button>
            </div>
        </div>

        <div class="collapsible-section">
            <h2 class="section-toggle" onclick="toggleSection('transactionLog')">
                <span id="transactionLogIcon">\u25BC</span> Transaction Log
            </h2>
            <div id="transactionLogContent" style="display: block;">
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
            </div>
        </div>
        
        {stock_reports_html}
        
        {ipad_submissions_html}
        
        {door_unlocks_html}
        
        <script>
            const DAILY_TOTAL = {initial_daily_total};
            const MONTHLY_TOTAL = {initial_monthly_total};
            const CURRENT_REPORT_TYPE = '{default_type}';
            const DAILY_SUBTITLE = {repr(daily_subtitle)};
            const MONTHLY_SUBTITLE = {repr(monthly_subtitle)};
            const DAILY_COUNT = {len(daily_rows)};
            const MONTHLY_COUNT = {len(monthly_rows)};
        </script>
    </div>

    <script>
        function changeReportType() {{
            const select = document.getElementById('reportType');
            const newType = select.value;
            const table = document.getElementById('dataTable');
            const rows = table.querySelectorAll('tbody tr');
            const subtitle = document.getElementById('subtitle');
            const totalDiv = document.getElementById('totalValue');
            
            // Reset all rows - show matching report type, hide others
            rows.forEach(row => {{
                const rowType = row.getAttribute('data-report-type');
                if (rowType === newType) {{
                    // Show row - filters will be applied next
                    row.style.display = '';
                    row.classList.remove('filtered-out');
                }} else {{
                    // Hide rows that don't match the report type
                    row.style.display = 'none';
                    row.classList.remove('filtered-out');
                }}
            }});
            
            // Update subtitle
            if (newType === 'daily') {{
                subtitle.textContent = DAILY_SUBTITLE || 'Date: N/A';
            }} else {{
                subtitle.textContent = MONTHLY_SUBTITLE || 'Last 30 Days';
            }}
            
            // Show/hide iPad submissions sections based on report type
            // All iPad submission tables have data-report-type attributes
            document.querySelectorAll('.submissions-details[data-report-type]').forEach(element => {{
                const elementType = element.getAttribute('data-report-type');
                element.style.display = elementType === newType ? 'block' : 'none';
            }});
            
            // Show/hide door unlocks sections based on report type
            document.querySelectorAll('.door-unlocks-details[data-report-type]').forEach(element => {{
                const elementType = element.getAttribute('data-report-type');
                element.style.display = elementType === newType ? 'block' : 'none';
            }});
            
            // Show/hide stock reports section (only show for daily)
            document.querySelectorAll('.stock-reports-section[data-report-type]').forEach(element => {{
                const elementType = element.getAttribute('data-report-type');
                element.style.display = elementType === newType ? 'block' : 'none';
            }});
            
            // Reapply filters to update visible count and totals
            // This will show/hide rows based on both report type and filters
            applyFilters();
        }}

        // CSV Export Function
        function exportToCSV() {{
            const table = document.getElementById('dataTable');
            const rows = table.querySelectorAll('tbody tr');
            const reportType = document.getElementById('reportType').value;
            const subtitle = document.getElementById('subtitle').textContent;
            
            // Get headers
            const headers = [];
            table.querySelectorAll('thead th').forEach(th => {{
                const headerText = th.textContent.replace(' ⇅', '').trim();
                headers.push(headerText);
            }});
            
            // Get visible rows (matching report type and not filtered out)
            const visibleRows = [];
            rows.forEach(row => {{
                const rowType = row.getAttribute('data-report-type');
                const isVisible = row.style.display !== 'none' && !row.classList.contains('filtered-out');
                
                if (rowType === reportType && isVisible) {{
                    const cells = row.querySelectorAll('td');
                    const rowData = [];
                    cells.forEach(cell => {{
                        // Get text content, handling links
                        let cellText = cell.textContent.trim();
                        // If cell contains a link, use the link text
                        const link = cell.querySelector('a');
                        if (link) {{
                            cellText = link.textContent.trim();
                        }}
                        // Escape quotes and wrap in quotes if contains comma, quote, or newline
                        if (cellText.includes(',') || cellText.includes('"') || cellText.includes('\\n')) {{
                            cellText = '"' + cellText.replace(/"/g, '""') + '"';
                        }}
                        rowData.push(cellText);
                    }});
                    visibleRows.push(rowData);
                }}
            }});
            
            // Build CSV content
            let csvContent = 'Crib Report\\n';
            csvContent += subtitle + '\\n';
            csvContent += 'Report Type: ' + (reportType === 'daily' ? 'Daily History' : 'Monthly History') + '\\n';
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
            const typeStr = reportType === 'daily' ? 'daily' : 'monthly';
            link.setAttribute('download', `master_transaction_report_${{typeStr}}_${{dateStr}}.csv`);
            
            link.style.visibility = 'hidden';
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);
        }}

        // Sort Under Minimum Stock Table by C-ID (numerical sorting)
        let umSortColumn = -1;
        let umSortDirection = 1; // 1 = ascending, -1 = descending

        function sortUnderMinimumTable(columnIndex) {{
            const table = document.getElementById('underMinimumTable');
            if (!table) return;
            
            const tbody = table.querySelector('tbody');
            const rows = Array.from(tbody.querySelectorAll('tr'));
            
            // Toggle direction if clicking the same column
            if (umSortColumn === columnIndex) {{
                umSortDirection *= -1;
            }} else {{
                umSortColumn = columnIndex;
                umSortDirection = 1; // Start with ascending
            }}
            
            // Sort rows
            rows.sort((a, b) => {{
                const aText = a.cells[columnIndex].textContent.trim();
                const bText = b.cells[columnIndex].textContent.trim();
                
                // For C-ID column (column 0), extract numeric part for proper numerical sorting
                if (columnIndex === 0) {{
                    // Extract number from C-ID format (e.g., "C-1" -> 1, "C-104" -> 104)
                    const aMatch = aText.match(/^C-(\\d+)$/i);
                    const bMatch = bText.match(/^C-(\\d+)$/i);
                    
                    if (aMatch && bMatch) {{
                        const aNum = parseInt(aMatch[1], 10);
                        const bNum = parseInt(bMatch[1], 10);
                        if (!isNaN(aNum) && !isNaN(bNum)) {{
                            return (aNum - bNum) * umSortDirection;
                        }}
                    }}
                    // If regex doesn't match, fall through to string comparison
                }}
                
                // Fallback to string comparison for other columns or non-matching C-ID format
                return aText.localeCompare(bText) * umSortDirection;
            }});
            
            // Re-append sorted rows
            rows.forEach(row => tbody.appendChild(row));
            
            // Update sort indicator
            const indicator = document.getElementById('um-sort-0');
            if (indicator) {{
                if (umSortColumn === 0) {{
                    indicator.textContent = umSortDirection === 1 ? ' ↑' : ' ↓';
                    indicator.classList.add('active');
                }} else {{
                    indicator.textContent = ' ⇅';
                    indicator.classList.remove('active');
                }}
            }}
        }}
        
        // Sort by C-ID ascending by default when page loads
        document.addEventListener('DOMContentLoaded', function() {{
            // Small delay to ensure table is rendered
            setTimeout(function() {{
                const table = document.getElementById('underMinimumTable');
                if (table && table.querySelector('tbody tr')) {{
                    sortUnderMinimumTable(0); // Sort by C-ID column on load
                }}
            }}, 100);
        }});

        // Export Under Minimum Stock to CSV
        function exportUnderMinimumToCSV() {{
            const section = document.querySelector('.under-minimum-section');
            if (!section) return;
            
            const table = section.querySelector('.under-minimum-table');
            if (!table) return;
            
            const headers = [];
            table.querySelectorAll('thead th').forEach(th => {{
                // Remove sort indicator from header text for CSV export
                let headerText = th.textContent.trim();
                headerText = headerText.replace(/[⇅↑↓]/g, '').trim();
                headers.push(headerText);
            }});
            
            const rows = [];
            table.querySelectorAll('tbody tr').forEach(tr => {{
                const rowData = [];
                tr.querySelectorAll('td').forEach(td => {{
                    let cellText = td.textContent.trim();
                    if (cellText.includes(',') || cellText.includes('"') || cellText.includes('\\n')) {{
                        cellText = '"' + cellText.replace(/"/g, '""') + '"';
                    }}
                    rowData.push(cellText);
                }});
                rows.push(rowData);
            }});
            
            let csvContent = 'Under Minimum Stock Report\\n';
            csvContent += 'Generated: ' + new Date().toLocaleString() + '\\n';
            csvContent += '\\n';
            csvContent += headers.join(',') + '\\n';
            rows.forEach(row => {{
                csvContent += row.join(',') + '\\n';
            }});
            
            const blob = new Blob([csvContent], {{ type: 'text/csv;charset=utf-8;' }});
            const link = document.createElement('a');
            const url = URL.createObjectURL(blob);
            link.setAttribute('href', url);
            const dateStr = new Date().toISOString().split('T')[0];
            link.setAttribute('download', `under_minimum_stock_${{dateStr}}.csv`);
            link.style.visibility = 'hidden';
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);
        }}

        // Email Under Minimum Stock List
        function emailUnderMinimum() {{
            // Email signature - customize with your details
            // To get your signature: Outlook > File > Options > Mail > Signatures
            const emailSignature = '\\n\\nBest regards,\\n\\n' +
                'Your Name\\n' +
                'Your Title\\n' +
                'Company Name\\n' +
                'Phone: (XXX) XXX-XXXX\\n' +
                'Email: your.email@company.com';
            
            const section = document.querySelector('.under-minimum-section');
            if (!section) return;
            
            const table = section.querySelector('.under-minimum-table');
            if (!table) return;
            
            // Get all headers and find indices for relevant columns
            const headers = [];
            let descIndex = -1;
            let partNoIndex = -1;
            let toMaxIndex = -1;
            let priceIndex = -1;
            
            table.querySelectorAll('thead th').forEach((th, idx) => {{
                const headerText = th.textContent.trim();
                headers.push(headerText);
                if (headerText === 'Description') descIndex = idx;
                if (headerText === 'Part No') partNoIndex = idx;
                if (headerText === 'To Max') toMaxIndex = idx;
                if (headerText === 'Price to Fill') priceIndex = idx;
            }});
            
            if (descIndex === -1 || toMaxIndex === -1) {{
                alert('Required columns not found');
                return;
            }}
            
            // Get all row data
            const rows = [];
            table.querySelectorAll('tbody tr').forEach(tr => {{
                const cells = tr.querySelectorAll('td');
                const maxIndex = Math.max(descIndex, toMaxIndex, partNoIndex >= 0 ? partNoIndex : -1, priceIndex >= 0 ? priceIndex : -1);
                if (cells.length > maxIndex) {{
                    const rowData = {{
                        description: cells[descIndex].textContent.trim(),
                        quantity: cells[toMaxIndex].textContent.trim()
                    }};
                    if (partNoIndex >= 0) {{
                        rowData.partNo = cells[partNoIndex].textContent.trim();
                    }}
                    if (priceIndex >= 0) {{
                        rowData.price = cells[priceIndex].textContent.trim();
                    }}
                    rows.push(rowData);
                }}
            }});
            
            if (rows.length === 0) {{
                alert('No data to email');
                return;
            }}
            
            // Format date as MM/DD/YYYY
            const today = new Date();
            const month = String(today.getMonth() + 1).padStart(2, '0');
            const day = String(today.getDate()).padStart(2, '0');
            const year = today.getFullYear();
            const dateStr = month + '/' + day + '/' + year;
            
            // Create formatted email body with table
            let emailBody = 'Jeff,\\n\\n';
            emailBody += 'Please quote the below items to replenish our vending system.\\n\\n';
            
            // Create formatted table with better spacing between fields
            rows.forEach((row, index) => {{
                const num = (index + 1) + '.';
                const desc = row.description || '';
                const qty = row.quantity || '';
                
                if (partNoIndex >= 0 && row.partNo) {{
                    // Include Part No with better spacing - use multiple spaces for clear separation
                    emailBody += num + '    ' + desc + '        Part No: ' + row.partNo + '        Qty: ' + qty + '\\n';
                }} else {{
                    // Simple format without Part No
                    emailBody += num + '    ' + desc + '        Qty: ' + qty + '\\n';
                }}
            }});
            
            // Add email signature
            emailBody += emailSignature;
            
            // Prepare email parameters
            const toEncoded = encodeURIComponent('jeff.spencer@wulco.com');
            const subjectEncoded = encodeURIComponent('Vending Replenishment RFQ - ' + dateStr);
            const bodyEncoded = encodeURIComponent(emailBody);
            
            // Open email client with formatted data in body
            window.location.href = 'mailto:' + toEncoded + '?subject=' + subjectEncoded + '&body=' + bodyEncoded;
        }}

        // Export iPad Submissions to CSV
        function exportSubmissionsToCSV(tableId, title) {{
            const table = document.getElementById(tableId);
            if (!table) return;
            
            const headers = [];
            table.querySelectorAll('thead th').forEach(th => {{
                headers.push(th.textContent.trim());
            }});
            
            const rows = [];
            table.querySelectorAll('tbody tr').forEach(tr => {{
                const rowData = [];
                tr.querySelectorAll('td').forEach(td => {{
                    let cellText = td.textContent.trim();
                    if (cellText.includes(',') || cellText.includes('"') || cellText.includes('\\n')) {{
                        cellText = '"' + cellText.replace(/"/g, '""') + '"';
                    }}
                    rowData.push(cellText);
                }});
                rows.push(rowData);
            }});
            
            let csvContent = 'iPad Kiosk Form Submissions - ' + title + '\\n';
            csvContent += 'Generated: ' + new Date().toLocaleString() + '\\n';
            csvContent += '\\n';
            csvContent += headers.join(',') + '\\n';
            rows.forEach(row => {{
                csvContent += row.join(',') + '\\n';
            }});
            
            const blob = new Blob([csvContent], {{ type: 'text/csv;charset=utf-8;' }});
            const link = document.createElement('a');
            const url = URL.createObjectURL(blob);
            link.setAttribute('href', url);
            const dateStr = new Date().toISOString().split('T')[0];
            const safeTitle = title.replace(/[^a-z0-9]/gi, '_').toLowerCase();
            link.setAttribute('download', `ipad_submissions_${{safeTitle}}_${{dateStr}}.csv`);
            link.style.visibility = 'hidden';
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);
        }}

        // Export Door Unlocks to CSV
        function exportDoorUnlocksToCSV(tableId, title) {{
            const table = document.getElementById(tableId);
            if (!table) return;
            
            const headers = [];
            table.querySelectorAll('thead th').forEach(th => {{
                headers.push(th.textContent.trim());
            }});
            
            const rows = [];
            table.querySelectorAll('tbody tr').forEach(tr => {{
                const rowData = [];
                tr.querySelectorAll('td').forEach(td => {{
                    let cellText = td.textContent.trim();
                    if (cellText.includes(',') || cellText.includes('"') || cellText.includes('\\n')) {{
                        cellText = '"' + cellText.replace(/"/g, '""') + '"';
                    }}
                    rowData.push(cellText);
                }});
                rows.push(rowData);
            }});
            
            let csvContent = 'Door Access Logs - ' + title + '\\n';
            csvContent += 'Generated: ' + new Date().toLocaleString() + '\\n';
            csvContent += '\\n';
            csvContent += headers.join(',') + '\\n';
            rows.forEach(row => {{
                csvContent += row.join(',') + '\\n';
            }});
            
            const blob = new Blob([csvContent], {{ type: 'text/csv;charset=utf-8;' }});
            const link = document.createElement('a');
            const url = URL.createObjectURL(blob);
            link.setAttribute('href', url);
            const dateStr = new Date().toISOString().split('T')[0];
            const safeTitle = title.replace(/[^a-z0-9]/gi, '_').toLowerCase();
            link.setAttribute('download', `door_unlocks_${{safeTitle}}_${{dateStr}}.csv`);
            link.style.visibility = 'hidden';
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);
        }}

        // Generic Section Toggle
        function toggleSection(sectionId) {{
            const content = document.getElementById(sectionId + 'Content');
            const icon = document.getElementById(sectionId + 'Icon');
            if (content.style.display === 'none') {{
                content.style.display = 'block';
                icon.textContent = '\u25BC';
            }} else {{
                content.style.display = 'none';
                icon.textContent = '\u25B6';
            }}
        }}

        // Matrix Vending Functions
        function toggleMatrixTransactions(rowId) {{
            const txRow = document.getElementById(rowId);
            const icon = document.getElementById(rowId + '_icon');
            if (!txRow || !icon) return;
            
            if (txRow.style.display === 'none') {{
                txRow.style.display = 'table-row';
                icon.textContent = '\u25BC';
                
                // Create chart if not already created
                const canvas = document.getElementById(rowId + '_chart');
                if (canvas && !canvas.chartInstance) {{
                    const labels = JSON.parse(canvas.dataset.labels || '[]');
                    const values = JSON.parse(canvas.dataset.values || '[]');
                    
                    if (labels.length > 0) {{
                        canvas.chartInstance = new Chart(canvas, {{
                            type: 'line',
                            data: {{
                                labels: labels,
                                datasets: [{{
                                    label: 'Monthly Usage',
                                    data: values,
                                    borderColor: '#2196F3',
                                    backgroundColor: 'rgba(33, 150, 243, 0.1)',
                                    fill: true,
                                    tension: 0.4,
                                    pointRadius: 4,
                                    pointHoverRadius: 6,
                                    pointBackgroundColor: '#2196F3',
                                    pointBorderColor: '#fff',
                                    pointBorderWidth: 2
                                }}]
                            }},
                            options: {{
                                responsive: true,
                                maintainAspectRatio: false,
                                plugins: {{
                                    legend: {{ display: false }},
                                    tooltip: {{
                                        backgroundColor: 'rgba(0,0,0,0.8)',
                                        titleColor: '#fff',
                                        bodyColor: '#fff',
                                        cornerRadius: 8,
                                        padding: 10
                                    }}
                                }},
                                scales: {{
                                    y: {{
                                        beginAtZero: true,
                                        title: {{ display: true, text: 'Quantity' }},
                                        grid: {{ color: 'rgba(0,0,0,0.05)' }}
                                    }},
                                    x: {{
                                        title: {{ display: true, text: 'Month' }},
                                        grid: {{ display: false }}
                                    }}
                                }}
                            }}
                        }});
                    }}
                }}
            }} else {{
                txRow.style.display = 'none';
                icon.textContent = '\u25B6';
            }}
        }}
        
        function sortMatrixTable(columnIndex) {{
            const table = document.getElementById('matrixVendingTable');
            if (!table) return;
            
            const tbody = table.querySelector('tbody');
            const rows = Array.from(tbody.querySelectorAll('.data-row'));
            
            const header = table.querySelectorAll('th')[columnIndex];
            const isAscending = !header.classList.contains('sort-asc');
            
            table.querySelectorAll('th').forEach(th => {{
                th.classList.remove('sort-asc', 'sort-desc');
            }});
            
            header.classList.add(isAscending ? 'sort-asc' : 'sort-desc');
            
            rows.sort((a, b) => {{
                const aCell = a.cells[columnIndex];
                const bCell = b.cells[columnIndex];
                const aText = aCell.textContent.trim();
                const bText = bCell.textContent.trim();
                
                const aNum = parseFloat(aText.replace(/[^0-9.-]/g, ''));
                const bNum = parseFloat(bText.replace(/[^0-9.-]/g, ''));
                
                if (!isNaN(aNum) && !isNaN(bNum)) {{
                    return isAscending ? aNum - bNum : bNum - aNum;
                }}
                
                return isAscending ? aText.localeCompare(bText) : bText.localeCompare(aText);
            }});
            
            rows.forEach(row => {{
                tbody.appendChild(row);
                // Also move the transaction/chart row with it
                const txRow = row.nextElementSibling;
                if (txRow && txRow.classList.contains('transaction-row')) {{
                    tbody.appendChild(txRow);
                }}
            }});
        }}

        function exportMatrixVendingToCSV() {{
            const table = document.getElementById('matrixVendingTable');
            if (!table) return;
            
            const headers = [];
            table.querySelectorAll('thead th').forEach(th => {{
                const text = th.textContent.trim();
                if (text) headers.push(text);
            }});
            
            const rows = [];
            table.querySelectorAll('tbody .data-row').forEach(tr => {{
                const rowData = [];
                tr.querySelectorAll('td').forEach((td, idx) => {{
                    if (idx === 0) return; // Skip expand icon column
                    let cellText = td.textContent.trim();
                    if (cellText.includes(',') || cellText.includes('"') || cellText.includes('\\n')) {{
                        cellText = '"' + cellText.replace(/"/g, '""') + '"';
                    }}
                    rowData.push(cellText);
                }});
                rows.push(rowData);
            }});
            
            // Adjust headers to match data (remove first empty header)
            const adjustedHeaders = headers.slice(1);
            
            let csvContent = 'Matrix Vending Transaction Report\\n';
            csvContent += 'Generated: ' + new Date().toLocaleString() + '\\n';
            csvContent += '\\n';
            csvContent += adjustedHeaders.join(',') + '\\n';
            rows.forEach(row => {{
                csvContent += row.join(',') + '\\n';
            }});
            
            const blob = new Blob([csvContent], {{ type: 'text/csv;charset=utf-8;' }});
            const link = document.createElement('a');
            const url = URL.createObjectURL(blob);
            link.setAttribute('href', url);
            const dateStr = new Date().toISOString().split('T')[0];
            link.setAttribute('download', `matrix_vending_report_${{dateStr}}.csv`);
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

            // Only select rows from the main dataTable, not iPad submission tables
            const mainTable = document.getElementById('dataTable');
            const allTableRows = mainTable ? mainTable.querySelectorAll('tbody tr') : [];
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
            
            // Initialize: show only rows matching default report type
            // Only process rows from the main dataTable (iPad submission rows don't have data-report-type)
            const defaultType = CURRENT_REPORT_TYPE;
            allTableRows.forEach(row => {{
                const rowType = row.getAttribute('data-report-type');
                // Only hide/show rows that have a data-report-type attribute (main table rows)
                // iPad submission rows don't have this attribute and should always be visible
                if (rowType !== null) {{
                    if (rowType !== defaultType) {{
                        row.style.display = 'none';
                    }} else {{
                        row.style.display = '';
                    }}
                }}
            }});
            
            // Apply filters after initialization to ensure everything is set up correctly
            applyFilters();
        }});

        function sortTable(col) {{
            const table = document.getElementById('dataTable');
            const tbody = table.querySelector('tbody');
            const reportType = document.getElementById('reportType').value;
            
            // Only get rows that match the current report type and are visible
            const allRows = Array.from(tbody.querySelectorAll('tr'));
            const rows = allRows.filter(row => {{
                const rowType = row.getAttribute('data-report-type');
                return rowType === reportType && row.style.display !== 'none';
            }});

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

            // Re-insert sorted rows in their new positions
            // Find the first visible row of the current report type to insert after
            const firstVisibleRow = allRows.find(row => {{
                const rowType = row.getAttribute('data-report-type');
                return rowType === reportType && row.style.display !== 'none';
            }});
            
            if (firstVisibleRow) {{
                // Insert sorted rows before the first visible row
                rows.forEach((row, index) => {{
                    if (index === 0) {{
                        tbody.insertBefore(row, firstVisibleRow);
                    }} else {{
                        tbody.insertBefore(row, rows[index - 1].nextSibling);
                    }}
                }});
            }} else {{
                // Fallback: just append
                rows.forEach(row => tbody.appendChild(row));
            }}
        }}

        function applyFilters() {{
            const userFilter = document.getElementById('filterUser').value;
            const actionFilter = document.getElementById('filterAction').value;
            const woFilter = document.getElementById('filterWorkOrder').value;
            const reportType = document.getElementById('reportType').value;

            const table = document.getElementById('dataTable');
            const rows = table.querySelectorAll('tbody tr');
            let visibleCount = 0;
            let totalValue = 0;

            rows.forEach(row => {{
                // First check if row matches current report type
                const rowType = row.getAttribute('data-report-type');
                if (rowType !== reportType) {{
                    // Hide rows that don't match the current report type
                    row.style.display = 'none';
                    row.classList.remove('filtered-out');
                    return;
                }}
                
                // Row matches report type, now check filters
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
                    // Show row - it matches both report type and filters
                    row.style.display = '';
                    row.classList.remove('filtered-out');
                    visibleCount++;
                    const rowValue = parseFloat(row.getAttribute('data-row-value')) || 0;
                    totalValue += rowValue;
                }} else {{
                    // Hide row - it matches report type but not filters
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
                totalDiv.innerHTML = `Total Value (Filtered): $` + formatted + ` | Transactions Shown: ` + visibleCount;
            }} else {{
                indicator.classList.remove('active');
                table.classList.remove('filtered');
                // Use the appropriate total and count based on report type
                const currentReportType = document.getElementById('reportType').value;
                const displayTotal = currentReportType === 'daily' ? DAILY_TOTAL : MONTHLY_TOTAL;
                const displayCount = currentReportType === 'daily' ? DAILY_COUNT : MONTHLY_COUNT;
                const formatted = displayTotal.toFixed(2).replace(/\\B(?=(\\d{{3}})+(?!\\d))/g, ",");
                totalDiv.innerHTML = `Total Value: $` + formatted + ` | Transactions Shown: ` + displayCount;
            }}
        }}
    </script>
</body>
</html>"""
    
    with open(output_html, 'w', encoding='utf-8') as f:
        f.write(html_content)
    
    print(f"Saved HTML report to {os.path.abspath(output_html)}")
    print(f"Generated report with {len(daily_rows)} daily and {len(monthly_rows)} monthly transactions")
    print(f"Included {len(daily_submissions)} daily and {len(monthly_submissions)} monthly iPad submissions")


def sanitize_xml_element_name(name):
    """Convert a string to a valid XML element name."""
    # Replace spaces and hyphens with underscores, remove other invalid chars
    name = name.replace(' ', '_').replace('-', '_')
    # Remove any characters that aren't valid in XML element names
    name = re.sub(r'[^a-zA-Z0-9_\.]', '', name)
    # Ensure it starts with a letter or underscore
    if name and name[0].isdigit():
        name = '_' + name
    return name if name else 'Element'


def generate_xml_report(daily_rows, monthly_rows, output_xml):
    """Generate XML report from transaction rows."""
    root = ET.Element("TransactionReport")
    
    # Add metadata
    metadata = ET.SubElement(root, "Metadata")
    ET.SubElement(metadata, "GeneratedDate").text = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
    ET.SubElement(metadata, "DailyTransactionCount").text = str(len(daily_rows))
    ET.SubElement(metadata, "MonthlyTransactionCount").text = str(len(monthly_rows))
    
    # Add daily transactions
    daily_section = ET.SubElement(root, "DailyTransactions")
    for row_data in daily_rows:
        transaction = ET.SubElement(daily_section, "Transaction")
        for key, value in row_data.items():
            if key != 'report_type':  # Skip internal metadata
                elem_name = sanitize_xml_element_name(key)
                elem = ET.SubElement(transaction, elem_name)
                elem.text = str(value) if value else ""
    
    # Add monthly transactions
    monthly_section = ET.SubElement(root, "MonthlyTransactions")
    for row_data in monthly_rows:
        transaction = ET.SubElement(monthly_section, "Transaction")
        for key, value in row_data.items():
            if key != 'report_type':  # Skip internal metadata
                elem_name = sanitize_xml_element_name(key)
                elem = ET.SubElement(transaction, elem_name)
                elem.text = str(value) if value else ""
    
    # Calculate totals
    daily_total = 0.0
    monthly_total = 0.0
    
    for row_data in daily_rows:
        value_raw = row_data.get('Value', '').strip()
        _, numeric = currency_format(value_raw)
        if numeric is not None:
            daily_total += numeric
    
    for row_data in monthly_rows:
        value_raw = row_data.get('Value', '').strip()
        _, numeric = currency_format(value_raw)
        if numeric is not None:
            monthly_total += numeric
    
    totals = ET.SubElement(root, "Totals")
    ET.SubElement(totals, "DailyTotal").text = f"{daily_total:.2f}"
    ET.SubElement(totals, "MonthlyTotal").text = f"{monthly_total:.2f}"
    
    # Write XML file
    tree = ET.ElementTree(root)
    ET.indent(tree, space="  ")
    tree.write(output_xml, encoding='utf-8', xml_declaration=True)
    
    print(f"Saved XML report to {os.path.abspath(output_xml)}")
    print(f"Generated XML with {len(daily_rows)} daily and {len(monthly_rows)} monthly transactions")


def main():
    """Main function to generate unified report."""
    import argparse
    
    parser = argparse.ArgumentParser(
        description="Generate Crib Report for checkout transactions",
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog="""
Examples:
  # Generate report (yesterday, automatically sends to Power Automate)
  python generate_master_transaction_report.py

  # Generate report for specific date
  python generate_master_transaction_report.py --date 2025-12-18
        """
    )
    
    parser.add_argument(
        '--date',
        help='Date for daily report (YYYY-MM-DD format). Defaults to yesterday.'
    )
    parser.add_argument(
        '--output',
        help='Output HTML filename (default: auto-generated)'
    )
    
    args = parser.parse_args()
    
    SERVER = r"ESTSS01\ZOLLERSQLEXPRESS"
    DATABASE = "ZOLLERDB3"
    CREDENTIALS = [
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
        # Always query both daily and monthly data
        # Calculate target dates (handles Monday special case)
        start_date, end_date, date_list = get_target_dates(args.date)
        
        # Display date range info
        if len(date_list) > 1:
            print(f"Querying daily checkout transactions for {len(date_list)} days: {', '.join(date_list)}")
        else:
            print(f"Querying daily checkout transactions for {date_list[0]}...")
        
        query_start = time.time()
        daily_rows = query_checkouts_by_date(probe, target_date=date_list[0], start_date=start_date, end_date=end_date)
        daily_query_time = time.time() - query_start
        print(f"Daily query completed in {daily_query_time:.2f} seconds ({len(daily_rows)} transactions)")
        
        # Query monthly data (last 30 days)
        print(f"Querying monthly checkout transactions for last 30 days...")
        query_start = time.time()
        monthly_rows = query_checkouts_last_30_days(probe)
        monthly_query_time = time.time() - query_start
        print(f"Monthly query completed in {monthly_query_time:.2f} seconds ({len(monthly_rows)} transactions)")
        
        query_time = daily_query_time + monthly_query_time
        
        if not daily_rows and not monthly_rows:
            print(f"No checkout transactions found")
            return
        
        # Generate output filenames (fixed names, no date)
        if args.output:
            output_html = args.output
        else:
            output_html = "master_transaction_report.html"
        
        output_xml = output_html.replace('.html', '.xml')
        
        # Run door unlocks script
        print(f"\n{'='*60}")
        print("Running Door Unlocks Script...")
        print(f"{'='*60}")
        run_door_unlocks_script()
        
        # Load door unlock data
        script_dir = Path(__file__).parent
        daily_door_json = script_dir.parent / "Ubiquiti_Scripts" / "yesterday_crib_door.json"
        monthly_door_json = script_dir.parent / "Ubiquiti_Scripts" / "last_30_days_crib_door.json"
        
        daily_door_data = load_door_unlocks(daily_door_json)
        monthly_door_data = load_door_unlocks(monthly_door_json)
        
        if daily_door_data:
            print(f"Loaded {daily_door_data.get('total_events', 0)} daily door unlock events")
        if monthly_door_data:
            print(f"Loaded {monthly_door_data.get('total_events', 0)} monthly door unlock events")
        
        # Query under minimum stock items
        print(f"\n{'='*60}")
        print("Querying Under Minimum Stock Items...")
        print(f"{'='*60}")
        query_start = time.time()
        under_minimum_rows = query_under_minimum_items(probe)
        under_minimum_query_time = time.time() - query_start
        print(f"Under minimum query completed in {under_minimum_query_time:.2f} seconds ({len(under_minimum_rows)} items found)")
        
        # Query Matrix Vending items
        print(f"\n{'='*60}")
        print("Querying Matrix Vending Items...")
        print(f"{'='*60}")
        matrix_vending_data = None
        if MATRIX_VENDING_ENABLED:
            query_start = time.time()
            try:
                matrix_vending_data = query_matrix_vending_items()
                matrix_query_time = time.time() - query_start
                if matrix_vending_data is not None:
                    print(f"Matrix Vending query completed in {matrix_query_time:.2f} seconds ({len(matrix_vending_data)} items found)")
                else:
                    print(f"Matrix Vending query failed or returned no data")
            except Exception as e:
                print(f"Warning: Error querying Matrix Vending database: {e}")
                matrix_vending_data = None
        else:
            print("Matrix Vending database not configured (MATRIX_VENDING_ENABLED = False)")
        
        # Load iPad form submissions
        print(f"\n{'='*60}")
        print("Loading iPad Form Submissions...")
        print(f"{'='*60}")
        all_submissions = load_ipad_submissions()
        print(f"Loaded {len(all_submissions)} total submissions")
        
        # For iPad submissions, use the same date range as the transaction report
        # This keeps iPad submissions aligned with the transaction data
        # Filter submissions by date
        if len(date_list) > 1:
            print(f"Filtering iPad submissions - Daily dates: {', '.join(date_list)}")
        else:
            print(f"Filtering iPad submissions - Daily date: {date_list[0]}")
        daily_submissions = filter_submissions_by_date(all_submissions, target_date=date_list[0], days_back=1, date_list=date_list)
        monthly_submissions = filter_submissions_by_date(all_submissions, None, days_back=30)
        if len(date_list) > 1:
            print(f"Daily iPad submissions for {', '.join(date_list)}: {len(daily_submissions)}")
        else:
            print(f"Daily iPad submissions for {date_list[0]}: {len(daily_submissions)}")
        print(f"Monthly iPad submissions (last 30 days): {len(monthly_submissions)}")
        
        # Generate HTML report with both datasets
        print(f"\n{'='*60}")
        print("Generating HTML Report...")
        print(f"{'='*60}")
        html_start = time.time()
        # Default to 'daily' report type (both datasets are always included)
        default_report_type = 'daily'
        generate_html_report(daily_rows, monthly_rows, output_html, default_report_type, daily_submissions, monthly_submissions, daily_door_data, monthly_door_data, under_minimum_rows, matrix_vending_data)
        html_time = time.time() - html_start
        print(f"HTML generation completed in {html_time:.2f} seconds")
        
        # Send to Power Automate automatically
        print(f"\n{'='*60}")
        print("Sending HTML Report to Power Automate...")
        print(f"{'='*60}")
        powerautomate_start = time.time()
        # Convert to absolute path
        if not os.path.isabs(output_html):
            output_html_abs = os.path.abspath(output_html)
        else:
            output_html_abs = output_html
        print(f"HTML file path: {output_html_abs}")
        env_url = os.environ.get('POWER_AUTOMATE_WEBHOOK_URL')
        if env_url:
            print(f"Using webhook URL from environment variable")
        else:
            print(f"Using default webhook URL from configuration")
        success = send_to_powerautomate(output_html_abs, None)
        powerautomate_time = time.time() - powerautomate_start
        if success:
            print(f"Power Automate send completed in {powerautomate_time:.2f} seconds")
        else:
            print(f"Power Automate send failed after {powerautomate_time:.2f} seconds")
            print(f"Please check the error messages above for details.")
        
        # Generate XML report
        print(f"\n{'='*60}")
        print("Generating XML Report...")
        print(f"{'='*60}")
        xml_start = time.time()
        generate_xml_report(daily_rows, monthly_rows, output_xml)
        xml_time = time.time() - xml_start
        print(f"XML generation completed in {xml_time:.2f} seconds")
        
        print(f"\n{'='*60}")
        print("SUCCESS: Reports generated!")
        print(f"{'='*60}")
        print(f"Performance Summary:")
        print(f"  Database connection: {conn_time:.2f} seconds")
        print(f"  Database query: {query_time:.2f} seconds")
        print(f"  HTML generation: {html_time:.2f} seconds")
        print(f"  XML generation: {xml_time:.2f} seconds")
        
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

