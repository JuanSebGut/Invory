FROM node:20-alpine

WORKDIR /app

COPY services/product-service/package*.json ./services/product-service/
COPY shared ./shared

WORKDIR /app/services/product-service
RUN npm ci --omit=dev

COPY services/product-service ./

EXPOSE 3001

CMD ["npm", "start"]
