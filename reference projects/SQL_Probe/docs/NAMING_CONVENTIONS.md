# Naming Conventions

## Directory Naming

All directories use **lowercase with underscores** (snake_case), following Python and Unix conventions:

- ✅ `daily_trans/` - Daily transaction reports
- ✅ `templates/` - Template and reference files
- ✅ `docs/` - Documentation files
- ✅ `utils/` - Utility scripts

## File Naming

### Python Scripts
- Use lowercase with underscores: `generate_yesterday_checkout_report.py`
- Versioned files: `script_v1.py`, `script_v2.py`
- Reference files: `reference_*.py`
- Template files: `*_template.py`

### Documentation
- UPPERCASE for main docs: `DATABASE_SCHEMA_DOCUMENTATION.md`
- Mixed case for specific topics: `PART_NUMBER_HYPERLINK_LIBRARY.md`
- README files: `README.md` (always uppercase)

### Resources
- Simple, descriptive names: `logo.png`
- No spaces or special characters
- Lowercase preferred

## Benefits

1. **Cross-platform compatibility** - Works on Windows, Linux, macOS
2. **Case-insensitive filesystem safety** - Avoids issues on Windows
3. **Python conventions** - Matches Python package naming
4. **URL-friendly** - Easy to reference in documentation
5. **Consistency** - Predictable naming throughout project

## Migration Notes

- `Daily_Trans/` → `daily_trans/`
- `Main_ref/` → `templates/`
- All references updated in documentation

