FROM alpine:3.20

RUN apk add --no-cache ca-certificates curl

ARG WGCF_VERSION=2.2.31
ARG WIREPROXY_VERSION=1.1.2
RUN curl -fsSL "https://github.com/ViRb3/wgcf/releases/download/v${WGCF_VERSION}/wgcf_${WGCF_VERSION}_linux_amd64" -o /usr/local/bin/wgcf \
	&& chmod +x /usr/local/bin/wgcf \
	&& curl -fsSL "https://github.com/pufferffish/wireproxy/releases/download/v${WIREPROXY_VERSION}/wireproxy_linux_amd64.tar.gz" | tar -xz -C /usr/local/bin wireproxy

COPY entrypoint.sh /entrypoint.sh
RUN chmod +x /entrypoint.sh

EXPOSE 1080
ENTRYPOINT ["/entrypoint.sh"]
