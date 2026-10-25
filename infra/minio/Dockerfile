FROM golang:1.24-alpine@sha256:8bee1901f1e530bfb4a7850aa7a479d17ae3a18beb6e09064ed54cfd245b7191 AS builder

ARG MINIO_COMMIT

RUN apk add --no-cache ca-certificates git

WORKDIR /src

# The archived repository no longer publishes binaries or container images. Fetching the exact
# release commit keeps the build reproducible; Go verifies dependencies against the committed sum.
RUN git init && \
    git remote add origin https://github.com/minio/minio.git && \
    git fetch --depth 1 origin "${MINIO_COMMIT}" && \
    git checkout --detach FETCH_HEAD

RUN CGO_ENABLED=0 go build -trimpath -buildvcs=false -o /out/minio .

FROM alpine:3.22@sha256:5291449c3df73caf6ed85e649dec1b9e818b39a5d8c871e97afc13e9cd5e8fa8

LABEL org.opencontainers.image.source="https://github.com/minio/minio" \
  org.opencontainers.image.licenses="AGPL-3.0" \
  org.opencontainers.image.version="RELEASE.2025-09-07T16-13-09Z"

RUN apk add --no-cache ca-certificates curl

COPY --from=builder /out/minio /usr/local/bin/minio
COPY --from=builder /src/CREDITS /licenses/CREDITS
COPY --from=builder /src/LICENSE /licenses/LICENSE

EXPOSE 9000 9001
VOLUME ["/data"]

ENTRYPOINT ["minio"]
CMD ["server", "/data", "--console-address", ":9001"]
