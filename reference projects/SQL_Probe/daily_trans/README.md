# Daily Transaction Report Generator

This directory contains scripts for generating daily checkout transaction reports from the Zoller TMS/Vending database.

## Overview

The main script `generate_yesterday_checkout_report.py` queries the database for checkout/taken events on a specified date and generates a professional HTML report with:

- **Interactive filtering** by User, Action, and Work Order
- **Sortable columns** (C-ID, Action, User, Time)
- **Dark/Light mode toggle** with preference persistence
- **Print functionality** (desktop only) with optimized formatting
- **Mobile responsive design**
- **Part number hyperlinks** - Automatically links part numbers to manufacturer websites
- **Work order hyperlinks** - Links to internal work order system
- **Power Automate integration** - Optional automatic sending to Power Automate webhook

## Files

### Main Scripts

- **`generate_yesterday_checkout_report.py`** - Current production version
  - Generates HTML reports from database queries
  - Supports date filtering, Power Automate integration
  - Includes part number hyperlink library

- **`generate_yesterday_checkout_report_v1.py` through `v5.py`** - Version history
  - v1: Initial version
  - v2: Mobile responsive
  - v4: Dark/light mode toggle + print button
  - v5: Part number hyperlink library

- **`send_to_powerautomate.py`** - Power Automate integration
  - Sends generated HTML reports to Power Automate webhook
  - Embeds images as base64 data URIs
  - Handles webhook communication

### Query Scripts

- **`query_yesterday_checkouts.py`** - Simple query script for yesterday's checkouts
- **`query_c212_checkouts.py`** - Example query for specific component

### Resources

- **`logo.png`** - Logo used in reports
- **`requirements.txt`** - Python dependencies
- **`checkout_report_*.html`** - Generated report files

## Usage

### Basic Usage

Generate a report for yesterday:
```bash
python generate_yesterday_checkout_report.py
```

Generate a report for a specific date:
```bash
python generate_yesterday_checkout_report.py --date 2025-12-18
```

### Power Automate Integration

Generate and send to Power Automate:
```bash
python generate_yesterday_checkout_report.py --date 2025-12-18 --send
```

Wait 30 seconds before sending (default):
```bash
python generate_yesterday_checkout_report.py --date 2025-12-18 --send --wait 30
```

### Custom Output Location

```bash
python generate_yesterday_checkout_report.py --date 2025-12-18 --output custom_report.html
```

## Part Number Hyperlink Library

The script automatically converts part numbers to hyperlinks based on company prefixes:

| Prefix | Company | Example | Link |
|--------|---------|---------|------|
| OSG- | OSG Tool | OSG-VGM5-0162 | https://osgtool.com/VGM5-0162 |
| ALLI- | Allied Machine | ALLI-HTA1D10-100F | https://www.alliedmachine.com/PRODUCTS/ItemDetail.aspx?item=HTA1D10-100F |
| GARR- | GARR Tool | GARR-13157 | https://www.garrtool.com/product-details/?EDP=13157 |
| GUHR- | Guhring | GUHR-9041240254000 | https://guhring.com/ProductsServices/SizeDetails?EDP=9041240254000 |
| HARV- | Harvey Tool | HARV-33493-C3 | https://www.harveytool.com/products/tool-details-33493-c3 |
| INGE- | Ingersoll | INGE-6198535 | https://www.ingersoll-imc.com/product/6198535 |

### Adding New Companies

Edit `generate_yesterday_checkout_report.py` and add to the `PART_NUMBER_LINKS` dictionary:

```python
PART_NUMBER_LINKS = {
    'OSG': lambda suffix: f"https://osgtool.com/{suffix}",
    'NEWCOMPANY': lambda suffix: f"https://newcompany.com/products/{suffix}",
    # Add more...
}
```

## Report Features

### Filtering
- Filter by User, Action, or Work Order
- Filters update totals dynamically
- Clear filters to see all data

### Sorting
- Click column headers to sort (C-ID, Action, User, Time)
- Click again to reverse sort order
- Time column uses chronological sorting

### Dark Mode
- Toggle between light and dark themes
- Preference saved in browser localStorage
- Print always uses light theme for readability

### Mobile Responsive
- Optimized layout for mobile devices
- Horizontal scrolling for wide tables
- Touch-friendly controls

### Print Formatting
- Landscape orientation
- Optimized margins and font sizes
- Hides filters and controls
- Clean, professional output

## Dependencies

See `requirements.txt` for full list. Main dependencies:
- `pyodbc` - SQL Server database connection
- `requests` - Power Automate webhook communication

## Database Schema

The script queries the following tables:
- `ArticleFlowStatistic` - Transaction history
- `ObjData` - Component and user information
- `ValData` - Component attributes (Part No, etc.)
- `FieldInfo` - Attribute definitions

## Power Automate Webhook

The webhook URL is configured in `send_to_powerautomate.py`. The script sends:
- **filename**: HTML file name
- **content**: Base64-encoded HTML content (with embedded images)

## Troubleshooting

### Connection Issues
- Verify SQL Server is accessible
- Check Windows authentication permissions
- Ensure ODBC Driver 17+ is installed

### Part Number Links Not Working
- Verify part number format matches expected pattern (e.g., "OSG-XXXXX")
- Check that company prefix is in `PART_NUMBER_LINKS` dictionary
- Case-insensitive matching is supported

### Power Automate Errors
- Verify webhook URL is correct
- Check network connectivity
- Ensure HTML file exists before sending

## Version History

- **v5** - Added part number hyperlink library (6 companies)
- **v4** - Dark/light mode toggle, print button, removed stat cards
- **v2** - Mobile responsive design
- **v1** - Initial version

