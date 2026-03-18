"""Verify that all database schema information is documented."""
import json

with open('DATABASE_SCHEMA.json', 'r', encoding='utf-8') as f:
    data = json.load(f)

print("="*80)
print("DOCUMENTATION VERIFICATION")
print("="*80)
print(f"\nTables documented: {len(data['tables'])}")
print(f"Relationships documented: {len(data['relationships'])}")
print(f"Errors encountered: {len(data['errors'])}")

if data['errors']:
    print("\nErrors:")
    for error in data['errors']:
        print(f"  - {error}")

print("\n" + "="*80)
print("ALL TABLES:")
print("="*80)
for table_name in sorted(data['tables'].keys()):
    table = data['tables'][table_name]
    col_count = len(table['columns'])
    pk_count = len(table['primary_keys'])
    fk_count = len(table.get('foreign_keys', []))
    print(f"{table_name:40} | {col_count:3} cols | {pk_count} PK | {fk_count} FK")

print("\n" + "="*80)
print("VERIFICATION COMPLETE")
print("="*80)

