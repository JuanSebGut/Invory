FROM node:20-alpine

WORKDIR /app

COPY services/category-service/package*.json ./services/category-service/
COPY shared ./shared

WORKDIR /app/services/category-service
RUN npm ci --omit=dev

COPY services/category-service ./

EXPOSE 3003

CMD ["npm", "start"]

