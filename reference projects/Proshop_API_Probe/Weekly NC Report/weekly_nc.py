import requests
import datetime
import sys
from typing import List, Dict
import re
import html
import logging
import configparser
import argparse
import time
import json
from functools import lru_cache

# --- CACHING ---
# Global caches to avoid redundant API calls
_user_cache = {}
_work_order_cache = {}

def clear_caches():
    """Clear all caches."""
    global _user_cache, _work_order_cache
    _user_cache.clear()
    _work_order_cache.clear()

# --- CONFIGURATION ---
def load_config():
    """Load configuration from config.ini file."""
    config = configparser.ConfigParser()
    config.read('config.ini')
    return config

def get_cause_code_description(cause_code: str) -> str:
    """Get the description for a cause code."""
    cause_code_mapping = {

            
        "C1": "Operator Error",
        "C2": "Material Defect", 
        "C3": "Setup Error",
        "C4": "Tool Wear",
        "C5": "Vendor Defect",
        "C6": "Design Error",
        "C7": "Process Error",
        "C8": "Program Error",
        "C9": "Measurement Error",
        "C10": "Equipment Failure",
        "C11": "Environmental",
        "C12": "Documentation Error",
        "C13": "Training Issue",
        "C14": "Communication Error",
        "C15": "Procedure Error",
        "C16": "Inspection Error",
        "C17": "Calibration Error",
        "C18": "Maintenance Issue",
        "C19": "Quality System",
        "C20": "Other",
        "C21": "Unknown",
        "C22": "Unknown",
        "C24": "Unknown"
    }
    
    if not cause_code or cause_code.strip() == "":
        return "N/A"
    
    return cause_code_mapping.get(cause_code, f"Unknown ({cause_code})")

def get_disposition_notes(ncr: Dict, config) -> str:
    """Get disposition notes for an NCR."""
    # Try to get from config first (manual mapping)
    ncr_number = ncr.get('ncrRefNumber', '')
    disposition_mapping = config.get('disposition_notes', 'mapping', fallback='')
    
    if disposition_mapping:
        try:
            mapping = json.loads(disposition_mapping)
            return mapping.get(ncr_number, "N/A")
        except:
            pass
    
    # If no mapping, return N/A
    return "N/A"

def get_per_part_value(ncr: Dict, config) -> str:
    """Get per part value for an NCR."""
    # Try to get from config first (manual mapping)
    ncr_number = ncr.get('ncrRefNumber', '')
    value_mapping = config.get('per_part_value', 'mapping', fallback='')
    
    if value_mapping:
        try:
            mapping = json.loads(value_mapping)
            return mapping.get(ncr_number, "N/A")
        except:
            pass
    
    # If no mapping, return N/A
    return "N/A"

# --- LOGGING CONFIGURATION ---
def setup_logging(config):
    """Configure logging to write to both console and file."""
    log_level = getattr(logging, config.get('logging', 'level', fallback='INFO'))
    log_file = config.get('logging', 'log_file', fallback='ncr_fetch.log')
    
    logging.basicConfig(
        level=log_level,
        format='%(asctime)s - %(levelname)s - %(message)s',
        handlers=[
            logging.FileHandler(log_file),
            logging.StreamHandler(sys.stdout)
        ]
    )

# --- RETRY LOGIC ---
def make_request_with_retry(method, url, **kwargs):
    """Make HTTP request with exponential backoff retry logic."""
    max_retries = 3
    base_delay = 1
    
    for attempt in range(max_retries):
        try:
            response = requests.request(method, url, **kwargs)
            response.raise_for_status()
            return response
        except requests.exceptions.RequestException as e:
            if attempt == max_retries - 1:
                raise e
            delay = base_delay * (2 ** attempt)
            logging.warning(f"Request failed (attempt {attempt + 1}/{max_retries}): {e}. Retrying in {delay} seconds...")
            time.sleep(delay)
    
    raise RuntimeError("Max retries exceeded")

