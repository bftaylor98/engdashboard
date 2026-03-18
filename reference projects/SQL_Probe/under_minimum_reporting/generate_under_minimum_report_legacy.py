"""
Generate Under Minimum Stock Report
Queries ZOLLERSQLEXPRESS DB to find items that are under their minimum stock requirements
"""
import sys
import os

# Add parent directory to path to import sql_probe
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from sql_probe import SQLProbe
from datetime import datetime
import html
import time


TARGET_HEADERS = [
    "C-ID",
    "Description",
    "Part No",
    "Current Stock",
    "Minimum Stock",
    "Difference",
    "Storage Location",
    "Supplier",
]


def get_component_part_no(probe, comp_id):
    """Get Part No (OrderNo) for a component."""
    query = f"""
        SELECT vd.ValStr
        FROM ValData vd
        INNER JOIN FieldInfo fi ON vd.FieldId = fi.FieldId
        WHERE vd.ObjId = {comp_id}
            AND fi.ColumnName = 'OrderNo'
    """
    result = probe.execute_query(query)
    if result and result[0]:
        return result[0][0] or ""
    return ""


def get_component_storage_location(probe, comp_id):
    """Get StorageLocation for a component."""
    query = f"""
        SELECT vd.ValStr
        FROM ValData vd
        INNER JOIN FieldInfo fi ON vd.FieldId = fi.FieldId
        WHERE vd.ObjId = {comp_id}
            AND fi.ColumnName = 'StorageLocation'
    """
    result = probe.execute_query(query)
    if result and result[0]:
        return result[0][0] or ""
    return ""


def get_component_supplier(probe, comp_id):
    """Get Supplier for a component."""
    query = f"""
        SELECT vd.ValStr
        FROM ValData vd
        INNER JOIN FieldInfo fi ON vd.FieldId = fi.FieldId
        WHERE vd.ObjId = {comp_id}
            AND fi.ColumnName = 'Supplier'
    """
    result = probe.execute_query(query)
    if result and result[0]:
        return result[0][0] or ""
    return ""


def get_part_number_link(part_no: str) -> str:
    """Generate a hyperlink URL for a part number if it matches a known company."""
    PART_NUMBER_LINKS = {
        'OSG': lambda suffix: f"https://osgtool.com/{suffix}",
        'ALLI': lambda suffix: f"https://www.alliedmachine.com/PRODUCTS/ItemDetail.aspx?item={suffix}",
        'GARR': lambda suffix: f"https://www.garrtool.com/product-details/?EDP={suffix}",
        'GUHR': lambda suffix: f"https://guhring.com/ProductsServices/SizeDetails?EDP={suffix}",
        'HARV': lambda suffix: f"https://www.harveytool.com/products/tool-details-{suffix}",
        'INGE': lambda suffix: f"https://www.ingersoll-imc.com/product/{suffix}",
    }
    
    if not part_no or not part_no.strip():
        return None
    
    part_no = part_no.strip()
    
    for prefix, url_func in PART_NUMBER_LINKS.items():
        prefix_with_hyphen = f"{prefix}-"
        if part_no.upper().startswith(prefix_with_hyphen.upper()):
            suffix = part_no[len(prefix_with_hyphen):].strip()
            if suffix:
                return url_func(suffix)
    
    return None


