import requests
import os
import time
from datetime import datetime, timedelta

def run_backfill():
    url = "https://taeduxiandktefcwgspx.supabase.co/functions/v1/sync-meta-today"
    # The anon key is safe for Edge Functions invoked via client/sandbox
    anon_key = os.environ.get("VITE_SUPABASE_ANON_KEY")
    operation_id = "1dd606e3-dac2-4064-b863-9784307c9e98"
    
    # Range: 2026-08-01 to 2026-08-17
    start_date = datetime(2026, 8, 1)
    end_date = datetime(2026, 8, 17)
    
    current_date = start_date
    while current_date <= end_date:
        date_str = current_date.strftime("%Y-%m-%d")
        print(f"Triggering backfill for {date_str}...")
        
        payload = {
            "date": date_str,
            "operation_id": operation_id,
            "full": True
        }
        
        headers = {
            "Authorization": f"Bearer {anon_key}",
            "Content-Type": "application/json"
        }
        
        try:
            # We use a timeout to avoid hanging, but the function itself might take up to 60s
            response = requests.post(url, json=payload, headers=headers, timeout=65)
            print(f"Response for {date_str}: {response.status_code} - {response.text[:200]}")
        except Exception as e:
            print(f"Error for {date_str}: {str(e)}")
        
        # Small delay to avoid hammering the orchestrator/API limits
        time.sleep(2)
        current_date += timedelta(days=1)

if __name__ == "__main__":
    run_backfill()
