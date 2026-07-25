# Shared base for every stage that needs the source tree and dev dependencies.
FROM node:20-bookworm-slim AS deps
WORKDIR /app
RUN apt-get update && apt-get install -y --no-install-recommends python3 make g++ && rm -rf /var/lib/apt/lists/*
COPY package.json package-lock.json ./
RUN npm ci
COPY tsconfig.json tsconfig.server.json vite.config.ts components.json index.html ./
COPY src ./src

# Runs the full quality gate inside the same runtime the image ships, so a
# green result cannot depend on the workstation's Node version or on locally
# installed Playwright browsers.
#   docker build --target verify -t dreambau-testmails:verify .
FROM deps AS verify
COPY vitest.config.ts playwright.config.ts ./
# `npm run lint` also type-checks the evidence gateway, and its tests read the
# installer script, so both must be present even though the shipped testmails
# runtime never uses them.
COPY tsconfig.evidence.json ./
COPY tests ./tests
COPY k8s ./k8s
COPY ops ./ops
COPY scripts ./scripts
COPY migrations ./migrations
# tests/playwright-login-broker.test.ts launches a real browser.
RUN npx playwright install --with-deps chromium
RUN npm run lint
RUN npm test
RUN npm run build

FROM deps AS build
RUN npm run build && npm prune --omit=dev

FROM node:20-bookworm-slim AS runtime
ENV NODE_ENV=production PORT=3000
WORKDIR /app
COPY --from=build --chown=node:node /app/package.json ./package.json
COPY --from=build --chown=node:node /app/node_modules ./node_modules
COPY --from=build --chown=node:node /app/dist ./dist
USER node
EXPOSE 3000
CMD ["node", "dist/server/index.js"]
