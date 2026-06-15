#!/bin/bash
# deploy.sh — instala e inicia o GMB Monitor na VPS
# Execute com: bash deploy.sh
set -e

APP_DIR="/opt/gmb"
VPS_IP="204.168.196.118"

echo "====================================================="
echo "  GMB Monitor — Deploy VPS"
echo "====================================================="

# 1. Node.js 20
if ! command -v node &> /dev/null; then
  echo "[1/6] Instalando Node.js 20..."
  curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
  sudo apt-get install -y nodejs
else
  echo "[1/6] Node.js já instalado: $(node -v)"
fi

# 2. PM2
if ! command -v pm2 &> /dev/null; then
  echo "[2/6] Instalando PM2..."
  sudo npm install -g pm2
else
  echo "[2/6] PM2 já instalado"
fi

# 3. Clonar ou atualizar repositório
if [ -d "$APP_DIR/.git" ]; then
  echo "[3/6] Atualizando código (git pull)..."
  cd "$APP_DIR" && git pull
else
  echo "[3/6] Clonando repositório..."
  sudo git clone https://github.com/JGOliveiraQ/gmb-monitor.git "$APP_DIR"
  sudo chown -R "$USER:$USER" "$APP_DIR"
  cd "$APP_DIR"
fi

cd "$APP_DIR"

# 4. Verificar .env do backend
if [ ! -f "backend/.env" ]; then
  echo ""
  echo "ERRO: O arquivo backend/.env não existe."
  echo "Crie-o antes de rodar este script:"
  echo ""
  echo "  nano backend/.env"
  echo ""
  echo "  CLIENT_ID=<seu_client_id>"
  echo "  CLIENT_SECRET=<seu_client_secret>"
  echo "  REDIRECT_URI=http://$VPS_IP:3000/auth/callback"
  echo "  PEXELS_API_KEY=<sua_chave_pexels>"
  echo "  PORT=3000"
  echo ""
  exit 1
fi
echo "[4/6] .env do backend OK"

# 5. Instalar dependências do backend
echo "[5/6] Instalando dependências do backend..."
cd backend && npm install --omit=dev && cd ..

# 6. Build do frontend
echo "[6/6] Buildando frontend (pode demorar ~2 min)..."
cd frontend
npm install
NEXT_PUBLIC_API_URL="http://$VPS_IP:3000" npm run build
cd ..

# Parar processos antigos (ignora erro se não existirem)
pm2 delete gmb-backend  2>/dev/null || true
pm2 delete gmb-frontend 2>/dev/null || true

# Iniciar com PM2
pm2 start ecosystem.config.js --env production
pm2 save

# Configurar PM2 para iniciar no boot do servidor
startup_cmd=$(pm2 startup 2>&1 | grep "sudo env")
if [ -n "$startup_cmd" ]; then
  eval "$startup_cmd"
fi

echo ""
echo "====================================================="
echo "  Deploy concluído!"
echo "  Backend:  http://$VPS_IP:3000"
echo "  Frontend: http://$VPS_IP:3001"
echo "====================================================="
