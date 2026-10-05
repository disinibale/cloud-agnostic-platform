.DEFAULT_GOAL := help

SERVICES := users orders worker

# Keeps "Entering directory" lines out of stdout, which matters for run-worker
# because its stdout is the worker's result stream.
MAKEFLAGS += --no-print-directory

INSTALL := $(addprefix install-,$(SERVICES))
LINT    := $(addprefix lint-,$(SERVICES))
TEST    := $(addprefix test-,$(SERVICES))
FMT     := $(addprefix fmt-,$(SERVICES))

.PHONY: help install lint test fmt run-users run-orders run-worker \
	$(INSTALL) $(LINT) $(TEST) $(FMT)

help: ## List targets (default)
	@awk 'BEGIN {FS = ":.*## "} /^[a-zA-Z_-]+:.*## / {printf "  %-12s %s\n", $$1, $$2}' $(MAKEFILE_LIST)
	@echo ""
	@echo "One service only: make -C services/<users|orders|worker> <target>"

install: $(INSTALL) ## Install dependencies for every service
lint: $(LINT) ## Lint every service; fails if any fail
test: $(TEST) ## Test every service; fails if any fail
fmt: $(FMT) ## Format the code of every service

# Static pattern rules, because make skips implicit rules for .PHONY targets.
$(INSTALL): install-%:
	$(MAKE) -C services/$* install
$(LINT): lint-%:
	$(MAKE) -C services/$* lint
$(TEST): test-%:
	$(MAKE) -C services/$* test
$(FMT): fmt-%:
	$(MAKE) -C services/$* fmt

run-users: ## Run the Go users service on :8081
	$(MAKE) -C services/users run

run-orders: ## Run the Express orders service on :8080 (calls users)
	$(MAKE) -C services/orders run

run-worker: ## Run the Python worker, reading JSON Lines events from stdin
	@$(MAKE) -C services/worker run
