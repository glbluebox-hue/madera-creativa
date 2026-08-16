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
# `npm run build` (no `npx vite build`): npx resuelve el binario por su
# cuenta y en el entorno Linux de Render no encontraba `vite` ni
# `@vitejs/plugin-react` al cargar el propio vite.config.render.js aunque
# `npm ci` ya los hubiera instalado — `npm run` antepone node_modules/.bin
# al PATH de forma fiable, que es exactamente lo que ya funcionaba para
# compilar el backend.
VITE_API_BASE="" npm run build
cd ..

echo "── Build completo ──"
