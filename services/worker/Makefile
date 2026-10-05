.DEFAULT_GOAL := help

# --locked fails instead of silently rewriting uv.lock when it is out of date.
UV_RUN := uv run --locked

.PHONY: help install lint test fmt run

help: ## List targets
	@awk 'BEGIN {FS = ":.*## "} /^[a-zA-Z_-]+:.*## / {printf "  %-8s %s\n", $$1, $$2}' $(MAKEFILE_LIST)

install: ## Install Python and dependencies from the lockfile
	uv sync --locked

lint: ## Run ruff lint and format checks
	$(UV_RUN) ruff check .
	$(UV_RUN) ruff format --check .

test: ## Run the tests
	$(UV_RUN) pytest

fmt: ## Format the code and apply safe ruff fixes
	$(UV_RUN) ruff format .
	$(UV_RUN) ruff check --fix .

# Not echoed: stdout carries the worker's results and nothing else.
run: ## Read JSON Lines events from stdin, write results to stdout
	@$(UV_RUN) python -m worker
