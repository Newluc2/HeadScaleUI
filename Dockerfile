FROM node:20-alpine

WORKDIR /app

COPY package*.json ./
RUN npm ci --only=production

COPY . .

RUN mkdir -p /app/data

ENV PORT=3000
ENV SESSION_SECRET=change-me-in-production
ENV ADMIN_USER=admin
ENV ADMIN_PASS=admin

EXPOSE 3000

CMD ["node", "server.js"]
