package main

import (
	"encoding/json"
	"io"
	"log/slog"
	"net/http"
	"net/http/httptest"
	"reflect"
	"strings"
	"testing"
)

func newTestHandler() http.Handler {
	return newHandler(NewSeededStore(), slog.New(slog.NewTextHandler(io.Discard, nil)))
}

func TestHandler(t *testing.T) {
	tests := []struct {
		name       string
		method     string
		path       string
		body       string
		wantStatus int
		// wantBody is compared as JSON. Empty means the body is not checked,
		// which is used for responses the standard library mux writes itself.
		wantBody string
	}{
		{
			name:       "list users returns the seeded users",
			method:     http.MethodGet,
			path:       "/users",
			wantStatus: http.StatusOK,
			wantBody: `[
				{"id":"1","name":"Alice","email":"alice@example.com"},
				{"id":"2","name":"Bob","email":"bob@example.com"},
				{"id":"3","name":"Carol","email":"carol@example.com"}
			]`,
		},
		{
			name:       "get existing user",
			method:     http.MethodGet,
			path:       "/users/2",
			wantStatus: http.StatusOK,
			wantBody:   `{"id":"2","name":"Bob","email":"bob@example.com"}`,
		},
		{
			name:       "get unknown user",
			method:     http.MethodGet,
			path:       "/users/999",
			wantStatus: http.StatusNotFound,
			wantBody:   `{"error":"user not found"}`,
		},
		{
			name:       "create user",
			method:     http.MethodPost,
			path:       "/users",
			body:       `{"name":"Dave","email":"dave@example.com"}`,
			wantStatus: http.StatusCreated,
			wantBody:   `{"id":"4","name":"Dave","email":"dave@example.com"}`,
		},
		{
			name:       "create user trims surrounding whitespace",
			method:     http.MethodPost,
			path:       "/users",
			body:       `{"name":"  Dave ","email":" dave@example.com  "}`,
			wantStatus: http.StatusCreated,
			wantBody:   `{"id":"4","name":"Dave","email":"dave@example.com"}`,
		},
		{
			name:       "create user without name",
			method:     http.MethodPost,
			path:       "/users",
			body:       `{"email":"dave@example.com"}`,
			wantStatus: http.StatusBadRequest,
			wantBody:   `{"error":"name is required"}`,
		},
		{
			name:       "create user with blank name",
			method:     http.MethodPost,
			path:       "/users",
			body:       `{"name":"   ","email":"dave@example.com"}`,
			wantStatus: http.StatusBadRequest,
			wantBody:   `{"error":"name is required"}`,
		},
		{
			name:       "create user without email",
			method:     http.MethodPost,
			path:       "/users",
			body:       `{"name":"Dave"}`,
			wantStatus: http.StatusBadRequest,
			wantBody:   `{"error":"email is required"}`,
		},
		{
			name:       "create user with malformed JSON",
			method:     http.MethodPost,
			path:       "/users",
			body:       `{"name":`,
			wantStatus: http.StatusBadRequest,
			wantBody:   `{"error":"invalid JSON body"}`,
		},
		{
			name:       "create user with empty body",
			method:     http.MethodPost,
			path:       "/users",
			body:       ``,
			wantStatus: http.StatusBadRequest,
			wantBody:   `{"error":"invalid JSON body"}`,
		},
		{
			name:       "create user with wrong field type",
			method:     http.MethodPost,
			path:       "/users",
			body:       `{"name":42,"email":"dave@example.com"}`,
			wantStatus: http.StatusBadRequest,
			wantBody:   `{"error":"invalid JSON body"}`,
		},
		{
			name:       "create user with oversized body",
			method:     http.MethodPost,
			path:       "/users",
			body:       `{"name":"` + strings.Repeat("a", maxBodyBytes) + `","email":"dave@example.com"}`,
			wantStatus: http.StatusRequestEntityTooLarge,
			wantBody:   `{"error":"request body too large"}`,
		},
		{
			name:       "unsupported method",
			method:     http.MethodDelete,
			path:       "/users/1",
			wantStatus: http.StatusMethodNotAllowed,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			req := httptest.NewRequest(tt.method, tt.path, strings.NewReader(tt.body))
			rec := httptest.NewRecorder()

			newTestHandler().ServeHTTP(rec, req)

			if rec.Code != tt.wantStatus {
				t.Fatalf("status = %d, want %d (body: %s)", rec.Code, tt.wantStatus, rec.Body.String())
			}
			if tt.wantBody == "" {
				return
			}
			if ct := rec.Header().Get("Content-Type"); ct != "application/json" {
				t.Errorf("Content-Type = %q, want application/json", ct)
			}
			assertJSONEqual(t, rec.Body.String(), tt.wantBody)
		})
	}
}

func TestCreatedUserIsRetrievable(t *testing.T) {
	h := newTestHandler()

	create := httptest.NewRecorder()
	h.ServeHTTP(create, httptest.NewRequest(http.MethodPost, "/users",
		strings.NewReader(`{"name":"Dave","email":"dave@example.com"}`)))
	if create.Code != http.StatusCreated {
		t.Fatalf("create status = %d, want %d", create.Code, http.StatusCreated)
	}

	get := httptest.NewRecorder()
	h.ServeHTTP(get, httptest.NewRequest(http.MethodGet, "/users/4", nil))
	if get.Code != http.StatusOK {
		t.Fatalf("get status = %d, want %d", get.Code, http.StatusOK)
	}
	assertJSONEqual(t, get.Body.String(), `{"id":"4","name":"Dave","email":"dave@example.com"}`)

	list := httptest.NewRecorder()
	h.ServeHTTP(list, httptest.NewRequest(http.MethodGet, "/users", nil))
	var users []User
	if err := json.Unmarshal(list.Body.Bytes(), &users); err != nil {
		t.Fatalf("decoding list: %v", err)
	}
	if len(users) != 4 {
		t.Errorf("list returned %d users, want 4", len(users))
	}
}

func assertJSONEqual(t *testing.T, got, want string) {
	t.Helper()

	var g, w any
	if err := json.Unmarshal([]byte(got), &g); err != nil {
		t.Fatalf("response is not valid JSON: %v (body: %s)", err, got)
	}
	if err := json.Unmarshal([]byte(want), &w); err != nil {
		t.Fatalf("expected value is not valid JSON: %v", err)
	}
	if !reflect.DeepEqual(g, w) {
		t.Errorf("body = %s, want %s", got, want)
	}
}
