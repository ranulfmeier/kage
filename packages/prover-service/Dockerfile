FROM rust:1.82-bookworm AS builder

RUN curl -L https://sp1.succinct.xyz | bash && \
    ~/.sp1/bin/sp1up

WORKDIR /app
COPY packages/zk-circuits /app/packages/zk-circuits
COPY packages/prover-service /app/packages/prover-service

WORKDIR /app/packages/zk-circuits/program
RUN ~/.sp1/bin/cargo-prove prove build

WORKDIR /app/packages/prover-service
RUN cargo build --release

FROM debian:bookworm-slim
RUN apt-get update && apt-get install -y ca-certificates && rm -rf /var/lib/apt/lists/*
COPY --from=builder /app/packages/prover-service/target/release/kage-prover-service /usr/local/bin/
EXPOSE 3080
CMD ["kage-prover-service"]
