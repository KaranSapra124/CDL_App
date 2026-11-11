// Package config loads runtime settings from environment variables.
package config

import (
	"errors"
	"fmt"
	"os"
	"strconv"
)

// Config holds all settings the API needs at startup.
type Config struct {
	Addr            string // address to listen on, e.g. ":8080"
	DatabaseURL     string // PostgreSQL connection string
	JWTSecret       []byte // signing key for admin session tokens
	CookieSecure    bool   // true = cookies only sent over HTTPS
	AdminInviteCode string // required to create an admin via signup; empty = signup disabled
}

// Load reads and validates configuration. It returns an error naming the
// first problem it finds, so the server fails fast at startup.
func Load() (Config, error) {
	cfg := Config{
		Addr:            getenv("API_ADDR", ":8080"),
		DatabaseURL:     os.Getenv("DATABASE_URL"),
		JWTSecret:       []byte(os.Getenv("JWT_SECRET")),
		CookieSecure:    getbool("COOKIE_SECURE", true),
		AdminInviteCode: os.Getenv("ADMIN_INVITE_CODE"),
	}

	if cfg.DatabaseURL == "" {
		return Config{}, errors.New("DATABASE_URL is required")
	}
	if len(cfg.JWTSecret) < 32 {
		return Config{}, fmt.Errorf("JWT_SECRET must be at least 32 bytes, got %d", len(cfg.JWTSecret))
	}
	return cfg, nil
}

func getenv(key, fallback string) string {
	if v := os.Getenv(key); v != "" {
		return v
	}
	return fallback
}

func getbool(key string, fallback bool) bool {
	v := os.Getenv(key)
	if v == "" {
		return fallback
	}
	b, err := strconv.ParseBool(v)
	if err != nil {
		return fallback
	}
	return b
}
