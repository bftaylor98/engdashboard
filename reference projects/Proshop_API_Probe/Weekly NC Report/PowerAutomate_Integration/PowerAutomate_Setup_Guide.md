# Power Automate Setup Guide for ProShop NCR Integration

This guide provides step-by-step instructions for configuring Power Automate to receive and process NCR data from the ProShop integration script.

## Prerequisites

- Microsoft Power Automate account
- Access to create and manage flows
- ProShop NCR integration script (`weekly_nc.py`) configured and tested

## Step 1: Create a New Flow

1. **Log into Power Automate**
   - Go to https://flow.microsoft.com
   - Sign in with your Microsoft account

2. **Create a new flow**
   - Click "Create" → "Automated cloud flow"
   - Give it a name like "ProShop NCR Processing"
   - Click "Create"

## Step 2: Add HTTP Webhook Trigger

1. **Search for trigger**
   - In the trigger search box, type "HTTP"
   - Select "When a HTTP request is received"

2. **Configure the trigger**
   - **Method**: POST
   - **Schema**: Leave blank (will auto-generate)
   - **Relative path**: Leave blank
   - Click "Save"

3. **Copy the webhook URL**
   - After saving, copy the HTTP POST URL
   - This is your webhook URL to use with the script

## Step 3: Test the Webhook

1. **Test with the script**
   ```bash
   py weekly_nc.py --output webhook --webhook-url YOUR_WEBHOOK_URL --start-date "2025-07-25 00:00" --end-date "2025-07-26 00:00"
   ```

2. **Check Power Automate**
   - Go back to your flow in Power Automate
   - Click "Test" → "Manually"
   - Run the test to see the incoming data

## Step 4: Add Data Processing Actions

### Option A: Process Individual NCRs

1. **Add "Apply to each" action**
   - Click the "+" button after the trigger
   - Search for "Apply to each"
   - Select it

2. **Configure the loop**
   - In the "Select an output from previous steps" field, click the "{}" button
   - Select "ncr_records" from the dynamic content

3. **Add actions inside the loop**
   - Click the "+" button inside the "Apply to each" action
   - Add actions like:
     - **Send email** for notifications
     - **Create item** for SharePoint lists
     - **Create row** for Excel tables
     - **Post message** for Teams channels

### Option B: Process Summary Data

1. **Add actions after the trigger**
   - Click the "+" button after the trigger
   - Add actions that use the summary data:
     - `triggerBody()?['summary']?['total_ncrs']`
     - `triggerBody()?['summary']?['time_window_start']`
     - `triggerBody()?['summary']?['time_window_end']`

## Step 5: Common Power Automate Actions

### Send Email Notification
1. **Add "Send an email" action**
2. **Configure:**
   - **To**: Recipient email addresses
   - **Subject**: "NCR Alert: @{triggerBody()?['summary']?['total_ncrs']} new NCRs"
   - **Body**: 
     ```
     New NCRs detected:
     
     Time Window: @{triggerBody()?['summary']?['time_window_start']} to @{triggerBody()?['summary']?['time_window_end']}
     Total NCRs: @{triggerBody()?['summary']?['total_ncrs']}
     
     Details:
     @{triggerBody()?['ncr_records']}
     ```

### Create SharePoint List Item
1. **Add "Create item" action**
2. **Configure:**
   - **Site Address**: Your SharePoint site
   - **List Name**: Your NCR list
   - **Title**: `@{items('Apply_to_each')?['ncrRefNumber']}`
   - **Work Order**: `@{items('Apply_to_each')?['workOrderNumber']}`
   - **Part Description**: `@{items('Apply_to_each')?['partDescription']}`
   - **Status**: `@{items('Apply_to_each')?['status']}`
   - **Resource**: `@{items('Apply_to_each')?['resource']}`

