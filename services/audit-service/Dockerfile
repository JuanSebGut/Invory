FROM node:20-alpine

WORKDIR /app

# Copiar SOLO los package del servicio (no el de la raíz)
COPY services/audit-service/package*.json ./services/audit-service/
COPY shared ./shared

WORKDIR /app/services/audit-service
RUN npm install --omit=dev

# Copiar el resto del código del servicio
COPY services/audit-service ./

EXPOSE 3006

CMD ["npm", "start"]
