package httpapi

import (
	"errors"
	"log"
	"net/http"
	"strings"

	"creditdost/backend/internal/portal"
)

// studentNotices lists emails sent to the signed-in student.
func (s *Server) studentNotices(w http.ResponseWriter, r *http.Request) {
	list, err := s.Portal.Notices(r.Context(), studentFrom(r).StudentID)
	if err != nil {
		log.Printf("notices: %v", err)
		writeError(w, http.StatusInternalServerError, "could not load notifications")
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"items": list})
}

// studentTickets lists the student's support tickets.
func (s *Server) studentTickets(w http.ResponseWriter, r *http.Request) {
	list, err := s.Portal.Tickets(r.Context(), studentFrom(r).StudentID)
	if err != nil {
		log.Printf("tickets: %v", err)
		writeError(w, http.StatusInternalServerError, "could not load tickets")
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"items": list})
}

type raiseTicketRequest struct {
	Category string `json:"category"`
	Subject  string `json:"subject"`
	Body     string `json:"body"`
}

// studentRaiseTicket opens a support ticket for the signed-in student.
func (s *Server) studentRaiseTicket(w http.ResponseWriter, r *http.Request) {
	var req raiseTicketRequest
	if err := decodeJSON(w, r, &req); err != nil {
		writeError(w, http.StatusBadRequest, "invalid request body")
		return
	}
	id, err := s.Portal.CreateTicket(r.Context(), studentFrom(r).StudentID,
		strings.TrimSpace(req.Category), strings.TrimSpace(req.Subject), strings.TrimSpace(req.Body))
	if errors.Is(err, portal.ErrInvalidTicket) {
		writeError(w, http.StatusBadRequest, err.Error())
		return
	}
	if err != nil {
		log.Printf("create ticket: %v", err)
		writeError(w, http.StatusInternalServerError, "could not create the ticket")
		return
	}
	writeJSON(w, http.StatusCreated, map[string]any{"id": id})
}
