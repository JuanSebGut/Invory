FROM node:20-alpine

WORKDIR /app

COPY services/supplier-service/package*.json ./services/supplier-service/
COPY shared ./shared

WORKDIR /app/services/supplier-service
RUN npm ci --omit=dev

COPY services/supplier-service ./

EXPOSE 3008

CMD ["npm", "start"]