# --- ARGUMENT PARSING ---
def parse_arguments():
    """Parse command-line arguments."""
    parser = argparse.ArgumentParser(description='Fetch NCRs from ProShop API and output in various formats')
    parser.add_argument('--start-date', type=str, help='Start date (YYYY-MM-DD HH:MM) for custom time window')
    parser.add_argument('--end-date', type=str, help='End date (YYYY-MM-DD HH:MM) for custom time window')
    parser.add_argument('--output', choices=['console', 'csv', 'webhook'], default='webhook', 
                       help='Output format: webhook (default), console, or csv')
    parser.add_argument('--csv-file', type=str, default='ncrs.csv', help='CSV output filename')
    parser.add_argument('--webhook-url', type=str, default='https://prod-43.westus.logic.azure.com:443/workflows/99ecc752c78b406d886a1097ff39dc22/triggers/manual/paths/invoke?api-version=2016-06-01&sp=%2Ftriggers%2Fmanual%2Frun&sv=1.0&sig=yob9gt1BCjO9x3fyKc1OgwJDC-o6yCk9T9_S5OpupzY', help='Webhook URL to send NCRs to Power Automate (default: your Power Automate webhook)')
    parser.add_argument('--verbose', '-v', action='store_true', help='Enable verbose logging')
    return parser.parse_args()

# --- TIME WINDOW CALCULATION ---
def get_last_7_days_window(now=None):
    if now is None:
        # Get current time in Eastern Time
        now = datetime.datetime.now(datetime.timezone.utc).astimezone(datetime.timezone(datetime.timedelta(hours=-5)))  # EST
    
    # Calculate 7 days ago from now
    seven_days_ago = now - datetime.timedelta(days=7)
    
    return seven_days_ago, now

def get_monday_noon_window(now=None):
    if now is None:
        # Get current time in Eastern Time
        now = datetime.datetime.now(datetime.timezone.utc).astimezone(datetime.timezone(datetime.timedelta(hours=-5)))  # EST
    # Find this week's Monday at 12pm Eastern
    weekday = now.weekday()  # Monday=0
    this_monday_noon = (now - datetime.timedelta(days=weekday)).replace(hour=12, minute=0, second=0, microsecond=0)
    # If now is before this Monday at noon, use last week's window
    if now < this_monday_noon:
        this_monday_noon -= datetime.timedelta(weeks=1)
    last_monday_noon = this_monday_noon - datetime.timedelta(weeks=1)
    return last_monday_noon, this_monday_noon

def parse_custom_dates(start_date_str: str, end_date_str: str) -> tuple:
    """Parse custom start and end dates from command line arguments."""
    try:
        # Parse as Eastern Time
        start_date = datetime.datetime.strptime(start_date_str, "%Y-%m-%d %H:%M").replace(tzinfo=datetime.timezone(datetime.timedelta(hours=-5)))
        end_date = datetime.datetime.strptime(end_date_str, "%Y-%m-%d %H:%M").replace(tzinfo=datetime.timezone(datetime.timedelta(hours=-5)))
        return start_date, end_date
    except ValueError as e:
        logging.error(f"Invalid date format: {e}. Use YYYY-MM-DD HH:MM format.")
        sys.exit(1)

# --- AUTHENTICATION ---
def get_session_token(config):
    url = config.get('proshop', 'tenant_url') + config.get('proshop', 'login_endpoint')
    payload = {
        "username": config.get('proshop', 'username'),
        "password": config.get('proshop', 'password'),
        "scope": config.get('proshop', 'scope')
    }
    try:
        resp = make_request_with_retry('POST', url, json=payload, timeout=10)
        data = resp.json()
        return data["authorizationResult"]["token"]
    except Exception as e:
        logging.error(f"Error during authentication: {e}")
        sys.exit(1)

