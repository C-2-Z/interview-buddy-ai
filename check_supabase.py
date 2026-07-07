import urllib.request, urllib.error, json

with open(r"D:\26AICoding\interview-buddy-ai\.env", "r") as f:
    for line in f:
        if "SUPABASE_SERVICE_ROLE_KEY" in line:
            key = line.split("=")[1].strip().strip(chr(34)).strip(chr(39))
            break

ref = "sgrwsljvglfuwgzbjkmo"
url = f"https://api.supabase.com/v1/projects/{ref}/database/query"
print(f"Testing API endpoint: {url}")

data = json.dumps({"query": "SELECT 1 AS test"}).encode()
req = urllib.request.Request(url, data=data)
req.add_header("Authorization", f"Bearer {key}")
req.add_header("Content-Type", "application/json")

try:
    resp = urllib.request.urlopen(req, timeout=15)
    print(f"SUCCESS! Status: {resp.status}")
    body = resp.read().decode()[:500]
    print(body)
except urllib.error.HTTPError as e:
    print(f"HTTP Error: {e.code}")
    print(e.read().decode()[:500])
except Exception as e:
    print(f"Error: {type(e).__name__}: {e}")
