"""
Query checkout/taken events for components
"""
from sql_probe import SQLProbe

def query_component_checkouts(component_code, date_filter=None):
    """
    Query checkout/taken events for a component.
    
    Args:
        component_code: Component code (e.g., 'C-212', 'C-47')
        date_filter: Optional date string in format 'YYYY-MM-DD' to filter events
    """
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
        # First, find the ObjId for the component
        print("="*80)
        print(f"Finding Component {component_code}")
        print("="*80)
        
        query_id = f"SELECT ObjId, ObjTxt, DescrTxt FROM ObjData WHERE ObjTxt = '{component_code}' AND ObjType = 11"
        result_id = probe.execute_query_with_headers(query_id)
        
        if not result_id or not result_id[1]:
            print(f"ERROR: Component '{component_code}' not found")
            probe.disconnect()
            return
        
        columns, rows = result_id
        probe.display_results(columns, rows)
        
        comp_id = rows[0][0]
        comp_txt = rows[0][1]
        comp_desc = rows[0][2] if len(rows[0]) > 2 else None
        
        print(f"\nComponent ID: {comp_id}")
        print(f"Component Code: {comp_txt}")
        if comp_desc:
            print(f"Description: {comp_desc}")
        
        # Build date filter if provided
        date_filter_clause = ""
        if date_filter:
            # Filter by Eastern Time date
            date_filter_clause = f"""
                AND CAST(CAST(afs.Time AT TIME ZONE 'UTC' AT TIME ZONE 'Eastern Standard Time' AS DATETIME) AS DATE) = '{date_filter}'
            """
        
        # Now query ArticleFlowStatistic for checkout/taken events
        print("\n" + "="*80)
        filter_text = f" on {date_filter}" if date_filter else ""
        print(f"Checkout/Taken Events for Component {component_code}{filter_text}")
        print("="*80)
        
        query_events = f"""
            SELECT 
                afs.AutoCounter,
                afs.Time AS TimeUTC,
                CAST(afs.Time AT TIME ZONE 'UTC' AT TIME ZONE 'Eastern Standard Time' AS DATETIME) AS TimeEastern,
                afs.Quantity,
                afs.StoragePlace,
                afs.EntryComment,
                afs.UserObjId,
                COALESCE(user_od.ObjTxt, CAST(afs.UserObjId AS NVARCHAR(50))) AS UserName,
                afs.EntryTypeId,
                afs.EntrySubTypeId,
                CASE 
                    WHEN afs.EntrySubTypeId = 4 THEN 'Checkout'
                    WHEN afs.EntrySubTypeId = 5 THEN 'Taken/Return'
                    ELSE CAST(afs.EntrySubTypeId AS NVARCHAR(50))
                END AS EventType,
                afs.Duration,
                afs.Delay,
                afs.Cost,
                afs.CostCurrencyCode,
                afs.StorageObjId,
                afs.StorageType,
                afs.StorageUseType,
                afs.OrderObjId,
                afs.OrderSupplierOrderNo,
                afs.ArticleObjInv,
                afs.ComputerName
            FROM ArticleFlowStatistic afs
            LEFT JOIN ObjData user_od ON afs.UserObjId = user_od.ObjId
            WHERE afs.ArticleObjId = {comp_id}
            {date_filter_clause}
            ORDER BY afs.Time DESC
        """
        
        result_events = probe.execute_query_with_headers(query_events)
        
        if result_events:
            columns, rows = result_events
            if rows:
                probe.display_results(columns, rows, max_display=100)
                
                filter_text = f" on {date_filter}" if date_filter else ""
                print(f"\nSummary: Found {len(rows)} checkout/taken event(s) for component {component_code}{filter_text}")
            else:
                filter_text = f" on {date_filter}" if date_filter else ""
                print(f"No checkout/taken events found for component {component_code}{filter_text}")
        else:
            print("ERROR: Could not query checkout events")
    
    except Exception as e:
        print(f"ERROR: {e}")
    finally:
        probe.disconnect()

if __name__ == "__main__":
    # Query C-47 for December 18, 2025
    query_component_checkouts('C-47', '2025-12-18')