# --- FETCH NCRs ---
def fetch_all_ncrs(session_token: str, config) -> List[Dict]:
    url = config.get('proshop', 'tenant_url') + config.get('proshop', 'graphql_endpoint')
    headers = {"Authorization": f"Bearer {session_token}"}
    ncrs = []
    page_size = 200  # Increased page size for faster fetching
    page_start = 0
    total_pages = 0
    
    while True:
        query = """
        query GetNCRs($pageSize: Int!, $pageStart: Int!) {
          nonConformanceReports(pageSize: $pageSize, pageStart: $pageStart) {
            records {
              ncrRefNumber
              createdTime
              lastModifiedByPlainText
              assignedToPlainText
              notes
              causeCode
              opNumber
              improvementSuggestion
              status
              workOrder { 
                workOrderNumber 
                part { partDescription }
              }
            }
          }
        }
        """
        variables = {"pageSize": page_size, "pageStart": page_start}
        try:
            resp = make_request_with_retry('POST', url, json={"query": query, "variables": variables}, headers=headers, timeout=15)
            data = resp.json()
            if "data" not in data:
                logging.error(f"Full API response (no 'data' key): {data}")
                break
            records = data["data"]["nonConformanceReports"]["records"]
            if not records:
                break
            ncrs.extend(records)
            total_pages += 1
            logging.debug(f"Fetched page {total_pages} with {len(records)} records")
            if len(records) < page_size:
                break
            page_start += page_size
        except Exception as e:
            logging.error(f"Error fetching NCRs: {e}")
            break
    
    logging.info(f"Fetched {len(ncrs)} NCRs in {total_pages} pages")
    return ncrs

# --- FILTER NCRs BY TIME WINDOW ---
def filter_ncrs_by_time(ncrs: List[Dict], start: datetime.datetime, end: datetime.datetime) -> List[Dict]:
    filtered = []
    skipped_count = 0
    for ncr in ncrs:
        try:
            created = datetime.datetime.fromisoformat(ncr["createdTime"].replace("Z", "+00:00"))
            if start <= created < end:
                filtered.append(ncr)
            else:
                skipped_count += 1
        except Exception as e:
            logging.warning(f"Skipping NCR with invalid createdTime: {ncr.get('ncrRefNumber', 'unknown')}, error: {e}")
            skipped_count += 1
    
    logging.info(f"Filtered {len(filtered)} NCRs from {len(ncrs)} total (skipped {skipped_count})")
    return filtered

