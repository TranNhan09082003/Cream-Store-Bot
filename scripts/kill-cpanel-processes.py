import subprocess, os, sys

HOST = "ghf58-22141.azdigihost.com"
USER = "xsxejrvu"
PASS = "6WS0dt+6DH6:ng"

try:
    import paramiko
except ImportError:
    subprocess.check_call([sys.executable, "-m", "pip", "install", "paramiko", "-q"])
    import paramiko

print(f"=== Cenar Store - Connecting to cPanel SSH: {USER}@{HOST} ===")

client = paramiko.SSHClient()
client.set_missing_host_key_policy(paramiko.AutoAddPolicy())

try:
    # Thử kết nối qua port 22 mặc định
    client.connect(HOST, username=USER, password=PASS, timeout=15)
    print("✅ Connected to SSH successfully!")
    
    # Chạy lệnh giết các tiến trình Node.js của user
    cmd = "pkill -f node || killall -9 node"
    print(f"Executing: {cmd}")
    stdin, stdout, stderr = client.exec_command(cmd, timeout=30)
    
    print("\n--- stdout ---")
    print(stdout.read().decode('utf-8', errors='replace'))
    print("--- stderr ---")
    print(stderr.read().decode('utf-8', errors='replace'))
    
    print("🚀 Đã gửi lệnh kill node processes! Hãy kiểm tra lại cPanel Terminal của bạn.")

except Exception as e:
    print(f"❌ Lỗi kết nối SSH: {e}")
    print("\nCó thể cổng SSH không phải là 22 hoặc kết nối bị từ chối do quá giới hạn tiến trình (NPROC).")

finally:
    client.close()
