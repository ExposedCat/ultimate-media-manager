FROM docker.io/denoland/deno:2.9.5 AS cache

ENV DENO_DIR=/deno-dir

WORKDIR /app

COPY deno.json deno.lock ./
COPY src ./src

# Type checks do not execute CommonJS dependencies; verify the cached MongoDB
# driver can load before shipping the image.
RUN deno cache --lock=deno.lock --frozen src/index.ts src/migrations/add-chat-settings.ts \
	&& deno eval --cached-only 'import { MongoClient } from "mongodb"; if (typeof MongoClient !== "function") throw new Error("MongoDB import failed")'

FROM docker.io/denoland/deno:2.9.5

ENV DENO_DIR=/deno-dir

WORKDIR /app

USER root

RUN apt-get update \
	&& apt-get install -y --no-install-recommends ffmpeg ca-certificates \
	&& rm -rf /var/lib/apt/lists/*

COPY --from=cache /deno-dir /deno-dir
COPY deno.json deno.lock ./
COPY src ./src

USER deno

CMD ["deno", "run", "--cached-only", "-A", "src/index.ts"]
