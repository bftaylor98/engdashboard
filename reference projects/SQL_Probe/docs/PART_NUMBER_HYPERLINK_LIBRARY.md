# Part Number Hyperlink Library Documentation

## Overview

The Part Number Hyperlink Library automatically converts part numbers in reports to clickable hyperlinks based on company prefixes. This allows users to quickly access manufacturer product pages directly from the report.

## How It Works

1. **Prefix Detection**: The library checks if a part number starts with a known company prefix (e.g., "OSG-")
2. **Suffix Extraction**: Extracts the part number suffix (everything after the prefix and hyphen)
3. **URL Generation**: Constructs the manufacturer's product page URL using the suffix
4. **HTML Integration**: Converts the part number text to a clickable hyperlink in the report

## Supported Companies

| Prefix | Company | URL Pattern | Example Part Number | Generated URL |
|--------|---------|-------------|---------------------|---------------|
| OSG- | OSG Tool | `https://osgtool.com/{suffix}` | OSG-VGM5-0162 | https://osgtool.com/VGM5-0162 |
| ALLI- | Allied Machine | `https://www.alliedmachine.com/PRODUCTS/ItemDetail.aspx?item={suffix}` | ALLI-HTA1D10-100F | https://www.alliedmachine.com/PRODUCTS/ItemDetail.aspx?item=HTA1D10-100F |
| GARR- | GARR Tool | `https://www.garrtool.com/product-details/?EDP={suffix}` | GARR-13157 | https://www.garrtool.com/product-details/?EDP=13157 |
| GUHR- | Guhring | `https://guhring.com/ProductsServices/SizeDetails?EDP={suffix}` | GUHR-9041240254000 | https://guhring.com/ProductsServices/SizeDetails?EDP=9041240254000 |
| HARV- | Harvey Tool | `https://www.harveytool.com/products/tool-details-{suffix}` | HARV-33493-C3 | https://www.harveytool.com/products/tool-details-33493-c3 |
| INGE- | Ingersoll | `https://www.ingersoll-imc.com/product/{suffix}` | INGE-6198535 | https://www.ingersoll-imc.com/product/6198535 |

## Implementation

### Library Structure

```python
PART_NUMBER_LINKS = {
    'OSG': lambda suffix: f"https://osgtool.com/{suffix}",
    'ALLI': lambda suffix: f"https://www.alliedmachine.com/PRODUCTS/ItemDetail.aspx?item={suffix}",
    'GARR': lambda suffix: f"https://www.garrtool.com/product-details/?EDP={suffix}",
    'GUHR': lambda suffix: f"https://guhring.com/ProductsServices/SizeDetails?EDP={suffix}",
    'HARV': lambda suffix: f"https://www.harveytool.com/products/tool-details-{suffix}",
    'INGE': lambda suffix: f"https://www.ingersoll-imc.com/product/{suffix}",
}
```

### Core Functions

#### `parse_part_number(part_no: str) -> tuple`

Parses a part number to extract company prefix and suffix.

**Parameters:**
- `part_no`: Part number string (e.g., "OSG-VGM5-0162")

**Returns:**
- Tuple of `(company_prefix, part_suffix)` or `(None, None)` if no match

**Example:**
```python
company, suffix = parse_part_number("OSG-VGM5-0162")
# Returns: ('OSG', 'VGM5-0162')
```

#### `get_part_number_link(part_no: str) -> str`

Generates a hyperlink URL for a part number if it matches a known company.

**Parameters:**
- `part_no`: Part number string (e.g., "OSG-VGM5-0162")

**Returns:**
- URL string if match found, `None` otherwise

**Example:**
```python
url = get_part_number_link("OSG-VGM5-0162")
# Returns: "https://osgtool.com/VGM5-0162"
```

## Adding New Companies

### Step 1: Identify the URL Pattern

Determine how the manufacturer's website constructs product page URLs. Common patterns:
- Simple: `https://company.com/{part_number}`
- Query parameter: `https://company.com/product?item={part_number}`
- Path-based: `https://company.com/products/{part_number}`

### Step 2: Add to Library

Add the company prefix and URL pattern to `PART_NUMBER_LINKS`:

