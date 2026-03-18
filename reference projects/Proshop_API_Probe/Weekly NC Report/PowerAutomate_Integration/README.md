# ProShop NCR to Power Automate Integration Package

This directory contains everything needed to integrate ProShop NCR (Non-Conformance Report) data with Microsoft Power Automate.

## 📁 Files Included

### Core Scripts
- **`weekly_nc.py`** - Main Python script that fetches NCRs from ProShop and sends to Power Automate
- **`config.ini`** - Configuration file with ProShop API credentials and settings
- **`requirements.txt`** - Python dependencies needed to run the script

### Documentation
- **`README_PowerAutomate.md`** - Comprehensive technical documentation including API details, data structure, and field mappings
- **`PowerAutomate_Setup_Guide.md`** - Step-by-step guide for configuring Power Automate flows
- **`AI_CONTEXT.md`** - Technical context and implementation details
- **`RESEARCH_SUMMARY.md`** - API research findings and field discoveries

### Sample Data
- **`sample_webhook_payload.json`** - Example JSON payload showing exact data structure sent to Power Automate

## 🚀 Quick Start

1. **Configure ProShop credentials** in `config.ini`
2. **Install Python dependencies**: `pip install -r requirements.txt`
3. **Create Power Automate flow** using `PowerAutomate_Setup_Guide.md`
4. **Test the integration**:
   ```bash
   py weekly_nc.py --output webhook --webhook-url YOUR_WEBHOOK_URL
   ```

## 📊 Data Structure

The script sends NCR data to Power Automate in this format:

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

## 🔧 ProShop API Details

- **URL**: https://est.adionsystems.com
- **Authentication**: Session-based with username/password
- **Required Scopes**: `nonconformancereports:r workorders:r parts:r users:r toolpots:r`
- **GraphQL Endpoint**: `/api/graphql`

## 📋 Key Features

- ✅ **Resource tracking** - Shows machine/work cell names
- ✅ **Cause code mapping** - Converts codes to human-readable descriptions
- ✅ **User name resolution** - Shows full names instead of IDs
- ✅ **Time window filtering** - Monday-to-Monday or custom date ranges
- ✅ **Error handling** - Robust retry logic and logging
- ✅ **Multiple output formats** - Console, CSV, or Power Automate webhook

## 🎯 Use Cases

- **Automated NCR notifications** via email or Teams
- **SharePoint list creation** for NCR tracking
- **Excel data export** for analysis
- **Real-time alerts** for quality issues
- **Dashboard integration** for management reporting

## 📖 Documentation

- **Start with**: `PowerAutomate_Setup_Guide.md` for step-by-step instructions
- **Technical details**: `README_PowerAutomate.md` for API and data structure info
- **Implementation context**: `AI_CONTEXT.md` for technical background
- **API research**: `RESEARCH_SUMMARY.md` for field mappings and discoveries

## 🔒 Security Notes

- ProShop credentials stored in `config.ini` (plain text)
- Webhook URLs contain authentication tokens
- Consider using environment variables for production
- Ensure proper file permissions

## 🆘 Support

For issues or questions:
1. Check the log file for detailed error information
2. Run with `--verbose` flag for debugging
3. Verify API credentials and permissions
4. Test with the sample JSON payload
5. Review Power Automate flow configuration

## 📞 Integration Status

- ✅ **Script tested** and working with Power Automate webhook
- ✅ **Data structure validated** with sample payload
- ✅ **Error handling implemented** for common scenarios
- ✅ **Documentation complete** for setup and configuration

Ready for production use! 🎉 