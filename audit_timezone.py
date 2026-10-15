from datetime import datetime
import pytz

now_utc = datetime.now(pytz.utc)
brt = pytz.timezone('America/Sao_Paulo')
now_brt = now_utc.astimezone(brt)

print(f"UTC: {now_utc.isoformat()}")
print(f"BRT: {now_brt.isoformat()}")
print(f"Today (BRT): {now_brt.strftime('%Y-%m-%d')}")
