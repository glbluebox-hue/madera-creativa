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
VITE_API_BASE="" npx vite build --config vite.config.render.js
cd ..

echo "── Build completo ──"