def debug_minimum_stock_sources(probe):
    """
    Debug function to explore where minimum stock data might be stored.
    Returns sample data from various sources.
    """
    print("\n=== DEBUG: Exploring Minimum Stock Sources ===\n")
    
    # Check ValData for minimum stock fields
    print("1. Checking ValData for minimum stock attributes...")
    query1 = """
        SELECT DISTINCT fi.ColumnName
        FROM FieldInfo fi
        WHERE fi.ColumnName LIKE '%Min%' OR fi.ColumnName LIKE '%Minimum%' OR fi.ColumnName LIKE '%Stock%'
        ORDER BY fi.ColumnName
    """
    result1 = probe.execute_query_with_headers(query1)
    if result1:
        columns, rows = result1
        print(f"   Found {len(rows)} potential minimum stock fields:")
        for row in rows[:10]:
            print(f"   - {row[columns.index('ColumnName')]}")
    
    # Check StorageBooking for components with minimums
    print("\n2. Checking StorageBooking for components with StorageQuantityMin...")
    query2 = """
        SELECT TOP 10
            sb.ObjId,
            od.ObjTxt,
            sb.StorageQuantityMin,
            sb.Quantity,
            sb.Status
        FROM StorageBooking sb
        INNER JOIN ObjData od ON sb.ObjId = od.ObjId
        WHERE od.ObjType = 11
          AND sb.StorageQuantityMin IS NOT NULL
          AND sb.StorageQuantityMin > 0
        ORDER BY sb.ObjId
    """
    result2 = probe.execute_query_with_headers(query2)
    if result2:
        columns, rows = result2
        print(f"   Found {len(rows)} StorageBooking records with minimums:")
        for row in rows:
            print(f"   - ObjId: {row[columns.index('ObjId')]}, Code: {row[columns.index('ObjTxt')]}, Min: {row[columns.index('StorageQuantityMin')]}, Qty: {row[columns.index('Quantity')]}, Status: {row[columns.index('Status')]}")
    
    # Check ALL StorageBooking records for components (not just those with minimums)
    print("\n2b. Checking ALL StorageBooking records for components C-90 and C-97...")
    query2b = """
        SELECT 
            sb.ObjId,
            od.ObjTxt,
            sb.StorageQuantityMin,
            sb.StorageQuantityMax,
            sb.Quantity,
            sb.Status,
            sb.StoragePlace,
            sb.StorageObjTxt
        FROM StorageBooking sb
        INNER JOIN ObjData od ON sb.ObjId = od.ObjId
        WHERE od.ObjType = 11
          AND od.ObjTxt IN ('C-90', 'C-97')
        ORDER BY od.ObjTxt, sb.StorageQuantityMin
    """
    result2b = probe.execute_query_with_headers(query2b)
    if result2b:
        columns, rows = result2b
        print(f"   Found {len(rows)} StorageBooking records for C-90 and C-97:")
        for row in rows:
            print(f"   - ObjId: {row[columns.index('ObjId')]}, Code: {row[columns.index('ObjTxt')]}, "
                  f"Min: {row[columns.index('StorageQuantityMin')]}, "
                  f"Max: {row[columns.index('StorageQuantityMax')]}, "
                  f"Qty: {row[columns.index('Quantity')]}, "
                  f"Status: {row[columns.index('Status')]}, "
                  f"Place: {row[columns.index('StoragePlace')]}, "
                  f"Storage: {row[columns.index('StorageObjTxt')]}")
    else:
        print("   No StorageBooking records found for C-90 and C-97")
    
    # Check StoragePlaces
    print("\n3. Checking StoragePlaces for QuantityMin...")
    query3 = """
        SELECT TOP 10
            sp.BaseObjId,
            sp.PlaceObjId,
            sp.QuantityMin,
            sp.QuantityMax
        FROM StoragePlaces sp
        WHERE sp.QuantityMin IS NOT NULL
          AND sp.QuantityMin > 0
        ORDER BY sp.BaseObjId
    """
    result3 = probe.execute_query_with_headers(query3)
    if result3:
        columns, rows = result3
        print(f"   Found {len(rows)} StoragePlaces records with minimums:")
        for row in rows:
            print(f"   - BaseObjId: {row[columns.index('BaseObjId')]}, PlaceObjId: {row[columns.index('PlaceObjId')]}, Min: {row[columns.index('QuantityMin')]}")
    
    # Check StoragePlaces for the specific storage places used by C-90 and C-97
    print("\n3b. Checking StoragePlaces for D1-P19 and D1-P25...")
    query3b = """
        SELECT 
            sp.BaseObjId,
            sp.PlaceObjId,
            sp.QuantityMin,
            sp.QuantityMax,
            sp.Description,
            od.ObjTxt AS PlaceObjTxt
        FROM StoragePlaces sp
        LEFT JOIN ObjData od ON sp.PlaceObjId = od.ObjId
        WHERE sp.Description IN ('D1-P19', 'D1-P25')
           OR od.ObjTxt IN ('D1-P19', 'D1-P25')
        ORDER BY sp.Description
    """
    result3b = probe.execute_query_with_headers(query3b)
    if result3b:
        columns, rows = result3b
        print(f"   Found {len(rows)} StoragePlaces records for D1-P19 and D1-P25:")
        for row in rows:
            print(f"   - BaseObjId: {row[columns.index('BaseObjId')]}, "
                  f"PlaceObjId: {row[columns.index('PlaceObjId')]}, "
                  f"Description: {row[columns.index('Description')]}, "
                  f"PlaceObjTxt: {row[columns.index('PlaceObjTxt')]}, "
                  f"Min: {row[columns.index('QuantityMin')]}, "
                  f"Max: {row[columns.index('QuantityMax')]}")
    else:
        print("   No StoragePlaces records found for D1-P19 and D1-P25")
    
    # Check StoragePlaces by PlaceObjId from StorageBooking (C-90 has StoragePlaceObjId = 2180)
    print("\n3d. Checking StoragePlaces by PlaceObjId from StorageBooking (C-90 has PlaceObjId=2180)...")
    query3d = """
        SELECT 
            sp.BaseObjId,
            sp.PlaceObjId,
            sp.QuantityMin,
            sp.QuantityMax,
            sp.Description,
            sb.StoragePlace,
            sb.ObjTxt AS ComponentCode
        FROM StorageBooking sb
        INNER JOIN StoragePlaces sp ON sp.PlaceObjId = sb.StoragePlaceObjId
        INNER JOIN ObjData od ON sb.ObjId = od.ObjId
        WHERE od.ObjType = 11
          AND od.ObjTxt IN ('C-90', 'C-97')
          AND sb.StoragePlaceObjId IS NOT NULL
    """
    result3d = probe.execute_query_with_headers(query3d)
    if result3d:
        columns, rows = result3d
        print(f"   Found {len(rows)} StoragePlaces records matched by PlaceObjId:")
        for row in rows:
            print(f"   - Component: {row[columns.index('ComponentCode')]}, "
                  f"StoragePlace: {row[columns.index('StoragePlace')]}, "
                  f"PlaceObjId: {row[columns.index('PlaceObjId')]}, "
                  f"BaseObjId: {row[columns.index('BaseObjId')]}, "
                  f"Description: {row[columns.index('Description')]}, "
                  f"Min: {row[columns.index('QuantityMin')]}, "
                  f"Max: {row[columns.index('QuantityMax')]}")
    else:
        print("   No StoragePlaces records found by PlaceObjId")
    result3b = probe.execute_query_with_headers(query3b)
    if result3b:
        columns, rows = result3b
        print(f"   Found {len(rows)} StoragePlaces records for D1-P19 and D1-P25:")
        for row in rows:
            print(f"   - BaseObjId: {row[columns.index('BaseObjId')]}, "
                  f"PlaceObjId: {row[columns.index('PlaceObjId')]}, "
                  f"Description: {row[columns.index('Description')]}, "
                  f"PlaceObjTxt: {row[columns.index('PlaceObjTxt')]}, "
                  f"Min: {row[columns.index('QuantityMin')]}, "
                  f"Max: {row[columns.index('QuantityMax')]}")
    else:
        print("   No StoragePlaces records found for D1-P19 and D1-P25")
    
    # Also check if StoragePlace is stored as a string in StorageBooking and match to StoragePlaces
    print("\n3c. Checking StoragePlaces by matching StoragePlace string from StorageBooking...")
    query3c = """
        SELECT DISTINCT
            sb.StoragePlace,
            sp.QuantityMin,
            sp.QuantityMax,
            sp.Description
        FROM StorageBooking sb
        INNER JOIN ObjData od ON sb.ObjId = od.ObjId
        LEFT JOIN StoragePlaces sp ON sp.Description = sb.StoragePlace
        WHERE od.ObjType = 11
          AND od.ObjTxt IN ('C-90', 'C-97')
          AND sb.StoragePlace IS NOT NULL
    """
    result3c = probe.execute_query_with_headers(query3c)
    if result3c:
        columns, rows = result3c
        print(f"   Found {len(rows)} matching records:")
        for row in rows:
            print(f"   - StoragePlace: {row[columns.index('StoragePlace')]}, "
                  f"Description: {row[columns.index('Description')]}, "
                  f"Min: {row[columns.index('QuantityMin')]}, "
                  f"Max: {row[columns.index('QuantityMax')]}")
    
    # Check components with CountInv
    print("\n4. Checking components with inventory counts...")
    query4 = """
        SELECT TOP 10
            od.ObjId,
            od.ObjTxt,
            od.CountInv
        FROM ObjData od
        WHERE od.ObjType = 11
          AND od.CountInv IS NOT NULL
        ORDER BY od.CountInv DESC
    """
    result4 = probe.execute_query_with_headers(query4)
    if result4:
        columns, rows = result4
        print(f"   Found {len(rows)} components with inventory counts:")
        for row in rows:
            print(f"   - ObjId: {row[columns.index('ObjId')]}, Code: {row[columns.index('ObjTxt')]}, CountInv: {row[columns.index('CountInv')]}")
    
    # Check C-90 and C-97 specifically - all their data
    print("\n5. Detailed check for C-90, C-97, and C-153...")
    query5 = """
        SELECT 
            od.ObjId,
            od.ObjTxt,
            od.DescrTxt,
            od.CountInv,
            (SELECT COUNT(*) FROM StorageBooking sb WHERE sb.ObjId = od.ObjId) AS StorageBookingCount,
            (SELECT SUM(sb.Quantity) FROM StorageBooking sb WHERE sb.ObjId = od.ObjId AND sb.Status IN (0,1,2)) AS TotalQuantity,
            (SELECT MIN(sb.StorageQuantityMin) FROM StorageBooking sb WHERE sb.ObjId = od.ObjId AND sb.StorageQuantityMin IS NOT NULL) AS MinStorageQuantityMin,
            (SELECT MAX(sb.StorageQuantityMin) FROM StorageBooking sb WHERE sb.ObjId = od.ObjId AND sb.StorageQuantityMin IS NOT NULL) AS MaxStorageQuantityMin
        FROM ObjData od
        WHERE od.ObjType = 11
          AND od.ObjTxt IN ('C-90', 'C-97', 'C-153')
    """
    result5 = probe.execute_query_with_headers(query5)
    if result5:
        columns, rows = result5
        print(f"   Found {len(rows)} components:")
        for row in rows:
            print(f"   - Code: {row[columns.index('ObjTxt')]}, "
                  f"ObjId: {row[columns.index('ObjId')]}, "
                  f"CountInv: {row[columns.index('CountInv')]}, "
                  f"StorageBookingCount: {row[columns.index('StorageBookingCount')]}, "
                  f"TotalQuantity: {row[columns.index('TotalQuantity')]}, "
                  f"MinStorageQuantityMin: {row[columns.index('MinStorageQuantityMin')]}, "
                  f"MaxStorageQuantityMin: {row[columns.index('MaxStorageQuantityMin')]}")
    
    # Check if there's a pattern - maybe all components in ZTO_2 should have minimum 2?
    print("\n6. Checking if there's a pattern - components in ZTO_2 storage...")
    query6 = """
        SELECT 
            od.ObjTxt,
            (SELECT SUM(sb.Quantity) FROM StorageBooking sb WHERE sb.ObjId = od.ObjId AND sb.Status IN (0,1,2)) AS CurrentQty,
            (SELECT COUNT(*) FROM StorageBooking sb WHERE sb.ObjId = od.ObjId) AS BookingCount
        FROM ObjData od
        WHERE od.ObjType = 11
          AND EXISTS (
              SELECT 1 FROM StorageBooking sb 
              WHERE sb.ObjId = od.ObjId 
                AND sb.StorageObjTxt = 'ZTO_2'
          )
        ORDER BY od.ObjTxt
    """
    result6 = probe.execute_query_with_headers(query6)
    if result6:
        columns, rows = result6
        print(f"   Found {len(rows)} components in ZTO_2 storage:")
        qty_1 = [r for r in rows if r[columns.index('CurrentQty')] == 1]
        qty_2_plus = [r for r in rows if r[columns.index('CurrentQty')] and r[columns.index('CurrentQty')] >= 2]
        print(f"   Components with Qty=1: {len(qty_1)}")
        print(f"   Components with Qty>=2: {len(qty_2_plus)}")
        if len(qty_1) > 0:
            print(f"   Sample components with Qty=1: {[r[columns.index('ObjTxt')] for r in qty_1[:5]]}")
    
    # Check ValData for any numeric fields that might be minimum stock
    print("\n7. Checking ValData numeric fields for C-90 and C-97 that might be minimum...")
    query7 = """
        SELECT 
            od.ObjTxt,
            fi.ColumnName,
            vd.ValNum
        FROM ObjData od
        INNER JOIN ValData vd ON od.ObjId = vd.ObjId
        INNER JOIN FieldInfo fi ON vd.FieldId = fi.FieldId
        WHERE od.ObjType = 11
          AND od.ObjTxt IN ('C-90', 'C-97')
          AND vd.ValNum IS NOT NULL
          AND vd.ValNum > 0
          AND vd.ValNum < 100  -- Reasonable range for minimum stock
        ORDER BY od.ObjTxt, vd.ValNum
    """
    result7 = probe.execute_query_with_headers(query7)
    if result7:
        columns, rows = result7
        print(f"   Found {len(rows)} ValData numeric fields:")
        for row in rows:
            print(f"   - {row[columns.index('ObjTxt')]}: {row[columns.index('ColumnName')]} = {row[columns.index('ValNum')]}")
    
    # Check ALL ValData fields for C-90 (not just numeric, and not just small numbers)
    print("\n7b. Checking ALL ValData fields for C-90 (comprehensive)...")
    query7b = """
        SELECT 
            fi.ColumnName,
            vd.ValStr,
            vd.ValNum,
            fi.DataType,
            fi.ValType,
            vd.TableId,
            fi.FieldId,
            ti.TableName
        FROM ObjData od
        INNER JOIN ValData vd ON od.ObjId = vd.ObjId
        INNER JOIN FieldInfo fi ON vd.FieldId = fi.FieldId
        LEFT JOIN TableInfo ti ON vd.TableId = ti.TableId
        WHERE od.ObjType = 11
          AND od.ObjTxt = 'C-90'
        ORDER BY vd.TableId, fi.ColumnName
    """
    result7b = probe.execute_query_with_headers(query7b)
    if result7b:
        columns, rows = result7b
        print(f"   Found {len(rows)} ValData fields for C-90:")
        # Group by TableId to see different tables
        tables = {}
        for row in rows:
            table_id = row[columns.index('TableId')]
            table_name = row[columns.index('TableName')] if 'TableName' in columns else 'Unknown'
            if table_id not in tables:
                tables[table_id] = {'name': table_name, 'fields': []}
            tables[table_id]['fields'].append(row)
        
        for table_id, table_info in sorted(tables.items()):
            print(f"   TableId={table_id} (TableName={table_info['name']}):")
            for row in table_info['fields']:
                col_name = row[columns.index('ColumnName')]
                val_str = row[columns.index('ValStr')]
                val_num = row[columns.index('ValNum')]
                data_type = row[columns.index('DataType')]
                val_type = row[columns.index('ValType')]
                field_id = row[columns.index('FieldId')]
                if val_str or (val_num and val_num != 0):
                    print(f"     - {col_name} (FieldId={field_id}): ValStr='{val_str}', ValNum={val_num}, DataType={data_type}, ValType={val_type}")
    
    # Check what TableIds exist for components and what they're called
    print("\n7e. Checking what TableIds exist for components and their names...")
    query7e = """
        SELECT DISTINCT
            vd.TableId,
            ti.TableName,
            COUNT(DISTINCT vd.ObjId) AS ComponentCount,
            COUNT(*) AS TotalRecords
        FROM ValData vd
        INNER JOIN ObjData od ON vd.ObjId = od.ObjId
        LEFT JOIN TableInfo ti ON vd.TableId = ti.TableId
        WHERE od.ObjType = 11
        GROUP BY vd.TableId, ti.TableName
        ORDER BY vd.TableId
    """
    result7e = probe.execute_query_with_headers(query7e)
    if result7e:
        columns, rows = result7e
        print(f"   Found {len(rows)} different TableIds for components:")
        for row in rows:
            print(f"   - TableId={row[columns.index('TableId')]}, TableName={row[columns.index('TableName')]}, "
                  f"Used by {row[columns.index('ComponentCount')]} components, {row[columns.index('TotalRecords')]} total records")
    
    # Check for minimum stock field names that might be in article data (check all TableIds)
    print("\n7d. Searching for minimum stock field names in FieldInfo (all TableIds)...")
    query7d = """
        SELECT DISTINCT
            fi.ColumnName,
            fi.FieldId,
            fi.DataType,
            vd.TableId,
            ti.TableName,
            COUNT(*) AS UsageCount
        FROM FieldInfo fi
        INNER JOIN ValData vd ON fi.FieldId = vd.FieldId
        INNER JOIN ObjData od ON vd.ObjId = od.ObjId
        LEFT JOIN TableInfo ti ON vd.TableId = ti.TableId
        WHERE od.ObjType = 11
          AND (
              fi.ColumnName LIKE '%Min%' 
              OR fi.ColumnName LIKE '%Minimum%'
              OR fi.ColumnName LIKE '%Stock%'
              OR fi.ColumnName LIKE '%Quantity%'
          )
          AND vd.ValNum IS NOT NULL
          AND vd.ValNum > 0
          AND vd.ValNum < 100
        GROUP BY fi.ColumnName, fi.FieldId, fi.DataType, vd.TableId, ti.TableName
        ORDER BY vd.TableId, UsageCount DESC, fi.ColumnName
    """
    result7d = probe.execute_query_with_headers(query7d)
    if result7d:
        columns, rows = result7d
        print(f"   Found {len(rows)} potential minimum stock fields in use:")
        for row in rows:
            print(f"   - {row[columns.index('ColumnName')]} (FieldId={row[columns.index('FieldId')]}, "
                  f"TableId={row[columns.index('TableId')]}, TableName={row[columns.index('TableName')]}, "
                  f"DataType={row[columns.index('DataType')]}, Used {row[columns.index('UsageCount')]} times)")
    
    # Check StorageBooking more thoroughly for C-90 - maybe minimum is in a different field
    print("\n7c. Checking ALL StorageBooking fields for C-90...")
    query7c = """
        SELECT TOP 1
            *
        FROM StorageBooking sb
        INNER JOIN ObjData od ON sb.ObjId = od.ObjId
        WHERE od.ObjType = 11
          AND od.ObjTxt = 'C-90'
    """
    # Get column names first
    result7c_headers = probe.execute_query("""
        SELECT COLUMN_NAME 
        FROM INFORMATION_SCHEMA.COLUMNS 
        WHERE TABLE_NAME = 'StorageBooking'
        ORDER BY ORDINAL_POSITION
    """)
    if result7c_headers:
        print(f"   StorageBooking has {len(result7c_headers)} columns")
        # Get a sample record
        result7c = probe.execute_query_with_headers("""
            SELECT TOP 1 *
            FROM StorageBooking sb
            INNER JOIN ObjData od ON sb.ObjId = od.ObjId
            WHERE od.ObjType = 11
              AND od.ObjTxt = 'C-90'
        """)
        if result7c:
            columns, rows = result7c
            if rows:
                print(f"   Sample StorageBooking record for C-90:")
                for i, col in enumerate(columns):
                    val = rows[0][i]
                    if val is not None and str(val) != 'None' and str(val) != '':
                        # Only show non-null, non-empty values
                        if isinstance(val, (int, float)) and val != 0:
                            print(f"     {col} = {val}")
                        elif isinstance(val, str) and val.strip():
                            print(f"     {col} = '{val}'")
    
    # Check if there's an "Article" table or if overall minimum might be in a different table
    print("\n7f. Checking for Article-related tables that might contain overall minimum...")
    query7f = """
        SELECT TABLE_NAME
        FROM INFORMATION_SCHEMA.TABLES
        WHERE TABLE_NAME LIKE '%Article%'
           OR TABLE_NAME LIKE '%Component%'
        ORDER BY TABLE_NAME
    """
    result7f = probe.execute_query(query7f)
    if result7f:
        print(f"   Found {len(result7f)} article/component related tables:")
        for row in result7f:
            print(f"   - {row[0]}")
    
    # Since the user mentioned "article data sub table" - check what fields exist in FieldInfo
    print("\n7g. Checking ALL FieldInfo fields that contain 'Min' or 'Stock' or 'Quantity'...")
    query7g = """
        SELECT 
            fi.FieldId,
            fi.ColumnName,
            fi.DataType,
            fi.ValType,
            COUNT(DISTINCT vd.ObjId) AS ComponentCount
        FROM FieldInfo fi
        LEFT JOIN ValData vd ON fi.FieldId = vd.FieldId
        LEFT JOIN ObjData od ON vd.ObjId = od.ObjId AND od.ObjType = 11
        WHERE (
            fi.ColumnName LIKE '%Min%' 
            OR fi.ColumnName LIKE '%Stock%'
            OR fi.ColumnName LIKE '%Quantity%'
        )
        GROUP BY fi.FieldId, fi.ColumnName, fi.DataType, fi.ValType
        ORDER BY ComponentCount DESC, fi.ColumnName
    """
    result7g = probe.execute_query_with_headers(query7g)
    if result7g:
        columns, rows = result7g
        print(f"   Found {len(rows)} potential fields:")
        for row in rows[:20]:  # Show top 20
            print(f"   - {row[columns.index('ColumnName')]} (FieldId={row[columns.index('FieldId')]}, "
                  f"DataType={row[columns.index('DataType')]}, ValType={row[columns.index('ValType')]}, "
                  f"Used by {row[columns.index('ComponentCount')]} components)")
    
    print("\n=== End Debug ===\n")