# --- SUMMARY STATISTICS ---
def print_summary_statistics(ncrs: List[Dict], start: datetime.datetime, end: datetime.datetime, session_token: str, config):
    """Print summary statistics for the fetched NCRs."""
    if not ncrs:
        logging.info("No NCRs found in the specified time window.")
        return
    
    # Count by work order
    work_order_counts = {}
    part_counts = {}
    cause_code_counts = {}
    resource_counts = {}
    status_counts = {}
    improvement_suggestion_counts = {}
    # creator_counts = {}
    
    for ncr in ncrs:
        work_order = ncr.get("workOrder", {}).get("workOrderNumber", "N/A")
        work_order_counts[work_order] = work_order_counts.get(work_order, 0) + 1
        
        part = ncr.get("workOrder", {}).get("part", {}).get("partDescription", "No part description.")
        part_counts[part] = part_counts.get(part, 0) + 1
        
        cause_code = ncr.get("causeCode", "N/A")
        cause_code_description = get_cause_code_description(cause_code)
        cause_code_counts[cause_code_description] = cause_code_counts.get(cause_code_description, 0) + 1
        
        resource = get_resource_for_operation(ncr, session_token, config)
        resource_counts[resource] = resource_counts.get(resource, 0) + 1
        
        status = ncr.get("status", "N/A")
        status_counts[status] = status_counts.get(status, 0) + 1
        
        improvement_suggestion = ncr.get("improvementSuggestion", "N/A")
        improvement_suggestion_counts[improvement_suggestion] = improvement_suggestion_counts.get(improvement_suggestion, 0) + 1
        # creator = ncr.get("lastModifiedByPlainText", "N/A")
        # creator_counts[creator] = creator_counts.get(creator, 0) + 1
    
    print("\n" + "="*50)
    print("SUMMARY STATISTICS")
    print("="*50)
    print(f"Total NCRs in window: {len(ncrs)}")
    print(f"Time window: {start.strftime('%Y-%m-%d %H:%M')} to {end.strftime('%Y-%m-%d %H:%M')} Eastern Time")
    
    print(f"\nTop 5 Work Orders:")
    for work_order, count in sorted(work_order_counts.items(), key=lambda x: x[1], reverse=True)[:5]:
        print(f"  {work_order}: {count} NCRs")
    
    print(f"\nTop 5 Parts:")
    for part, count in sorted(part_counts.items(), key=lambda x: x[1], reverse=True)[:5]:
        print(f"  {part[:50]}{'...' if len(part) > 50 else ''}: {count} NCRs")
    
    print(f"\nTop 5 Cause Codes:")
    for cause_code, count in sorted(cause_code_counts.items(), key=lambda x: x[1], reverse=True)[:5]:
        print(f"  {cause_code}: {count} NCRs")
    
    print(f"\nTop 5 Resources:")
    for resource, count in sorted(resource_counts.items(), key=lambda x: x[1], reverse=True)[:5]:
        print(f"  {resource}: {count} NCRs")
    
    print(f"\nTop 5 Statuses:")
    for status, count in sorted(status_counts.items(), key=lambda x: x[1], reverse=True)[:5]:
        print(f"  {status}: {count} NCRs")
    
    print(f"\nTop 5 Improvement Suggestions:")
    for suggestion, count in sorted(improvement_suggestion_counts.items(), key=lambda x: x[1], reverse=True)[:5]:
        if suggestion != "N/A":
            print(f"  {suggestion[:50]}{'...' if len(suggestion) > 50 else ''}: {count} NCRs")
    
    print("="*50)

def get_work_order_operations(work_order_number: str, session_token: str, config) -> List[Dict]:
    """Get operations for a specific work order."""
    # Check cache first
    if work_order_number in _work_order_cache:
        return _work_order_cache[work_order_number]
    
    url = config.get('proshop', 'tenant_url') + config.get('proshop', 'graphql_endpoint')
    headers = {"Authorization": f"Bearer {session_token}"}
    
    query = """
    query GetWorkOrderOps($workOrderNumber: String!) {
      workOrders(filter: { workOrderNumber: $workOrderNumber }) {
        records {
          workOrderNumber
          ops {
            records {
              operationNumber
              workCenterPlainText
            }
          }
        }
      }
    }
    """
    
    try:
        resp = make_request_with_retry('POST', url, json={"query": query, "variables": {"workOrderNumber": work_order_number}}, headers=headers, timeout=15)
        data = resp.json()
        if "data" not in data:
            logging.warning(f"No data returned for work order {work_order_number}")
            result = []
        else:
            work_orders = data["data"]["workOrders"]["records"]
            if not work_orders:
                logging.warning(f"No work order found for {work_order_number}")
                result = []
            else:
                # Return the operations from the first work order
                result = work_orders[0].get("ops", {}).get("records", [])
        
        # Cache the result
        _work_order_cache[work_order_number] = result
        return result
    except Exception as e:
        logging.warning(f"Error fetching operations for work order {work_order_number}: {e}")
        result = []
        _work_order_cache[work_order_number] = result
        return result

def get_resource_for_operation(ncr: Dict, session_token: str, config) -> str:
    """Get the resource/work cell name for the operation where the NCR occurred."""
    try:
        ncr_op_number = ncr.get("opNumber")
        if not ncr_op_number or ncr_op_number == "N/A":
            return "N/A"
        
        work_order = ncr.get("workOrder") or {}
        work_order_number = work_order.get("workOrderNumber")
        if not work_order_number:
            return f"Op {ncr_op_number} (No work order)"
        
        # Get operations for this work order
        operations = get_work_order_operations(work_order_number, session_token, config)
        
        # Find the operation that matches the NCR's opNumber
        for operation in operations:
            if str(operation.get("operationNumber")) == str(ncr_op_number):
                resource_name = operation.get("workCenterPlainText") or "Unknown Resource"
                return resource_name
        
        return f"Op {ncr_op_number} (Resource not found)"
    except Exception as e:
        logging.warning(f"Error getting resource for NCR {ncr.get('ncrRefNumber', 'unknown')}: {e}")
        return "N/A"

