import sys, json
d = json.load(sys.stdin); s = json.dumps(d)
bad = None
if any(k in s for k in ["pip install", "npm install", "curl ", "wget ", "apt-get"]): bad = "no installs or downloads; everything you need is in /workspace/engine"
for key in ("path", "file_path", "target_file"):
    p = str(d.get("tool_input", {}).get(key, "")) if isinstance(d.get("tool_input"), dict) else ""
    if p and not (p.startswith("/workspace/") or p.startswith("/tmp/")): bad = f"writes only under /workspace or /tmp (got {p})"
print(json.dumps({"decision": "deny", "reason": bad} if bad else {"decision": "allow"}))
