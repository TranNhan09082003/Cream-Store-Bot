import subprocess, os, sys

HOST = "103.179.189.36"
USER = "root"
PASS = "9DzsgMZE3xUmyk1T"

try:
    import paramiko
except ImportError:
    subprocess.check_call([sys.executable, "-m", "pip", "install", "paramiko", "-q"])
    import paramiko

print("=== Connecting to VPS to pull and restart Bot ===")
client = paramiko.SSHClient()
client.set_missing_host_key_policy(paramiko.AutoAddPolicy())

try:
    client.connect(HOST, username=USER, password=PASS, timeout=30)
    print("SUCCESS: Connected to VPS successfully!")
    
    def run_cmd(cmd):
        print(f"\nExecuting: {cmd}")
        stdin, stdout, stderr = client.exec_command(cmd, timeout=120)
        out = stdout.read().decode('utf-8', errors='replace')
        err = stderr.read().decode('utf-8', errors='replace')
        
        # In an toàn chống lỗi encoding trên Windows CMD
        if out:
            print("[STDOUT]")
            sys.stdout.buffer.write(out.encode('utf-8', errors='replace'))
            print()
        if err:
            print("[STDERR]")
            sys.stdout.buffer.write(err.encode('utf-8', errors='replace'))
            print()
        return out, err

    # 1. Pre-deploy cleanup on VPS
    run_cmd("pm2 stop cenar-store-bot cenar-store-bot-2 || true")
    run_cmd("pm2 delete cenar-store-bot cenar-store-bot-2 || true")
    run_cmd("pm2 flush || true")
    run_cmd("fuser -k 2753/tcp || kill -9 $(lsof -t -i:2753) || true")
    run_cmd("fuser -k 8080/tcp || kill -9 $(lsof -t -i:8080) || true")

    # 2. Pull code mới từ Github (xóa thay đổi local và các file untracked bị trùng trên VPS trước để tránh conflict)
    run_cmd("cd /opt/cenar-store && git checkout .")
    run_cmd("cd /opt/cenar-store && rm -rf src/commands/dac-quyen.js src/commands/order.js src/commands/sale.js src/commands/setup-permissions.js src/commands/vinh-danh.js src/events/guildMemberAdd.js src/events/guildMemberRemove.js src/services/oauthBackupRoutes.js src/services/saleService.js src/services/vinhDanhService.js src/utils/antiScam.js src/utils/emojiHelper.js scripts/setup-sale-channels.js")
    run_cmd("cd /opt/cenar-store && git pull origin main")
    
    # 3. Cập nhật các dependency nếu cần
    run_cmd("cd /opt/cenar-store && npm install --omit=dev")

    # 3.5 Deploy slash commands cho cả 2 server (guilds)
    run_cmd("cd /opt/cenar-store && ENV_FILE=.env node src/deploy-commands.js")
    run_cmd("cd /opt/cenar-store && ENV_FILE=.env.store2 node src/deploy-commands.js")

    # 4. Khởi động lại bot bằng PM2 sạch sẽ
    run_cmd("cd /opt/cenar-store && pm2 start ecosystem.config.cjs")

    print("\nSUCCESS: Bot has been updated with the latest code and restarted on VPS!")

except Exception as e:
    print("ERROR occurred during setup:")
    try:
        sys.stdout.buffer.write(str(e).encode('utf-8', errors='replace'))
        print()
    except:
        print(type(e).__name__)
finally:
    client.close()
