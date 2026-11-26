# Contact form handler for dreambau.com/kontakt/ (spec D2). Build for the server's architecture:
#   docker build --platform linux/amd64 -t dreambau-contact:<tag> apps/contact
FROM node:20-bookworm-slim
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --omit=dev && npm cache clean --force
COPY src ./src
COPY public ./public
USER node
EXPOSE 8080
CMD ["node", "src/server.mjs"]
