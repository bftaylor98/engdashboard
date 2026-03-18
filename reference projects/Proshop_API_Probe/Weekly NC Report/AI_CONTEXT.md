# AI Context for ProShop NCR Fetching Project

## 🚀 FOR AI MODELS: How to Get Up to Speed Quickly

### First Steps (Read These Files in Order):
1. **Start with this file** (`AI_CONTEXT.md`) - You're here! ✅
2. **Read `RESEARCH_SUMMARY.md`** - Contains all API discoveries and technical findings
3. **Check `README.md`** - User documentation and setup instructions
4. **Review `weekly_nc.py`** - Main script to understand current implementation

### Key Things to Know Immediately:
- **✅ Resource tracking is FULLY WORKING** - Don't try to re-implement it
- **✅ All major features are complete** - Focus on improvements, not core functionality
- **✅ API structure is documented** - See RESEARCH_SUMMARY.md for details
- **✅ Required scope**: `nonconformancereports:r workorders:r parts:r users:r toolpots:r`
- **❌ AssignedTo field removed** - Due to data sync issues between ProShop web interface and API
- **✅ Power Automate integration** - Webhook functionality added for Power Automate integration

### If User Asks About:
- **"Machine tracking"** → It's now called "resource tracking" and it works
- **"API errors"** → Check RESEARCH_SUMMARY.md for common patterns
- **"Adding features"** → Current code is solid, focus on enhancements
- **"Debugging"** → Use `--verbose` flag and check logs
- **"AssignedTo field"** → Removed due to ProShop web interface vs API data sync issues
- **"Power Automate"** → Use `--output webhook --webhook-url YOUR_URL`

### Quick Test:
```bash
python weekly_nc.py
```
This should work immediately and show resource names like "INSPECT", "PART CHECK", etc.

---

## Project Summary
This project fetches Non-Conformance Reports (NCRs) from ProShop's GraphQL API for a specific time window (Monday 12 PM to Monday 12 PM UTC) and provides detailed analysis including resource tracking, cause codes, and summary statistics. Now includes Power Automate integration via webhook.

## Key Facts
- **API URL**: https://est.adionsystems.com
- **Authentication**: Session-based with username/password to get bearer token
- **Required Scopes**: `nonconformancereports:r workorders:r parts:r users:r toolpots:r`
- **Language**: Python 3.x
- **Host**: Windows Task Scheduler (intended for Monday 12 PM Eastern Time execution)
- **Config**: Externalized in `config.ini`
- **Logging**: Structured logging to file and console
- **Output**: Console display, CSV export, or Power Automate webhook
- **Time Window**: Previous Monday 12 PM to current Monday 12 PM Eastern Time
- **Fields Fetched**: ncrRefNumber, workOrderNumber, partDescription, lastModifiedBy (resolved to full name), operationNumber, resource, causeCode (description only), dispositionNotes, perPartValue, improvementSuggestion, status, notes, timestamp
- **Summary Stats**: Total NCRs, top 5 work orders, top 5 parts, top 5 cause codes, top 5 resources, top 5 statuses, top 5 improvement suggestions
- **Resource Tracking**: ✅ WORKING - Successfully retrieves resource names from work order operations

## User Preferences
- Security not a primary concern (credentials hardcoded)
- Terminal output for debugging
- Detailed NCR information matching reference script format
- Comprehensive error handling and logging
- Command-line arguments for flexibility
- CSV export capability
- Power Automate integration via webhook

## Usage
```bash
# Basic usage (Monday-to-Monday window)
python weekly_nc.py

# Custom date range (Eastern Time)
python weekly_nc.py --start-date 2025-07-21 --end-date 2025-07-28

# CSV export
python weekly_nc.py --output csv --csv-file output.csv

# Power Automate webhook
python weekly_nc.py --output webhook --webhook-url YOUR_WEBHOOK_URL

# Verbose logging
python weekly_nc.py --verbose
```

## Recent Improvements
- ✅ **Resource Tracking**: Successfully implemented! The script now:
  - Queries work orders by work order number
  - Accesses the `ops` field which returns `PaginatedWorkOrderOperationResult`
  - Extracts operations from `ops.records` array
  - Matches NCR operation number with work order operation number
  - Retrieves resource name from `workCenterPlainText` field
  - Requires `toolpots:r` scope for resource data access