### Post to Teams Channel
1. **Add "Post message" action**
2. **Configure:**
   - **Team**: Your team
   - **Channel**: Your channel
   - **Message**: 
     ```
     🚨 New NCR Alert
     
     **NCR Number**: @{items('Apply_to_each')?['ncrRefNumber']}
     **Work Order**: @{items('Apply_to_each')?['workOrderNumber']}
     **Part**: @{items('Apply_to_each')?['partDescription']}
     **Resource**: @{items('Apply_to_each')?['resource']}
     **Status**: @{items('Apply_to_each')?['status']}
     **Notes**: @{items('Apply_to_each')?['notes']}
     ```

### Add to Excel Table
1. **Add "Add a row into a table" action**
2. **Configure:**
   - **Location**: Your Excel file
   - **Document Library**: Your SharePoint document library
   - **File**: Your Excel file
   - **Table**: Your table name
   - **Columns**: Map to NCR fields

## Step 6: Conditional Logic

### Filter by Status
1. **Add "Condition" action inside "Apply to each"**
2. **Configure:**
   - **Field**: `@{items('Apply_to_each')?['status']}`
   - **Operator**: "is equal to"
   - **Value**: "Outstanding"

### Filter by Resource
1. **Add "Condition" action**
2. **Configure:**
   - **Field**: `@{items('Apply_to_each')?['resource']}`
   - **Operator**: "contains"
   - **Value**: "INSPECT"

### Filter by Cause Code
1. **Add "Condition" action**
2. **Configure:**
   - **Field**: `@{items('Apply_to_each')?['causeCode']}`
   - **Operator**: "is not equal to"
   - **Value**: "N/A"

## Step 7: Error Handling

### Add Error Handling
1. **Add "Configure run after"**
   - Click the "..." menu on any action
   - Select "Configure run after"
   - Check "is successful" and "has failed"

2. **Add failure actions**
   - Send notification emails
   - Log errors to SharePoint
   - Post to Teams channel

## Step 8: Testing and Validation

### Test with Sample Data
1. **Use the sample JSON file**
   - Copy content from `sample_webhook_payload.json`
   - Use Power Automate's "Test" feature
   - Paste the JSON as the request body

### Validate Data Processing
1. **Check all fields are mapped correctly**
2. **Verify conditional logic works**
3. **Test error scenarios**
4. **Confirm notifications are sent**

## Step 9: Production Deployment

### Enable the Flow
1. **Turn on the flow**
   - Click "Turn on" in the flow editor
   - The webhook is now active

### Monitor the Flow
1. **Check run history**
   - Go to "My flows"
   - Click on your flow
   - View "Run history"

### Set Up Monitoring
1. **Add monitoring actions**
   - Log successful runs
   - Track processing times
   - Monitor error rates

## Troubleshooting

### Common Issues

1. **Webhook not receiving data**
   - Check the webhook URL is correct
   - Verify the flow is turned on
   - Test with the script's `--verbose` flag

2. **Data not processing correctly**
   - Check field mappings in Power Automate
   - Verify JSON structure matches expected format
   - Use the sample JSON for testing

3. **Actions not executing**
   - Check permissions for SharePoint/Teams/Excel
   - Verify conditional logic
   - Review error messages in run history

### Debug Steps

1. **Add "Compose" actions** to inspect data
2. **Use "Initialize variable"** to store intermediate values
3. **Add "Terminate" actions** to stop processing on errors
4. **Check "Run after" configurations**

## Best Practices

1. **Use meaningful action names**
2. **Add comments to complex flows**
3. **Test with small data sets first**
4. **Implement proper error handling**
5. **Monitor flow performance**
6. **Use variables for repeated values**
7. **Document your flow configuration**

## Security Considerations

1. **Webhook URLs contain authentication tokens**
2. **Store sensitive data in environment variables**
3. **Use least-privilege permissions**
4. **Regularly rotate webhook URLs**
5. **Monitor for unauthorized access**

## Support Resources

- **Power Automate Documentation**: https://docs.microsoft.com/en-us/power-automate/
- **Power Automate Community**: https://powerusers.microsoft.com/t5/Microsoft-Power-Automate/ct-p/MPACommunity
- **ProShop Integration Script**: See `README_PowerAutomate.md` for script details 