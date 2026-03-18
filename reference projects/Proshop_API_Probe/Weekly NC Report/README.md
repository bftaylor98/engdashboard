# ProShop NCR Fetch Script

A Python script to fetch Non-Conformance Reports (NCRs) from ProShop via its GraphQL API and filter them by time window.

## Features

- **Authentication**: Secure login to ProShop API with session token management
- **Time Window Filtering**: Fetch NCRs created between Monday at 12pm and the previous Monday at 12pm (UTC)
- **Custom Time Windows**: Support for custom date ranges via command-line arguments
- **Multiple Output Formats**: Console output or CSV export
- **Robust Error Handling**: Retry logic with exponential backoff for network requests
- **Comprehensive Logging**: Detailed logging to both console and file
- **Summary Statistics**: Detailed breakdown of NCRs by work order, part, cause code, resource, status, and improvement suggestions
- **User Name Resolution**: Displays full names instead of user IDs
- **Assigned User Resolution**: Displays full names for assigned users, handles both IDs and role names
- **Cause Code Descriptions**: Shows human-readable descriptions instead of codes
- **Configuration Management**: External config file for credentials and settings

## Requirements

- Python 3.6 or higher
- `requests` library
- ProShop API access credentials

## Installation

1. Clone or download the script files
2. Install the required Python package:
   ```bash
   pip install requests
   ```
3. Configure the `config.ini` file with your ProShop credentials

## Configuration

Edit `config.ini` to set your ProShop credentials and logging preferences:

```ini
[proshop]
tenant_url = https://est.adionsystems.com
graphql_endpoint = /api/graphql
login_endpoint = /api/beginsession
username = your_username@domain.com
password = your_password
scope = nonconformancereports:r workorders:r parts:r users:r toolpots:r

[logging]
level = INFO
log_file = ncr_fetch.log
```

## Usage

### Basic Usage (Monday-to-Monday Window)

```bash
python fetch_ncrs.py
```

This will fetch NCRs created between the previous Monday at 12pm and the current Monday at 12pm (UTC).

### Custom Time Window

```bash
python fetch_ncrs.py --start-date "2025-01-20 12:00" --end-date "2025-01-27 12:00"
```

### Export to CSV

```bash
python fetch_ncrs.py --output csv --csv-file my_ncrs.csv
```

### Verbose Logging

```bash
python fetch_ncrs.py --verbose
```

### Command-Line Options

- `--start-date`: Start date in YYYY-MM-DD HH:MM format (UTC)
- `--end-date`: End date in YYYY-MM-DD HH:MM format (UTC)
- `--output`: Output format (`console` or `csv`)
- `--csv-file`: CSV output filename (default: `ncrs.csv`)
- `--verbose` or `-v`: Enable verbose logging

## Output

### Console Output

The script prints detailed information for each NCR in the time window:

```
--- NCR ---
ncrRefNumber: 25-0536.01
workOrderNumber: WO-12345
partDescription: Brass Bushing Assembly
createdById: John Smith
operationNumber: 46
resource: PART CHECK
causeCode: C16
improvementSuggestion: quote was incorrect, quote should have been for 4 bushings instead of 2
status: Complete
notes: 4 brass bushings unaccounted for
timestamp: 2025-01-23 04:20 PM
```

### Summary Statistics

The script also provides summary statistics:

```
==================================================
SUMMARY STATISTICS
==================================================
Total NCRs in window: 21
Time window: 2025-01-20 12:00 to 2025-01-27 12:00 UTC

Top 5 Work Orders:
  WO-12345: 3 NCRs
  WO-12346: 2 NCRs
  ...

Top 5 Parts:
  Brass Bushing Assembly: 3 NCRs
  Steel Plate Component: 2 NCRs
  ...

NCRs by Creator:
  John Smith: 5 NCRs
  Jane Doe: 3 NCRs
  ...
==================================================
```

### CSV Export

When using `--output csv`, the script creates a CSV file with columns:
- ncrRefNumber
- workOrderNumber
- partDescription
- createdById
- notes
- timestamp

## Scheduling

### Windows Task Scheduler

1. Open Task Scheduler
2. Create a new Basic Task
3. Set the trigger to run every Monday at 12:00 PM
4. Set the action to start a program:
   - Program: `python`
   - Arguments: `fetch_ncrs.py`
   - Start in: `C:\path\to\your\script\directory`

### Example Task Scheduler Command

```cmd
python "C:\Users\BTaylor\Documents\Proshop_Cursor\fetch_ncrs.py"
```

## Logging

The script creates a log file (`ncr_fetch.log` by default) with detailed information about:
- Authentication attempts
- API requests and responses
- Error handling and retries
- Processing statistics

Log levels can be configured in `config.ini`:
- `DEBUG`: Detailed debugging information
- `INFO`: General information (default)
- `WARNING`: Warning messages
- `ERROR`: Error messages only

## Error Handling

The script includes robust error handling:
- **Network Retries**: Automatic retry with exponential backoff for failed requests
- **Authentication Errors**: Clear error messages for login failures
- **Data Validation**: Graceful handling of malformed NCR data
- **Time Parsing**: Validation of date formats and time zones

## Troubleshooting

### Common Issues

1. **Authentication Failed**: Check credentials in `config.ini`
2. **No NCRs Found**: Verify the time window and API permissions
3. **Network Errors**: Check internet connectivity and ProShop server status
4. **Permission Errors**: Ensure the script has write access for log and CSV files

### Debug Mode

Run with `--verbose` to see detailed debug information:

```bash
python fetch_ncrs.py --verbose
```

## Security Notes

- Credentials are stored in plain text in `config.ini`
- Consider using environment variables for production deployments
- Log files may contain sensitive information
- Ensure proper file permissions on configuration and log files

## API Limitations

- The ProShop API does not support filtering by `createdTime` directly
- All NCRs are fetched and filtered locally in Python
- Large datasets may require significant memory and processing time

## Support

For issues or questions:
1. Check the log file for detailed error information
2. Run with `--verbose` for additional debugging
3. Verify API credentials and permissions
4. Ensure ProShop server is accessible 