def get_user_name_by_id(user_id: str, session_token: str, config) -> str:
    """Get the full name of a user by their ID."""
    if not user_id or user_id.strip() == "" or user_id == "N/A":
        return "N/A"
    
    # Check cache first
    if user_id in _user_cache:
        return _user_cache[user_id]
    
    url = config.get('proshop', 'tenant_url') + config.get('proshop', 'graphql_endpoint')
    headers = {"Authorization": f"Bearer {session_token}"}
    
    query = f"""
    query GetUserById {{
      users(filter: {{ id: "{user_id}" }}) {{
        records {{
          id
          firstName
          lastName
        }}
      }}
    }}
    """
    
    try:
        resp = make_request_with_retry('POST', url, json={"query": query}, headers=headers, timeout=15)
        data = resp.json()
        
        if "data" in data and "users" in data["data"]:
            users = data["data"]["users"]["records"]
            if users:
                user = users[0]
                first_name = user.get("firstName", "")
                last_name = user.get("lastName", "")
                if first_name and last_name:
                    result = f"{first_name} {last_name}"
                elif first_name:
                    result = first_name
                elif last_name:
                    result = last_name
                else:
                    result = f"User {user_id}"
            else:
                result = f"User {user_id}"
        else:
            result = f"User {user_id}"
        
        # Cache the result
        _user_cache[user_id] = result
        return result
            
    except Exception as e:
        logging.warning(f"Error fetching user {user_id}: {e}")
        result = f"User {user_id}"
        _user_cache[user_id] = result
        return result

def batch_get_user_names(user_ids: List[str], session_token: str, config) -> Dict[str, str]:
    """Get multiple user names in a single API call."""
    if not user_ids:
        return {}
    
    # Filter out already cached users
    uncached_ids = [uid for uid in user_ids if uid not in _user_cache and uid and uid.strip() and uid != "N/A"]
    
    if not uncached_ids:
        # All users are already cached
        return {uid: _user_cache.get(uid, "N/A") for uid in user_ids}
    
    url = config.get('proshop', 'tenant_url') + config.get('proshop', 'graphql_endpoint')
    headers = {"Authorization": f"Bearer {session_token}"}
    
    # Build query for multiple users
    user_filters = ' '.join([f'{{ id: "{uid}" }}' for uid in uncached_ids])
    query = f"""
    query GetUsersById {{
      users(filter: {{ or: [{user_filters}] }}) {{
        records {{
          id
          firstName
          lastName
        }}
      }}
    }}
    """
    
    try:
        resp = make_request_with_retry('POST', url, json={"query": query}, headers=headers, timeout=30)
        data = resp.json()
        
        if "data" in data and "users" in data["data"]:
            users = data["data"]["users"]["records"]
            for user in users:
                user_id = user.get("id")
                first_name = user.get("firstName", "")
                last_name = user.get("lastName", "")
                if first_name and last_name:
                    name = f"{first_name} {last_name}"
                elif first_name:
                    name = first_name
                elif last_name:
                    name = last_name
                else:
                    name = f"User {user_id}"
                
                _user_cache[user_id] = name
        
        # Return results for all requested user IDs
        results = {}
        for uid in user_ids:
            if uid in _user_cache:
                results[uid] = _user_cache[uid]
            else:
                results[uid] = f"User {uid}"
                _user_cache[uid] = results[uid]
        
        return results
        
    except Exception as e:
        logging.warning(f"Error batch fetching users: {e}")
        # Fall back to individual lookups
        results = {}
        for uid in user_ids:
            results[uid] = get_user_name_by_id(uid, session_token, config)
        return results

