FROM node:20-alpine

WORKDIR /app

COPY services/export-service/package*.json ./services/export-service/
COPY shared ./shared

WORKDIR /app/services/export-service
RUN npm ci --omit=dev

COPY services/export-service ./

EXPOSE 3007

CMD ["npm", "start"]
