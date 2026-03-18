"""
Export Component IDs to various formats
"""
import json
import csv
from sql_probe import SQLProbe

def export_component_ids():
    """Export all component IDs to CSV and JSON formats."""
    SERVER = r"ESTSS01\ZOLLERSQLEXPRESS"
    DATABASE = "ZOLLERDB3"
    CREDENTIALS = [
        ("Brad Taylor", "Falcon 9"),
        ("SA", "Zollerdb3")
    ]
    
    probe = None
    connected = False
    
    for username, password in CREDENTIALS:
        probe = SQLProbe(SERVER, DATABASE, username, password)
        if probe.connect():
            connected = True
            break
    
    if not connected:
        print("ERROR: Could not connect to database")
        return
    
    try:
        # Query to get all component IDs with key attributes
        query = """
            SELECT DISTINCT
                od.ObjId,
                od.ObjType,
                od.ObjTxt,
                od.DescrTxt,
                oi.EntryDate,
                MAX(CASE WHEN fi.ColumnName = 'OrderNo' THEN vd.ValStr END) AS OrderNo,
                MAX(CASE WHEN fi.ColumnName = 'Norm' THEN vd.ValStr END) AS Norm,
                MAX(CASE WHEN fi.ColumnName = 'Supplier' THEN vd.ValStr END) AS Supplier,
                MAX(CASE WHEN fi.ColumnName = 'StorageLocation' THEN vd.ValStr END) AS StorageLocation
            FROM ObjData od
            INNER JOIN ObjInfo oi ON od.ObjType = oi.ObjType
            LEFT JOIN ValData vd ON od.ObjId = vd.ObjId
            LEFT JOIN FieldInfo fi ON vd.FieldId = fi.FieldId
            WHERE od.ObjType = 11
            GROUP BY od.ObjId, od.ObjType, od.ObjTxt, od.DescrTxt, oi.EntryDate
            ORDER BY od.ObjId
        """
        
        result = probe.execute_query_with_headers(query)
        if not result:
            print("ERROR: Could not retrieve component data")
            return
        
        columns, rows = result
        
        # Export to CSV
        csv_file = 'component_ids.csv'
        with open(csv_file, 'w', newline='', encoding='utf-8') as f:
            writer = csv.writer(f)
            writer.writerow(columns)
            writer.writerows(rows)
        print(f"[OK] Exported {len(rows)} components to {csv_file}")
        
        # Export to JSON
        json_file = 'component_ids.json'
        components = []
        for row in rows:
            component = dict(zip(columns, row))
            components.append(component)
        
        with open(json_file, 'w', encoding='utf-8') as f:
            json.dump(components, f, indent=2, default=str)
        print(f"[OK] Exported {len(components)} components to {json_file}")
        
        # Print summary
        print(f"\nSummary:")
        print(f"   Total Components: {len(components)}")
        print(f"   Component ID Range: {min(c['ObjId'] for c in components)} to {max(c['ObjId'] for c in components)}")
        
    except Exception as e:
        print(f"ERROR: {e}")
        import traceback
        traceback.print_exc()
    finally:
        probe.disconnect()

if __name__ == "__main__":
    export_component_ids()

