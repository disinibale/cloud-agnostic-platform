.DEFAULT_GOAL := help

# The gofmt on PATH belongs to whatever Go is installed locally. Use the one
# from the toolchain pinned in go.mod so formatting matches that version.
GOFMT = $(shell go env GOROOT)/bin/gofmt

.PHONY: help install lint test fmt run

help: ## List targets
	@awk 'BEGIN {FS = ":.*## "} /^[a-zA-Z_-]+:.*## / {printf "  %-8s %s\n", $$1, $$2}' $(MAKEFILE_LIST)

install: ## Download the Go toolchain and module dependencies
	go mod download

lint: ## Run go vet and fail if any file needs gofmt
	go vet ./...
	@unformatted="$$("$(GOFMT)" -l .)"; \
	if [ -n "$$unformatted" ]; then \
		echo "gofmt needed on:"; echo "$$unformatted"; exit 1; \
	fi

test: ## Run the tests
	go test ./...

fmt: ## Format the code with gofmt
	"$(GOFMT)" -w .

run: ## Run the service on PORT (default 8081)
	go run .
