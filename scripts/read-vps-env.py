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
    stdin, stdout, stderr = client.exec_command("cat /opt/cenar-store/.env")
    content = stdout.read().decode('utf-8', errors='replace')
    print("--- VPS .env CONTENT ---")
    sys.stdout.buffer.write(content.encode('utf-8'))
    print("\n-----------------------")
except Exception as e:
    print(f"Error: {e}")
finally:
    client.close()
