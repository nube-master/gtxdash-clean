import requests
import os
import time
from datetime import datetime, timedelta

def run_backfill():
    url = "https://taeduxiandktefcwgspx.supabase.co/functions/v1/sync-meta-today"
    anon_key = os.environ.get("VITE_SUPABASE_ANON_KEY")
    operation_id = "1dd606e3-dac2-4064-b863-9784307c9e98"
    
    # We'll focus on the most recent days first (16, 15, 14...) as they are most critical
    # and then go back to the 1st.
    dates = ["2026-08-16", "2026-08-15", "2026-08-14", "2026-08-13", "2026-08-12", 
             "2026-08-11", "2026-08-10", "2026-08-09", "2026-08-08", "2026-08-07",
             "2026-08-06", "2026-08-05", "2026-08-04", "2026-08-03", "2026-08-02", "2026-08-01"]
    
    headers = {
        "Authorization": f"Bearer {anon_key}",
        "Content-Type": "application/json"
    }
    
    for date_str in dates:
        print(f"Triggering backfill for {date_str}...")
        
        # We need to trigger multiple times if there are many accounts because sync-meta-today
        # processes in batches of 15 and usually times out after 60s.
        # For 55 accounts, we need at least 4 successful runs per day.
        for attempt in range(4):
            print(f"  Attempt {attempt+1}/4 for {date_str}...")
            payload = {
                "date": date_str,
                "operation_id": operation_id,
                "full": True
            }
            try:
                response = requests.post(url, json=payload, headers=headers, timeout=65)
                print(f"  Response: {response.status_code}")
                if response.status_code == 200:
                    res_json = response.json()
                    processed = res_json.get("processed", 0)
                    print(f"  Processed {processed} accounts.")
                    # If it processed 0, we might have finished all accounts for that day
                    if processed == 0 and attempt > 0:
                        break
            except Exception as e:
                print(f"  Error: {str(e)}")
            
            time.sleep(1) # Small gap between batches
        
        time.sleep(2) # Gap between days

if __name__ == "__main__":
    run_backfill()
