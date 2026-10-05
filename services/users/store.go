package main

import (
	"strconv"
	"sync"
)

type User struct {
	ID    string `json:"id"`
	Name  string `json:"name"`
	Email string `json:"email"`
}

// Store is an in-memory user store, safe for concurrent use. Users are kept
// in a slice so List returns them in creation order.
type Store struct {
	mu     sync.RWMutex
	users  []User
	nextID int
}

func NewStore() *Store {
	return &Store{nextID: 1}
}

// NewSeededStore returns a store with three fixed users, so the service is
// useful straight after start-up without any setup calls.
func NewSeededStore() *Store {
	s := NewStore()
	s.Create("Alice", "alice@example.com")
	s.Create("Bob", "bob@example.com")
	s.Create("Carol", "carol@example.com")
	return s
}

func (s *Store) List() []User {
	s.mu.RLock()
	defer s.mu.RUnlock()

	out := make([]User, len(s.users))
	copy(out, s.users)
	return out
}

func (s *Store) Get(id string) (User, bool) {
	s.mu.RLock()
	defer s.mu.RUnlock()

	for _, u := range s.users {
		if u.ID == id {
			return u, true
		}
	}
	return User{}, false
}

func (s *Store) Create(name, email string) User {
	s.mu.Lock()
	defer s.mu.Unlock()

	u := User{ID: strconv.Itoa(s.nextID), Name: name, Email: email}
	s.nextID++
	s.users = append(s.users, u)
	return u
}
