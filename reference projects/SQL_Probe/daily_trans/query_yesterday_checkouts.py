"""
Query all checkout events from yesterday
"""
from sql_probe import SQLProbe
from datetime import datetime, timedelta

def query_yesterday_checkouts():
    """Query all checkout events (EntrySubTypeId = 4) from yesterday in Eastern Time."""
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
        # Calculate yesterday's date in Eastern Time
        # Note: We'll filter by date in Eastern Time
        yesterday = datetime.now() - timedelta(days=1)
        yesterday_str = yesterday.strftime('%Y-%m-%d')
        
        print("="*80)
        print(f"All Checkout Events from Yesterday ({yesterday_str})")
        print("="*80)
        
        # Query all checkout events from yesterday
        # EntrySubTypeId = 4 means Checkout
        query_checkouts = f"""
            SELECT 
                afs.AutoCounter,
                afs.Time AS TimeUTC,
                CAST(afs.Time AT TIME ZONE 'UTC' AT TIME ZONE 'Eastern Standard Time' AS DATETIME) AS TimeEastern,
                comp_od.ObjTxt AS ComponentCode,
                comp_od.DescrTxt AS ComponentDescription,
                afs.Quantity,
                afs.StoragePlace,
                afs.EntryComment,
                afs.UserObjId,
                COALESCE(user_od.ObjTxt, CAST(afs.UserObjId AS NVARCHAR(50))) AS UserName,
                afs.EntryTypeId,
                afs.EntrySubTypeId,
                'Checkout' AS EventType,
                afs.Cost,
                afs.CostCurrencyCode,
                afs.StorageObjId,
                afs.ComputerName
            FROM ArticleFlowStatistic afs
            INNER JOIN ObjData comp_od ON afs.ArticleObjId = comp_od.ObjId
            LEFT JOIN ObjData user_od ON afs.UserObjId = user_od.ObjId
            WHERE afs.EntrySubTypeId = 4  -- Checkout events
                AND CAST(CAST(afs.Time AT TIME ZONE 'UTC' AT TIME ZONE 'Eastern Standard Time' AS DATETIME) AS DATE) = '{yesterday_str}'
            ORDER BY afs.Time DESC
        """
        
        result_checkouts = probe.execute_query_with_headers(query_checkouts)
        
        if result_checkouts:
            columns, rows = result_checkouts
            if rows:
                probe.display_results(columns, rows, max_display=200)
                
                # Summary statistics
                total_items = len(rows)
                total_quantity = sum(row[columns.index('Quantity')] for row in rows)
                unique_components = len(set(row[columns.index('ComponentCode')] for row in rows if row[columns.index('ComponentCode')]))
                unique_users = len(set(row[columns.index('UserName')] for row in rows if row[columns.index('UserName')]))
                
                print("\n" + "="*80)
                print("SUMMARY STATISTICS")
                print("="*80)
                print(f"Total Checkout Events: {total_items}")
                print(f"Total Quantity Checked Out: {total_quantity}")
                print(f"Unique Components: {unique_components}")
                print(f"Unique Users: {unique_users}")
                print("="*80)
                
                # Group by component
                print("\n" + "="*80)
                print("CHECKOUTS BY COMPONENT")
                print("="*80)
                
                component_summary = {}
                for row in rows:
                    comp_code = row[columns.index('ComponentCode')]
                    quantity = row[columns.index('Quantity')]
                    if comp_code not in component_summary:
                        component_summary[comp_code] = {
                            'count': 0,
                            'quantity': 0,
                            'description': row[columns.index('ComponentDescription')]
                        }
                    component_summary[comp_code]['count'] += 1
                    component_summary[comp_code]['quantity'] += quantity
                
                # Display component summary
                print(f"{'Component':<15} {'Events':<10} {'Total Qty':<12} {'Description':<50}")
                print("-" * 90)
                for comp_code in sorted(component_summary.keys()):
                    info = component_summary[comp_code]
                    desc = info['description'] if info['description'] else 'N/A'
                    if len(desc) > 47:
                        desc = desc[:44] + "..."
                    print(f"{comp_code:<15} {info['count']:<10} {info['quantity']:<12} {desc:<50}")
                
                # Comments summary
                print("\n" + "="*80)
                print("CHECKOUTS WITH COMMENTS")
                print("="*80)
                
                comment_index = columns.index('EntryComment')
                time_index = columns.index('TimeEastern')
                comp_index = columns.index('ComponentCode')
                user_index = columns.index('UserName')
                qty_index = columns.index('Quantity')
                
                events_with_comments = []
                events_without_comments = []
                
                for row in rows:
                    comment = row[comment_index]
                    if comment and str(comment).strip() and str(comment).upper() != 'NULL':
                        events_with_comments.append({
                            'time': row[time_index],
                            'component': row[comp_index],
                            'user': row[user_index],
                            'quantity': row[qty_index],
                            'comment': comment
                        })
                    else:
                        events_without_comments.append({
                            'time': row[time_index],
                            'component': row[comp_index],
                            'user': row[user_index],
                            'quantity': row[qty_index]
                        })
                
                if events_with_comments:
                    print(f"{'Time (Eastern)':<20} {'Component':<12} {'User':<15} {'Qty':<6} {'Comment':<30}")
                    print("-" * 90)
                    for event in sorted(events_with_comments, key=lambda x: x['time'], reverse=True):
                        time_str = str(event['time'])[:19] if event['time'] else 'N/A'
                        print(f"{time_str:<20} {event['component']:<12} {event['user']:<15} {event['quantity']:<6} {event['comment']:<30}")
                else:
                    print("No events with comments found.")
                
                print(f"\nEvents without comments: {len(events_without_comments)}")
                
                # Group by comment value
                if events_with_comments:
                    print("\n" + "="*80)
                    print("COMMENTS SUMMARY")
                    print("="*80)
                    comment_groups = {}
                    for event in events_with_comments:
                        comment = event['comment']
                        if comment not in comment_groups:
                            comment_groups[comment] = []
                        comment_groups[comment].append(event)
                    
                    for comment, events in sorted(comment_groups.items()):
                        print(f"\nComment: '{comment}' ({len(events)} event(s))")
                        for event in events:
                            time_str = str(event['time'])[:19] if event['time'] else 'N/A'
                            print(f"  - {time_str} | {event['component']} | {event['user']} | Qty: {event['quantity']}")
                
            else:
                print(f"No checkout events found for {yesterday_str}")
        else:
            print("ERROR: Could not query checkout events")
    
    except Exception as e:
        print(f"ERROR: {e}")
        import traceback
        traceback.print_exc()
    finally:
        probe.disconnect()

if __name__ == "__main__":
    query_yesterday_checkouts()

