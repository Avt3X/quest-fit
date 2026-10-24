"""Decodes a CDP Page.captureScreenshot response file into an image (used for UI review)."""
import base64
import json
import sys

source, target = sys.argv[1], sys.argv[2]
with open(source) as f:
    payload = json.load(f)
data = payload.get("data") or payload.get("result", {}).get("data")
with open(target, "wb") as out:
    out.write(base64.b64decode(data))
print(target)
