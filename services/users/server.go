package main

import (
	"encoding/json"
	"errors"
	"log/slog"
	"net/http"
	"strings"
)

// maxBodyBytes caps request bodies so a single client cannot exhaust memory.
const maxBodyBytes = 1 << 20

type handler struct {
	store  *Store
	logger *slog.Logger
}

func newHandler(store *Store, logger *slog.Logger) http.Handler {
	h := &handler{store: store, logger: logger}

	mux := http.NewServeMux()
	mux.HandleFunc("GET /users", h.listUsers)
	mux.HandleFunc("GET /users/{id}", h.getUser)
	mux.HandleFunc("POST /users", h.createUser)
	return mux
}

func (h *handler) listUsers(w http.ResponseWriter, _ *http.Request) {
	h.writeJSON(w, http.StatusOK, h.store.List())
}

func (h *handler) getUser(w http.ResponseWriter, r *http.Request) {
	u, ok := h.store.Get(r.PathValue("id"))
	if !ok {
		h.writeError(w, http.StatusNotFound, "user not found")
		return
	}
	h.writeJSON(w, http.StatusOK, u)
}

type createUserRequest struct {
	Name  string `json:"name"`
	Email string `json:"email"`
}

func (h *handler) createUser(w http.ResponseWriter, r *http.Request) {
	r.Body = http.MaxBytesReader(w, r.Body, maxBodyBytes)

	var req createUserRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		var tooLarge *http.MaxBytesError
		if errors.As(err, &tooLarge) {
			h.writeError(w, http.StatusRequestEntityTooLarge, "request body too large")
			return
		}
		h.writeError(w, http.StatusBadRequest, "invalid JSON body")
		return
	}

	name := strings.TrimSpace(req.Name)
	email := strings.TrimSpace(req.Email)
	switch {
	case name == "":
		h.writeError(w, http.StatusBadRequest, "name is required")
		return
	case email == "":
		h.writeError(w, http.StatusBadRequest, "email is required")
		return
	}

	h.writeJSON(w, http.StatusCreated, h.store.Create(name, email))
}

func (h *handler) writeError(w http.ResponseWriter, status int, msg string) {
	h.writeJSON(w, status, map[string]string{"error": msg})
}

func (h *handler) writeJSON(w http.ResponseWriter, status int, v any) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	if err := json.NewEncoder(w).Encode(v); err != nil {
		// Headers are already sent, so the client cannot be told; log it.
		h.logger.Error("writing response failed", "err", err)
	}
}
