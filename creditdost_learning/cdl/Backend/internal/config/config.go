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
	MediaDir        string // root folder for uploaded files, e.g. /srv/cdl/media on the VPS
	MaxVideoBytes   int64  // largest accepted video upload
	AdminOrigin     string // origin of the admin web app allowed to call the API directly, e.g. http://localhost:3000; empty = no CORS
	Transcode       bool   // run the video transcoder inside this process
	FFmpegPath      string // ffmpeg executable
	FFprobePath     string // ffprobe executable
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
		MediaDir:        getenv("MEDIA_DIR", "./media"),
		MaxVideoBytes:   getint64("MAX_VIDEO_BYTES", 4<<30), // 4 GiB
		AdminOrigin:     os.Getenv("ADMIN_ORIGIN"),
		Transcode:       getbool("TRANSCODE_ENABLED", true),
		FFmpegPath:      getenv("FFMPEG_PATH", "ffmpeg"),
		FFprobePath:     getenv("FFPROBE_PATH", "ffprobe"),
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

func getint64(key string, fallback int64) int64 {
	v := os.Getenv(key)
	if v == "" {
		return fallback
	}
	n, err := strconv.ParseInt(v, 10, 64)
	if err != nil || n <= 0 {
		return fallback
	}
	return n
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
