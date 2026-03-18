"""
Generate Crib Report for checkout transactions - Manual Version
This is a copy of the master report that:
- Does NOT send to Power Automate
- Automatically opens the report in browser
- Uses a different output filename (manual_report.html)
- Stays in sync with master report functionality
"""
import sys
import os
import webbrowser

# Import everything from the master report
# This ensures we stay in sync with the master report
from generate_master_transaction_report import (
    SQLProbe,
    query_checkouts_by_date,
    query_checkouts_last_30_days,
    get_target_dates,
    load_ipad_submissions,
    filter_submissions_by_date,
    run_door_unlocks_script,
    load_door_unlocks,
    query_under_minimum_items,
    query_matrix_vending_items,
    generate_html_report,
    generate_xml_report,
    MATRIX_VENDING_ENABLED,
)

def main():
    """Main function to generate unified report - Manual version (no Power Automate)."""
    import argparse
    
    parser = argparse.ArgumentParser(
        description="Generate Crib Report for checkout transactions (Manual - No Power Automate)",
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog="""
Examples:
  # Generate report (yesterday, opens in browser, does NOT send to Power Automate)
  python generate_master_transaction_report_manual.py

  # Generate report for specific date
  python generate_master_transaction_report_manual.py --date 2025-12-18
        """
    )
    
    parser.add_argument(
        '--date',
        help='Date for daily report (YYYY-MM-DD format). Defaults to yesterday.'
    )
    parser.add_argument(
        '--output',
        help='Output HTML filename (default: manual_report.html)'
    )
    
    args = parser.parse_args()
    
    SERVER = r"ESTSS01\ZOLLERSQLEXPRESS"
    DATABASE = "ZOLLERDB3"
    CREDENTIALS = [
        ("SA", "Zollerdb3")
    ]
    
    probe = None
    connected = False
    
    print("="*60)
    print("Crib Report - Manual Version (No Power Automate)")
    print("="*60)
    print()
    
    import time
    conn_start = time.time()
    for username, password in CREDENTIALS:
        probe = SQLProbe(SERVER, DATABASE, username, password)
        if probe.connect():
            connected = True
            break
    conn_time = time.time() - conn_start
    
    if not connected:
        print("ERROR: Could not connect to database")
        return
    
    try:
        # Always query both daily and monthly data
        # Calculate target dates (handles Monday special case)
        start_date, end_date, date_list = get_target_dates(args.date)
        
        # Display date range info
        if len(date_list) > 1:
            print(f"Querying daily checkout transactions for {len(date_list)} days: {', '.join(date_list)}")
        else:
            print(f"Querying daily checkout transactions for {date_list[0]}...")
        
        query_start = time.time()
        daily_rows = query_checkouts_by_date(probe, target_date=date_list[0], start_date=start_date, end_date=end_date)
        daily_query_time = time.time() - query_start
        print(f"Daily query completed in {daily_query_time:.2f} seconds ({len(daily_rows)} transactions)")
        
        # Query monthly data (last 30 days)
        print(f"Querying monthly checkout transactions for last 30 days...")
        query_start = time.time()
        monthly_rows = query_checkouts_last_30_days(probe)
        monthly_query_time = time.time() - query_start
        print(f"Monthly query completed in {monthly_query_time:.2f} seconds ({len(monthly_rows)} transactions)")
        
        query_time = daily_query_time + monthly_query_time
        
        if not daily_rows and not monthly_rows:
            print(f"No checkout transactions found")
            return
        
        # Generate output filenames (use manual_report.html to avoid overwriting master report)
        if args.output:
            output_html = args.output
        else:
            output_html = "manual_report.html"
        
        output_xml = output_html.replace('.html', '.xml')
        
        # Run door unlocks script
        print(f"\n{'='*60}")
        print("Running Door Unlocks Script...")
        print(f"{'='*60}")
        run_door_unlocks_script()
        
        # Load door unlock data
        from pathlib import Path
        script_dir = Path(__file__).parent
        daily_door_json = script_dir.parent / "Ubiquiti_Scripts" / "yesterday_crib_door.json"
        monthly_door_json = script_dir.parent / "Ubiquiti_Scripts" / "last_30_days_crib_door.json"
        
        daily_door_data = load_door_unlocks(daily_door_json)
        monthly_door_data = load_door_unlocks(monthly_door_json)
        
        if daily_door_data:
            print(f"Loaded {daily_door_data.get('total_events', 0)} daily door unlock events")
        if monthly_door_data:
            print(f"Loaded {monthly_door_data.get('total_events', 0)} monthly door unlock events")
        
        # Query under minimum stock items
        print(f"\n{'='*60}")
        print("Querying Under Minimum Stock Items...")
        print(f"{'='*60}")
        query_start = time.time()
        under_minimum_rows = query_under_minimum_items(probe)
        under_minimum_query_time = time.time() - query_start
        print(f"Under minimum query completed in {under_minimum_query_time:.2f} seconds ({len(under_minimum_rows)} items found)")
        
        # Query Matrix Vending items
        print(f"\n{'='*60}")
        print("Querying Matrix Vending Items...")
        print(f"{'='*60}")
        matrix_vending_data = None
        if MATRIX_VENDING_ENABLED:
            query_start = time.time()
            try:
                matrix_vending_data = query_matrix_vending_items()
                matrix_query_time = time.time() - query_start
                if matrix_vending_data is not None:
                    print(f"Matrix Vending query completed in {matrix_query_time:.2f} seconds ({len(matrix_vending_data)} items found)")
                else:
                    print(f"Matrix Vending query failed or returned no data")
            except Exception as e:
                print(f"Warning: Error querying Matrix Vending database: {e}")
                matrix_vending_data = None
        else:
            print("Matrix Vending database not configured (MATRIX_VENDING_ENABLED = False)")
        
        # Load iPad form submissions
        print(f"\n{'='*60}")
        print("Loading iPad Form Submissions...")
        print(f"{'='*60}")
        all_submissions = load_ipad_submissions()
        print(f"Loaded {len(all_submissions)} total submissions")
        
        # For iPad submissions, use the same date range as the transaction report
        # This keeps iPad submissions aligned with the transaction data
        # Filter submissions by date
        if len(date_list) > 1:
            print(f"Filtering iPad submissions - Daily dates: {', '.join(date_list)}")
        else:
            print(f"Filtering iPad submissions - Daily date: {date_list[0]}")
        daily_submissions = filter_submissions_by_date(all_submissions, target_date=date_list[0], days_back=1, date_list=date_list)
        monthly_submissions = filter_submissions_by_date(all_submissions, None, days_back=30)
        if len(date_list) > 1:
            print(f"Daily iPad submissions for {', '.join(date_list)}: {len(daily_submissions)}")
        else:
            print(f"Daily iPad submissions for {date_list[0]}: {len(daily_submissions)}")
        print(f"Monthly iPad submissions (last 30 days): {len(monthly_submissions)}")
        
        # Generate HTML report with both datasets
        print(f"\n{'='*60}")
        print("Generating HTML Report...")
        print(f"{'='*60}")
        html_start = time.time()
        # Default to 'daily' report type (both datasets are always included)
        default_report_type = 'daily'
        generate_html_report(daily_rows, monthly_rows, output_html, default_report_type, daily_submissions, monthly_submissions, daily_door_data, monthly_door_data, under_minimum_rows, matrix_vending_data)
        html_time = time.time() - html_start
        print(f"HTML generation completed in {html_time:.2f} seconds")
        
        # NOTE: Power Automate sending is SKIPPED in manual version
        
        # Generate XML report
        print(f"\n{'='*60}")
        print("Generating XML Report...")
        print(f"{'='*60}")
        xml_start = time.time()
        generate_xml_report(daily_rows, monthly_rows, output_xml)
        xml_time = time.time() - xml_start
        print(f"XML generation completed in {xml_time:.2f} seconds")
        
        # Open HTML file automatically in browser
        print(f"\n{'='*60}")
        print("Opening Report in Browser...")
        print(f"{'='*60}")
        try:
            if not os.path.isabs(output_html):
                output_html_abs = os.path.abspath(output_html)
            else:
                output_html_abs = output_html
            webbrowser.open(f"file:///{output_html_abs.replace(os.sep, '/')}")
            print(f"[OK] Report opened in default browser")
        except Exception as e:
            print(f"Warning: Could not open browser automatically: {e}")
            print(f"  Please open manually: {os.path.abspath(output_html)}")
        
        print(f"\n{'='*60}")
        print("SUCCESS: Reports generated!")
        print(f"{'='*60}")
        print(f"Performance Summary:")
        print(f"  Database connection: {conn_time:.2f} seconds")
        print(f"  Database query: {query_time:.2f} seconds")
        print(f"  HTML generation: {html_time:.2f} seconds")
        print(f"  XML generation: {xml_time:.2f} seconds")
        print(f"  Total time: {conn_time + query_time + html_time + xml_time:.2f} seconds")
        print()
        print(f"Report file: {os.path.abspath(output_html)}")
        print(f"Note: This is the MANUAL version - report was NOT sent to Power Automate")
        print("="*60)
        
    except Exception as e:
        print(f"ERROR: {e}")
        import traceback
        traceback.print_exc()
    finally:
        probe.disconnect()


if __name__ == "__main__":
    import time
    start_time = time.time()
    main()
    total_time = time.time() - start_time
    print()
    print(f"Total execution time: {total_time:.2f} seconds")




