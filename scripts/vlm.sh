#!/bin/bash
# VLM review helper: vlm.sh <image> <prompt>
z-ai vision -p "$2" -i "$1" > /tmp/vlm_out.json 2>/tmp/vlm_err.log
python3 - << 'PYEOF'
import json, re
raw = open('/tmp/vlm_out.json').read()
m = re.search(r'\{.*\}', raw, re.S)
if m:
    try:
        d = json.loads(m.group(0))
        print(d['choices'][0]['message']['content'])
        exit(0)
    except Exception:
        pass
print(raw[:2000])
PYEOF
