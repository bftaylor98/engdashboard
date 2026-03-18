"""
Get Complete Information for Component C-112
"""
from sql_probe import SQLProbe
import json

def get_component_full_info(component_id=None, component_txt=None):
    """Get all available information about a component."""
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
        # Get component ID first
        if component_id:
            comp_id = component_id
            where_clause = f"od.ObjId = {component_id}"
        elif component_txt:
            # Get ObjId from ObjTxt
            query_id = f"SELECT ObjId FROM ObjData WHERE ObjTxt = '{component_txt}' AND ObjType = 11"
            result_id = probe.execute_query(query_id)
            if not result_id or not result_id[0]:
                print(f"ERROR: Component '{component_txt}' not found")
                return
            comp_id = result_id[0][0]
            where_clause = f"od.ObjId = {comp_id}"
        else:
            print("ERROR: Must provide component_id or component_txt")
            return
        
        print(f"Component ID: {comp_id}")
        
        print("="*80)
        print("COMPLETE COMPONENT INFORMATION")
        print("="*80)
        
        # 1. Basic Component Information from ObjData
        print("\n[1] Basic Component Information (ObjData)")
        print("-"*80)
        query1 = f"""
            SELECT 
                od.ObjId,
                od.ObjType,
                od.ObjTxt,
                od.DescrTxt,
                od.ClassId,
                od.State,
                od.StateBits,
                od.Embedded,
                od.CountInv,
                od.InvMode,
                od.TS,
                oi.ModuleName,
                oi.ObjName,
                oi.ObjTypeFullName,
                oi.EntryDate
            FROM ObjData od
            INNER JOIN ObjInfo oi ON od.ObjType = oi.ObjType
            WHERE {where_clause}
        """
        result1 = probe.execute_query_with_headers(query1)
        if result1:
            columns, rows = result1
            probe.display_results(columns, rows, max_display=100)
            basic_info = dict(zip(columns, rows[0])) if rows else None
        else:
            basic_info = None
            print("No basic information found")
        
        # 2. All Attributes from ValData
        print("\n[2] All Attributes from ValData")
        print("-"*80)
        query2 = f"""
            SELECT 
                od.ObjId,
                od.ObjTxt,
                fi.FieldId,
                fi.ColumnName,
                fi.DataType,
                fi.ValType,
                fi.Unit,
                vd.ValStr,
                vd.ValNum,
                CAST(LEFT(CAST(vd.ValText AS NVARCHAR(MAX)), 500) AS NVARCHAR(500)) AS ValTextPreview
            FROM ObjData od
            INNER JOIN ValData vd ON od.ObjId = vd.ObjId
            INNER JOIN FieldInfo fi ON vd.FieldId = fi.FieldId
            WHERE {where_clause}
            ORDER BY fi.ColumnName
        """
        result2 = probe.execute_query_with_headers(query2)
        if result2:
            columns, rows = result2
            probe.display_results(columns, rows, max_display=100)
            val_data = [dict(zip(columns, row)) for row in rows]
        else:
            val_data = []
            print("No ValData attributes found")
        
        # 3. All Attributes from ValActData
        print("\n[3] All Attributes from ValActData")
        print("-"*80)
        query3 = f"""
            SELECT 
                od.ObjId,
                od.ObjTxt,
                fi.FieldId,
                fi.ColumnName,
                fi.DataType,
                vad.ValStr,
                vad.ValNum
            FROM ObjData od
            INNER JOIN ValActData vad ON od.ObjId = vad.ObjId
            INNER JOIN FieldInfo fi ON vad.FieldId = fi.FieldId
            WHERE {where_clause}
            ORDER BY fi.ColumnName
        """
        result3 = probe.execute_query_with_headers(query3)
        if result3:
            columns, rows = result3
            probe.display_results(columns, rows, max_display=100)
            val_act_data = [dict(zip(columns, row)) for row in rows]
        else:
            val_act_data = []
            print("No ValActData attributes found")
        
        # 4. All Attributes from ValInvData
        print("\n[4] All Attributes from ValInvData")
        print("-"*80)
        query4 = f"""
            SELECT 
                od.ObjId,
                od.ObjTxt,
                oid.ObjInv,
                fi.FieldId,
                fi.ColumnName,
                fi.DataType,
                vid.ValStr,
                vid.ValNum
            FROM ObjData od
            INNER JOIN ObjInvData oid ON od.ObjId = oid.ObjId
            INNER JOIN ValInvData vid ON od.ObjId = vid.ObjId AND oid.ObjInv = vid.ObjInv
            INNER JOIN FieldInfo fi ON vid.FieldId = fi.FieldId
            WHERE {where_clause}
            ORDER BY oid.ObjInv, fi.ColumnName
        """
        result4 = probe.execute_query_with_headers(query4)
        if result4:
            columns, rows = result4
            probe.display_results(columns, rows, max_display=100)
            val_inv_data = [dict(zip(columns, row)) for row in rows]
        else:
            val_inv_data = []
            print("No ValInvData attributes found")
        
        # 5. Inventory Information
        print("\n[5] Inventory Information (ObjInvData)")
        print("-"*80)
        query5 = f"""
            SELECT 
                oid.ObjId,
                oid.ObjInv,
                oid.InvTxt,
                oid.InvDescrTxt,
                oid.InvState,
                oid.Logical,
                oid.InvNo,
                oid.FullCopy,
                oid.DescrTxt,
                NULL AS ClientId
            FROM ObjInvData oid
            WHERE oid.ObjId = {comp_id}
            ORDER BY oid.ObjInv
        """
        result5 = probe.execute_query_with_headers(query5)
        if result5:
            columns, rows = result5
            probe.display_results(columns, rows, max_display=100)
            inv_data = [dict(zip(columns, row)) for row in rows]
        else:
            inv_data = []
            print("No inventory information found")
        
        # 6. Statistics Information
        print("\n[6] Statistics Information (ObjStatistic)")
        print("-"*80)
        query6 = f"""
            SELECT 
                os.ObjId,
                os.ObjInv,
                os.Counter,
                os.DT,
                os.ClientId,
                os.UserId,
                os.UserTxt
            FROM ObjStatistic os
            WHERE os.ObjId = {comp_id}
            ORDER BY os.DT DESC, os.Counter DESC
        """
        result6 = probe.execute_query_with_headers(query6)
        if result6:
            columns, rows = result6
            probe.display_results(columns, rows, max_display=100)
            stats_data = [dict(zip(columns, row)) for row in rows]
        else:
            stats_data = []
            print("No statistics found")
        
        # 7. Reference Data (ObjRefData)
        print("\n[7] Reference Data (ObjRefData)")
        print("-"*80)
        query7 = f"""
            SELECT 
                ord.ObjId,
                ord.ObjInv,
                ord.TableId,
                ord.Sub1,
                ord.Sub2,
                ord.Sub3,
                ord.Sub4,
                ord.FieldId,
                fi.ColumnName,
                ord.RefObjId,
                ord.Quantity
            FROM ObjRefData ord
            LEFT JOIN FieldInfo fi ON ord.FieldId = fi.FieldId
            WHERE ord.ObjId = {comp_id}
            ORDER BY ord.TableId, ord.Sub1, ord.Sub2, ord.Sub3, ord.Sub4
        """
        result7 = probe.execute_query_with_headers(query7)
        if result7:
            columns, rows = result7
            probe.display_results(columns, rows, max_display=100)
            ref_data = [dict(zip(columns, row)) for row in rows]
        else:
            ref_data = []
            print("No reference data found")
        
        # 8. Article Flow Statistics (if any)
        print("\n[8] Article Flow Statistics")
        print("-"*80)
        query8 = f"""
            SELECT TOP 50
                afs.AutoCounter,
                afs.Time,
                afs.Duration,
                afs.Delay,
                afs.UserObjId,
                afs.EntryTypeId,
                afs.EntrySubTypeId,
                afs.Quantity,
                afs.EntryComment,
                afs.Cost,
                afs.CostCurrencyCode,
                afs.StoragePlace,
                afs.OrderObjId,
                afs.OrderSupplierOrderNo
            FROM ArticleFlowStatistic afs
            WHERE afs.ArticleObjId = {comp_id}
            ORDER BY afs.Time DESC
        """
        result8 = probe.execute_query_with_headers(query8)
        if result8:
            columns, rows = result8
            probe.display_results(columns, rows, max_display=50)
            flow_stats = [dict(zip(columns, row)) for row in rows]
        else:
            flow_stats = []
            print("No article flow statistics found")
        
        # 9. History
        print("\n[9] History Records")
        print("-"*80)
        query9 = f"""
            SELECT TOP 50
                h.Counter,
                h.DT,
                h.ActionType,
                h.ObjType,
                h.ObjId,
                h.ObjInv,
                h.ObjTxt,
                h.ObjInvTxt,
                h.ClientId,
                h.ClientTxt,
                h.UserId,
                h.UserTxt,
                h.Info AS Comment
            FROM History h
            WHERE h.ObjId = {comp_id}
            ORDER BY h.DT DESC, h.Counter DESC
        """
        result9 = probe.execute_query_with_headers(query9)
        if result9:
            columns, rows = result9
            probe.display_results(columns, rows, max_display=50)
            history = [dict(zip(columns, row)) for row in rows]
        else:
            history = []
            print("No history records found")
        
        # 10. Object Change History
        print("\n[10] Object Change History")
        print("-"*80)
        query10 = f"""
            SELECT 
                och.ObjId,
                och.ChangeDateTime,
                och.UserTxt,
                och.Comment,
                CASE WHEN och.ChangeHistoryDatas IS NOT NULL THEN 'Yes' ELSE 'No' END AS HasChangeData
            FROM ObjectChangeHistory och
            WHERE och.ObjId = {comp_id}
            ORDER BY och.ChangeDateTime DESC
        """
        result10 = probe.execute_query_with_headers(query10)
        if result10:
            columns, rows = result10
            probe.display_results(columns, rows, max_display=100)
            change_history = [dict(zip(columns, row)) for row in rows]
        else:
            change_history = []
            print("No change history found")
        
        # Compile all information
        all_info = {
            'basic_info': basic_info,
            'val_data': val_data,
            'val_act_data': val_act_data,
            'val_inv_data': val_inv_data,
            'inventory': inv_data,
            'statistics': stats_data,
            'references': ref_data,
            'flow_statistics': flow_stats,
            'history': history,
            'change_history': change_history
        }
        
        # Save to JSON
        json_file = f'component_{component_id or component_txt}_full_info.json'
        with open(json_file, 'w', encoding='utf-8') as f:
            json.dump(all_info, f, indent=2, default=str)
        print(f"\n[OK] Complete information saved to {json_file}")
        
        print("\n" + "="*80)
        print("INFORMATION RETRIEVAL COMPLETE")
        print("="*80)
        
    except Exception as e:
        print(f"ERROR: {e}")
        import traceback
        traceback.print_exc()
    finally:
        probe.disconnect()

if __name__ == "__main__":
    # Get info for C-112
    get_component_full_info(component_txt='C-112')

