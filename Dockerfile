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

FROM node:22-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production NEXT_TELEMETRY_DISABLED=1 PORT=3000
RUN addgroup -S app && adduser -S app -G app
COPY --from=build --chown=app:app /app/.next/standalone ./
COPY --from=build --chown=app:app /app/.next/static ./.next/static
COPY --from=build --chown=app:app /app/public ./public
# Applied on start by src/server/startup.ts from process.cwd()/drizzle.
COPY --from=build --chown=app:app /app/drizzle ./drizzle
USER app
EXPOSE 3000
COPY --chmod=755 docker/web/start.sh /usr/local/bin/start-web
CMD ["start-web"]
