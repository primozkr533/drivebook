# Multi-stage build → Next.js standalone output.
FROM node:22-alpine AS deps
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --no-audit --no-fund

FROM node:22-alpine AS build
WORKDIR /app
ENV NEXT_TELEMETRY_DISABLED=1
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN npm run build
# Startup migrations need pg in the standalone output and the drizzle migrator in the server bundle.
RUN test -f .next/standalone/node_modules/pg/package.json \
 && grep -rqs __drizzle_migrations .next/standalone/.next/server
# The runner has no tsx or sources: worker and CLIs run as compiled JS via repointed npm scripts.
RUN npm run build:cli \
 && mkdir -p /runner \
 && cp package.json /runner/package.json \
 && cd /runner \
 && npm pkg set \
      scripts.worker="node dist/worker.cjs" \
      scripts.db:migrate="node dist/migrate-cli.cjs" \
      scripts.db:seed="node dist/seed-cli.cjs" \
      scripts.create-superadmin="node dist/create-superadmin-cli.cjs" \
      scripts.user-admin="node dist/user-admin-cli.cjs"

# Full production node_modules for the compiled CLIs (pg-boss, argon2, sharp's musl binary, …);
# the standalone trace only covers what the web server imports.
FROM deps AS prod-deps
RUN npm prune --omit=dev --no-audit --no-fund && rm -rf node_modules/@next/swc-*

FROM node:22-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production NEXT_TELEMETRY_DISABLED=1 PORT=3000 STORAGE_DIR=/data/storage \
    NPM_CONFIG_UPDATE_NOTIFIER=false NPM_CONFIG_FUND=false
RUN addgroup -S app && adduser -S app -G app
# A new named volume copies this ownership; without it the mount is root-owned and uploads fail.
RUN mkdir -p /data/storage && chown app:app /data/storage
COPY --from=prod-deps --chown=app:app /app/node_modules ./node_modules
COPY --from=build --chown=app:app /app/.next/standalone ./
COPY --from=build --chown=app:app /app/.next/static ./.next/static
COPY --from=build --chown=app:app /app/public ./public
# Applied on start by src/server/startup.ts from process.cwd()/drizzle.
COPY --from=build --chown=app:app /app/drizzle ./drizzle
COPY --from=build --chown=app:app /app/dist ./dist
COPY --from=build --chown=app:app /runner/package.json ./package.json
USER app
EXPOSE 3000
COPY --chmod=755 docker/web/start.sh /usr/local/bin/start-web
CMD ["start-web"]
