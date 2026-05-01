FROM docker.io/denoland/deno:2.7.11 AS cache

ENV DENO_DIR=/deno-dir

WORKDIR /app

COPY deno.json deno.lock ./
COPY src ./src

RUN deno cache --lock=deno.lock --frozen src/index.ts src/migrations/add-chat-settings.ts

FROM docker.io/denoland/deno:2.7.11

ENV DENO_DIR=/deno-dir

WORKDIR /app

COPY --from=cache /deno-dir /deno-dir
COPY deno.json deno.lock ./
COPY src ./src

USER deno

CMD ["deno", "run", "--cached-only", "-A", "src/index.ts"]
