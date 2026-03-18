"""
Systematic Database Discovery and Documentation Script
Runs all discovery queries and writes comprehensive documentation
"""

import pyodbc
import json
from datetime import datetime
from pathlib import Path
from sql_probe import SQLProbe

def discover_complete_schema(probe: SQLProbe):
    """Discover complete database schema and return structured data."""
    schema_data = {
        'database_name': probe.database,
        'server': probe.server,
        'discovery_date': datetime.now().isoformat(),
        'tables': {},
        'relationships': [],
        'errors': []
    }
    
    print("\n" + "="*80)
    print("COMPREHENSIVE DATABASE SCHEMA DISCOVERY")
    print("="*80 + "\n")
    
    # 1. Get all tables
    print("[1/6] Discovering all tables...")
    tables_query = """
        SELECT 
            TABLE_SCHEMA,
            TABLE_NAME,
            TABLE_TYPE
        FROM INFORMATION_SCHEMA.TABLES
        WHERE TABLE_TYPE = 'BASE TABLE'
        ORDER BY TABLE_SCHEMA, TABLE_NAME
    """
    tables_result = probe.execute_query_with_headers(tables_query)
    if tables_result:
        columns, rows = tables_result
        for row in rows:
            schema = row[0]
            table_name = row[1]
            full_name = f"{schema}.{table_name}"
            schema_data['tables'][full_name] = {
                'schema': schema,
                'table_name': table_name,
                'table_type': row[2],
                'columns': [],
                'primary_keys': [],
                'foreign_keys': []
            }
        print(f"  Found {len(schema_data['tables'])} tables")
    else:
        schema_data['errors'].append("Failed to retrieve table list")
    
    # 2. Get all columns for all tables
    print("[2/6] Discovering all columns...")
    columns_query = """
        SELECT 
            t.TABLE_SCHEMA,
            t.TABLE_NAME,
            c.COLUMN_NAME,
            c.ORDINAL_POSITION,
            c.DATA_TYPE,
            c.CHARACTER_MAXIMUM_LENGTH,
            c.NUMERIC_PRECISION,
            c.NUMERIC_SCALE,
            c.DATETIME_PRECISION,
            c.IS_NULLABLE,
            c.COLUMN_DEFAULT
        FROM INFORMATION_SCHEMA.TABLES t
        INNER JOIN INFORMATION_SCHEMA.COLUMNS c 
            ON t.TABLE_SCHEMA = c.TABLE_SCHEMA 
            AND t.TABLE_NAME = c.TABLE_NAME
        WHERE t.TABLE_TYPE = 'BASE TABLE'
        ORDER BY t.TABLE_SCHEMA, t.TABLE_NAME, c.ORDINAL_POSITION
    """
    columns_result = probe.execute_query_with_headers(columns_query)
    if columns_result:
        columns, rows = columns_result
        for row in rows:
            schema = row[0]
            table_name = row[1]
            full_name = f"{schema}.{table_name}"
            if full_name in schema_data['tables']:
                schema_data['tables'][full_name]['columns'].append({
                    'column_name': row[2],
                    'ordinal_position': row[3],
                    'data_type': row[4],
                    'character_maximum_length': row[5],
                    'numeric_precision': row[6],
                    'numeric_scale': row[7],
                    'datetime_precision': row[8],
                    'is_nullable': row[9],
                    'column_default': row[10]
                })
        total_columns = sum(len(t['columns']) for t in schema_data['tables'].values())
        print(f"  Found {total_columns} columns across all tables")
    else:
        schema_data['errors'].append("Failed to retrieve column information")
    
    # 3. Get primary keys
    print("[3/6] Discovering primary keys...")
    pk_query = """
        SELECT 
            tc.TABLE_SCHEMA,
            tc.TABLE_NAME,
            tc.CONSTRAINT_NAME,
            kcu.COLUMN_NAME,
            kcu.ORDINAL_POSITION
        FROM INFORMATION_SCHEMA.TABLE_CONSTRAINTS tc
        INNER JOIN INFORMATION_SCHEMA.KEY_COLUMN_USAGE kcu
            ON tc.CONSTRAINT_NAME = kcu.CONSTRAINT_NAME
            AND tc.TABLE_SCHEMA = kcu.TABLE_SCHEMA
            AND tc.TABLE_NAME = kcu.TABLE_NAME
        WHERE tc.CONSTRAINT_TYPE = 'PRIMARY KEY'
        ORDER BY tc.TABLE_SCHEMA, tc.TABLE_NAME, kcu.ORDINAL_POSITION
    """
    pk_result = probe.execute_query_with_headers(pk_query)
    if pk_result:
        columns, rows = pk_result
        for row in rows:
            schema = row[0]
            table_name = row[1]
            full_name = f"{schema}.{table_name}"
            if full_name in schema_data['tables']:
                schema_data['tables'][full_name]['primary_keys'].append({
                    'constraint_name': row[2],
                    'column_name': row[3],
                    'ordinal_position': row[4]
                })
        total_pks = sum(len(t['primary_keys']) for t in schema_data['tables'].values())
        print(f"  Found {total_pks} primary key columns")
    else:
        schema_data['errors'].append("Failed to retrieve primary key information")
    
    # 4. Get foreign keys
    print("[4/6] Discovering foreign keys...")
    fk_query = """
        SELECT 
            fk.TABLE_SCHEMA AS FK_SCHEMA,
            fk.TABLE_NAME AS FK_TABLE,
            kcu.COLUMN_NAME AS FK_COLUMN,
            kcu.ORDINAL_POSITION AS FK_ORDINAL_POSITION,
            pk.TABLE_SCHEMA AS PK_SCHEMA,
            pk.TABLE_NAME AS PK_TABLE,
            pkcu.COLUMN_NAME AS PK_COLUMN,
            fk.CONSTRAINT_NAME AS FK_CONSTRAINT_NAME,
            rc.UPDATE_RULE,
            rc.DELETE_RULE
        FROM INFORMATION_SCHEMA.REFERENTIAL_CONSTRAINTS rc
        INNER JOIN INFORMATION_SCHEMA.TABLE_CONSTRAINTS fk 
            ON rc.CONSTRAINT_NAME = fk.CONSTRAINT_NAME
            AND rc.CONSTRAINT_SCHEMA = fk.TABLE_SCHEMA
        INNER JOIN INFORMATION_SCHEMA.TABLE_CONSTRAINTS pk 
            ON rc.UNIQUE_CONSTRAINT_NAME = pk.CONSTRAINT_NAME
            AND rc.UNIQUE_CONSTRAINT_SCHEMA = pk.TABLE_SCHEMA
        INNER JOIN INFORMATION_SCHEMA.KEY_COLUMN_USAGE kcu 
            ON fk.CONSTRAINT_NAME = kcu.CONSTRAINT_NAME
            AND fk.TABLE_SCHEMA = kcu.TABLE_SCHEMA
        INNER JOIN INFORMATION_SCHEMA.KEY_COLUMN_USAGE pkcu 
            ON pk.CONSTRAINT_NAME = pkcu.CONSTRAINT_NAME
            AND pk.TABLE_SCHEMA = pkcu.TABLE_SCHEMA
            AND kcu.ORDINAL_POSITION = pkcu.ORDINAL_POSITION
        ORDER BY fk.TABLE_SCHEMA, fk.TABLE_NAME, kcu.ORDINAL_POSITION
    """
    fk_result = probe.execute_query_with_headers(fk_query)
    if fk_result:
        columns, rows = fk_result
        for row in rows:
            fk_schema = row[0]
            fk_table = row[1]
            fk_full_name = f"{fk_schema}.{fk_table}"
            pk_schema = row[4]
            pk_table = row[5]
            pk_full_name = f"{pk_schema}.{pk_table}"
            
            relationship = {
                'from_table': fk_full_name,
                'from_column': row[2],
                'to_table': pk_full_name,
                'to_column': row[6],
                'constraint_name': row[7],
                'update_rule': row[8],
                'delete_rule': row[9]
            }
            schema_data['relationships'].append(relationship)
            
            if fk_full_name in schema_data['tables']:
                schema_data['tables'][fk_full_name]['foreign_keys'].append({
                    'constraint_name': row[7],
                    'column_name': row[2],
                    'references_table': pk_full_name,
                    'references_column': row[6],
                    'update_rule': row[8],
                    'delete_rule': row[9]
                })
        print(f"  Found {len(schema_data['relationships'])} foreign key relationships")
    else:
        schema_data['errors'].append("Failed to retrieve foreign key information")
    
    # 5. Get indexes
    print("[5/6] Discovering indexes...")
    index_query = """
        SELECT 
            SCHEMA_NAME(t.schema_id) AS TABLE_SCHEMA,
            t.name AS TABLE_NAME,
            i.name AS INDEX_NAME,
            i.type_desc AS INDEX_TYPE,
            i.is_unique AS IS_UNIQUE,
            i.is_primary_key AS IS_PRIMARY_KEY,
            COL_NAME(ic.object_id, ic.column_id) AS COLUMN_NAME,
            ic.key_ordinal AS KEY_ORDINAL,
            ic.is_included_column AS IS_INCLUDED_COLUMN
        FROM sys.tables t
        INNER JOIN sys.indexes i ON t.object_id = i.object_id
        INNER JOIN sys.index_columns ic ON i.object_id = ic.object_id AND i.index_id = ic.index_id
        WHERE t.is_ms_shipped = 0
        ORDER BY SCHEMA_NAME(t.schema_id), t.name, i.name, ic.key_ordinal
    """
    index_result = probe.execute_query_with_headers(index_query)
    if index_result:
        columns, rows = index_result
        indexes_by_table = {}
        for row in rows:
            schema = row[0]
            table_name = row[1]
            full_name = f"{schema}.{table_name}"
            if full_name not in indexes_by_table:
                indexes_by_table[full_name] = []
            indexes_by_table[full_name].append({
                'index_name': row[2],
                'index_type': row[3],
                'is_unique': row[4],
                'is_primary_key': row[5],
                'column_name': row[6],
                'key_ordinal': row[7],
                'is_included_column': row[8]
            })
        
        for full_name, indexes in indexes_by_table.items():
            if full_name in schema_data['tables']:
                schema_data['tables'][full_name]['indexes'] = indexes
        
        total_indexes = len(set(row[2] for row in rows))
        print(f"  Found {total_indexes} unique indexes")
    else:
        schema_data['errors'].append("Failed to retrieve index information")
    
    # 6. Get constraints
    print("[6/6] Discovering constraints...")
    constraint_query = """
        SELECT 
            tc.TABLE_SCHEMA,
            tc.TABLE_NAME,
            tc.CONSTRAINT_NAME,
            tc.CONSTRAINT_TYPE,
            kcu.COLUMN_NAME,
            cc.CHECK_CLAUSE
        FROM INFORMATION_SCHEMA.TABLE_CONSTRAINTS tc
        LEFT JOIN INFORMATION_SCHEMA.KEY_COLUMN_USAGE kcu
            ON tc.CONSTRAINT_NAME = kcu.CONSTRAINT_NAME
            AND tc.TABLE_SCHEMA = kcu.TABLE_SCHEMA
            AND tc.TABLE_NAME = kcu.TABLE_NAME
        LEFT JOIN INFORMATION_SCHEMA.CHECK_CONSTRAINTS cc
            ON tc.CONSTRAINT_NAME = cc.CONSTRAINT_NAME
            AND tc.TABLE_SCHEMA = cc.CONSTRAINT_SCHEMA
        WHERE tc.TABLE_SCHEMA NOT IN ('sys', 'INFORMATION_SCHEMA')
        ORDER BY tc.TABLE_SCHEMA, tc.TABLE_NAME, tc.CONSTRAINT_TYPE
    """
    constraint_result = probe.execute_query_with_headers(constraint_query)
    if constraint_result:
        columns, rows = constraint_result
        constraints_by_table = {}
        for row in rows:
            schema = row[0]
            table_name = row[1]
            full_name = f"{schema}.{table_name}"
            if full_name not in constraints_by_table:
                constraints_by_table[full_name] = []
            constraints_by_table[full_name].append({
                'constraint_name': row[2],
                'constraint_type': row[3],
                'column_name': row[4] if row[4] else None,
                'check_clause': row[5] if row[5] else None
            })
        
        for full_name, constraints in constraints_by_table.items():
            if full_name in schema_data['tables']:
                schema_data['tables'][full_name]['constraints'] = constraints
        
        total_constraints = len(rows)
        print(f"  Found {total_constraints} constraints")
    else:
        schema_data['errors'].append("Failed to retrieve constraint information")
    
    print("\n" + "="*80)
    print("DISCOVERY COMPLETE")
    print("="*80 + "\n")
    
    return schema_data

