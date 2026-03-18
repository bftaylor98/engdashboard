REM Add a tiny one-liner to print username/scope/tenant from config.ini
python - <<^PY
import configparser, os
c=configparser.ConfigParser(); c.read('config.ini')
print("USING config.ini from:", os.path.abspath('config.ini'))
print("username:", c.get('proshop','username', fallback='(missing)'))
print("scope   :", c.get('proshop','scope', fallback='(missing)'))
print("tenant  :", c.get('proshop','tenant_url', fallback='(missing)'))
^PY
