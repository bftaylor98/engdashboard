"""
FastAPI server for C-ID lookup from ZOLLERDB3 database.
Provides API endpoint to query component information by C-ID.
"""

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from typing import Optional, List
import pyodbc
import os
from urllib.parse import unquote

app = FastAPI(title="C-ID Lookup API", version="1.1.0")

# CORS configuration - allow all origins for development
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # In production, specify exact origins
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Database configuration
SERVER = r"ESTSS01\ZOLLERSQLEXPRESS"
DATABASE = "ZOLLERDB3"
CREDENTIALS = [
    ("SA", "Zollerdb3"),
    ("Brad Taylor", "Falcon 9"),  # Fallback
]

# Response model
class ComponentInfo(BaseModel):
    cid: str
    objId: Optional[int] = None
    description: Optional[str] = None
    partNo: Optional[str] = None
    unitPrice: Optional[float] = None
    stockQty: int = 0
    circulationQty: int = 0
    minStock: Optional[int] = None
    maxStock: Optional[int] = None
    storageLocation: Optional[str] = None


def get_db_connection():
    """Create and return a database connection using the first working credential."""
    for username, password in CREDENTIALS:
        try:
            connection_string = (
                f"DRIVER={{ODBC Driver 17 for SQL Server}};"
                f"SERVER={SERVER};"
                f"DATABASE={DATABASE};"
                f"UID={username};"
                f"PWD={password};"
            )
            conn = pyodbc.connect(connection_string)
            return conn
        except Exception as e:
            print(f"Failed to connect with {username}: {e}")
            continue
    raise Exception("Could not connect to database with any credentials")


def search_components_by_description(description: str):
    """
    Search components by description (partial match, case-insensitive).
    Returns list of components with basic information.
    """
    conn = None
    try:
        conn = get_db_connection()
        cursor = conn.cursor()
        
        # Search for components matching description (case-insensitive)
        # Use UPPER() for case-insensitive comparison
        query = """
            SELECT 
                od.ObjId,
                od.ObjTxt AS ComponentCode,
                od.DescrTxt AS ComponentDescription
            FROM ObjData od
            WHERE od.ObjType = 11
              AND UPPER(od.DescrTxt) LIKE UPPER(?)
            ORDER BY od.DescrTxt
        """
        # Use LIKE with % wildcards for partial match (case-insensitive)
        search_pattern = f"%{description}%"
        cursor.execute(query, (search_pattern,))
        rows = cursor.fetchall()
        
        if not rows:
            return []
        
        results = []
        for row in rows:
            obj_id = row[0]
            cid = row[1] if row[1] else None
            desc = row[2] if row[2] else None
            
            if not cid:
                continue
            
            # Get Part Number (OrderNo) from ValData
            query_part_no = """
                SELECT vd.ValStr
                FROM ValData vd
                INNER JOIN FieldInfo fi ON vd.FieldId = fi.FieldId
                WHERE vd.ObjId = ?
                  AND fi.ColumnName = 'OrderNo'
            """
            cursor.execute(query_part_no, (obj_id,))
            part_no_row = cursor.fetchone()
            part_no = part_no_row[0] if part_no_row and part_no_row[0] else None
            
            # Get Stock Quantity (Status = 0 only) - quick lookup for list view
            query_stock = """
                SELECT COALESCE(
                    (SELECT SUM(COALESCE(sb.Quantity, 0))
                     FROM StorageBooking sb
                     WHERE sb.ObjId = ?
                       AND sb.Status = 0
                    ),
                    0
                ) AS StockQuantity
            """
            cursor.execute(query_stock, (obj_id,))
            stock_row = cursor.fetchone()
            stock_qty = int(stock_row[0] or 0) if stock_row else 0
            
            results.append({
                "cid": cid,
                "objId": obj_id,
                "description": desc,
                "partNo": part_no,
                "unitPrice": None,  # Not needed for list view
                "stockQty": stock_qty,
                "circulationQty": 0,  # Not needed for list view
                "minStock": None,
                "maxStock": None,
                "storageLocation": None
            })
        
        return results
        
    except Exception as e:
        print(f"Error searching components by description: {e}")
        raise
    finally:
        if conn:
            conn.close()


