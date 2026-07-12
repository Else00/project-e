set shell := ["bash", "-eu", "-o", "pipefail", "-c"]
set default-list

dist_dir := "dist"
shot_out := env("SHOT_OUT", "test-results/screenshots")
docker_image := env("PROJECT_E_DOCKER_IMAGE", "project-e-web:local")
docker_port := env("PROJECT_E_DOCKER_PORT", "8080")
pages_base := env("VITE_BASE_PATH", "/project-e/")

[private]
_require_package:
    @test -f package.json || { echo "package.json is missing."; exit 2; }

[private]
_check-docker:
    @command -v docker >/dev/null || { echo "Missing docker binary."; exit 127; }
    @docker info >/dev/null 2>&1 || { echo "Docker daemon is not reachable. Start Docker/OrbStack and retry."; exit 127; }

[default]
[group("meta")]
list:
    @just --list --unsorted

alias default := list

[group("local")]
install:
    @just _require_package
    bun install

[group("local")]
dev:
    @just _require_package
    bun run dev

[group("local")]
preview:
    @just _require_package
    bun run preview

[group("build")]
build:
    @just _require_package
    bun run build

[group("build")]
build-pages:
    @just _require_package
    VITE_BASE_PATH={{pages_base}} bun run build

[group("check")]
check: fmt-check lint typecheck version-check coverage build e2e

[group("check")]
release-check: check docker-build

[group("check")]
lint:
    @just _require_package
    bun run lint

[group("check")]
fmt:
    @just _require_package
    bun run fmt

[group("check")]
fmt-check:
    @just _require_package
    bun run fmt-check

[group("check")]
typecheck:
    @just _require_package
    bun run typecheck

[group("check")]
version-check:
    @just _require_package
    bun run scripts/check-version.ts

[group("check")]
test:
    @just _require_package
    bun run test

[group("check")]
coverage:
    @just _require_package
    bun run coverage

[group("check")]
e2e:
    @just _require_package
    bun run e2e

[group("check")]
screenshots:
    @just _require_package
    mkdir -p {{shot_out}}
    bun run e2e -- --project=chromium

[group("container")]
docker-build: _check-docker
    DOCKER_BUILDKIT=1 docker build --pull -t {{docker_image}} .

[group("container")]
docker-run: _check-docker
    docker run --rm -p {{docker_port}}:8080 {{docker_image}}

[group("container")]
docker-smoke: _check-docker docker-build
    @container_id="$(docker run -d -p 127.0.0.1:{{docker_port}}:8080 {{docker_image}})"; \
        trap 'docker rm -f "$container_id" >/dev/null' EXIT; \
        for _ in $(seq 1 20); do \
            if curl -fsS "http://127.0.0.1:{{docker_port}}/healthz" >/dev/null; then \
                curl -fsS "http://127.0.0.1:{{docker_port}}/" >/dev/null; \
                echo "Docker smoke passed: http://127.0.0.1:{{docker_port}}"; \
                exit 0; \
            fi; \
            sleep 0.25; \
        done; \
        echo "Docker smoke failed."; \
        exit 1

[group("clean")]
clean:
    rm -rf {{dist_dir}} coverage test-results playwright-report node_modules/.vite