```python
PART_NUMBER_LINKS = {
    # ... existing entries ...
    'NEWCOMPANY': lambda suffix: f"https://newcompany.com/products/{suffix}",
}
```

### Step 3: Test

Test with sample part numbers:
```python
# Test the new entry
test_part = "NEWCOMPANY-12345"
url = get_part_number_link(test_part)
print(url)  # Should print: https://newcompany.com/products/12345
```

## Usage in Reports

The library is automatically integrated into the HTML report generation. Part numbers in the "Part No" column are automatically converted to hyperlinks:

```python
# In HTML generation code
if idx == 8 and cell.strip():  # Part No column
    part_link = get_part_number_link(cell)
    if part_link:
        cells.append(f'<td><a href="{html.escape(part_link)}" target="_blank">{cell_text}</a></td>')
    else:
        cells.append(f'<td>{cell_text}</td>')
```

## Features

### Case-Insensitive Matching

The library performs case-insensitive matching, so all of these work:
- `OSG-VGM5-0162`
- `osg-VGM5-0162`
- `Osg-VGM5-0162`

### Prefix Validation

The library ensures:
- Part number starts with the prefix followed by a hyphen
- There is actual content after the prefix (not just "OSG-")
- Empty or whitespace-only part numbers are ignored

### HTML Escaping

All URLs are properly HTML-escaped to prevent XSS vulnerabilities:
```python
html.escape(part_link)
```

### Target Blank

All hyperlinks open in a new tab:
```html
<a href="..." target="_blank">...</a>
```

## Examples

### Example 1: OSG Part Number

**Input:** `OSG-VGM5-0162`

**Processing:**
1. Detects prefix "OSG-"
2. Extracts suffix "VGM5-0162"
3. Generates URL: `https://osgtool.com/VGM5-0162`

**Output:** Clickable link to OSG Tool product page

### Example 2: GARR Part Number

**Input:** `GARR-13157`

**Processing:**
1. Detects prefix "GARR-"
2. Extracts suffix "13157"
3. Generates URL: `https://www.garrtool.com/product-details/?EDP=13157`

**Output:** Clickable link to GARR Tool product page

### Example 3: Non-Matching Part Number

**Input:** `UNKNOWN-12345`

**Processing:**
1. No matching prefix found
2. Returns `None`

**Output:** Plain text (no hyperlink)

## Troubleshooting

### Part Number Not Linking

**Possible Causes:**
1. **Prefix not in library**: Add the company prefix to `PART_NUMBER_LINKS`
2. **Format mismatch**: Verify part number format matches expected pattern (e.g., "PREFIX-SUFFIX")
3. **Whitespace issues**: Library handles trimming, but verify source data

**Solution:**
```python
# Debug: Check what's being parsed
company, suffix = parse_part_number("YOUR-PART-NUMBER")
print(f"Company: {company}, Suffix: {suffix}")
```

### URL Not Working

**Possible Causes:**
1. **URL pattern incorrect**: Verify the manufacturer's actual URL structure
2. **Special characters**: Some URLs may need encoding (library handles basic cases)

**Solution:**
Test the URL pattern manually:
```python
# Test URL generation
test_suffix = "YOUR-SUFFIX"
url = PART_NUMBER_LINKS['COMPANY'](test_suffix)
print(f"Generated URL: {url}")
# Open in browser to verify
```

## Best Practices

1. **Test thoroughly**: Always test new company additions with real part numbers
2. **Verify URL patterns**: Check manufacturer websites to confirm URL structure
3. **Handle edge cases**: Consider part numbers with special characters
4. **Document additions**: Update this documentation when adding new companies
5. **Maintain consistency**: Follow the existing pattern for new entries

## Future Enhancements

Potential improvements:
- Support for multiple URL patterns per company
- Fallback URL patterns if primary fails
- Configuration file for easier maintenance
- Logging for unmatched part numbers
- Support for part numbers without hyphens (e.g., "OSGVGM50162")

## Related Files

- `generate_yesterday_checkout_report.py` - Main implementation
- `templates/generate_yesterday_checkout_report_template.py` - Template with library
- `daily_trans/README.md` - Usage documentation

