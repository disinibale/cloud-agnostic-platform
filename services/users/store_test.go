package main

import (
	"sync"
	"testing"
)

func TestStoreGet(t *testing.T) {
	s := NewSeededStore()

	tests := []struct {
		name   string
		id     string
		wantOK bool
		want   User
	}{
		{name: "first seeded user", id: "1", wantOK: true, want: User{ID: "1", Name: "Alice", Email: "alice@example.com"}},
		{name: "last seeded user", id: "3", wantOK: true, want: User{ID: "3", Name: "Carol", Email: "carol@example.com"}},
		{name: "unknown id", id: "4", wantOK: false},
		{name: "empty id", id: "", wantOK: false},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			got, ok := s.Get(tt.id)
			if ok != tt.wantOK {
				t.Fatalf("ok = %v, want %v", ok, tt.wantOK)
			}
			if got != tt.want {
				t.Errorf("user = %+v, want %+v", got, tt.want)
			}
		})
	}
}

func TestStoreListReturnsCopy(t *testing.T) {
	s := NewSeededStore()

	users := s.List()
	users[0].Name = "Mallory"

	if got, _ := s.Get("1"); got.Name != "Alice" {
		t.Errorf("mutating List result changed the store: name = %q", got.Name)
	}
}

func TestStoreConcurrentCreate(t *testing.T) {
	s := NewSeededStore()
	const writers = 50

	var wg sync.WaitGroup
	for range writers {
		wg.Go(func() {
			s.Create("user", "user@example.com")
			s.List()
		})
	}
	wg.Wait()

	users := s.List()
	if len(users) != 3+writers {
		t.Fatalf("store has %d users, want %d", len(users), 3+writers)
	}
	seen := make(map[string]bool, len(users))
	for _, u := range users {
		if seen[u.ID] {
			t.Fatalf("duplicate id %q", u.ID)
		}
		seen[u.ID] = true
	}
}
