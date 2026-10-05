.DEFAULT_GOAL := help

# Corepack runs the pnpm version pinned in package.json's packageManager field.
PNPM := corepack pnpm
export COREPACK_ENABLE_DOWNLOAD_PROMPT := 0

.PHONY: help install lint test fmt build run

help: ## List targets
	@awk 'BEGIN {FS = ":.*## "} /^[a-zA-Z_-]+:.*## / {printf "  %-8s %s\n", $$1, $$2}' $(MAKEFILE_LIST)

install: ## Install dependencies from the lockfile
	$(PNPM) install --frozen-lockfile

lint: ## Run ESLint, the Prettier check and the type checker
	$(PNPM) run lint

test: ## Run the tests
	$(PNPM) run test

fmt: ## Format the code with Prettier and ESLint fixes
	$(PNPM) run fmt

build: ## Compile TypeScript to dist/
	$(PNPM) run build

run: ## Run the service in watch mode on PORT (default 8080)
	$(PNPM) run dev
