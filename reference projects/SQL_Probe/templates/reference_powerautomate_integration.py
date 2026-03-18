#!/usr/bin/env python3
"""
Script to generate HTML report and send it to Power Automate.
Runs the HTML generator, waits 30 seconds, then sends to Power Automate.
"""

import argparse
import os
import subprocess
import sys
import time
from typing import Optional


def run_command(command: list, description: str) -> bool:
    """
    Run a command and return True if successful.
    
    Args:
        command: List of command and arguments
        description: Description of what's being run
    
    Returns:
        True if successful, False otherwise
    """
    print(f"\n{'='*60}")
    print(f"{description}")
    print(f"{'='*60}")
    
    try:
        result = subprocess.run(
            command,
            check=True,
            capture_output=False,
            text=True
        )
        return result.returncode == 0
    except subprocess.CalledProcessError as e:
        print(f"Error: {description} failed with return code {e.returncode}", file=sys.stderr)
        return False
    except FileNotFoundError:
        print(f"Error: Command not found: {command[0]}", file=sys.stderr)
        return False


def main() -> None:
    """Main function."""
    parser = argparse.ArgumentParser(
        description="Generate HTML report and send to Power Automate",
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog="""
Examples:
  # Generate from latest CSV and send
  python generate_and_send_report.py

  # Generate from specific CSV and send
  python generate_and_send_report.py --csv Sample_Transaction.csv

  # Generate with custom output file
  python generate_and_send_report.py --output custom_report.html
        """
    )
    
    parser.add_argument(
        '--csv',
        help='Input CSV file (defaults to latest CSV in directory)'
    )
    parser.add_argument(
        '--output',
        default='vending_report.html',
        help='Output HTML file (default: vending_report.html)'
    )
    parser.add_argument(
        '--wait',
        type=int,
        default=30,
        help='Wait time in seconds between generation and sending (default: 30)'
    )
    parser.add_argument(
        '--skip-send',
        action='store_true',
        help='Only generate HTML, do not send to Power Automate'
    )
    
    args = parser.parse_args()
    
    # Get script directory
    script_dir = os.path.dirname(os.path.abspath(__file__))
    
    # Build command for HTML generator
    html_generator_cmd = [sys.executable, os.path.join(script_dir, 'generate_report_html_v2.py')]
    if args.csv:
        html_generator_cmd.append(args.csv)
    if args.output != 'vending_report.html' or args.csv:
        html_generator_cmd.append(args.output)
    
    # Run HTML generator
    if not run_command(html_generator_cmd, "Step 1: Generating HTML Report"):
        print("\nFailed to generate HTML report. Exiting.", file=sys.stderr)
        sys.exit(1)
    
    # Wait for HTML to be fully generated
    if args.wait > 0:
        print(f"\n{'='*60}")
        print(f"Waiting {args.wait} seconds for HTML to be fully generated...")
        print(f"{'='*60}")
        for i in range(args.wait, 0, -1):
            print(f"  Waiting... {i} seconds remaining", end='\r')
            time.sleep(1)
        print("  Waiting complete!                    ")  # Clear the line
    
    # Check if HTML file exists
    html_path = args.output
    if not os.path.isabs(html_path):
        html_path = os.path.join(script_dir, html_path)
    
    if not os.path.exists(html_path):
        print(f"\nError: HTML file not found: {html_path}", file=sys.stderr)
        sys.exit(1)
    
    # Send to Power Automate (unless skipped)
    if not args.skip_send:
        send_cmd = [sys.executable, os.path.join(script_dir, 'send_to_powerautomate.py'), '--html-file', args.output]
        
        if not run_command(send_cmd, "Step 2: Sending to Power Automate"):
            print("\nFailed to send to Power Automate.", file=sys.stderr)
            sys.exit(1)
        
        print(f"\n{'='*60}")
        print("SUCCESS: Report generated and sent to Power Automate!")
        print(f"{'='*60}")
    else:
        print(f"\n{'='*60}")
        print("SUCCESS: Report generated!")
        print(f"{'='*60}")


if __name__ == "__main__":
    main()




