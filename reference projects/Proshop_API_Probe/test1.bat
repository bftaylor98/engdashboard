REM Show current folder and list relevant files
cd
dir /b

REM Show what Python thinks the working dir is when it runs each script
python - <<^PY
import os
print("CWD:", os.getcwd())
^PY
