#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────────────
# SkyRush FPV — Google Cloud dev server (Ubuntu + XFCE + xrdp + Node)
#
# Creates a VM you can reach over RDP from Windows/Mac/phone, with the
# repo cloned and ready:  npm run dev  →  http://VM_IP:5173
#
# Usage:
#   PROJECT_ID=my-project ./infra/gcp-dev-server.sh
#
# Tunables (env vars):
#   PROJECT_ID  (required) existing GCP project with billing enabled
#   ZONE        default me-central1-a  (Doha — closest to the Gulf;
#               europe-west1-b is ~15% cheaper if latency is OK)
#   VM_NAME     default skyrush-dev
#   MACHINE     default e2-medium (2 vCPU / 4 GB ≈ $27/mo if left on 24/7)
#   DISK_GB     default 50
#   REPO_URL    default https://github.com/aboljamajem1004-jpg/Fpvdrone.git
#
# Cost control: the VM only bills while running.
#   stop:  gcloud compute instances stop  skyrush-dev --zone=me-central1-a
#   start: gcloud compute instances start skyrush-dev --zone=me-central1-a
# ─────────────────────────────────────────────────────────────────────
set -euo pipefail

PROJECT_ID=${PROJECT_ID:?Set PROJECT_ID to your GCP project id}
ZONE=${ZONE:-me-central1-a}
VM_NAME=${VM_NAME:-skyrush-dev}
MACHINE=${MACHINE:-e2-medium}
DISK_GB=${DISK_GB:-50}
REPO_URL=${REPO_URL:-https://github.com/aboljamajem1004-jpg/Fpvdrone.git}

RDP_USER=skyrush
RDP_PASS=$(head -c 24 /dev/urandom | base64 | tr -dc 'a-zA-Z0-9' | head -c 16)

echo "→ project: $PROJECT_ID  zone: $ZONE  vm: $VM_NAME ($MACHINE, ${DISK_GB}GB)"
gcloud config set project "$PROJECT_ID" --quiet

echo "→ enabling Compute Engine API (first time can take ~1 min)"
gcloud services enable compute.googleapis.com --quiet

echo "→ firewall: RDP (3389) + Vite dev server (5173)"
gcloud compute firewall-rules describe allow-rdp >/dev/null 2>&1 ||
  gcloud compute firewall-rules create allow-rdp \
    --allow=tcp:3389 --direction=INGRESS --target-tags=rdp --quiet
gcloud compute firewall-rules describe allow-vite >/dev/null 2>&1 ||
  gcloud compute firewall-rules create allow-vite \
    --allow=tcp:5173 --direction=INGRESS --target-tags=vite --quiet

STARTUP=$(cat <<EOF
#!/bin/bash
set -x
if [ ! -f /opt/.provisioned ]; then
  export DEBIAN_FRONTEND=noninteractive
  apt-get update
  apt-get install -y xfce4 xfce4-goodies xrdp git curl firefox
  curl -fsSL https://deb.nodesource.com/setup_22.x | bash -
  apt-get install -y nodejs

  id -u $RDP_USER >/dev/null 2>&1 || useradd -m -s /bin/bash $RDP_USER
  echo "$RDP_USER:$RDP_PASS" | chpasswd
  usermod -aG sudo $RDP_USER
  echo "xfce4-session" > /home/$RDP_USER/.xsession
  chown $RDP_USER:$RDP_USER /home/$RDP_USER/.xsession
  systemctl enable --now xrdp

  sudo -u $RDP_USER git clone $REPO_URL /home/$RDP_USER/Fpvdrone || true
  cd /home/$RDP_USER/Fpvdrone && sudo -u $RDP_USER npm install || true

  touch /opt/.provisioned
fi
EOF
)

echo "→ creating VM"
gcloud compute instances create "$VM_NAME" \
  --zone="$ZONE" \
  --machine-type="$MACHINE" \
  --image-family=ubuntu-2404-lts-amd64 \
  --image-project=ubuntu-os-cloud \
  --boot-disk-size="${DISK_GB}GB" \
  --boot-disk-type=pd-balanced \
  --tags=rdp,vite \
  --metadata=startup-script="$STARTUP" \
  --quiet

IP=$(gcloud compute instances describe "$VM_NAME" --zone="$ZONE" \
  --format='get(networkInterfaces[0].accessConfigs[0].natIP)')

cat <<DONE

──────────────────────────────────────────────────────────
✅ VM created. First boot installs the desktop (~3-5 min).

RDP:      $IP:3389
user:     $RDP_USER
password: $RDP_PASS
          (change it after first login:  passwd)

Dev server on the VM:
  cd ~/Fpvdrone && npm run dev -- --host
  → play/test at http://$IP:5173 from any device

Stop billing when idle:
  gcloud compute instances stop $VM_NAME --zone=$ZONE
──────────────────────────────────────────────────────────
DONE
