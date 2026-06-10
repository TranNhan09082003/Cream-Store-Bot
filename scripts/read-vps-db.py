import subprocess, os, sys

HOST = "103.179.189.36"
USER = "root"
PASS = "9DzsgMZE3xUmyk1T"

try:
    import paramiko
except ImportError:
    subprocess.check_call([sys.executable, "-m", "pip", "install", "paramiko", "-q"])
    import paramiko

client = paramiko.SSHClient()
client.set_missing_host_key_policy(paramiko.AutoAddPolicy())

try:
    client.connect(HOST, username=USER, password=PASS, timeout=30)
    # Query all columns from guild_settings
    cmd = 'sqlite3 /opt/cenar-store/data/shopbot.sqlite "SELECT * FROM guild_settings"'
    stdin, stdout, stderr = client.exec_command(cmd)
    content = stdout.read().decode('utf-8', errors='replace')
    err = stderr.read().decode('utf-8', errors='replace')
    if err:
        print("Error from VPS:", err)
    print("--- VPS guild_settings ---")
    print(content)
    print("--------------------------")
except Exception as e:
    print(f"Error: {e}")
finally:
    client.close()
