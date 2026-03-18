# ProShop API Research Summary

This file contains the key findings from research scripts used to understand the ProShop GraphQL API structure and implement machine/resource tracking.

## Key Discoveries

### 1. Work Order Operations Structure
- **Field Name**: `ops` (not `operations`)
- **Return Type**: `PaginatedWorkOrderOperationResult` (not direct array)
- **Access Pattern**: `ops.records` to get the operations array
- **Individual Operation Type**: `WorkOrderOperation`

### 2. Machine/Resource Information
- **Field Name**: `workCenterPlainText` (contains the machine/resource name)
- **Alternative Field**: `workCenter` (returns WorkCell object)
- **Required Scope**: `toolpots:r` (essential for accessing machine data)
- **Example Values**: "INSPECT", "PART CHECK", "ROB", "PHILLIP", "84-1"

### 3. Operation Number Field
- **Field Name**: `operationNumber` (not `operationNum` or `opNumber`)
- **Type**: String (needs string comparison for matching)

### 4. API Query Structure
```graphql
query GetWorkOrderOps($workOrderNumber: String!) {
  workOrders(filter: { workOrderNumber: $workOrderNumber }) {
    records {
      workOrderNumber
      ops {
        records {
          operationNumber
          workCenterPlainText
        }
      }
    }
  }
}
```

### 5. Required Permissions
- **Base Scopes**: `nonconformancereports:r workorders:r parts:r users:r`
- **Machine Access**: `toolpots:r` (additional scope required)
- **Full Scope**: `nonconformancereports:r workorders:r parts:r users:r toolpots:r`

### 6. Data Relationships
```
NCR → opNumber → Work Order → ops.records → operationNumber + workCenterPlainText
```

### 7. Common Error Patterns
- **"Unexpected field"**: Wrong field name or structure
- **"Expected a selection"**: Object field needs sub-selection
- **"INVALID_PERMISSIONS"**: Missing required scope
- **"INVALID_SELECTION"**: Field doesn't exist on type

### 8. Work Order 25-0972 Example
- **Part**: 4168 Trim Blade
- **Operations**: 12 total operations
- **Operation 46**: Machine = "INSPECT"
- **Operation 10**: Machine = "ROB"
- **Operation 15**: Machine = "PHILLIP"

### 9. GraphQL Introspection Findings
- **WorkOrder Type**: Has `ops` field returning `PaginatedWorkOrderOperationResult`
- **WorkOrderOperation Type**: Has `operationNumber` and `workCenterPlainText` fields
- **WorkCell Type**: Has `commonName`, `description`, `shortName` fields

### 10. Implementation Notes
- Use string comparison for operation number matching
- Handle missing work orders gracefully
- Cache work order operations to avoid repeated API calls
- Log warnings for missing machine data
- Use retry logic for network requests

## Research Scripts Used (Now Deleted)
- `discover_ops_fields.py` - Found WorkOrderOperation fields
- `discover_workcell_fields.py` - Found WorkCell structure
- `discover_ops_fields_detailed.py` - Discovered PaginatedWorkOrderOperationResult
- `test_workorder_25_0972.py` - Confirmed working query structure
- `test_workorder_ops.py` - Tested various operation field names
- `test_workorder_query.py` - Tested work order queries
- `test_workorder_different.py` - Explored alternative approaches
- `discover_operations_query.py` - Checked for separate operations queries
- `discover_ncr_fields.py` - Explored NCR field structure
- `test_specific_workorder.py` - Tested specific work order queries
- `test_ops_query.py` - Tested operations queries
- `discover_workorder_fields.py` - Explored work order fields
- `fetch_ncrs.py` - Original script (replaced by weekly_nc.py)

## Lessons Learned
1. **API Structure**: ProShop uses paginated results for operations
2. **Permissions**: Machine data requires specific scope (`toolpots:r`)
3. **Field Names**: Must use exact field names from introspection
4. **Error Handling**: GraphQL errors are very specific about field names
5. **Data Types**: Operation numbers are strings, not integers
6. **Caching**: Work order operations should be cached to avoid repeated queries

## Final Project Structure
After cleanup, the project contains only essential files:
- `weekly_nc.py` - Main production script
- `config.ini` - Configuration file
- `README.md` - Documentation
- `requirements.txt` - Dependencies
- `AI_CONTEXT.md` - AI model context
- `RESEARCH_SUMMARY.md` - This file with research findings
- `ncr_good.py` - Reference script (kept for comparison)
- Various log and output files 