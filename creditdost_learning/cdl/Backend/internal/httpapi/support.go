package httpapi

import (
	"errors"
	"fmt"
	"io"
	"log"
	"net/http"
	"path"
	"path/filepath"
	"strconv"
	"strings"

	"github.com/go-chi/chi/v5"

	"creditdost/backend/internal/support"
)

var ticketStatuses = map[string]bool{"all": true, "open": true, "in_progress": true, "resolved": true}

func (s *Server) listTickets(w http.ResponseWriter, r *http.Request) {
	q := r.URL.Query()
	status := q.Get("status")
	if status == "" {
		status = "all"
	}
	if !ticketStatuses[status] {
		writeError(w, http.StatusBadRequest, "status must be all, open, in_progress or resolved")
		return
	}
	priority := q.Get("priority")
	if priority != "urgent" {
		priority = "all"
	}
	page, _ := strconv.Atoi(q.Get("page"))
	if page <= 0 {
		page = 1
	}
	limit, _ := strconv.Atoi(q.Get("limit"))
	res, err := s.Support.List(r.Context(), support.ListFilter{
		Status: status, Priority: priority, Query: q.Get("q"), Page: page, Limit: limit,
	})
	if err != nil {
		log.Printf("list tickets: %v", err)
		writeError(w, http.StatusInternalServerError, "could not load tickets")
		return
	}
	writeJSON(w, http.StatusOK, res)
}

func (s *Server) getTicket(w http.ResponseWriter, r *http.Request) {
	id, ok := parseID(r, "id")
	if !ok {
		writeError(w, http.StatusBadRequest, "invalid ticket id")
		return
	}
	t, err := s.Support.Get(r.Context(), id)
	if err != nil {
		s.writeSupportError(w, err, "could not load ticket")
		return
	}
	writeJSON(w, http.StatusOK, t)
}

// replyToTicket accepts multipart form data: "body" (text, optional when a screenshot is attached)
// and "attachment" (an image: JPEG, PNG or WebP, for example a pasted screenshot).
func (s *Server) replyToTicket(w http.ResponseWriter, r *http.Request) {
	id, ok := parseID(r, "id")
	if !ok {
		writeError(w, http.StatusBadRequest, "invalid ticket id")
		return
	}
	const maxReplyBytes = 10 << 20
	r.Body = http.MaxBytesReader(w, r.Body, maxReplyBytes)
	mr, err := r.MultipartReader()
	if err != nil {
		writeError(w, http.StatusBadRequest, "send the reply as multipart form data")
		return
	}

	var body, attachPath, attachType string
	for {
		part, err := mr.NextPart()
		if errors.Is(err, io.EOF) {
			break
		}
		if err != nil {
			writeUploadError(w, err)
			return
		}
		switch part.FormName() {
		case "body":
			b, err := io.ReadAll(io.LimitReader(part, 10000))
			if err != nil {
				writeUploadError(w, err)
				return
			}
			body = strings.TrimSpace(string(b))
		case "attachment":
			if part.FileName() == "" {
				_ = part.Close()
				continue
			}
			rel, _, err := s.saveUpload(part, fmt.Sprintf("tickets/ticket-%d", id), imageTypes)
			if err != nil {
				writeUploadError(w, err)
				return
			}
			attachPath = rel
			attachType = mimeFromRel(rel, imageTypes)
		default:
			_ = part.Close()
		}
	}

	admin, _ := r.Context().Value(ctxKey{}).(AdminUser)
	if err := s.Support.AddReply(r.Context(), id, admin.ID, body, attachPath, attachType); err != nil {
		if attachPath != "" {
			s.removeMedia(attachPath)
		}
		s.writeSupportError(w, err, "could not send the reply")
		return
	}
	t, err := s.Support.Get(r.Context(), id)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "reply sent but the ticket could not be loaded")
		return
	}
	writeJSON(w, http.StatusCreated, t)
}

// mimeFromRel finds the content type for a stored image from its file extension.
func mimeFromRel(rel string, types map[string]string) string {
	ext := strings.ToLower(filepath.Ext(rel))
	for mime, e := range types {
		if e == ext {
			return mime
		}
	}
	return "application/octet-stream"
}

func (s *Server) ticketAttachment(w http.ResponseWriter, r *http.Request) {
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
	rel, contentType, err := s.Support.Attachment(r.Context(), ticketID, msgID)
	if err != nil {
		s.writeSupportError(w, err, "could not load the attachment")
		return
	}
	full := filepath.Join(s.Cfg.MediaDir, filepath.FromSlash(path.Clean(rel)))
	w.Header().Set("Content-Type", contentType)
	http.ServeFile(w, r, full)
}

type ticketStatusRequest struct {
	Status string `json:"status"`
}

func (s *Server) setTicketStatus(w http.ResponseWriter, r *http.Request) {
	id, ok := parseID(r, "id")
	if !ok {
		writeError(w, http.StatusBadRequest, "invalid ticket id")
		return
	}
	var req ticketStatusRequest
	if err := decodeJSON(w, r, &req); err != nil {
		writeError(w, http.StatusBadRequest, "invalid request body")
		return
	}
	if err := s.Support.SetStatus(r.Context(), id, req.Status); err != nil {
		s.writeSupportError(w, err, "could not update the status")
		return
	}
	t, err := s.Support.Get(r.Context(), id)
	if err != nil {
		s.writeSupportError(w, err, "could not load ticket")
		return
	}
	writeJSON(w, http.StatusOK, t)
}

type ticketAssignRequest struct {
	AdminID int64 `json:"adminId"` // 0 unassigns
}

func (s *Server) assignTicket(w http.ResponseWriter, r *http.Request) {
	id, ok := parseID(r, "id")
	if !ok {
		writeError(w, http.StatusBadRequest, "invalid ticket id")
		return
	}
	var req ticketAssignRequest
	if err := decodeJSON(w, r, &req); err != nil {
		writeError(w, http.StatusBadRequest, "invalid request body")
		return
	}
	if err := s.Support.Assign(r.Context(), id, req.AdminID); err != nil {
		s.writeSupportError(w, err, "could not assign the ticket")
		return
	}
	t, err := s.Support.Get(r.Context(), id)
	if err != nil {
		s.writeSupportError(w, err, "could not load ticket")
		return
	}
	writeJSON(w, http.StatusOK, t)
}

func (s *Server) writeSupportError(w http.ResponseWriter, err error, fallback string) {
	switch {
	case errors.Is(err, support.ErrNotFound):
		writeError(w, http.StatusNotFound, "not found")
	case errors.Is(err, support.ErrBadStatus), errors.Is(err, support.ErrNothingToSend), errors.Is(err, support.ErrNoAdmin):
		writeError(w, http.StatusBadRequest, err.Error())
	default:
		log.Printf("%s: %v", fallback, err)
		writeError(w, http.StatusInternalServerError, fallback)
	}
}
