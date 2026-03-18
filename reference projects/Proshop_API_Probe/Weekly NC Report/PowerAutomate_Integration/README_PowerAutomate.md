# ProShop NCR to Power Automate Integration

This directory contains all the files needed to integrate ProShop NCR (Non-Conformance Report) data with Power Automate via HTTP webhook.

## Overview

The `weekly_nc.py` script fetches NCR data from ProShop's GraphQL API and sends it to Power Automate in a structured JSON format. This enables automated processing, notifications, and data analysis of NCRs.

## Files Included

- **`weekly_nc.py`** - Main script that fetches NCRs and sends to Power Automate
- **`config.ini`** - Configuration file with ProShop API credentials
- **`requirements.txt`** - Python dependencies
- **`AI_CONTEXT.md`** - Technical documentation and context
- **`RESEARCH_SUMMARY.md`** - API research findings and field mappings
- **`README_PowerAutomate.md`** - This file

## ProShop API Details

### Authentication
- **URL**: https://est.adionsystems.com
- **Method**: Session-based authentication
- **Endpoint**: `/api/beginsession`
- **Required Scopes**: `nonconformancereports:r workorders:r parts:r users:r toolpots:r`

### GraphQL Endpoint
- **URL**: https://est.adionsystems.com/api/graphql
- **Method**: POST
- **Headers**: `Authorization: Bearer {token}`

### NCR Query Structure
```graphql
query GetNCRs($pageSize: Int!, $pageStart: Int!) {
  nonConformanceReports(pageSize: $pageSize, pageStart: $pageStart) {
    records {
      ncrRefNumber
      createdTime
      lastModifiedByPlainText
      assignedToPlainText
      notes
      causeCode
      opNumber
      improvementSuggestion
      status
      workOrder { 
        workOrderNumber 
        part { partDescription }
      }
    }
  }
}
```

## Data Structure Sent to Power Automate

### JSON Payload Format
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

### Field Descriptions

| Field | Description | Example |
|-------|-------------|---------|
| `ncrRefNumber` | Unique NCR identifier | "25-0905.46.01" |
| `workOrderNumber` | Associated work order | "25-0905" |
| `partDescription` | Part name/description | "D-14850-S5 DET 2L FCA-SO Bottom Blocker Die" |
| `lastModifiedBy` | Person who last modified the NCR | "Justin Barnes" |
| `operationNumber` | Operation number where NCR occurred | "46" |
| `resource` | Machine/work cell where NCR occurred | "PART CHECK", "INSPECT" |
| `causeCode` | Cause code description | "Operator Error", "Inspection Error" |
| `dispositionNotes` | Disposition notes (configurable) | "N/A" |
| `perPartValue` | Per part value (configurable) | "N/A" |
| `improvementSuggestion` | Process improvement suggestion | "will not effect function of part." |
| `status` | NCR status | "Outstanding", "Complete" |
| `notes` | NCR notes (HTML stripped) | "program Dim says .787..." |
| `timestamp` | Creation timestamp (Eastern Time) | "2025-07-25 08:31 PM" |

### Summary Object
```json
{
  "total_ncrs": 4,
  "time_window_start": "2025-07-25 00:00",
  "time_window_end": "2025-07-26 00:00",
  "timezone": "Eastern Time"
}
```

## Cause Code Mappings

The script automatically converts ProShop cause codes to human-readable descriptions:

| Code | Description |
|------|-------------|
| C1 | Operator Error |
| C2 | Material Defect |
| C3 | Setup Error |
| C4 | Tool Wear |
| C5 | Vendor Defect |
| C6 | Design Error |
| C7 | Process Error |
| C8 | Program Error |
| C9 | Measurement Error |
| C10 | Equipment Failure |
| C11 | Environmental |
| C12 | Documentation Error |
| C13 | Training Issue |
| C14 | Communication Error |
| C15 | Procedure Error |
| C16 | Inspection Error |
| C17 | Calibration Error |
| C18 | Maintenance Issue |
| C19 | Quality System |
| C20 | Other |
| C21-C24 | Unknown |

## Usage Examples

### Basic Webhook Usage (Monday-to-Monday Window)
```bash
py weekly_nc.py --output webhook --webhook-url YOUR_WEBHOOK_URL
```

