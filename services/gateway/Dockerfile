# syntax=docker/dockerfile:1.7
FROM golang:1.27-alpine AS builder

WORKDIR /src

ARG GIT_SHA=dev

COPY go.mod go.sum ./
RUN go mod download

COPY . .
RUN CGO_ENABLED=0 GOOS=linux GOARCH=amd64 \
    go build -trimpath -ldflags="-s -w -X main.commit=${GIT_SHA}" \
    -o /out/shelfops ./cmd/shelfops

FROM alpine:3.22 AS runtime

RUN apk add --no-cache ca-certificates tzdata \
    && addgroup -S -g 1001 shelfops \
    && adduser -S -D -H -u 1001 -G shelfops shelfops \
    && mkdir -p /data/uploads \
    && chown -R 1001:1001 /data

WORKDIR /app

COPY --from=builder --chown=1001:1001 /out/shelfops /usr/local/bin/shelfops

USER 1001:1001

ENV OBJECT_STORE_ROOT=/data/uploads

EXPOSE 8080

HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
    CMD wget -qO- http://127.0.0.1:8080/healthz >/dev/null || exit 1

ENTRYPOINT ["/usr/local/bin/shelfops"]
CMD ["serve"]
