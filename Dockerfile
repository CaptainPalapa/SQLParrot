# SQL Parrot Dockerfile
#
# The compiler toolchain and the frontend build tools are confined to throwaway
# stages. Only the Express server, its production dependencies, and the built
# React bundle reach the published image.

# Every stage resolves to this one base. better-sqlite3 is a native module: it is
# compiled in the deps stage and copied into the runtime stage, so both must agree
# on the Node ABI and the C library. Pinning them to a single ARG is what keeps
# that true -- editing one stage's base in isolation is the way this breaks.
ARG NODE_IMAGE=node:24-alpine

# ---------------------------------------------------------------------------
# Backend production dependencies (compiles better-sqlite3)
# ---------------------------------------------------------------------------
FROM ${NODE_IMAGE} AS backend-deps

RUN apk add --no-cache python3 make g++

WORKDIR /app/backend
COPY backend/package.json backend/package-lock.json ./

# Build better-sqlite3 from source instead of downloading a prebuilt binary.
# The published prebuilds are linked against glibc and will not load on Alpine's
# musl; compiling here guarantees the binary matches the runtime stage.
ENV npm_config_build_from_source=true
RUN npm ci --omit=dev

# ---------------------------------------------------------------------------
# Frontend bundle
# ---------------------------------------------------------------------------
FROM ${NODE_IMAGE} AS frontend-build

WORKDIR /app/frontend
COPY frontend/package.json frontend/package-lock.json ./
# vite and its plugins are devDependencies, so this stage needs the full install.
RUN npm ci

COPY frontend/ ./
RUN npm run build

# ---------------------------------------------------------------------------
# Runtime
# ---------------------------------------------------------------------------
FROM ${NODE_IMAGE}

WORKDIR /app/backend

COPY --from=backend-deps /app/backend/node_modules ./node_modules
COPY backend/ ./

# server.js resolves the static bundle as ../frontend/dist, so the two-directory
# layout has to survive into the runtime image.
COPY --from=frontend-build /app/frontend/dist /app/frontend/dist

# Fail the build rather than ship an image whose native module cannot load.
RUN node -e "require('better-sqlite3')" \
    && node -e "new (require('better-sqlite3'))(':memory:').exec('create table t(x)')"

EXPOSE 3000

ENV NODE_ENV=production
ENV PORT=3000

# Run the server directly rather than through `npm run`. The working directory
# is what places the SQLite file at /app/backend/data/sqlparrot.db, and dropping
# the npm wrapper lets SIGTERM reach node for a clean container shutdown.
CMD ["node", "server.js"]
