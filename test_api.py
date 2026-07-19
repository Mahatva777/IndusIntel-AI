import requests

try:
    resp = requests.get("http://localhost:8000/api/scenario/SCN_GAS_LEAK_CONF_SPACE/stream", stream=True)
    print("Status:", resp.status_code)
    for line in resp.iter_lines():
        if line:
            print(line.decode('utf-8'))
            break
except Exception as e:
    print("Error:", e)
