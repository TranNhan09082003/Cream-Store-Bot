import subprocess, os, sys

HOST = "103.179.189.36"
USER = "root"
PASS = "9DzsgMZE3xUmyk1T"

try:
    import paramiko
except ImportError:
    subprocess.check_call([sys.executable, "-m", "pip", "install", "paramiko", "-q"])
    import paramiko

print("=== Connecting to VPS to download live SQLite DB ===")
client = paramiko.SSHClient()
client.set_missing_host_key_policy(paramiko.AutoAddPolicy())

try:
    client.connect(HOST, username=USER, password=PASS, timeout=30)
    sftp = client.open_sftp()
    
    remote_path = "/opt/cenar-store/data/shopbot.sqlite"
    local_path = os.path.join(os.path.dirname(__file__), "..", "data", "shopbot.sqlite")
    
    # Avoid printing raw unicode paths directly to prevent Windows cmd console encoding errors
    print(f"Downloading from VPS: {remote_path}")
    sftp.get(remote_path, local_path)
    sftp.close()
    print("SUCCESS: Live database synchronized successfully!")
except Exception as e:
    print(f"Error: {e}")
finally:
    client.close()
