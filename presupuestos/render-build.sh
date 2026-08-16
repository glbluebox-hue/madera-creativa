#!/usr/bin/env bash
# Script de build para el despliegue combinado en Render (fuera de Bit).
# Render debe tener "Root Directory" = presupuestos y "Build Command" =
# bash render-build.sh (ver guía de despliegue).
set -euo pipefail

echo "── Backend: instalar y compilar ──"
cd presupuestos-service
npm ci --legacy-peer-deps
npm run build
cd ..

echo "── Frontend: preparar archivos estáticos (manifest, iconos, service worker) ──"
cd presupuestos-prototype
rm -rf public-render
mkdir -p public-render/assets
cp assets/icon-180.png assets/icon-192.png assets/icon-512.png assets/icon-maskable-512.png assets/sw.js public-render/assets/
cp manifest.webmanifest public-render/

echo "── Frontend: instalar y compilar (mismo origen que la API, sin prefijo /api) ──"
npm ci
echo "── Diagnóstico: ¿existe el binario de vite tras npm ci? ──"
ls -la node_modules/.bin/vite* 2>&1 || echo "(no existe node_modules/.bin/vite)"
ls node_modules/vite/package.json 2>&1 && grep '"version"' node_modules/vite/package.json || echo "(el paquete vite no está instalado)"
# Ruta explícita al binario — ni `npx vite` ni `npm run build` (que
# internamente también depende de la resolución de PATH de npm) lo
# encontraban en el entorno Linux de Render aunque `npm ci` reportara la
# instalación como correcta.
VITE_API_BASE="" node node_modules/vite/bin/vite.js build --config vite.config.render.js
cd ..

echo "── Build completo ──"
