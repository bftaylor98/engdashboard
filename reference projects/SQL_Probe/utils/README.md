# Utility Scripts

This directory contains utility scripts for database exploration, documentation generation, and data export.

## Scripts

### Documentation Generation

- **`discover_and_document.py`** - Automatically discover and document database schema
- **`verify_documentation.py`** - Verify documentation accuracy against database

### Data Export

- **`export_component_ids.py`** - Export component IDs to CSV/JSON formats
- **`get_component_full_info.py`** - Get complete information for a specific component

## Usage

### Discover Database Schema

```bash
python discover_and_document.py
```

This will:
- Scan database tables and relationships
- Generate schema documentation
- Export to JSON format

### Export Component Data

```bash
python export_component_ids.py
```

Exports component IDs to:
- `../docs/component_ids.csv`
- `../docs/component_ids.json`

### Get Component Information

```bash
python get_component_full_info.py --component-id C-112
```

Generates detailed documentation for a specific component.

### Verify Documentation

```bash
python verify_documentation.py
```

Checks that documentation files match current database structure.

## Dependencies

All utility scripts require:
- `sql_probe.py` (from parent directory)
- Database connection (Windows authentication)
- Python 3.7+

## Output Locations

- Documentation files → `../docs/`
- Data exports → `../docs/`
- Schema exports → `../docs/`

## Notes

- These scripts are read-only (SELECT queries only)
- All scripts use the same database connection as main project
- Generated files are placed in the `docs/` directory

