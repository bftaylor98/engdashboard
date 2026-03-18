# Templates and Reference Library

This directory contains reference materials, templates, and examples for building HTML report generators similar to the Daily Transaction Report.

## Purpose

Use these files as a foundation when creating new report generators that:
- Query the Zoller TMS/Vending database
- Generate professional HTML reports
- Include interactive features (filtering, sorting, dark mode)
- Support Power Automate integration
- Include part number hyperlinks

## Contents

### Reference Scripts

#### `generate_report_html_v2.py`
Original reference script that generates HTML from CSV files. Key features:
- CSV input processing
- HTML table generation with filtering and sorting
- Responsive design
- Currency formatting
- Column normalization

**Use this as a reference for:**
- HTML structure and CSS styling
- JavaScript filtering and sorting logic
- Table layout and responsive design
- Currency and data formatting

#### `generate_and_send_report.py`
Example script showing Power Automate integration.

**Use this as a reference for:**
- Power Automate webhook communication
- Base64 encoding of HTML content
- Image embedding in HTML

#### `generate_yesterday_checkout_report_template.py`
Complete template based on the current Daily Transaction Report. This is the most comprehensive reference.

**Use this as a reference for:**
- Database query structure
- HTML report generation from database results
- Part number hyperlink library
- Dark/light mode implementation
- Print functionality
- Mobile responsive design
- Power Automate integration

## Building a New Report Generator

### Step 1: Copy the Template

```bash
cp generate_yesterday_checkout_report_template.py ../NewReport/new_report_generator.py
```

### Step 2: Modify the Query Function

Update `query_checkouts_by_date()` or create a new query function:

```python
def query_your_data(probe, target_date=None):
    """Query your specific data."""
    # Your SQL query here
    query = """
        SELECT 
            -- Your columns
        FROM YourTable
        WHERE conditions
    """
    # Process results
    return report_rows
```

### Step 3: Update Headers

Modify `TARGET_HEADERS` to match your data:

```python
TARGET_HEADERS = [
    "Column 1",
    "Column 2",
    # ... your columns
]
```

### Step 4: Customize HTML Generation

In `generate_html_report()`:
- Update column indices for filtering/sorting
- Modify table structure if needed
- Adjust CSS for your layout
- Add/remove features as needed

### Step 5: Add Custom Features

- **Hyperlinks**: Use the part number hyperlink library pattern
- **Custom formatting**: Add formatting functions similar to `currency_format()`
- **Additional filters**: Extend the filter dropdowns
- **Custom styling**: Modify CSS in the HTML template

## Key Patterns

### Database Query Pattern

```python
def query_data(probe, filters):
    """Query pattern for database reports."""
    query = f"""
        SELECT 
            columns
        FROM Table1 t1
        INNER JOIN Table2 t2 ON t1.Id = t2.Id
        WHERE conditions
        ORDER BY sort_column
    """
    result = probe.execute_query(query)
    # Process and format results
    return formatted_rows
```

### HTML Generation Pattern

```python
def generate_html_report(data_rows, output_html):
    """HTML generation pattern."""
    # 1. Prepare data
    rows_html = []
    for row_data in data_rows:
        rows_html.append([...])
    
    # 2. Build HTML structure
    html_content = f"""<!DOCTYPE html>
    <html>
    <head>
        <style>
            /* CSS styles */
        </style>
    </head>
    <body>
        <!-- HTML content -->
        <script>
            // JavaScript for interactivity
        </script>
    </body>
    </html>"""
    
    # 3. Write file
    with open(output_html, 'w', encoding='utf-8') as f:
        f.write(html_content)
```

### Part Number Hyperlink Pattern

```python
# Define company mappings
PART_NUMBER_LINKS = {
    'COMPANY': lambda suffix: f"https://company.com/{suffix}",
}

# Parse and generate links
def get_part_number_link(part_no: str) -> str:
    company, suffix = parse_part_number(part_no)
    if company and suffix:
        return PART_NUMBER_LINKS[company](suffix)
    return None
```

### Power Automate Integration Pattern

```python
def send_to_powerautomate(html_path: str):
    """Send HTML to Power Automate."""
    # 1. Read HTML
    with open(html_path, 'r', encoding='utf-8') as f:
        html_content = f.read()
    
    # 2. Embed images
    html_content = embed_images_in_html(html_content, html_dir)
    
    # 3. Encode to base64
    html_base64 = base64.b64encode(html_content.encode('utf-8')).decode('utf-8')
    
    # 4. Send to webhook
    payload = {
        "filename": os.path.basename(html_path),
        "content": html_base64
    }
    requests.post(webhook_url, json=payload)
```

## CSS Patterns

### Dark Mode Toggle

```css
body.dark-mode {
    background-color: #1a1a1a;
    color: #ffffff;
}

body.dark-mode .container {
    background-color: #2d2d2d;
}
```

### Responsive Design

```css
@media screen and (max-width: 768px) {
    /* Mobile styles */
}
```

### Print Styles

```css
@media print {
    @page {
        size: landscape;
        margin: 0.5in;
    }
    /* Print-specific styles */
}
```

## JavaScript Patterns

### Filtering

```javascript
function applyFilters() {
    const filterValue = document.getElementById('filterId').value;
    const rows = document.querySelectorAll('tbody tr');
    
    rows.forEach(row => {
        const cellText = row.querySelectorAll('td')[columnIndex].textContent.trim();
        const matches = !filterValue || cellText === filterValue;
        row.style.display = matches ? '' : 'none';
    });
}
```

### Sorting

```javascript
function sortTable(columnIndex, direction) {
    const tbody = document.querySelector('tbody');
    const rows = Array.from(tbody.querySelectorAll('tr'));
    
    rows.sort((a, b) => {
        const aText = a.querySelectorAll('td')[columnIndex].textContent.trim();
        const bText = b.querySelectorAll('td')[columnIndex].textContent.trim();
        return direction === 'asc' 
            ? aText.localeCompare(bText)
            : bText.localeCompare(aText);
    });
    
    rows.forEach(row => tbody.appendChild(row));
}
```

## Best Practices

1. **Start with the template** - Use `generate_yesterday_checkout_report_template.py` as your base
2. **Modify incrementally** - Make small changes and test frequently
3. **Keep queries simple** - Let SQL do the heavy lifting
4. **Test on mobile** - Always verify responsive design works
5. **Document your changes** - Add comments explaining custom logic
6. **Version control** - Save versions as you add features
7. **Reuse patterns** - Use established patterns from reference scripts

## Common Customizations

### Adding a New Filter

1. Add dropdown to HTML:
```html
<select id="filterNewColumn">
    <option value="">All Values</option>
    <!-- Options populated from data -->
</select>
```

2. Add to JavaScript:
```javascript
const FILTER_COLS = {
    2: 'filterUser',
    5: 'filterNewColumn',  // New filter
};
```

3. Update `applyFilters()` function

### Adding a Sortable Column

1. Add to sortable columns list:
```python
sortable_cols = [4, 3, 2, 1, 5]  # Add index 5
```

2. Add sort indicator to header in HTML generation

3. Add sorting logic in JavaScript

### Custom Hyperlink Column

```python
# In HTML generation
if idx == column_index and cell.strip():
    custom_link = generate_custom_link(cell)
    if custom_link:
        cells.append(f'<td><a href="{custom_link}" target="_blank">{cell_text}</a></td>')
```

## Questions?

Refer to:
- `generate_yesterday_checkout_report_template.py` for complete working example
- `generate_report_html_v2.py` for CSV-based approach
- daily_trans/README.md for usage examples