def get_component_by_cid(cid: str):
    """
    Get complete component information by C-ID.
    Returns all component details including stock levels.
    """
    conn = None
    try:
        conn = get_db_connection()
        cursor = conn.cursor()
        
        # First, get the ObjId from ObjData
        query_obj = """
            SELECT 
                od.ObjId,
                od.ObjTxt AS ComponentCode,
                od.DescrTxt AS ComponentDescription
            FROM ObjData od
            WHERE od.ObjType = 11
              AND od.ObjTxt = ?
        """
        cursor.execute(query_obj, (cid,))
        obj_row = cursor.fetchone()
        
        if not obj_row:
            return None
        
        obj_id = obj_row[0]
        description = obj_row[2] if obj_row[2] else None
        
        # Get Part Number (OrderNo) from ValData
        query_part_no = """
            SELECT vd.ValStr
            FROM ValData vd
            INNER JOIN FieldInfo fi ON vd.FieldId = fi.FieldId
            WHERE vd.ObjId = ?
              AND fi.ColumnName = 'OrderNo'
        """
        cursor.execute(query_part_no, (obj_id,))
        part_no_row = cursor.fetchone()
        part_no = part_no_row[0] if part_no_row and part_no_row[0] else None
        
        # Get Unit Price from ValData
        query_price = """
            SELECT vd.ValNum
            FROM ValData vd
            INNER JOIN FieldInfo fi ON vd.FieldId = fi.FieldId
            WHERE vd.ObjId = ?
              AND fi.ColumnName = 'UnitPrice'
        """
        cursor.execute(query_price, (obj_id,))
        price_row = cursor.fetchone()
        unit_price = float(price_row[0]) if price_row and price_row[0] is not None else None
        
        # Get Stock Quantity (Status = 0 only)
        query_stock = """
            SELECT COALESCE(
                (SELECT SUM(COALESCE(sb.Quantity, 0))
                 FROM StorageBooking sb
                 WHERE sb.ObjId = ?
                   AND sb.Status = 0
                ),
                0
            ) AS StockQuantity
        """
        cursor.execute(query_stock, (obj_id,))
        stock_row = cursor.fetchone()
        stock_qty = int(stock_row[0] or 0) if stock_row else 0
        
        # Get Circulation Quantity (Status != 0)
        # Note: Status = 0 is in stock, Status != 0 is in circulation
        query_circulation = """
            SELECT COALESCE(
                (SELECT SUM(COALESCE(sb.Quantity, 0))
                 FROM StorageBooking sb
                 WHERE sb.ObjId = ?
                   AND sb.Status IS NOT NULL
                   AND sb.Status <> 0
                ),
                0
            ) AS CirculationQuantity
        """
        cursor.execute(query_circulation, (obj_id,))
        circulation_row = cursor.fetchone()
        circulation_qty = int(circulation_row[0] or 0) if circulation_row else 0
        
        # Get Minimum Stock
        query_min = """
            SELECT MIN(sb.StorageQuantityMin)
            FROM StorageBooking sb 
            WHERE sb.ObjId = ? 
              AND sb.StorageQuantityMin IS NOT NULL 
              AND sb.StorageQuantityMin > 0
        """
        cursor.execute(query_min, (obj_id,))
        min_row = cursor.fetchone()
        min_stock = int(min_row[0]) if min_row and min_row[0] is not None else None
        
        # Get Maximum Stock
        query_max = """
            SELECT MAX(sb.StorageQuantityMax)
            FROM StorageBooking sb 
            WHERE sb.ObjId = ? 
              AND sb.StorageQuantityMax IS NOT NULL 
              AND sb.StorageQuantityMax > 0
        """
        cursor.execute(query_max, (obj_id,))
        max_row = cursor.fetchone()
        max_stock = int(max_row[0]) if max_row and max_row[0] is not None else None
        
        # Get Storage Location (from StorageBooking)
        query_location = """
            SELECT TOP 1 sb.StoragePlace
            FROM StorageBooking sb
            WHERE sb.ObjId = ?
              AND sb.StoragePlace IS NOT NULL
              AND sb.StoragePlace != ''
            ORDER BY sb.DT DESC
        """
        cursor.execute(query_location, (obj_id,))
        location_row = cursor.fetchone()
        storage_location = location_row[0] if location_row and location_row[0] else None
        
        return {
            "cid": cid,
            "objId": obj_id,
            "description": description,
            "partNo": part_no,
            "unitPrice": unit_price,
            "stockQty": stock_qty,
            "circulationQty": circulation_qty,
            "minStock": min_stock,
            "maxStock": max_stock,
            "storageLocation": storage_location
        }
        
    except Exception as e:
        print(f"Error querying database: {e}")
        raise
    finally:
        if conn:
            conn.close()


@app.get("/")
async def root():
    """Root endpoint - health check."""
    return {"message": "C-ID Lookup API Server", "version": "1.1.0"}


@app.get("/cid/{cid}", response_model=ComponentInfo)
async def lookup_cid(cid: str):
    """
    Lookup component information by C-ID.
    
    Args:
        cid: Component ID (e.g., "C-1", "C-112")
    
    Returns:
        ComponentInfo with all component details
    """
    try:
        # URL decode the C-ID in case it's encoded
        cid = unquote(cid)
        
        # Validate C-ID format (should start with C-)
        if not cid.startswith("C-"):
            raise HTTPException(status_code=400, detail="Invalid C-ID format. Must start with 'C-'")
        
        # Query the database
        component_info = get_component_by_cid(cid)
        
        if not component_info:
            raise HTTPException(status_code=404, detail=f"Component '{cid}' not found")
        
        return ComponentInfo(**component_info)
        
    except HTTPException:
        raise
    except Exception as e:
        print(f"Error in lookup_cid: {e}")
        raise HTTPException(status_code=500, detail=f"Internal server error: {str(e)}")


@app.get("/search/description/{description}")
async def search_by_description(description: str):
    """
    Search components by description (partial match, case-insensitive).
    
    Args:
        description: Search term to match against component descriptions
    
    Returns:
        List of ComponentInfo objects matching the description
    """
    try:
        # URL decode the description in case it's encoded
        description = unquote(description)
        
        # Validate search term is not empty
        if not description or not description.strip():
            raise HTTPException(status_code=400, detail="Search term cannot be empty")
        
        # Search the database
        results = search_components_by_description(description.strip())
        
        # Return as list (removed response_model to avoid potential serialization issues)
        return results
        
    except HTTPException:
        raise
    except Exception as e:
        print(f"Error in search_by_description: {e}")
        import traceback
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=f"Internal server error: {str(e)}")


@app.get("/health")
async def health():
    """Health check endpoint."""
    try:
        conn = get_db_connection()
        conn.close()
        return {"status": "healthy", "database": "connected"}
    except Exception as e:
        return {"status": "unhealthy", "database": "disconnected", "error": str(e)}


if __name__ == "__main__":
    import uvicorn
    port = int(os.getenv("PORT", 5055))
    uvicorn.run(app, host="0.0.0.0", port=port)

