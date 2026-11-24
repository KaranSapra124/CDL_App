// Package notify sends emails over SMTP. Messages are written to the notifications table first
// and a background worker sends them, so a slow or failing mail server never blocks the admin.
package notify

import (
	"context"
	"crypto/tls"
	"errors"
	"fmt"
	"log"
	"net"
	"net/smtp"
	"strings"
	"time"

	"github.com/jackc/pgx/v5/pgxpool"
)

// ErrNotConfigured is returned when SMTP settings are missing.
var ErrNotConfigured = errors.New("email is not configured: set SMTP_HOST, SMTP_PORT, SMTP_FROM")

// Config holds the SMTP settings from the environment.
type Config struct {
	Host     string
	Port     string
	Username string
	Password string
	From     string
}

func (c Config) Enabled() bool {
	return c.Host != "" && c.Port != "" && c.From != ""
}

// Send delivers one plain-text email. It uses STARTTLS when the server offers it.
func Send(cfg Config, to, subject, body string) error {
	if !cfg.Enabled() {
		return ErrNotConfigured
	}
	addr := net.JoinHostPort(cfg.Host, cfg.Port)
	conn, err := net.DialTimeout("tcp", addr, 15*time.Second)
	if err != nil {
		return fmt.Errorf("connect to mail server: %w", err)
	}
	client, err := smtp.NewClient(conn, cfg.Host)
	if err != nil {
		conn.Close()
		return fmt.Errorf("mail handshake: %w", err)
	}
	defer client.Close()

	if ok, _ := client.Extension("STARTTLS"); ok {
		if err := client.StartTLS(&tls.Config{ServerName: cfg.Host, MinVersion: tls.VersionTLS12}); err != nil {
			return fmt.Errorf("starttls: %w", err)
		}
	}
	if cfg.Username != "" {
		if err := client.Auth(smtp.PlainAuth("", cfg.Username, cfg.Password, cfg.Host)); err != nil {
			return fmt.Errorf("mail login failed: %w", err)
		}
	}
	if err := client.Mail(cfg.From); err != nil {
		return fmt.Errorf("sender rejected: %w", err)
	}
	if err := client.Rcpt(to); err != nil {
		return fmt.Errorf("recipient rejected: %w", err)
	}
	w, err := client.Data()
	if err != nil {
		return fmt.Errorf("start message: %w", err)
	}
	msg := strings.Join([]string{
		"From: " + cfg.From,
		"To: " + to,
		"Subject: " + subject,
		"MIME-Version: 1.0",
		"Content-Type: text/plain; charset=UTF-8",
		"",
		body,
	}, "\r\n")
	if _, err := w.Write([]byte(msg)); err != nil {
		return fmt.Errorf("write message: %w", err)
	}
	if err := w.Close(); err != nil {
		return fmt.Errorf("finish message: %w", err)
	}
	return client.Quit()
}

// Worker sends queued notifications one at a time until ctx is cancelled.
type Worker struct {
	DB   *pgxpool.Pool
	Cfg  Config
	Poll time.Duration
}

func (w *Worker) Run(ctx context.Context) {
	if w.Poll <= 0 {
		w.Poll = 10 * time.Second
	}
	ticker := time.NewTicker(w.Poll)
	defer ticker.Stop()
	for {
		for {
			did := w.sendNext(ctx)
			if !did {
				break
			}
		}
		select {
		case <-ctx.Done():
			return
		case <-ticker.C:
		}
	}
}

// sendNext claims one queued row and sends it. It returns false when the queue is empty.
func (w *Worker) sendNext(ctx context.Context) bool {
	var id int64
	var to, subject, body string
	err := w.DB.QueryRow(ctx, `
		select id, recipient, subject, body from notifications
		where status = 'queued'
		order by created_at, id
		limit 1
		for update skip locked`).Scan(&id, &to, &subject, &body)
	if err != nil {
		return false
	}

	sendErr := Send(w.Cfg, to, subject, body)
	if sendErr != nil {
		log.Printf("notify: message %d to %s failed: %v", id, to, sendErr)
		_, _ = w.DB.Exec(ctx, `update notifications set status = 'failed', error = $2 where id = $1`, id, sendErr.Error())
		return true
	}
	_, _ = w.DB.Exec(ctx, `update notifications set status = 'sent', sent_at = now() where id = $1`, id)
	return true
}