### Custom Date Range
```bash
py weekly_nc.py --output webhook --webhook-url YOUR_WEBHOOK_URL --start-date "2025-07-21 12:00" --end-date "2025-07-28 12:00"
```

### With Verbose Logging
```bash
py weekly_nc.py --output webhook --webhook-url YOUR_WEBHOOK_URL --verbose
```

## Power Automate Configuration

### HTTP Request Action
- **Method**: POST
- **URI**: Your webhook URL
- **Headers**: 
  - `Content-Type: application/json`
- **Body**: JSON (will be automatically parsed)

### Expected Response
- **Success**: Status 200 or 202
- **Failure**: Status 400+ with error details

### Data Access in Power Automate
Once the webhook receives data, you can access it in Power Automate using:

```json
{
  "ncr_records": [
    {
      "ncrRefNumber": "@{triggerBody()?['ncr_records']?[0]?['ncrRefNumber']}",
      "workOrderNumber": "@{triggerBody()?['ncr_records']?[0]?['workOrderNumber']}",
      "partDescription": "@{triggerBody()?['ncr_records']?[0]?['partDescription']}",
      "lastModifiedBy": "@{triggerBody()?['ncr_records']?[0]?['lastModifiedBy']}",
      "operationNumber": "@{triggerBody()?['ncr_records']?[0]?['operationNumber']}",
      "resource": "@{triggerBody()?['ncr_records']?[0]?['resource']}",
      "causeCode": "@{triggerBody()?['ncr_records']?[0]?['causeCode']}",
      "status": "@{triggerBody()?['ncr_records']?[0]?['status']}",
      "notes": "@{triggerBody()?['ncr_records']?[0]?['notes']}",
      "timestamp": "@{triggerBody()?['ncr_records']?[0]?['timestamp']}"
    }
  ],
  "summary": {
    "total_ncrs": "@{triggerBody()?['summary']?['total_ncrs']}",
    "time_window_start": "@{triggerBody()?['summary']?['time_window_start']}",
    "time_window_end": "@{triggerBody()?['summary']?['time_window_end']}",
    "timezone": "@{triggerBody()?['summary']?['timezone']}"
  }
}
```

### Loop Through All NCRs
To process all NCRs in the array:
```json
"Apply to each": "@{triggerBody()?['ncr_records']}"
```

## Error Handling

### Common HTTP Status Codes
- **200/202**: Success
- **400**: Bad Request (check webhook URL)
- **401**: Unauthorized (check webhook permissions)
- **500**: Server Error (Power Automate issue)

### Script Error Messages
- ✅ `Successfully sent X NCRs to Power Automate`
- ❌ `Failed to send to Power Automate. Status: XXX`
- ❌ `Error sending to Power Automate: [error details]`

## Configuration Notes

### Time Windows
- **Default**: Monday 12 PM to Monday 12 PM Eastern Time
- **Custom**: Use `--start-date` and `--end-date` parameters
- **Format**: YYYY-MM-DD HH:MM (Eastern Time)

### Data Filtering
- Script fetches ALL NCRs from ProShop
- Filters by `createdTime` field locally
- Only sends NCRs within specified time window

### Resource Tracking
- Requires `toolpots:r` scope in ProShop API
- Queries work order operations to get machine names
- Shows resource names like "PART CHECK", "INSPECT", "ROB", etc.

## Troubleshooting

### Webhook Not Receiving Data
1. Check webhook URL is correct
2. Verify Power Automate workflow is enabled
3. Check webhook permissions
4. Test with `--verbose` flag for detailed logs

### Authentication Issues
1. Verify ProShop credentials in `config.ini`
2. Check API scopes include all required permissions
3. Ensure ProShop server is accessible

### Data Issues
1. Check time window parameters
2. Verify ProShop has NCRs in the specified period
3. Review logs for filtering details

## Security Considerations

- ProShop credentials are stored in plain text in `config.ini`
- Webhook URL contains authentication tokens
- Consider using environment variables for production
- Ensure proper file permissions on configuration files

## Support

For issues or questions:
1. Check the log file for detailed error information
2. Run with `--verbose` for additional debugging
3. Verify API credentials and permissions
4. Ensure Power Automate workflow is properly configured 