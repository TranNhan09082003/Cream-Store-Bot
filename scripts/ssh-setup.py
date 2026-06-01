import subprocess, os, sys, time

HOST = "103.179.189.36"
USER = "root"
PASS = "9DzsgMZE3xUmyk1T"

try:
    import paramiko
except ImportError:
    subprocess.check_call([sys.executable, "-m", "pip", "install", "paramiko", "-q"])
    import paramiko

print("=== Cenar Store Bot - CloudFly Setup ===")
print(f"Connecting to {USER}@{HOST}...")

client = paramiko.SSHClient()
client.set_missing_host_key_policy(paramiko.AutoAddPolicy())
client.connect(HOST, username=USER, password=PASS, timeout=30)
print("Connected!\n")

def run(cmd, label="", timeout=600):
    if label:
        print(f"\n{label}")
    print(f"  > {cmd[:120]}...")
    stdin, stdout, stderr = client.exec_command(cmd, timeout=timeout, get_pty=True)
    output = ""
    for line in stdout:
        text = line if isinstance(line, str) else line.decode('utf-8', errors='replace')
        print(f"  {text}", end="")
        output += text
    exit_code = stdout.channel.recv_exit_status()
    if exit_code != 0:
        err = stderr.read().decode('utf-8', errors='replace')
        if err:
            print(f"  WARN: {err[:200]}")
    return output

# All setup steps on single connection
run("export DEBIAN_FRONTEND=noninteractive && apt-get update -y -qq 2>&1 | tail -3 && echo 'OK'",
    "[1/8] Updating system...")

run("if command -v node &>/dev/null; then echo \"SKIP: Node $(node -v)\"; else curl -fsSL https://deb.nodesource.com/setup_22.x | bash - 2>&1 | tail -5 && apt-get install -y nodejs 2>&1 | tail -3; fi && echo \"Node: $(node -v), npm: $(npm -v)\"",
    "[2/8] Installing Node.js 22...", timeout=300)

run("apt-get install -y -qq build-essential python3 git 2>&1 | tail -1 && echo 'OK'",
    "[3/8] Installing build tools...", timeout=120)

run("npm install -g pm2 --silent 2>&1 | tail -2 && echo \"PM2: $(pm2 -v)\"",
    "[4/8] Installing PM2...")

run("if [ -d /opt/cenar-store ]; then cd /opt/cenar-store && git pull origin main 2>&1; else cd /opt && git clone https://github.com/TranNhan09082003/Cream-Store-Bot.git cenar-store 2>&1; fi && echo 'OK'",
    "[5/8] Cloning repository...")

run("cd /opt/cenar-store && npm install --omit=dev 2>&1 | tail -5",
    "[6/8] Installing npm dependencies...", timeout=300)

run("if [ -f /swapfile ]; then echo 'SKIP: swap exists'; else fallocate -l 1G /swapfile && chmod 600 /swapfile && mkswap /swapfile 2>&1 | tail -1 && swapon /swapfile && echo '/swapfile none swap sw 0 0' >> /etc/fstab && echo 'Swap 1GB created'; fi && free -h | grep -i swap",
    "[7/8] Creating swap...")

run("if command -v ufw &>/dev/null; then ufw allow 22/tcp 2>&1 | tail -1 && ufw allow 2753/tcp 2>&1 | tail -1 && echo 'Ports opened'; else echo 'ufw not found'; fi",
    "[8/8] Configuring firewall...")

# SSH key
pubkey_path = os.path.expanduser("~/.ssh/id_ed25519.pub")
if os.path.exists(pubkey_path):
    with open(pubkey_path) as f:
        pubkey = f.read().strip()
    run(f"mkdir -p ~/.ssh && echo '{pubkey}' >> ~/.ssh/authorized_keys && chmod 700 ~/.ssh && chmod 600 ~/.ssh/authorized_keys && sort -u ~/.ssh/authorized_keys -o ~/.ssh/authorized_keys && echo 'SSH key added'",
        "[BONUS] SSH key...")

# .env
run("""if [ ! -f /opt/cenar-store/.env ]; then
cat > /opt/cenar-store/.env << 'EOF'
BOT_TOKEN=
CLIENT_ID=
GUILD_ID=
PUBLIC_BASE_URL=http://103.179.189.36:2753
HTTP_PORT=2753
PAYMENT_PROVIDER=PAYOS
PAYOS_CLIENT_ID=
PAYOS_API_KEY=
PAYOS_CHECKSUM_KEY=
PAYOS_WEBHOOK_PATH=/webhooks/payos
PAYOS_RETURN_PATH=/payments/payos/return
PAYOS_CANCEL_PATH=/payments/payos/cancel
STORE_NAME=Cenar Store
STORE_FOOTER=Cenar Store
SHIPPER_NAME=Cenar Shipper
SHIPPER_FOOTER=Cenar Store
GEMINI_API_KEYS=
DASHBOARD_ENABLED=true
DASHBOARD_TOKEN=
VIP_ROLE_ID=
CUSTOMER_ROLE_ID=
VIP_ROLE_THRESHOLD=3
EOF
echo '.env created'
else echo 'SKIP: .env exists'; fi""",
    "[BONUS] Creating .env...")

# Summary
print("\n\n=== SETUP RESULT ===")
run("echo \"OS:   $(lsb_release -ds 2>/dev/null || cat /etc/os-release | head -1)\" && echo \"Node: $(node -v 2>/dev/null || echo N/A)\" && echo \"npm:  $(npm -v 2>/dev/null || echo N/A)\" && echo \"PM2:  $(pm2 -v 2>/dev/null || echo N/A)\" && echo \"RAM:  $(free -h | awk '/Mem:/{print $2}')\" && echo \"Swap: $(free -h | awk '/Swap:/{print $2}')\" && echo \"Disk: $(df -h / | awk 'NR==2{print $4}') free\" && echo \"App:  $(ls /opt/cenar-store/package.json 2>/dev/null && echo OK || echo MISSING)\"")

client.close()
print("\n=== DONE ===")
print("Next: Edit .env, then npm run deploy, then pm2 start")
