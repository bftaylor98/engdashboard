"""
SQL Probe - Read-Only Database Exploration Tool
Connects to SQL Server Express and executes SELECT queries from queries.sql
"""

import pyodbc
import re
import sys
from pathlib import Path
from typing import List, Optional, Tuple


class SQLProbe:
    """Read-only SQL probe for exploring Zoller TMS/Vending database."""
    
    def __init__(self, server: str, database: str, username: str = None, password: str = None):
        """
        Initialize SQL probe connection.
        
        Args:
            server: SQL Server instance (e.g., 'ESTSS01\\ZOLLERSQLEXPRESS')
            database: Database name (e.g., 'ZOLLERDB3')
            username: SQL Server username (None for Windows auth)
            password: SQL Server password (None for Windows auth)
        """
        self.server = server
        self.database = database
        self.username = username
        self.password = password
        self.conn = None
        
    def connect(self) -> bool:
        """Establish connection using SQL Server or Windows authentication."""
        try:
            if self.username and self.password:
                # SQL Server authentication
                connection_string = (
                    f"DRIVER={{ODBC Driver 17 for SQL Server}};"
                    f"SERVER={self.server};"
                    f"DATABASE={self.database};"
                    f"UID={self.username};"
                    f"PWD={self.password};"
                )
            else:
                # Windows authentication
                connection_string = (
                    f"DRIVER={{ODBC Driver 17 for SQL Server}};"
                    f"SERVER={self.server};"
                    f"DATABASE={self.database};"
                    f"Trusted_Connection=yes;"
                )
            self.conn = pyodbc.connect(connection_string, timeout=10)
            print(f"[OK] Connected to {self.server}\\{self.database}")
            return True
        except pyodbc.Error as e:
            print(f"[ERROR] Connection failed: {e}")
            return False
    
    def disconnect(self):
        """Close database connection."""
        if self.conn:
            self.conn.close()
            print("[OK] Connection closed")
    
    @staticmethod
    def list_databases(server: str, username: str = None, password: str = None) -> Optional[List[str]]:
        """
        List available databases on the server (connects to 'master' database).
        
        Args:
            server: SQL Server instance
            username: SQL Server username (None for Windows auth)
            password: SQL Server password (None for Windows auth)
            
        Returns:
            List of database names or None if error
        """
        try:
            if username and password:
                # SQL Server authentication
                connection_string = (
                    f"DRIVER={{ODBC Driver 17 for SQL Server}};"
                    f"SERVER={server};"
                    f"DATABASE=master;"
                    f"UID={username};"
                    f"PWD={password};"
                )
            else:
                # Windows authentication
                connection_string = (
                    f"DRIVER={{ODBC Driver 17 for SQL Server}};"
                    f"SERVER={server};"
                    f"DATABASE=master;"
                    f"Trusted_Connection=yes;"
                )
            conn = pyodbc.connect(connection_string, timeout=10)
            cursor = conn.cursor()
            
            query = """
                SELECT name 
                FROM sys.databases 
                WHERE state_desc = 'ONLINE'
                ORDER BY name
            """
            cursor.execute(query)
            databases = [row[0] for row in cursor.fetchall()]
            
            cursor.close()
            conn.close()
            
            return databases
            
        except pyodbc.Error as e:
            print(f"[ERROR] Failed to list databases: {e}")
            return None
    
    def execute_query(self, query: str, max_rows: int = 1000) -> Optional[List[Tuple]]:
        """
        Execute a SELECT query and return results.
        
        Args:
            query: SQL SELECT query
            max_rows: Maximum rows to return (safety limit)
            
        Returns:
            List of tuples (rows) or None if error
        """
        if not self.conn:
            print("[ERROR] No active connection")
            return None
        
        # Safety check: ensure query is read-only
        # Check for SQL statements (keywords followed by whitespace or at statement start)
        query_upper = query.strip().upper()
        forbidden_keywords = ['INSERT', 'UPDATE', 'DELETE', 'DROP', 'CREATE', 
                             'ALTER', 'TRUNCATE', 'EXEC', 'EXECUTE']
        
        # Only block if keyword appears as a SQL statement (followed by space, newline, or at start)
        for keyword in forbidden_keywords:
            # Pattern: keyword at start of query or preceded by space/semicolon/newline
            pattern = rf'(^|\s|;|\n){keyword}(\s|\(|;|\n)'
            if re.search(pattern, query_upper):
                print(f"[ERROR] Query contains forbidden SQL statement: {keyword}. Read-only mode enforced.")
                return None
        
        try:
            cursor = self.conn.cursor()
            cursor.execute(query)
            
            # Fetch results with limit
            rows = cursor.fetchmany(max_rows)
            cursor.close()
            
            return rows
            
        except pyodbc.Error as e:
            print(f"[ERROR] Query execution error: {e}")
            return None
    
    def execute_query_with_headers(self, query: str, max_rows: int = 1000) -> Optional[Tuple[List[str], List[Tuple]]]:
        """
        Execute query and return column headers with results.
        
        Returns:
            Tuple of (column_names, rows) or None if error
        """
        if not self.conn:
            print("[ERROR] No active connection")
            return None
        
        # Safety check: ensure query is read-only
        # Check for SQL statements (keywords followed by whitespace or at statement start)
        query_upper = query.strip().upper()
        forbidden_keywords = ['INSERT', 'UPDATE', 'DELETE', 'DROP', 'CREATE', 
                             'ALTER', 'TRUNCATE', 'EXEC', 'EXECUTE']
        
        # Only block if keyword appears as a SQL statement (followed by space, newline, or at start)
        for keyword in forbidden_keywords:
            # Pattern: keyword at start of query or preceded by space/semicolon/newline
            pattern = rf'(^|\s|;|\n){keyword}(\s|\(|;|\n)'
            if re.search(pattern, query_upper):
                print(f"[ERROR] Query contains forbidden SQL statement: {keyword}. Read-only mode enforced.")
                return None
        
        try:
            cursor = self.conn.cursor()
            cursor.execute(query)
            
            # Get column names
            columns = [column[0] for column in cursor.description]
            
            # Fetch results with limit
            rows = cursor.fetchmany(max_rows)
            cursor.close()
            
            return (columns, rows)
            
        except pyodbc.Error as e:
            print(f"[ERROR] Query execution error: {e}")
            return None
    
    def display_results(self, columns: List[str], rows: List[Tuple], max_display: int = 50):
        """Display query results in a formatted table."""
        if not rows:
            print("No results returned.")
            return
        
        # Limit display rows
        display_rows = rows[:max_display]
        total_rows = len(rows)
        
        # Print header
        print("\n" + "=" * 80)
        print(f"Results ({len(display_rows)} of {total_rows} rows shown)")
        print("=" * 80)
        
        # Calculate column widths
        col_widths = {}
        for col in columns:
            col_idx = columns.index(col)
            # Get max width from column header and all non-NULL values
            value_lengths = [len(str(row[col_idx])) 
                           for row in display_rows 
                           if row[col_idx] is not None]
            col_widths[col] = max(len(str(col)), max(value_lengths) if value_lengths else 0)
        
        # Print column headers
        header = " | ".join(str(col).ljust(col_widths[col]) for col in columns)
        print(header)
        print("-" * len(header))
        
        # Print rows
        for row in display_rows:
            row_str = " | ".join(
                str(val).ljust(col_widths[col]) if val is not None else "NULL".ljust(col_widths[col])
                for col, val in zip(columns, row)
            )
            print(row_str)
        
        if total_rows > max_display:
            print(f"\n... ({total_rows - max_display} more rows not shown)")
        
        print("=" * 80 + "\n")
    
    def discover_all_tables(self) -> Optional[List[Tuple]]:
        """
        Discover all tables in the database.
        
        Returns:
            List of (schema, table_name, table_type) tuples or None if error
        """
        query = """
            SELECT 
                TABLE_SCHEMA,
                TABLE_NAME,
                TABLE_TYPE
            FROM INFORMATION_SCHEMA.TABLES
            WHERE TABLE_TYPE = 'BASE TABLE'
            ORDER BY TABLE_SCHEMA, TABLE_NAME
        """
        return self.execute_query(query)
    
    def discover_table_columns(self, table_schema: str = None, table_name: str = None) -> Optional[List[Tuple]]:
        """
        Discover all columns for specified table(s).
        
        Args:
            table_schema: Schema name (None for all schemas)
            table_name: Table name (None for all tables, can use LIKE patterns)
            
        Returns:
            List of column information tuples or None if error
        """
        if table_name:
            if table_schema:
                query = f"""
                    SELECT 
                        TABLE_SCHEMA,
                        TABLE_NAME,
                        COLUMN_NAME,
                        ORDINAL_POSITION,
                        DATA_TYPE,
                        CHARACTER_MAXIMUM_LENGTH,
                        NUMERIC_PRECISION,
                        NUMERIC_SCALE,
                        IS_NULLABLE,
                        COLUMN_DEFAULT
                    FROM INFORMATION_SCHEMA.COLUMNS
                    WHERE TABLE_SCHEMA = '{table_schema}' 
                        AND TABLE_NAME = '{table_name}'
                    ORDER BY TABLE_SCHEMA, TABLE_NAME, ORDINAL_POSITION
                """
            else:
                query = f"""
                    SELECT 
                        TABLE_SCHEMA,
                        TABLE_NAME,
                        COLUMN_NAME,
                        ORDINAL_POSITION,
                        DATA_TYPE,
                        CHARACTER_MAXIMUM_LENGTH,
                        NUMERIC_PRECISION,
                        NUMERIC_SCALE,
                        IS_NULLABLE,
                        COLUMN_DEFAULT
                    FROM INFORMATION_SCHEMA.COLUMNS
                    WHERE TABLE_NAME = '{table_name}'
                    ORDER BY TABLE_SCHEMA, TABLE_NAME, ORDINAL_POSITION
                """
        else:
            query = """
                SELECT 
                    TABLE_SCHEMA,
                    TABLE_NAME,
                    COLUMN_NAME,
                    ORDINAL_POSITION,
                    DATA_TYPE,
                    CHARACTER_MAXIMUM_LENGTH,
                    NUMERIC_PRECISION,
                    NUMERIC_SCALE,
                    IS_NULLABLE,
                    COLUMN_DEFAULT
                FROM INFORMATION_SCHEMA.COLUMNS
                ORDER BY TABLE_SCHEMA, TABLE_NAME, ORDINAL_POSITION
            """
        
        return self.execute_query(query)
    
    def discover_all_schema(self) -> Optional[Tuple[List[str], List[Tuple]]]:
        """
        Discover complete database schema: all tables and all columns.
        This is a comprehensive discovery that loops through all tables.
        
        Returns:
            Tuple of (column_names, rows) with complete schema information or None if error
        """
        query = """
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
                c.COLUMN_DEFAULT,
                CASE 
                    WHEN pk.COLUMN_NAME IS NOT NULL THEN 'YES'
                    ELSE 'NO'
                END AS IS_PRIMARY_KEY,
                CASE 
                    WHEN fk.COLUMN_NAME IS NOT NULL THEN 'YES'
                    ELSE 'NO'
                END AS IS_FOREIGN_KEY
            FROM INFORMATION_SCHEMA.TABLES t
            INNER JOIN INFORMATION_SCHEMA.COLUMNS c 
                ON t.TABLE_SCHEMA = c.TABLE_SCHEMA 
                AND t.TABLE_NAME = c.TABLE_NAME
            LEFT JOIN (
                SELECT ku.TABLE_SCHEMA, ku.TABLE_NAME, ku.COLUMN_NAME
                FROM INFORMATION_SCHEMA.TABLE_CONSTRAINTS tc
                INNER JOIN INFORMATION_SCHEMA.KEY_COLUMN_USAGE ku
                    ON tc.CONSTRAINT_TYPE = 'PRIMARY KEY'
                    AND tc.CONSTRAINT_NAME = ku.CONSTRAINT_NAME
            ) pk ON c.TABLE_SCHEMA = pk.TABLE_SCHEMA 
                AND c.TABLE_NAME = pk.TABLE_NAME 
                AND c.COLUMN_NAME = pk.COLUMN_NAME
            LEFT JOIN (
                SELECT ku.TABLE_SCHEMA, ku.TABLE_NAME, ku.COLUMN_NAME
                FROM INFORMATION_SCHEMA.TABLE_CONSTRAINTS tc
                INNER JOIN INFORMATION_SCHEMA.KEY_COLUMN_USAGE ku
                    ON tc.CONSTRAINT_TYPE = 'FOREIGN KEY'
                    AND tc.CONSTRAINT_NAME = ku.CONSTRAINT_NAME
            ) fk ON c.TABLE_SCHEMA = fk.TABLE_SCHEMA 
                AND c.TABLE_NAME = fk.TABLE_NAME 
                AND c.COLUMN_NAME = fk.COLUMN_NAME
            WHERE t.TABLE_TYPE = 'BASE TABLE'
            ORDER BY t.TABLE_SCHEMA, t.TABLE_NAME, c.ORDINAL_POSITION
        """
        return self.execute_query_with_headers(query)
    
    def loop_through_tables(self, callback=None):
        """
        Loop through all tables and discover their columns.
        For each table, calls callback function if provided.
        
        Args:
            callback: Optional function(table_schema, table_name, columns) to call for each table
        """
        if not self.conn:
            print("[ERROR] No active connection")
            return None
        
        # Get all tables
        tables = self.discover_all_tables()
        if not tables:
            print("[ERROR] Could not retrieve table list")
            return None
        
        print(f"\nDiscovering schema for {len(tables)} table(s)...\n")
        
        results = {}
        for schema, table_name, table_type in tables:
            print(f"Processing: {schema}.{table_name}...")
            
            # Get columns for this table
            columns_query = f"""
                SELECT 
                    COLUMN_NAME,
                    ORDINAL_POSITION,
                    DATA_TYPE,
                    CHARACTER_MAXIMUM_LENGTH,
                    NUMERIC_PRECISION,
                    NUMERIC_SCALE,
                    IS_NULLABLE,
                    COLUMN_DEFAULT
                FROM INFORMATION_SCHEMA.COLUMNS
                WHERE TABLE_SCHEMA = '{schema}' 
                    AND TABLE_NAME = '{table_name}'
                ORDER BY ORDINAL_POSITION
            """
            
            columns_result = self.execute_query_with_headers(columns_query)
            if columns_result:
                col_headers, col_rows = columns_result
                results[f"{schema}.{table_name}"] = {
                    'schema': schema,
                    'table': table_name,
                    'columns': col_rows,
                    'column_headers': col_headers
                }
                
                # Call callback if provided
                if callback:
                    callback(schema, table_name, col_rows)
        
        return results


