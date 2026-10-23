FROM node:24-bookworm-slim AS build
WORKDIR /app
COPY package*.json ./
RUN --mount=type=secret,id=trusted_ca \
    if [ -s /run/secrets/trusted_ca ]; then \
      NODE_EXTRA_CA_CERTS=/run/secrets/trusted_ca npm ci --no-audit --no-fund; \
    else npm ci --no-audit --no-fund; fi
COPY . .
RUN npm run build

FROM node:24-bookworm-slim
ENV NODE_ENV=production
WORKDIR /app
COPY --from=build --chown=node:node /app /app
RUN mkdir -p /app/.data /app/.backups && chown -R node:node /app/.data /app/.backups
USER node
EXPOSE 3000
VOLUME ["/app/.data", "/app/.backups"]
HEALTHCHECK --interval=30s --timeout=5s CMD node -e "fetch('http://127.0.0.1:3000/healthz').then(r=>{if(!r.ok)process.exit(1)}).catch(()=>process.exit(1))"
CMD ["npm", "start"]