def query_under_minimum_items(probe):
    """
    Query components that are under their minimum stock requirements.
    
    Uses StorageQuantityMin from StorageBooking (storage location specific minimum).
    This is the minimum stock requirement set per storage location.
    
    Current stock = sum of StorageBooking.Quantity for active statuses (Status IN 0,1,2)
    Minimum stock = StorageQuantityMin from StorageBooking
    """
    query = """
        WITH ComponentCurrentStock AS (
            -- Calculate current stock from StorageBooking Quantity (sum of active bookings)
            SELECT 
                od.ObjId,
                COALESCE(
                    (SELECT SUM(COALESCE(sb.Quantity, 0))
                     FROM StorageBooking sb
                     WHERE sb.ObjId = od.ObjId
                       AND sb.Status IN (0, 1, 2)  -- Active statuses
                    ),
                    0
                ) AS CurrentStock
            FROM ObjData od
            WHERE od.ObjType = 11
        ),
        ComponentMinimums AS (
            -- Get minimum stock from StorageBooking.StorageQuantityMin
            -- If multiple records exist, use the minimum value (most restrictive)
            SELECT DISTINCT
                od.ObjId,
                (SELECT MIN(sb.StorageQuantityMin)
                 FROM StorageBooking sb 
                 WHERE sb.ObjId = od.ObjId 
                   AND sb.StorageQuantityMin IS NOT NULL 
                   AND sb.StorageQuantityMin > 0
                ) AS MinimumStock
            FROM ObjData od
            WHERE od.ObjType = 11
              -- Only include components that have StorageQuantityMin set
              AND EXISTS (
                  SELECT 1 FROM StorageBooking sb 
                  WHERE sb.ObjId = od.ObjId 
                    AND sb.StorageQuantityMin IS NOT NULL 
                    AND sb.StorageQuantityMin > 0
              )
        )
        SELECT 
            od.ObjId AS ComponentId,
            od.ObjTxt AS ComponentCode,
            od.DescrTxt AS ComponentDescription,
            ccs.CurrentStock,
            cm.MinimumStock
        FROM ObjData od
        INNER JOIN ComponentCurrentStock ccs ON od.ObjId = ccs.ObjId
        INNER JOIN ComponentMinimums cm ON od.ObjId = cm.ObjId
        WHERE od.ObjType = 11
          AND cm.MinimumStock IS NOT NULL
          AND cm.MinimumStock > 0
          AND ccs.CurrentStock < cm.MinimumStock
        ORDER BY od.ObjTxt
    """
    
    result = probe.execute_query_with_headers(query)
    if not result:
        return []
    
    columns, rows = result
    report_rows = []
    
    for row in rows:
        comp_id = row[columns.index('ComponentId')]
        comp_code = row[columns.index('ComponentCode')] or ""
        comp_desc = row[columns.index('ComponentDescription')] or ""
        current_stock = row[columns.index('CurrentStock')] or 0
        minimum_stock = row[columns.index('MinimumStock')] or 0
        
        # Only include items where current stock is less than minimum
        # (This should already be filtered in the query, but double-check)
        try:
            current_stock_int = int(current_stock)
            minimum_stock_int = int(minimum_stock)
            
            if current_stock_int < minimum_stock_int:
                difference = current_stock_int - minimum_stock_int
                
                # Get additional component info
                part_no = get_component_part_no(probe, comp_id)
                storage_location = get_component_storage_location(probe, comp_id)
                supplier = get_component_supplier(probe, comp_id)
                
                report_rows.append({
                    'C-ID': comp_code,
                    'Description': comp_desc,
                    'Part No': part_no,
                    'Current Stock': str(current_stock_int),
                    'Minimum Stock': str(minimum_stock_int),
                    'Difference': str(difference),
                    'Storage Location': storage_location,
                    'Supplier': supplier,
                })
        except (ValueError, TypeError):
            # Skip rows with invalid numeric values
            continue
    
    return report_rows