def get_assigned_user_name(assigned_to: str, session_token: str, config) -> str:
    """Get the name of the assigned user, handling both IDs and role names."""
    if not assigned_to or assigned_to.strip() == "" or assigned_to == "N/A":
        return "N/A"
    
    # If it's already a readable name (not a numeric ID), return as is
    if not assigned_to.isdigit():
        return assigned_to
    
    # If it's a numeric ID, resolve it to a name
    return get_user_name_by_id(assigned_to, session_token, config)

def print_ncrs_detailed(ncrs: List[Dict], start: datetime.datetime, end: datetime.datetime, session_token: str, config):
    # Use Eastern Time for timestamp formatting
    eastern_tz = datetime.timezone(datetime.timedelta(hours=-5))  # EST
    filtered_count = 0
    
    for ncr in ncrs:
        try:
            created_str = ncr.get("createdTime")
            if not created_str:
                continue
            created_utc = datetime.datetime.strptime(created_str, "%Y-%m-%dT%H%M%SZ").replace(tzinfo=datetime.timezone.utc)
            if not (start <= created_utc < end):
                continue
            filtered_count += 1
            created_eastern = created_utc.astimezone(eastern_tz)
            notes = ncr.get("notes") or "N/A"
            # Strip HTML and unescape
            notes = re.sub(r'<.*?>', '', notes)
            notes = html.unescape(notes).strip()
            work_order = ncr.get("workOrder") or {}
            part = work_order.get("part") or {}
            cause_code = ncr.get("causeCode", "N/A")
            cause_code_description = get_cause_code_description(cause_code)
            disposition_notes = get_disposition_notes(ncr, config)
            per_part_value = get_per_part_value(ncr, config)
            resource = get_resource_for_operation(ncr, session_token, config)
            op_number = ncr.get("opNumber", "N/A")
            
            print("--- NCR ---")
            print(f"ncrRefNumber: {ncr.get('ncrRefNumber', 'N/A')}")
            print(f"workOrderNumber: {work_order.get('workOrderNumber', 'N/A')}")
            print(f"partDescription: {part.get('partDescription', 'No part description.')}")
            last_modified_by_id = ncr.get("lastModifiedByPlainText", "N/A")
            last_modified_by_name = get_user_name_by_id(last_modified_by_id, session_token, config)
            print(f"lastModifiedBy: {last_modified_by_name}")
            print(f"operationNumber: {op_number}")
            print(f"resource: {resource}")
            print(f"causeCode: {cause_code_description}")
            print(f"dispositionNotes: {disposition_notes}")
            print(f"perPartValue: {per_part_value}")
            print(f"improvementSuggestion: {ncr.get('improvementSuggestion', 'N/A')}")
            print(f"status: {ncr.get('status', 'N/A')}")
            print(f"notes: {notes}")
            print(f"timestamp: {created_eastern.strftime('%Y-%m-%d %I:%M %p')}")
            print()
        except Exception as e:
            logging.error(f"Error printing NCR: {e}")
    
    logging.info(f"Printed {filtered_count} NCRs to console")

