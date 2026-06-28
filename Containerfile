FROM docker.io/denoland/deno:2.7.11 AS cache

ENV DENO_DIR=/deno-dir

WORKDIR /app

COPY deno.json deno.lock ./
COPY src ./src

RUN deno cache --lock=deno.lock --frozen src/index.ts src/migrations/add-chat-settings.ts

FROM docker.io/denoland/deno:2.7.11

ENV DENO_DIR=/deno-dir

WORKDIR /app

USER root

RUN apt-get update \
	&& apt-get install -y --no-install-recommends ffmpeg curl ca-certificates \
	&& curl -fsSL https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp -o /usr/local/bin/yt-dlp \
	&& chmod a+rx /usr/local/bin/yt-dlp \
	&& rm -rf /var/lib/apt/lists/*

COPY --from=cache /deno-dir /deno-dir
COPY deno.json deno.lock ./
COPY src ./src

USER deno

CMD ["deno", "run", "--cached-only", "-A", "src/index.ts"]
