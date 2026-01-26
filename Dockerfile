FROM node:20-alpine AS builder

WORKDIR /app

# Instalar dependencias del sistema
RUN apk add --no-cache python3 make g++

# Copiar package files
COPY package*.json ./

# Instalar dependencias
RUN npm ci --legacy-peer-deps

# Copiar Prisma y generar cliente
COPY prisma ./prisma
RUN npx prisma generate

# Verificar que el symlink funciona
# (Ahora sí funcionará porque la carpeta existe)
RUN ls -la node_modules/.prisma/client/index.d.ts && \
    grep -q "PaymentStatus" node_modules/.prisma/client/index.d.ts && \
    echo "✅ Symlink funcionando correctamente"

# Copiar código fuente
COPY . .

# Build
RUN npm run build:docker

# Limpiar devDependencies
RUN npm prune --omit=dev --legacy-peer-deps

# ========================================
# Stage de producción
# ========================================
FROM node:20-alpine AS runner

WORKDIR /app

ENV NODE_ENV=production
ENV PORT=3000

# Usuario no-root
RUN addgroup -S nodejs && adduser -S nodejs -G nodejs

# Copiar archivos necesarios
COPY --from=builder --chown=nodejs:nodejs /app/node_modules ./node_modules
COPY --from=builder --chown=nodejs:nodejs /app/dist ./dist
COPY --from=builder --chown=nodejs:nodejs /app/prisma ./prisma
# --- CORRECCIÓN AQUÍ ---
# Se eliminó la línea que intentaba copiar la carpeta /app/generated
# que no existe.
# COPY --from=builder --chown=nodejs:nodejs /app/generated ./generated
COPY --from=builder --chown=nodejs:nodejs /app/package*.json ./

USER nodejs

EXPOSE 3000

CMD ["sh", "-c", "npx prisma migrate deploy 2>/dev/null || npx prisma db push; node dist/main.js"]