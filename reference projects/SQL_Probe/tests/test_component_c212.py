"""
Test script to query ComponentID C-212
"""
import sys
import os

# Add current directory to path to import sql_probe
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from sql_probe import SQLProbe
from datetime import datetime


def query_component_c212(probe):
    """Query all information related to ComponentID C-212."""
    
    # Query component basic information
    print("=" * 60)
    print("Querying Component Basic Information for C-212...")
    print("=" * 60)
    
    query_component = """
        SELECT 
            od.ObjId,
            od.ObjTxt AS ComponentCode,
            od.DescrTxt AS ComponentDescription
        FROM ObjData od
        WHERE od.ObjTxt = 'C-212'
    """
    
    result = probe.execute_query_with_headers(query_component)
    if result:
        columns, rows = result
        print(f"\nFound {len(rows)} component(s) with code C-212:\n")
        for row in rows:
            for idx, col in enumerate(columns):
                print(f"  {col}: {row[idx]}")
            print()
    else:
        print("No component found with code C-212")
        return
    
    if not rows:
        print("No component found with code C-212")
        return
    
    comp_obj_id = rows[0][columns.index('ObjId')]
    print(f"Component Object ID: {comp_obj_id}\n")
    
    # Query component part number
    print("=" * 60)
    print("Querying Part Number (OrderNo) for C-212...")
    print("=" * 60)
    
    query_part_no = f"""
        SELECT vd.ValStr
        FROM ValData vd
        INNER JOIN FieldInfo fi ON vd.FieldId = fi.FieldId
        WHERE vd.ObjId = {comp_obj_id}
            AND fi.ColumnName = 'OrderNo'
    """
    
    result = probe.execute_query(query_part_no)
    if result and result[0]:
        part_no = result[0][0] or "Not specified"
        print(f"\nPart Number: {part_no}\n")
    else:
        print("\nPart Number: Not found\n")
    
    # Query component price information
    print("=" * 60)
    print("Querying Price Information for C-212...")
    print("=" * 60)
    
    # Try to find price-related fields in ValData
    query_price_fields = f"""
        SELECT 
            fi.ColumnName,
            vd.ValStr AS StringValue,
            vd.ValNum AS NumericValue
        FROM ValData vd
        INNER JOIN FieldInfo fi ON vd.FieldId = fi.FieldId
        WHERE vd.ObjId = {comp_obj_id}
            AND (fi.ColumnName LIKE '%Price%' 
                 OR fi.ColumnName LIKE '%Cost%'
                 OR fi.ColumnName LIKE '%Amount%')
        ORDER BY fi.ColumnName
    """
    
    result = probe.execute_query_with_headers(query_price_fields)
    if result:
        columns, rows = result
        if rows:
            print(f"\nFound {len(rows)} price-related field(s):\n")
            for row in rows:
                col_name = row[columns.index('ColumnName')]
                str_val = row[columns.index('StringValue')]
                num_val = row[columns.index('NumericValue')]
                if num_val:
                    print(f"  {col_name}: ${float(num_val):,.2f}")
                elif str_val:
                    print(f"  {col_name}: {str_val}")
                else:
                    print(f"  {col_name}: Not set")
            print()
        else:
            print("\nNo price fields found in ValData\n")
    
    # Also check for price in recent transactions
    print("Checking price from recent transactions...")
    query_recent_cost = f"""
        SELECT TOP 1
            afs.Cost,
            CAST(afs.Time AT TIME ZONE 'UTC' AT TIME ZONE 'Eastern Standard Time' AS DATETIME) AS TimeEastern
        FROM ArticleFlowStatistic afs
        WHERE afs.ArticleObjId = {comp_obj_id}
            AND afs.Cost IS NOT NULL
            AND afs.Cost > 0
        ORDER BY afs.Time DESC
    """
    
    result = probe.execute_query(query_recent_cost)
    if result and result[0]:
        cost = result[0][0]
        if cost:
            print(f"\nMost recent transaction cost: ${float(cost):,.2f}\n")
    else:
        print("\nNo cost information found in transactions\n")
    
    # Query all transaction history for this component
    print("=" * 60)
    print("Querying Transaction History for C-212...")
    print("=" * 60)
    
    query_transactions = f"""
        SELECT 
            CAST(afs.Time AT TIME ZONE 'UTC' AT TIME ZONE 'Eastern Standard Time' AS DATETIME) AS TimeEastern,
            afs.EntrySubTypeId,
            afs.Quantity,
            afs.EntryComment,
            COALESCE(user_od.ObjTxt, CAST(afs.UserObjId AS NVARCHAR(50))) AS UserName,
            afs.Cost
        FROM ArticleFlowStatistic afs
        LEFT JOIN ObjData user_od ON afs.UserObjId = user_od.ObjId
        WHERE afs.ArticleObjId = {comp_obj_id}
        ORDER BY afs.Time DESC
    """
    
    result = probe.execute_query_with_headers(query_transactions)
    if result:
        columns, rows = result
        print(f"\nFound {len(rows)} transaction(s) for C-212:\n")
        
        # Map EntrySubTypeId to action type
        entry_type_map = {
            1: "Checkin",
            2: "Checkout",
            3: "Adjustment",
            4: "Checkout",
            5: "Return"
        }
        
        for row in rows:
            time_eastern = row[columns.index('TimeEastern')]
            entry_type_id = row[columns.index('EntrySubTypeId')]
            quantity = row[columns.index('Quantity')]
            comment = row[columns.index('EntryComment')] or ""
            user_name = row[columns.index('UserName')] or ""
            cost = row[columns.index('Cost')] or 0.0
            
            if time_eastern:
                dt = time_eastern if isinstance(time_eastern, datetime) else datetime.fromisoformat(str(time_eastern))
                time_str = dt.strftime("%Y-%m-%d %I:%M %p")
            else:
                time_str = "N/A"
            
            action = entry_type_map.get(entry_type_id, f"Unknown ({entry_type_id})")
            
            print(f"  Date/Time: {time_str}")
            print(f"  Action: {action}")
            print(f"  Quantity: {quantity}")
            print(f"  User: {user_name}")
            print(f"  Cost: ${float(cost):,.2f}" if cost else "  Cost: N/A")
            print(f"  Comment: {comment}")
            print()
    else:
        print("\nNo transactions found for C-212\n")
    
    # Note: Inventory queries may require different table structure
    # Uncomment and modify if needed based on your database schema


def main():
    """Main function."""
    SERVER = r"ESTSS01\ZOLLERSQLEXPRESS"
    DATABASE = "ZOLLERDB3"
    CREDENTIALS = [
        ("Brad Taylor", "Falcon 9"),
        ("SA", "Zollerdb3")
    ]
    
    probe = None
    connected = False
    
    print("Connecting to database...")
    for username, password in CREDENTIALS:
        probe = SQLProbe(SERVER, DATABASE, username, password)
        if probe.connect():
            connected = True
            print(f"Connected as {username}\n")
            break
    
    if not connected:
        print("ERROR: Could not connect to database")
        return
    
    try:
        query_component_c212(probe)
    except Exception as e:
        print(f"ERROR: {e}")
        import traceback
        traceback.print_exc()
    finally:
        probe.disconnect()
        print("=" * 60)
        print("Connection closed")


if __name__ == "__main__":
    main()