def export_to_csv(ncrs: List[Dict], start: datetime.datetime, end: datetime.datetime, filename: str, session_token: str, config):
    """Export filtered NCRs to CSV file."""
    import csv
    eastern_tz = datetime.timezone(datetime.timedelta(hours=-5))  # EST
    exported_count = 0
    
    with open(filename, 'w', newline='', encoding='utf-8') as csvfile:
        fieldnames = ['ncrRefNumber', 'workOrderNumber', 'partDescription', 'lastModifiedBy', 'operationNumber', 'resource', 'causeCode', 'dispositionNotes', 'perPartValue', 'improvementSuggestion', 'status', 'notes', 'timestamp']
        writer = csv.DictWriter(csvfile, fieldnames=fieldnames)
        writer.writeheader()
        
        for ncr in ncrs:
            try:
                created_str = ncr.get("createdTime")
                if not created_str:
                    continue
                created_utc = datetime.datetime.strptime(created_str, "%Y-%m-%dT%H%M%SZ").replace(tzinfo=datetime.timezone.utc)
                if not (start <= created_utc < end):
                    continue
                exported_count += 1
                created_eastern = created_utc.astimezone(eastern_tz)
                notes = ncr.get("notes") or "N/A"
                # Strip HTML and unescape
                notes = re.sub(r'<.*?>', '', notes)
                notes = html.unescape(notes).strip()
                work_order = ncr.get("workOrder") or {}
                part = work_order.get("part") or {}
                cause_code = ncr.get("causeCode", "N/A")
                cause_code_description = get_cause_code_description(cause_code)
                disposition_notes = get_disposition_notes(ncr, config)
                per_part_value = get_per_part_value(ncr, config)
                resource = get_resource_for_operation(ncr, session_token, config)
                op_number = ncr.get("opNumber", "N/A")
                
                last_modified_by_id = ncr.get("lastModifiedByPlainText", "N/A")
                last_modified_by_name = get_user_name_by_id(last_modified_by_id, session_token, config)
                writer.writerow({
                    'ncrRefNumber': ncr.get('ncrRefNumber', 'N/A'),
                    'workOrderNumber': work_order.get('workOrderNumber', 'N/A'),
                    'partDescription': part.get('partDescription', 'No part description.'),
                    'lastModifiedBy': last_modified_by_name,
                    'operationNumber': op_number,
                    'resource': resource,
                    'causeCode': cause_code_description,
                    'dispositionNotes': disposition_notes,
                    'perPartValue': per_part_value,
                    'improvementSuggestion': ncr.get('improvementSuggestion', 'N/A'),
                    'status': ncr.get('status', 'N/A'),
                    'notes': notes,
                    'timestamp': created_eastern.strftime('%Y-%m-%d %I:%M %p')
                })
            except Exception as e:
                logging.error(f"Error writing NCR to CSV: {e}")
    
    logging.info(f"Exported {exported_count} NCRs to {filename}")

