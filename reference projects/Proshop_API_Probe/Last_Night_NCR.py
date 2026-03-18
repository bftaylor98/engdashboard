import requests, sys, re, html, json
from datetime import datetime, timezone, timedelta

# ---- CONFIG -----------------------------------------------------
ROOT_URL  = "https://est.adionsystems.com"
USERNAME  = "admin@esttool.com"
PASSWORD  = "EstAdmin4626!!"
SCOPE     = "nonconformancereports:r workorders:r parts:r"
WEBHOOK_URL = "https://default8b194f6d59c94b4287861c626d1ec2.e6.environment.api.powerplatform.com:443/powerautomate/automations/direct/workflows/9a3ae54474864ed3929883d2254861a2/triggers/manual/paths/invoke?api-version=1&sp=%2Ftriggers%2Fmanual%2Frun&sv=1.0&sig=IY4hJDV6XBJrypE8k4p23AeNIdbDpIreXOgULzexwfY"
# ----------------------------------------------------------------

def begin_session() -> str:
    r = requests.post(f"{ROOT_URL}/api/beginsession", json={"username": USERNAME, "password": PASSWORD, "scope": SCOPE}, headers={"Accept": "application/json"}, timeout=30)
    r.raise_for_status()
    return r.json()["authorizationResult"]["token"]

def gql(query: str, vars_: dict, token: str) -> dict:
    r = requests.post(f"{ROOT_URL}/api/graphql", json={"query": query, "variables": vars_}, headers={"Authorization": f"Bearer {token}", "Accept": "application/json"}, timeout=30)
    body = r.json()
    if "errors" in body:
        raise RuntimeError(body["errors"])
    return body["data"]

def main():
    token = begin_session()

    # --- Step 1: Get the total number of records to fetch ---
    print("Finding total number of NCRs...")
    count_query = """query($pageSize:Int!){ nonConformanceReports(pageSize: $pageSize){ totalRecords } }"""
    count_data = gql(count_query, {"pageSize": 1}, token)
    total_records = count_data['nonConformanceReports']['totalRecords']
    
    # --- Step 2: Fetch ALL records from the API ---
    print(f"Fetching all {total_records} NCRs to filter locally...")
    # This query has no filter and fetches all records by setting pageSize to the total
    data_query = """
    query($pageSize:Int!){
      nonConformanceReports(pageSize: $pageSize){
        records{
          ncrRefNumber, createdTime, lastModifiedByPlainText, notes,
          workOrder { workOrderNumber, part { partDescription } }
        }
      }
    }
    """
    variables = { "pageSize": total_records }
    data = gql(data_query, variables, token)["nonConformanceReports"]["records"]

    if not data:
        print("Could not retrieve any NCRs."); return

    # --- Step 3: Define the time window and filter in Python ---
    local_tz = timezone(timedelta(hours=-4)) # EDT
    now_local = datetime.now(local_tz)
    
    if now_local.weekday() == 0: # Monday
        start_time_local = (now_local - timedelta(days=3)).replace(hour=14, minute=30, second=0, microsecond=0)
        end_time_local = now_local.replace(hour=6, minute=0, second=0, microsecond=0)
    else: # Tuesday - Friday
        start_time_local = (now_local - timedelta(days=1)).replace(hour=16, minute=30, second=0, microsecond=0)
        end_time_local = now_local.replace(hour=6, minute=0, second=0, microsecond=0)

    print(f"Filtering {len(data)} records for window: {start_time_local.strftime('%Y-%m-%d %I:%M %p')} to {end_time_local.strftime('%Y-%m-%d %I:%M %p')}...")

    ncr_payload = []
    for ncr in data:
        created_time_str = ncr.get("createdTime")
        if not created_time_str: continue

        utc_created_time = datetime.strptime(created_time_str, "%Y-%m-%dT%H%M%SZ").replace(tzinfo=timezone.utc)
        local_created_time = utc_created_time.astimezone(local_tz)

        # The precise, local filter based on creation time
        if start_time_local <= local_created_time <= end_time_local:
            notes_text = ncr.get("notes")
            if notes_text:
                clean_text = re.sub(r'<.*?>', '', notes_text); clean_text = html.unescape(clean_text)
                notes_text = clean_text.strip()
            else: notes_text = "N/A"
            work_order = ncr.get("workOrder") or {}; part = work_order.get("part") or {}
            ncr_payload.append({
                "ncrRefNumber": ncr.get("ncrRefNumber", "N/A"),
                "workOrderNumber": work_order.get("workOrderNumber", "N/A"),
                "partDescription": part.get("partDescription", "No part description."),
                "createdById": ncr.get("lastModifiedByPlainText", "N/A"),
                "notes": notes_text,
                "timestamp": local_created_time.strftime("%Y-%m-%d %I:%M %p")
            })

    if not ncr_payload:
        print("No NCRs were created in the specified time window."); return
    
    # --- Step 4: Send the final results ---
    final_payload = { "ncr_records": ncr_payload }
    print(f"Sending {len(ncr_payload)} filtered NCR(s) to Power Automate flow...")
    try:
        headers = {'Content-Type': 'application/json'}
        response = requests.post(WEBHOOK_URL, json=final_payload, headers=headers)
        if response.status_code == 202: print("Successfully triggered the Power Automate flow.")
        else: print(f"Failed to trigger flow. Status: {response.status_code}, Response: {response.text}")
    except requests.exceptions.RequestException as e: print(f"Error sending request to webhook: {e}")

if __name__ == "__main__":
    try:
        main()
    except Exception as e:
        print("Error:", e)
        sys.exit(1)