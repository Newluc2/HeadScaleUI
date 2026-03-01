FROM node:20-alpine

# Installer le binaire headscale directement dans l'image
RUN apk add --no-cache curl && \
    HEADSCALE_VERSION=$(curl -s https://api.github.com/repos/juanfont/headscale/releases/latest | grep '"tag_name"' | sed 's/.*"v\(.*\)".*/\1/') && \
    curl -fSL "https://github.com/juanfont/headscale/releases/download/v${HEADSCALE_VERSION}/headscale_${HEADSCALE_VERSION}_linux_amd64" -o /usr/local/bin/headscale && \
    chmod +x /usr/local/bin/headscale && \
    apk del curl

WORKDIR /app

COPY package*.json ./
RUN npm ci --only=production

COPY . .

RUN mkdir -p /app/data

ENV PORT=3000
ENV HEADSCALE_URL=http://headscale:8080
ENV HEADSCALE_BIN=headscale
ENV SESSION_SECRET=change-me-in-production
ENV ADMIN_USER=admin
ENV ADMIN_PASS=admin

EXPOSE 3000

CMD ["node", "server.js"]
