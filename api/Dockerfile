FROM node:24-alpine

ENV NODE_ENV=production
WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci --omit=dev && npm cache clean --force

COPY server.js ./

# Utilisateur non-root fourni par l'image officielle (uid 1000)
USER node

EXPOSE 8080
# node directement (pas npm) pour que SIGTERM arrive bien au process
CMD ["node", "server.js"]
