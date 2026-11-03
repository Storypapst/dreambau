FROM node:24-bookworm-slim
WORKDIR /app
COPY apps/oriso-ideas/ ./apps/oriso-ideas/
COPY apps/understand-anything/ ./apps/understand-anything/
USER node
CMD ["node", "apps/oriso-ideas/dreambau.mjs"]
