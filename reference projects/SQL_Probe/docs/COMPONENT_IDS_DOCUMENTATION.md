# Component ID Discovery Documentation

**Generated:** 2025-12-19  
**Database:** ZOLLERDB3  
**Server:** ESTSS01\ZOLLERSQLEXPRESS

## Summary

- **Total Components Found:** 281
- **Component Object Type (ObjType):** 11
- **Component ID Range:** 3029 to 3714
- **Distinct Attributes:** 13 different attribute types
- **All Components Created:** 2024-12-17 03:00:00

## Component Identification

Components in the ZOLLERDB3 database are identified by:
- **ObjId** - The unique component ID (primary key in ObjData table)
- **ObjType** - Always 11 for components
- **ObjTxt** - Component display name (e.g., "C-1", "C-2", "C-112")
- **DescrTxt** - Component description

## Component Attributes

Each component has the following attributes stored in the ValData table:

1. **OrderNo** - Order/Part number (e.g., "HARV-33493-C3", "OSG-1753001")
2. **Norm** - Manufacturer/Brand (e.g., "Harvey Tool", "OSG", "Allied", "Garr Tool")
3. **Supplier** - Supplier name (e.g., "Rocket Supply")
4. **StorageLocation** - Storage location code (e.g., "ZTO_1", "ZTO_2")
5. **CouplingUseCharacteristic** - Boolean (typically 1.0)
6. **Fabrication** - Integer (typically 0.0)
7. **PartClass** - Integer (typically 0.0)
8. **StorageUse** - Integer (typically 0.0)

## Query Results

### All Component IDs - Basic List

All 281 components were successfully retrieved. Components are stored in the `ObjData` table with `ObjType = 11`.

### Component ID Summary Statistics

- **Total Component Count:** 281
- **Distinct Class Count:** 0 (all ClassId values are NULL)
- **Distinct Attribute Count:** 13
- **Oldest Component Date:** 2024-12-17 03:00:00
- **Newest Component Date:** 2024-12-17 03:00:00

### Component ID Range

- **Minimum ObjId:** 3029
- **Maximum ObjId:** 3714
- **All components have NULL ClassId**

### Inventory Count

No components currently have inventory counts (CountInv is NULL for all components).

## Sample Component Data

Sample components from the database:

| ObjId | ObjTxt | Description | OrderNo | Norm | Supplier |
|-------|--------|-------------|---------|------|----------|
| 3029 | C-1 | 1/4" Square Endmill - 2.5" Overall Length | GARR-13157 | Garr Tool | Rocket Supply |
| 3031 | C-10 | 3/8"-16 UNC OSG EXOTAP Cut Tap | OSG-1753001 | OSG | Rocket Supply |
| 3339 | C-112 | Harvey Tool Long Reach Ball Endmill | HARV-33493-C3 | Harvey Tool | Rocket Supply |
| 3104 | C-38 | 1.375" Allied TA HSS Cobalt Insert | ALLI-1C12H-0112-TC | Allied | Rocket Supply |

## SQL Queries Used

The following queries were executed to discover component IDs:

1. **Find All Object Types and Their Names** - Identified ObjType 11 as components
2. **Find All Component IDs - Basic List** - Retrieved all 281 component records
3. **Find All Component IDs with Component Number/Identifier** - Retrieved components with OrderNo, Norm, Supplier
4. **Find All Component IDs - Complete with All Attributes** - Full attribute details for all components
5. **Component ID Summary - Count and Statistics** - Aggregate statistics
6. **Find Component IDs by Class** - Class distribution (all NULL)
7. **Find Component IDs with Inventory Count** - Inventory status (all NULL)

## Database Schema Reference

Components are stored using the EAV (Entity-Attribute-Value) pattern:

- **ObjData** table: Core component records (ObjId, ObjType, ObjTxt, DescrTxt)
- **ValData** table: Component attributes (linked by ObjId and FieldId)
- **FieldInfo** table: Attribute definitions (FieldId, ColumnName, DataType)
- **ObjInfo** table: Object type metadata (ObjType, ObjName, ModuleName)

## Notes

- All components were created on the same date: 2024-12-17 03:00:00
- Component IDs (ObjId) are sequential but not consecutive (gaps exist)
- All components have the same ObjType (11)
- No components currently have ClassId assigned
- No components have inventory counts (CountInv is NULL)
- Components are primarily from suppliers: OSG, Harvey Tool, Allied, Garr Tool, Ingersoll
- Storage locations include: ZTO_1, ZTO_2

## Export Format

Component data can be exported in the following formats:
- **CSV:** Component ID, ObjTxt, DescrTxt, OrderNo, Norm, Supplier, StorageLocation
- **JSON:** Full component records with all attributes
- **SQL:** SELECT queries for specific components

---

**Status:** ✅ Complete - All 281 component IDs discovered and documented

