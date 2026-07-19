import requests
import json

resp = requests.get("http://localhost:8000/api/scenario/SCN_GAS_LEAK_CONF_SPACE/stream", stream=True)
zone_3_max_severity = "Normal"
for line in resp.iter_lines():
    if line:
        data_str = line.decode('utf-8')
        if not data_str.startswith("data: "):
            continue
            
        data = json.loads(data_str[6:])
        if data.get("type") == "end":
            break
            
        if data.get("entityType") == "Incident" and data["payload"]["zoneId"] == "zone-compressor-room":
            sev = data["payload"]["severity"]
            score = data["payload"]["riskScore"]
            print(f"Zone 3 (Compressor Room): Severity={sev}, Score={score}, Time={data['timestamp']}")
            if sev == "Critical":
                zone_3_max_severity = "Critical"
                break
                
if zone_3_max_severity == "Critical":
    print("SUCCESS: Zone 3 reached CRITICAL status!")
else:
    print("FAILED: Zone 3 did not reach CRITICAL.")
