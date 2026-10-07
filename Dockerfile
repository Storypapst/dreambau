# Shared base for every stage that needs the source tree and dev dependencies.
FROM node:20-bookworm-slim AS deps
WORKDIR /app
RUN apt-get update && apt-get install -y --no-install-recommends python3 make g++ && rm -rf /var/lib/apt/lists/*
COPY package.json package-lock.json ./
RUN npm ci
COPY tsconfig.json tsconfig.server.json tsconfig.evidence.json vite.config.ts components.json index.html ./
COPY src ./src

# Runs the full quality gate inside the same runtime the image ships, so a
# green result cannot depend on the workstation's Node version or on locally
# installed Playwright browsers.
#   docker build --target verify -t dreambau-testmails:verify .
FROM deps AS verify
COPY vitest.config.ts playwright.config.ts ./
COPY tests ./tests
COPY k8s ./k8s
COPY ops ./ops
COPY scripts ./scripts
COPY migrations ./migrations
COPY understand-kit ./understand-kit
# tests/playwright-login-broker.test.ts launches a real browser.
RUN apt-get update && apt-get install -y --no-install-recommends curl && npx playwright install --with-deps chromium
RUN npm run lint
RUN npm test
RUN npm run build

FROM deps AS build
# GIT_SHA is stamped into the Test-Access CLI manifest; the image has no git.
#   docker build --build-arg GIT_SHA=$(git rev-parse --short=12 HEAD) ...
ARG GIT_SHA=unknown
COPY scripts/build-test-access-bundle.sh ./scripts/build-test-access-bundle.sh
RUN npm run build && GIT_SHA=$GIT_SHA npm run cli:bundle && npm prune --omit=dev

# The Understand-Kit bundle the /understand/api/v1/kit endpoint serves.
# understand-kit/dist/ is a gitignored build artefact, so the archive is built
# here rather than copied from the checkout. build-bundle.sh needs python3 and
# tar, both present in the deps stage.
FROM deps AS kit
COPY understand-kit ./understand-kit
RUN bash understand-kit/build-bundle.sh

FROM node:20-bookworm-slim AS runtime
ENV NODE_ENV=production PORT=3000
WORKDIR /app
COPY --from=build --chown=node:node /app/package.json ./package.json
COPY --from=build --chown=node:node /app/node_modules ./node_modules
COPY --from=build --chown=node:node /app/dist ./dist
# Served read-only at /understand/api/v1/kit; UNDERSTAND_KIT_DIR can override.
COPY --from=kit --chown=node:node /app/understand-kit ./understand-kit
USER node
EXPOSE 3000
CMD ["node", "dist/server/index.js"]
