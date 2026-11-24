package httpapi

import (
	"log"
	"net/http"
	"strconv"
	"strings"

	"creditdost/backend/internal/notify"
)

// notificationsConfig tells the admin whether email is set up, without revealing the password.
func (s *Server) notificationsConfig(w http.ResponseWriter, r *http.Request) {
	cfg := s.emailConfig()
	writeJSON(w, http.StatusOK, map[string]any{
		"configured": cfg.Enabled(),
		"from":       cfg.From,
		"host":       cfg.Host,
	})
}

type broadcastRequest struct {
	Audience  string `json:"audience"`
	StudentID int64  `json:"studentId"`
	Subject   string `json:"subject"`
	Body      string `json:"body"`
}

// sendNotification queues an email to a segment of students (or one student). Sending happens in the background.
func (s *Server) sendNotification(w http.ResponseWriter, r *http.Request) {
	var req broadcastRequest
	if err := decodeJSON(w, r, &req); err != nil {
		writeError(w, http.StatusBadRequest, "invalid request body")
		return
	}
	if !notify.Audiences[req.Audience] {
		writeError(w, http.StatusBadRequest, "audience must be all, paid, unpaid or student")
		return
	}
	if req.Audience == "student" && req.StudentID <= 0 {
		writeError(w, http.StatusBadRequest, "choose a student")
		return
	}
	subject := strings.TrimSpace(req.Subject)
	body := strings.TrimSpace(req.Body)
	if subject == "" || body == "" {
		writeError(w, http.StatusBadRequest, "subject and message are required")
		return
	}
	if len(subject) > 200 {
		writeError(w, http.StatusBadRequest, "subject must be 200 characters or fewer")
		return
	}
	if !s.emailConfig().Enabled() {
		writeError(w, http.StatusUnprocessableEntity,
			"email is not configured yet. Set SMTP_HOST, SMTP_PORT and SMTP_FROM on the server.")
		return
	}

	admin, _ := r.Context().Value(ctxKey{}).(AdminUser)
	res, err := notify.Broadcast(r.Context(), s.DB, req.Audience, req.StudentID, subject, body, admin.ID)
	if err != nil {
		log.Printf("broadcast: %v", err)
		writeError(w, http.StatusInternalServerError, "could not queue the emails")
		return
	}
	if res.Queued == 0 {
		writeError(w, http.StatusUnprocessableEntity, "no students with an email address match this audience")
		return
	}
	writeJSON(w, http.StatusCreated, res)
}

func (s *Server) listNotifications(w http.ResponseWriter, r *http.Request) {
	q := r.URL.Query()
	status := q.Get("status")
	if status == "" {
		status = "all"
	}
	if status != "all" && status != "queued" && status != "sent" && status != "failed" {
		writeError(w, http.StatusBadRequest, "status must be all, queued, sent or failed")
		return
	}
	page, _ := strconv.Atoi(q.Get("page"))
	limit, _ := strconv.Atoi(q.Get("limit"))
	res, err := notify.ListHistory(r.Context(), s.DB, status, page, limit)
	if err != nil {
		log.Printf("notification history: %v", err)
		writeError(w, http.StatusInternalServerError, "could not load emails")
		return
	}
	writeJSON(w, http.StatusOK, res)
}

// emailConfig returns the SMTP settings from the server config.
func (s *Server) emailConfig() notify.Config {
	return notify.Config{
		Host:     s.Cfg.SMTPHost,
		Port:     s.Cfg.SMTPPort,
		Username: s.Cfg.SMTPUsername,
		Password: s.Cfg.SMTPPassword,
		From:     s.Cfg.SMTPFrom,
	}
}