def generate_html_report(rows, output_html):
    """Generate HTML report from under minimum stock rows."""
    if not rows:
        print("No items found under minimum stock")
        return
    
    # Prepare rows for HTML
    rows_html = []
    
    for row_data in rows:
        cid_val = row_data.get('C-ID', '').strip()
        desc_val = row_data.get('Description', '').strip()
        part_val = row_data.get('Part No', '').strip()
        current_stock = row_data.get('Current Stock', '').strip()
        minimum_stock = row_data.get('Minimum Stock', '').strip()
        difference = row_data.get('Difference', '').strip()
        storage_location = row_data.get('Storage Location', '').strip()
        supplier = row_data.get('Supplier', '').strip()
        
        rows_html.append([
            cid_val,
            desc_val,
            part_val,
            current_stock,
            minimum_stock,
            difference,
            storage_location,
            supplier,
        ])
    
    # Build header row
    header_cells = []
    for idx, header in enumerate(TARGET_HEADERS):
        header_text = html.escape(header)
        header_cells.append(f'<th class="sortable" data-col="{idx}">{header_text} <span class="sort-indicator">⇅</span></th>')
    header_row = "<tr>" + "".join(header_cells) + "</tr>"
    
    # Build body rows
    body_rows = []
    for row in rows_html:
        cells = []
        for idx, cell in enumerate(row):
            cell_text = html.escape(cell)
            
            if idx == 2 and cell.strip():  # Part No column
                part_link = get_part_number_link(cell)
                if part_link:
                    cells.append(f'<td><a href="{html.escape(part_link)}" target="_blank">{cell_text}</a></td>')
                else:
                    cells.append(f'<td>{cell_text}</td>')
            elif idx == 5:  # Difference column - highlight negative values
                try:
                    diff_int = int(cell)
                    if diff_int < 0:
                        cells.append(f'<td class="under-minimum">{cell_text}</td>')
                    else:
                        cells.append(f'<td>{cell_text}</td>')
                except (ValueError, TypeError):
                    cells.append(f'<td>{cell_text}</td>')
            else:
                cells.append(f'<td>{cell_text}</td>')
        body_rows.append(f'<tr>{"".join(cells)}</tr>')
    
    # Generate timestamp
    timestamp = datetime.now().strftime("%m/%d/%Y %I:%M %p")
    
    html_content = f"""<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Under Minimum Stock Report</title>
    <style>
        * {{
            margin: 0;
            padding: 0;
            box-sizing: border-box;
        }}

        body {{
            font-family: Arial, sans-serif;
            padding: 30px;
            background-color: #f5f5f5;
            color: #333;
        }}

        .container {{
            max-width: 2000px;
            margin: 0 auto;
            background: white;
            padding: 40px;
            box-shadow: 0 2px 10px rgba(0,0,0,0.1);
            border-radius: 8px;
        }}

        .header-section {{
            display: flex;
            align-items: center;
            justify-content: center;
            gap: 20px;
            margin-bottom: 20px;
        }}

        h1 {{
            font-size: 36px;
            margin-bottom: 8px;
            color: #333;
            text-align: center;
        }}

        .subtitle {{
            font-size: 20px;
            margin-bottom: 20px;
            color: #666;
            text-align: center;
        }}

        .summary {{
            background-color: #fff3cd;
            border: 2px solid #ffc107;
            border-radius: 5px;
            padding: 15px;
            margin-bottom: 20px;
            text-align: center;
            font-weight: bold;
            color: #856404;
        }}

        .table-wrapper {{
            overflow-x: auto;
            margin-bottom: 30px;
        }}

        table {{
            width: 100%;
            border-collapse: collapse;
            font-size: 16px;
            min-width: 1200px;
        }}

        th {{
            background-color: #f2f2f2;
            font-weight: bold;
            font-size: 18px;
            padding: 12px 10px;
            text-align: center;
            border: 1px solid #ddd;
            position: sticky;
            top: 0;
            z-index: 10;
            cursor: pointer;
            user-select: none;
        }}

        th:hover {{
            background-color: #e0e0e0;
        }}

        th.sortable {{
            position: relative;
        }}

        .sort-indicator {{
            font-size: 12px;
            margin-left: 5px;
            opacity: 0.5;
        }}

        td {{
            padding: 10px;
            border: 1px solid #ddd;
            text-align: center;
        }}

        tr:nth-child(even) {{
            background-color: #f9f9f9;
        }}

        tr:hover {{
            background-color: #f0f0f0;
        }}

        .under-minimum {{
            background-color: #ffebee;
            color: #c62828;
            font-weight: bold;
        }}

        a {{
            color: #0066cc;
            text-decoration: none;
        }}

        a:hover {{
            text-decoration: underline;
        }}

        .timestamp {{
            text-align: center;
            color: #666;
            font-size: 14px;
            margin-top: 20px;
        }}
    </style>
</head>
<body>
    <div class="container">
        <div class="header-section">
            <div class="title-section">
                <h1>Under Minimum Stock Report</h1>
                <div class="subtitle">Items Below Minimum Stock Requirements</div>
            </div>
        </div>
        
        <div class="summary">
            Total Items Under Minimum: {len(rows)}
        </div>
        
        <div class="table-wrapper">
            <table id="reportTable">
                <thead>
                    {header_row}
                </thead>
                <tbody>
                    {''.join(body_rows)}
                </tbody>
            </table>
        </div>
        
        <div class="timestamp">
            Report Generated: {timestamp}
        </div>
    </div>
    
    <script>
        // Table sorting functionality
        const table = document.getElementById('reportTable');
        const headers = table.querySelectorAll('th.sortable');
        let sortColumn = -1;
        let sortDirection = 1;

        headers.forEach((header, index) => {{
            header.addEventListener('click', () => {{
                if (sortColumn === index) {{
                    sortDirection *= -1;
                }} else {{
                    sortColumn = index;
                    sortDirection = 1;
                }}
                
                sortTable(index, sortDirection);
                updateSortIndicators();
            }});
        }});

        function sortTable(column, direction) {{
            const tbody = table.querySelector('tbody');
            const rows = Array.from(tbody.querySelectorAll('tr'));
            
            rows.sort((a, b) => {{
                const aText = a.cells[column].textContent.trim();
                const bText = b.cells[column].textContent.trim();
                
                // Try numeric comparison first
                const aNum = parseFloat(aText.replace(/[^0-9.-]/g, ''));
                const bNum = parseFloat(bText.replace(/[^0-9.-]/g, ''));
                
                if (!isNaN(aNum) && !isNaN(bNum)) {{
                    return (aNum - bNum) * direction;
                }}
                
                // Fall back to string comparison
                return aText.localeCompare(bText) * direction;
            }});
            
            rows.forEach(row => tbody.appendChild(row));
        }}

        function updateSortIndicators() {{
            headers.forEach((header, index) => {{
                const indicator = header.querySelector('.sort-indicator');
                if (index === sortColumn) {{
                    indicator.textContent = sortDirection === 1 ? ' ↑' : ' ↓';
                    indicator.style.opacity = '1';
                }} else {{
                    indicator.textContent = ' ⇅';
                    indicator.style.opacity = '0.5';
                }}
            }});
        }}
    </script>
</body>
</html>"""
    
    with open(output_html, 'w', encoding='utf-8') as f:
        f.write(html_content)
    
    print(f"Saved HTML report to {os.path.abspath(output_html)}")
    print(f"Generated report with {len(rows)} items under minimum stock")


