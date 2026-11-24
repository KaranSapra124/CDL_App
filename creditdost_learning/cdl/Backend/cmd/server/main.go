// Command server runs the Credit Dost Learning admin API.
package main

import (
	"context"
	"errors"
	"log"
	"net/http"
	"os"
	"os/exec"
	"os/signal"
	"syscall"
	"time"

	"github.com/joho/godotenv"

	"creditdost/backend/internal/config"
	"creditdost/backend/internal/courses"
	"creditdost/backend/internal/db"
	"creditdost/backend/internal/httpapi"
	"creditdost/backend/internal/media"
	"creditdost/backend/internal/notify"
	"creditdost/backend/internal/payments"
	"creditdost/backend/internal/portal"
	"creditdost/backend/internal/students"
	"creditdost/backend/internal/support"
)

func main() {
	// Load .env if it exists (local development). In production, real
	// environment variables are used and a missing file is fine.
	if err := godotenv.Load(); err != nil && !errors.Is(err, os.ErrNotExist) {
		log.Fatalf("load .env: %v", err)
	}

	cfg, err := config.Load()
	if err != nil {
		log.Fatalf("config: %v", err)
	}

	// ctx is cancelled when the process gets Ctrl+C or a stop signal.
	ctx, stop := signal.NotifyContext(context.Background(), os.Interrupt, syscall.SIGTERM)
	defer stop()

	pool, err := db.Connect(ctx, cfg.DatabaseURL)
	if err != nil {
		log.Fatalf("database: %v", err)
	}
	defer pool.Close()

	api := &httpapi.Server{
		DB:       pool,
		Cfg:      cfg,
		Courses:  &courses.Store{DB: pool},
		Students: &students.Store{DB: pool},
		Payments: &payments.Store{DB: pool},
		Support:  &support.Store{DB: pool},
		Portal:   &portal.Store{DB: pool},
	}
	// Email worker: sends queued notifications over SMTP. Without SMTP settings the queue waits.
	if cfg.SMTPHost != "" {
		mailer := &notify.Worker{
			DB: pool,
			Cfg: notify.Config{
				Host: cfg.SMTPHost, Port: cfg.SMTPPort, Username: cfg.SMTPUsername,
				Password: cfg.SMTPPassword, From: cfg.SMTPFrom,
			},
		}
		go mailer.Run(ctx)
		log.Printf("email worker running (smtp: %s:%s)", cfg.SMTPHost, cfg.SMTPPort)
	} else {
		log.Printf("email not configured: set SMTP_HOST, SMTP_PORT and SMTP_FROM to send emails")
	}

	srv := &http.Server{
		Addr:              cfg.Addr,
		Handler:           api.Router(),
		ReadHeaderTimeout: 10 * time.Second,
	}

	if cfg.Transcode {
		if _, err := exec.LookPath(cfg.FFmpegPath); err != nil {
			log.Printf("WARNING: ffmpeg not found (%s); uploaded videos will wait until it is installed", cfg.FFmpegPath)
		} else {
			worker := media.New(media.Options{
				DB:       pool,
				MediaDir: cfg.MediaDir,
				FFmpeg:   cfg.FFmpegPath,
				FFprobe:  cfg.FFprobePath,
			})
			go func() {
				if err := worker.Run(ctx); err != nil {
					log.Printf("transcoder stopped: %v", err)
				}
			}()
			log.Printf("transcoder running (ffmpeg: %s)", cfg.FFmpegPath)
		}
	}

	go func() {
		log.Printf("api listening on %s", cfg.Addr)
		if err := srv.ListenAndServe(); err != nil && !errors.Is(err, http.ErrServerClosed) {
			log.Fatalf("server: %v", err)
		}
	}()

	<-ctx.Done()
	log.Println("shutting down...")

	shutdownCtx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()
	if err := srv.Shutdown(shutdownCtx); err != nil {
		log.Printf("shutdown: %v", err)
	}
}
