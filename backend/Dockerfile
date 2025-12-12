FROM node:slim AS base
WORKDIR /app
COPY package*.json ./
RUN npm install
COPY . .
EXPOSE 5000
ENV NODE_ENV=production
CMD ["node", "server.js"]