def main():
    """Main function to generate under minimum stock report."""
    SERVER = r"ESTSS01\ZOLLERSQLEXPRESS"
    DATABASE = "ZOLLERDB3"
    CREDENTIALS = [
        ("Brad Taylor", "Falcon 9"),
        ("SA", "Zollerdb3")
    ]
    
    probe = None
    connected = False
    
    conn_start = time.time()
    for username, password in CREDENTIALS:
        probe = SQLProbe(SERVER, DATABASE, username, password)
        if probe.connect():
            connected = True
            break
    conn_time = time.time() - conn_start
    
    if not connected:
        print("ERROR: Could not connect to database")
        return
    
    try:
        # Run debug exploration first
        debug_minimum_stock_sources(probe)
        
        print(f"Querying components under minimum stock requirements...")
        print(f"Using StorageQuantityMin from StorageBooking (storage location specific minimum)")
        query_start = time.time()
        rows = query_under_minimum_items(probe)
        query_time = time.time() - query_start
        print(f"Query completed in {query_time:.2f} seconds ({len(rows)} items found)")
        
        # Debug: Show what we found for C-90, C-97, and C-153 specifically
        print("\n=== DEBUG: Checking C-90, C-97, and C-153 specifically ===")
        debug_query = """
            WITH ComponentCurrentStock AS (
                SELECT 
                    od.ObjId,
                    COALESCE(
                        od.CountInv,
                        (SELECT SUM(COALESCE(sb.Quantity, 0))
                         FROM StorageBooking sb
                         WHERE sb.ObjId = od.ObjId
                           AND sb.Status IN (0, 1, 2, 3)
                        ),
                        0
                    ) AS CurrentStock
                FROM ObjData od
                WHERE od.ObjType = 11 AND od.ObjTxt IN ('C-90', 'C-97', 'C-153')
            )
            SELECT 
                od.ObjId,
                od.ObjTxt,
                ccs.CurrentStock,
                (SELECT TOP 1 sb.StorageQuantityMin FROM StorageBooking sb WHERE sb.ObjId = od.ObjId AND sb.StorageQuantityMin IS NOT NULL) AS StorageQuantityMin,
                (SELECT TOP 1 sb.StorageQuantityMax FROM StorageBooking sb WHERE sb.ObjId = od.ObjId AND sb.StorageQuantityMax IS NOT NULL) AS StorageQuantityMax,
                (SELECT SUM(sb.Quantity) FROM StorageBooking sb WHERE sb.ObjId = od.ObjId) AS TotalBookingQuantity,
                (SELECT COUNT(*) FROM StorageBooking sb WHERE sb.ObjId = od.ObjId) AS BookingCount
            FROM ObjData od
            INNER JOIN ComponentCurrentStock ccs ON od.ObjId = ccs.ObjId
            WHERE od.ObjType = 11 AND od.ObjTxt IN ('C-90', 'C-97', 'C-153')
        """
        debug_result = probe.execute_query_with_headers(debug_query)
        if debug_result:
            columns, debug_rows = debug_result
            print(f"Found {len(debug_rows)} components:")
            for row in debug_rows:
                print(f"  {row[columns.index('ObjTxt')]}: "
                      f"CurrentStock={row[columns.index('CurrentStock')]}, "
                      f"StorageQuantityMin={row[columns.index('StorageQuantityMin')]}, "
                      f"StorageQuantityMax={row[columns.index('StorageQuantityMax')]}, "
                      f"TotalBookingQuantity={row[columns.index('TotalBookingQuantity')]}, "
                      f"BookingCount={row[columns.index('BookingCount')]}")
        
        if not rows:
            print("No items found under minimum stock requirements")
            return
        
        # Generate output filename
        timestamp = datetime.now().strftime("%Y_%m_%d_%H%M%S")
        output_html = f"under_minimum_stock_report_{timestamp}.html"
        
        # Generate HTML report
        print(f"\n{'='*60}")
        print("Generating HTML Report...")
        print(f"{'='*60}")
        html_start = time.time()
        generate_html_report(rows, output_html)
        html_time = time.time() - html_start
        print(f"HTML generation completed in {html_time:.2f} seconds")
        
        print(f"\n{'='*60}")
        print("SUCCESS: Report generated!")
        print(f"{'='*60}")
        print(f"Performance Summary:")
        print(f"  Database connection: {conn_time:.2f} seconds")
        print(f"  Database query: {query_time:.2f} seconds")
        print(f"  HTML generation: {html_time:.2f} seconds")
        
    except Exception as e:
        print(f"ERROR: {e}")
        import traceback
        traceback.print_exc()
    finally:
        probe.disconnect()


if __name__ == "__main__":
    start_time = time.time()
    main()
    total_time = time.time() - start_time
    print(f"\n{'='*60}")
    print(f"Total execution time: {total_time:.2f} seconds")
    print(f"{'='*60}")