def load_queries(file_path: str) -> List[Tuple[str, str]]:
    """
    Load queries from SQL file.
    Queries are separated by '-- Query:' comments.
    
    Returns:
        List of (query_name, query_text) tuples
    """
    queries = []
    current_query = []
    current_name = "Unnamed Query"
    
    try:
        with open(file_path, 'r', encoding='utf-8') as f:
            for line in f:
                line_stripped = line.strip()
                
                # Check for query name marker
                if line_stripped.startswith('-- Query:'):
                    # Save previous query if exists
                    if current_query:
                        queries.append((current_name, '\n'.join(current_query)))
                    
                    # Start new query
                    current_name = line_stripped.replace('-- Query:', '').strip()
                    current_query = []
                elif line_stripped and not line_stripped.startswith('--'):
                    # Add non-comment lines to current query
                    current_query.append(line)
            
            # Save last query
            if current_query:
                queries.append((current_name, '\n'.join(current_query)))
    
    except FileNotFoundError:
        print(f"[ERROR] Query file not found: {file_path}")
        return []
    except Exception as e:
        print(f"[ERROR] Error loading queries: {e}")
        return []
    
    return queries


def main():
    """Main execution function."""
    # Configuration
    SERVER = r"ESTSS01\ZOLLERSQLEXPRESS"
    DATABASE = "ZOLLERDB3"
    QUERIES_FILE = "queries.sql"
    
    # SQL Server authentication credentials (try first set, fallback to SA)
    CREDENTIALS = [
        ("Brad Taylor", "Falcon 9"),
        ("SA", "Zollerdb3")
    ]
    
    print("SQL Probe - Read-Only Database Explorer")
    print("=" * 50)
    
    # Try to connect with provided credentials
    probe = None
    connected = False
    
    for username, password in CREDENTIALS:
        print(f"\nAttempting connection with username: {username}...")
        probe = SQLProbe(SERVER, DATABASE, username, password)
        
        if probe.connect():
            connected = True
            break
        else:
            print(f"Connection failed with {username}, trying next credential set...")
    
    if not connected:
        print("\n[ERROR] All connection attempts failed.")
        print("\nAttempting to discover available databases...")
        # Try to list databases with SA credentials
        databases = SQLProbe.list_databases(SERVER, "SA", "Zollerdb3")
        
        if databases:
            print(f"\nAvailable databases on {SERVER}:")
            for db in databases:
                print(f"  - {db}")
            print(f"\nCurrent database name: '{DATABASE}'")
        else:
            print("\nCould not retrieve database list.")
        
        print("\nTroubleshooting tips:")
        print("1. Verify SQL Server instance name is correct")
        print("2. Check database name (see list above)")
        print("3. Verify credentials are correct")
        print("4. Verify ODBC Driver 17 for SQL Server is installed")
        sys.exit(1)
    
    try:
        # Load queries
        queries = load_queries(QUERIES_FILE)
        
        if not queries:
            print(f"\nNo queries found in {QUERIES_FILE}")
            print("Creating sample queries file...")
            # queries.sql will be created separately
        else:
            print(f"\nLoaded {len(queries)} query(ies) from {QUERIES_FILE}\n")
            
            # Execute each query
            for i, (name, query) in enumerate(queries, 1):
                print(f"\n[{i}/{len(queries)}] Executing: {name}")
                print("-" * 50)
                
                result = probe.execute_query_with_headers(query)
                
                if result:
                    columns, rows = result
                    probe.display_results(columns, rows)
    
    except KeyboardInterrupt:
        print("\n\nInterrupted by user")
    except Exception as e:
        print(f"\n[ERROR] Unexpected error: {e}")
    finally:
        probe.disconnect()


if __name__ == "__main__":
    main()