- ✅ **Cause Code Integration**: Added cause codes to output and summary statistics
- ✅ **Process Improvement Suggestions**: Added improvementSuggestion field to output and summary statistics
- ✅ **Status/Disposition Tracking**: Added status field to output and summary statistics
- ✅ **Cause Code Descriptions**: Added manual mapping to convert codes (C8) to descriptions (Program Error)
- ✅ **User Name Resolution**: Added function to resolve user IDs to full names (e.g., 117 → Justin Barnes)
- ✅ **Last Modified By Field**: Shows who last modified the NCR (accurate field name)
- ❌ **AssignedTo Field Removed**: Due to data synchronization issues between ProShop web interface and API
- ✅ **Power Automate Integration**: Added webhook functionality to send NCR data to Power Automate
- ✅ **Disposition Notes**: Added configurable mapping system for disposition notes
- ✅ **Per Part Value**: Added configurable mapping system for per part values
- ✅ **Configuration Management**: Externalized settings to `config.ini`
- ✅ **Logging System**: Structured logging with configurable levels
- ✅ **Command-Line Arguments**: Support for custom dates, output formats, verbosity
- ✅ **Error Handling**: Retry logic with exponential backoff
- ✅ **CSV Export**: Optional CSV output with all fields
- ✅ **Summary Statistics**: Comprehensive analysis of NCR patterns

## Technical Implementation Details
- **Resource Lookup Process**:
  1. Extract `opNumber` from NCR
  2. Get `workOrderNumber` from NCR's work order relationship
  3. Query work orders with filter by work order number
  4. Access `ops.records` to get operations array
  5. Match operation number with NCR's opNumber
  6. Extract `workCenterPlainText` as resource name
- **API Structure**: Work orders have `ops` field returning `PaginatedWorkOrderOperationResult` with `records` array
- **Required Permissions**: `toolpots:r` scope needed for `workCenterPlainText` field access
- **Data Sync Issues**: ProShop web interface and API show different data for assignedTo field
- **Power Automate Integration**: Sends JSON payload with NCR records and summary information

## Power Automate Integration
The script can send NCR data to Power Automate via HTTP webhook:

**Payload Structure:**
```json
{
  "ncr_records": [
    {
      "ncrRefNumber": "25-0905.46.01",
      "workOrderNumber": "25-0905",
      "partDescription": "D-14850-S5 DET 2L FCA-SO Bottom Blocker Die",
      "lastModifiedBy": "Justin Barnes",
      "operationNumber": "46",
      "resource": "PART CHECK",
      "causeCode": "N/A",
      "dispositionNotes": "N/A",
      "perPartValue": "N/A",
      "improvementSuggestion": "",
      "status": "Outstanding",
      "notes": "program Dim says .787 and the blue print dim says .874...",
      "timestamp": "2025-07-25 08:31 PM"
    }
  ],
  "summary": {
    "total_ncrs": 4,
    "time_window_start": "2025-07-25 00:00",
    "time_window_end": "2025-07-26 00:00",
    "timezone": "Eastern Time"
  }
}
```

**Usage:**
```bash
py weekly_nc.py --output webhook --webhook-url YOUR_WEBHOOK_URL
```

## Files
- `weekly_nc.py`: Main script (renamed from fetch_ncrs.py)
- `config.ini`: Configuration file with credentials and settings
- `README.md`: Comprehensive documentation
- `requirements.txt`: Python dependencies
- `AI_CONTEXT.md`: This file for AI model context
- `RESEARCH_SUMMARY.md`: Research findings and API discoveries

## For Future AI Models
When working on this codebase:
1. **Resource tracking is now fully functional** - no need to re-implement
2. **Scope requirements**: Always include `toolpots:r` for resource data
3. **API structure**: Use `ops.records` pattern for work order operations
4. **User prefers**: Detailed output, comprehensive logging, error handling
5. **Maintenance**: Keep this file updated with any new features or changes
6. **Research**: See `RESEARCH_SUMMARY.md` for detailed API findings
7. **Cause codes**: Manual mapping implemented - update `get_cause_code_description()` function as needed
8. **Disposition notes**: Configurable via `config.ini` [disposition_notes] section
9. **Per part value**: Configurable via `config.ini` [per_part_value] section
10. **User names**: Resolved via API query to user module - no manual mapping needed
11. **AssignedTo field**: Removed due to ProShop data sync issues - web interface and API show different data
12. **Last Modified By**: Accurate field that shows who last modified the NCR
13. **Power Automate**: Webhook integration available - use `--output webhook --webhook-url URL` 