def write_documentation(schema_data, output_file='DATABASE_SCHEMA_DOCUMENTATION.md'):
    """Write comprehensive documentation to markdown file."""
    
    with open(output_file, 'w', encoding='utf-8') as f:
        f.write("# ZOLLERDB3 Database Schema Documentation\n\n")
        f.write(f"**Generated:** {schema_data['discovery_date']}\n")
        f.write(f"**Server:** {schema_data['server']}\n")
        f.write(f"**Database:** {schema_data['database_name']}\n\n")
        
        if schema_data['errors']:
            f.write("## ⚠️ Errors Encountered\n\n")
            for error in schema_data['errors']:
                f.write(f"- {error}\n")
            f.write("\n")
        
        f.write("## Summary\n\n")
        f.write(f"- **Total Tables:** {len(schema_data['tables'])}\n")
        total_columns = sum(len(t['columns']) for t in schema_data['tables'].values())
        f.write(f"- **Total Columns:** {total_columns}\n")
        f.write(f"- **Total Relationships:** {len(schema_data['relationships'])}\n")
        f.write("\n---\n\n")
        
        # Table details
        f.write("## Tables\n\n")
        for full_name in sorted(schema_data['tables'].keys()):
            table = schema_data['tables'][full_name]
            f.write(f"### {full_name}\n\n")
            f.write(f"- **Schema:** {table['schema']}\n")
            f.write(f"- **Type:** {table['table_type']}\n")
            f.write(f"- **Column Count:** {len(table['columns'])}\n")
            
            if table['primary_keys']:
                pk_cols = [pk['column_name'] for pk in sorted(table['primary_keys'], key=lambda x: x['ordinal_position'])]
                f.write(f"- **Primary Key:** {', '.join(pk_cols)}\n")
            
            if table['foreign_keys']:
                f.write(f"- **Foreign Keys:** {len(table['foreign_keys'])}\n")
            
            f.write("\n#### Columns\n\n")
            f.write("| Column Name | Data Type | Nullable | Default | PK | FK |\n")
            f.write("|-------------|-----------|----------|---------|----|----|\n")
            
            for col in table['columns']:
                is_pk = '✓' if any(pk['column_name'] == col['column_name'] for pk in table['primary_keys']) else ''
                is_fk = '✓' if any(fk['column_name'] == col['column_name'] for fk in table['foreign_keys']) else ''
                
                data_type = col['data_type']
                if col['character_maximum_length']:
                    data_type += f"({col['character_maximum_length']})"
                elif col['numeric_precision']:
                    if col['numeric_scale']:
                        data_type += f"({col['numeric_precision']},{col['numeric_scale']})"
                    else:
                        data_type += f"({col['numeric_precision']})"
                
                default = col['column_default'] if col['column_default'] else ''
                nullable = 'YES' if col['is_nullable'] == 'YES' else 'NO'
                
                f.write(f"| {col['column_name']} | {data_type} | {nullable} | {default} | {is_pk} | {is_fk} |\n")
            
            if table.get('foreign_keys'):
                f.write("\n#### Foreign Key Relationships\n\n")
                for fk in table['foreign_keys']:
                    f.write(f"- **{fk['column_name']}** → `{fk['references_table']}.{fk['references_column']}` ")
                    f.write(f"(Update: {fk['update_rule']}, Delete: {fk['delete_rule']})\n")
            
            if table.get('indexes'):
                f.write("\n#### Indexes\n\n")
                indexes_by_name = {}
                for idx in table['indexes']:
                    if idx['index_name'] not in indexes_by_name:
                        indexes_by_name[idx['index_name']] = {
                            'type': idx['index_type'],
                            'unique': idx['is_unique'],
                            'columns': []
                        }
                    if not idx['is_included_column']:
                        indexes_by_name[idx['index_name']]['columns'].append(
                            (idx['key_ordinal'], idx['column_name'])
                        )
                
                for idx_name, idx_info in indexes_by_name.items():
                    cols = [col[1] for col in sorted(idx_info['columns'])]
                    unique_str = "UNIQUE " if idx_info['unique'] else ""
                    f.write(f"- **{idx_name}**: {unique_str}{idx_info['type']} on ({', '.join(cols)})\n")
            
            f.write("\n---\n\n")
        
        # Relationships summary
        if schema_data['relationships']:
            f.write("## Relationship Map\n\n")
            f.write("| From Table | From Column | To Table | To Column | Update Rule | Delete Rule |\n")
            f.write("|------------|-------------|----------|-----------|-------------|------------|\n")
            for rel in schema_data['relationships']:
                f.write(f"| {rel['from_table']} | {rel['from_column']} | {rel['to_table']} | {rel['to_column']} | ")
                f.write(f"{rel['update_rule']} | {rel['delete_rule']} |\n")
            f.write("\n")
    
    print(f"Documentation written to: {output_file}")

def main():
    """Main execution."""
    SERVER = r"ESTSS01\ZOLLERSQLEXPRESS"
    DATABASE = "ZOLLERDB3"
    CREDENTIALS = [
        ("Brad Taylor", "Falcon 9"),
        ("SA", "Zollerdb3")
    ]
    
    probe = None
    connected = False
    
    for username, password in CREDENTIALS:
        print(f"Attempting connection with username: {username}...")
        probe = SQLProbe(SERVER, DATABASE, username, password)
        if probe.connect():
            connected = True
            break
    
    if not connected:
        print("ERROR: Could not connect to database")
        return
    
    try:
        schema_data = discover_complete_schema(probe)
        write_documentation(schema_data)
        
        # Also write JSON for programmatic access
        json_file = 'DATABASE_SCHEMA.json'
        with open(json_file, 'w', encoding='utf-8') as f:
            json.dump(schema_data, f, indent=2, default=str)
        print(f"JSON schema written to: {json_file}")
        
    except Exception as e:
        print(f"ERROR: {e}")
        import traceback
        traceback.print_exc()
    finally:
        probe.disconnect()

if __name__ == "__main__":
    main()

