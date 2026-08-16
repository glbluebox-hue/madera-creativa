#!/usr/bin/env bash
# Script de build para el despliegue combinado en Render (fuera de Bit).
# Render debe tener "Root Directory" = presupuestos y "Build Command" =
# bash render-build.sh (ver guía de despliegue).
set -euo pipefail

echo "── Backend: instalar y compilar ──"
cd presupuestos-service
# `--include=dev`: con NODE_ENV=production puesta (Render, en tiempo de
# ejecución) npm ci omite devDependencies por defecto — typescript vive ahí.
# Aquí no dio fallo (parece que el orden de paquetes lo dejó en algún sitio
# igualmente), pero mejor no confiar en eso — se fuerza explícito también.
npm ci --legacy-peer-deps --include=dev
npm run build
cd ..

echo "── Frontend: preparar archivos estáticos (manifest, iconos, service worker) ──"
cd presupuestos-prototype
rm -rf public-render
mkdir -p public-render/assets
cp assets/icon-180.png assets/icon-192.png assets/icon-512.png assets/icon-maskable-512.png assets/sw.js public-render/assets/
cp manifest.webmanifest public-render/

echo "── Frontend: instalar y compilar (mismo origen que la API, sin prefijo /api) ──"
# `--include=dev`: causa real del fallo anterior — con NODE_ENV=production
# puesta, npm ci omite devDependencies por defecto, y ahí viven vite y
# @vitejs/plugin-react (confirmado con el diagnóstico: node_modules/vite ni
# siquiera se llegaba a crear). Sin esto, ninguna ruta al binario sirve
# porque el paquete no existe en absoluto, no es un problema de PATH.
npm ci --include=dev
ls node_modules/vite/package.json >/dev/null 2>&1 && echo "vite instalado correctamente" || { echo "ERROR: vite sigue sin instalarse"; exit 1; }
VITE_API_BASE="" node node_modules/vite/bin/vite.js build --config vite.config.render.js
cd ..

echo "── Build completo ──"
