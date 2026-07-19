import requests

resp = requests.get("http://localhost:8000/api/scenario/SCN_GAS_LEAK_CONF_SPACE/stream", stream=True)
for i, line in enumerate(resp.iter_lines()):
    if line:
        print(line.decode('utf-8'))
    if i > 50:
        break