def send_to_power_automate(ncrs: List[Dict], start: datetime.datetime, end: datetime.datetime, webhook_url: str, session_token: str, config):
    """Send filtered NCRs to Power Automate via webhook."""
    eastern_tz = datetime.timezone(datetime.timedelta(hours=-5))  # EST
    ncr_payload = []
    
    # Pre-process: collect all user IDs and work order numbers for batch processing
    user_ids = set()
    work_order_numbers = set()
    filtered_ncrs = []
    
    for ncr in ncrs:
        try:
            created_str = ncr.get("createdTime")
            if not created_str:
                continue
            created_utc = datetime.datetime.strptime(created_str, "%Y-%m-%dT%H%M%SZ").replace(tzinfo=datetime.timezone.utc)
            if not (start <= created_utc < end):
                continue
            
            filtered_ncrs.append(ncr)
            
            # Collect user IDs for batch lookup
            last_modified_by_id = ncr.get("lastModifiedByPlainText", "N/A")
            if last_modified_by_id and last_modified_by_id != "N/A":
                user_ids.add(last_modified_by_id)
            
            # Collect work order numbers for batch lookup
            work_order = ncr.get("workOrder") or {}
            work_order_number = work_order.get("workOrderNumber")
            if work_order_number:
                work_order_numbers.add(work_order_number)
                
        except Exception as e:
            logging.error(f"Error pre-processing NCR: {e}")
    
    # Batch fetch user names
    user_names = batch_get_user_names(list(user_ids), session_token, config)
    
    # Process NCRs with cached data
    for ncr in filtered_ncrs:
        try:
            created_str = ncr.get("createdTime")
            created_utc = datetime.datetime.strptime(created_str, "%Y-%m-%dT%H%M%SZ").replace(tzinfo=datetime.timezone.utc)
            created_eastern = created_utc.astimezone(eastern_tz)
            notes = ncr.get("notes") or "N/A"
            # Strip HTML and unescape
            notes = re.sub(r'<.*?>', '', notes)
            notes = html.unescape(notes).strip()
            work_order = ncr.get("workOrder") or {}
            part = work_order.get("part") or {}
            cause_code = ncr.get("causeCode", "N/A")
            cause_code_description = get_cause_code_description(cause_code)
            disposition_notes = get_disposition_notes(ncr, config)
            per_part_value = get_per_part_value(ncr, config)
            resource = get_resource_for_operation(ncr, session_token, config)
            op_number = ncr.get("opNumber", "N/A")
            
            last_modified_by_id = ncr.get("lastModifiedByPlainText", "N/A")
            last_modified_by_name = user_names.get(last_modified_by_id, f"User {last_modified_by_id}")
            
            ncr_payload.append({
                "ncrRefNumber": ncr.get('ncrRefNumber', 'N/A'),
                "workOrderNumber": work_order.get('workOrderNumber', 'N/A'),
                "partDescription": part.get('partDescription', 'No part description.'),
                "lastModifiedBy": last_modified_by_name,
                "operationNumber": op_number,
                "resource": resource,
                "causeCode": cause_code_description,
                "dispositionNotes": disposition_notes,
                "perPartValue": per_part_value,
                "improvementSuggestion": ncr.get('improvementSuggestion', 'N/A'),
                "status": ncr.get('status', 'N/A'),
                "notes": notes,
                "timestamp": created_eastern.strftime('%Y-%m-%d %I:%M %p')
            })
        except Exception as e:
            logging.error(f"Error processing NCR for webhook: {e}")
    
    if not ncr_payload:
        logging.info("No NCRs to send to Power Automate")
        return
    
    # Prepare the final payload
    final_payload = {
        "ncr_records": ncr_payload,
        "summary": {
            "total_ncrs": len(ncr_payload),
            "time_window_start": start.strftime('%Y-%m-%d %H:%M'),
            "time_window_end": end.strftime('%Y-%m-%d %H:%M'),
            "timezone": "Eastern Time"
        }
    }
    
    try:
        headers = {'Content-Type': 'application/json'}
        response = requests.post(webhook_url, json=final_payload, headers=headers, timeout=30)
        
        if response.status_code in [200, 202]:
            logging.info(f"Successfully sent {len(ncr_payload)} NCRs to Power Automate")
        else:
            logging.error(f"Failed to send to Power Automate. Status: {response.status_code}, Response: {response.text}")
            
    except Exception as e:
        logging.error(f"Error sending to Power Automate: {e}")
    
    return len(ncr_payload)

# --- MAIN SCRIPT ---
def main():
    args = parse_arguments()
    config = load_config()
    
    # Set logging level based on verbose flag
    if args.verbose:
        config.set('logging', 'level', 'DEBUG')
    
    setup_logging(config)
    logging.info("Starting NCR fetch...")
    
    # Clear caches at start
    clear_caches()
    
    # Determine time window
    if args.start_date and args.end_date:
        start, end = parse_custom_dates(args.start_date, args.end_date)
        logging.info(f"Using custom time window: {start} to {end} (Eastern Time)")
    else:
        start, end = get_last_7_days_window()
        logging.info(f"Using last 7 days window: {start} to {end} (Eastern Time)")
    
    session_token = get_session_token(config)
    ncrs = fetch_all_ncrs(session_token, config)
    
    # Filter NCRs by time window
    filtered_ncrs = filter_ncrs_by_time(ncrs, start, end)
    
    # Output based on format
    if args.output == 'csv':
        export_to_csv(ncrs, start, end, args.csv_file, session_token, config)
    elif args.output == 'webhook':
        send_to_power_automate(ncrs, start, end, args.webhook_url, session_token, config)
    else:
        print_ncrs_detailed(ncrs, start, end, session_token, config)

if __name__ == "__main__":
    main() 