FROM node:20-alpine

WORKDIR /app

COPY api-gateway/package*.json ./api-gateway/
COPY shared ./shared

WORKDIR /app/api-gateway
RUN npm ci --omit=dev

COPY api-gateway ./

EXPOSE 3000

CMD ["npm", "start"]

