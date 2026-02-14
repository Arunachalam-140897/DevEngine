FROM node:20-alpine

# Create non-root user
RUN addgroup -S app && adduser -S app -G app

WORKDIR /app
COPY package*.json ./
RUN npm install --only=production

COPY . .

USER app
EXPOSE 5001
ENV NODE_ENV=production
ENV PORT=5001

CMD ["node", "server.js"]
