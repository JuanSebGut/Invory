FROM node:20-alpine

WORKDIR /app

COPY services/inventory-service/package*.json ./services/inventory-service/
COPY shared ./shared

WORKDIR /app/services/inventory-service
RUN npm ci --omit=dev

COPY services/inventory-service ./

EXPOSE 3005

CMD ["npm", "start"]
