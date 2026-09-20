# Miso, the studio. The other half of the stack is audio.cpp, which runs as its
# own container and owns the GPU. See compose.yaml.
#
# No build toolchain here, which is what `--ignore-scripts` on the install is
# for. Do not remove that flag.
#
# better-sqlite3 13 ships prebuilt binaries for glibc and musl inside the
# package, and its loader finds them on its own. But it also ships a
# binding.gyp and no install script, and npm's default for that combination is
# to run `node-gyp rebuild` anyway, which then wants python and a compiler and
# fails. Skipping install scripts skips that pointless rebuild and the prebuild
# gets used, which is how this stays a 476 MB image with no compiler in it.
#
# Verified September 20, 2026: no build/ directory in the image, database opens
# and migrates, health endpoint answers.

FROM node:22-bookworm-slim AS build
WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci --ignore-scripts

COPY tsconfig.json vite.config.ts index.html ./
COPY public ./public
COPY src ./src

# Only the client is built. The server runs from TypeScript through tsx, which
# is why tsx is a dependency rather than a devDependency.
RUN npm run build && npm prune --omit=dev


FROM node:22-bookworm-slim AS runtime
WORKDIR /app

# MISO_HOST matters: the default is 127.0.0.1, which is right on a laptop and
# publishes nothing at all from inside a container.
ENV NODE_ENV=production \
    MISO_DATA_DIR=/data \
    MISO_PORT=5171 \
    MISO_HOST=0.0.0.0

COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/dist/client ./dist/client
COPY package.json package-lock.json tsconfig.json ./
COPY src ./src

# An empty named volume inherits the ownership of the directory it covers, so
# creating it here is what lets Miso write to the volume as a non-root user.
RUN mkdir -p /data && chown -R node:node /data
USER node
VOLUME ["/data"]

EXPOSE 5171

# Node 22 has fetch, so this needs no curl in the image. It asks Miso about
# Miso and never about audio.cpp: see the comment on the route.
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:'+(process.env.MISO_PORT||5171)+'/api/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

CMD ["./node_modules/.bin/tsx", "src/server/index.ts"]
