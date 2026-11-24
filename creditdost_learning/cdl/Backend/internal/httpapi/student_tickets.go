package httpapi

import (
	"errors"
	"log"
	"net/http"
	"path"
	"path/filepath"
	"strconv"

	"github.com/go-chi/chi/v5"

	"creditdost/backend/internal/portal"
)

// studentTicket returns one of the student's tickets with its conversation.
func (s *Server) studentTicket(w http.ResponseWriter, r *http.Request) {
	id, ok := parseID(r, "id")
	if !ok {
		writeError(w, http.StatusBadRequest, "invalid ticket id")
		return
	}
	t, err := s.Portal.TicketThread(r.Context(), studentFrom(r).StudentID, id)
	if errors.Is(err, portal.ErrNotFound) {
		writeError(w, http.StatusNotFound, "ticket not found")
		return
	}
	if err != nil {
		log.Printf("ticket thread: %v", err)
		writeError(w, http.StatusInternalServerError, "could not load the ticket")
		return
	}
	writeJSON(w, http.StatusOK, t)
}

type ticketReplyRequest struct {
	Body string `json:"body"`
}

// studentReplyToTicket adds the student's message and returns the updated conversation.
func (s *Server) studentReplyToTicket(w http.ResponseWriter, r *http.Request) {
	id, ok := parseID(r, "id")
	if !ok {
		writeError(w, http.StatusBadRequest, "invalid ticket id")
		return
	}
	var req ticketReplyRequest
	if err := decodeJSON(w, r, &req); err != nil {
		writeError(w, http.StatusBadRequest, "invalid request body")
		return
	}
	err := s.Portal.ReplyToTicket(r.Context(), studentFrom(r).StudentID, id, req.Body)
	switch {
	case errors.Is(err, portal.ErrNotFound):
		writeError(w, http.StatusNotFound, "ticket not found")
		return
	case errors.Is(err, portal.ErrInvalidReply):
		writeError(w, http.StatusBadRequest, err.Error())
		return
	case err != nil:
		log.Printf("ticket reply: %v", err)
		writeError(w, http.StatusInternalServerError, "could not send your message")
		return
	}
	s.studentTicket(w, r)
}

// studentTicketAttachment serves a screenshot attached to a message on the student's own ticket.
func (s *Server) studentTicketAttachment(w http.ResponseWriter, r *http.Request) {
	ticketID, ok := parseID(r, "id")
	if !ok {
		writeError(w, http.StatusBadRequest, "invalid ticket id")
		return
	}
	msgID, err := strconv.ParseInt(chi.URLParam(r, "messageId"), 10, 64)
	if err != nil || msgID <= 0 {
		writeError(w, http.StatusBadRequest, "invalid message id")
		return
	}
	rel, contentType, err := s.Portal.TicketAttachment(r.Context(), studentFrom(r).StudentID, ticketID, msgID)
	if errors.Is(err, portal.ErrNotFound) {
		writeError(w, http.StatusNotFound, "attachment not found")
		return
	}
	if err != nil {
		log.Printf("ticket attachment: %v", err)
		writeError(w, http.StatusInternalServerError, "could not load the attachment")
		return
	}
	w.Header().Set("Content-Type", contentType)
	w.Header().Set("Cache-Control", "private, no-cache")
	http.ServeFile(w, r, filepath.Join(s.Cfg.MediaDir, filepath.FromSlash(path.Clean("/"+rel))))
}
