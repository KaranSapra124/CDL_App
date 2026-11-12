package httpapi

import (
	"encoding/csv"
	"errors"
	"fmt"
	"log"
	"net/http"
	"net/mail"
	"strconv"
	"strings"
	"time"

	"creditdost/backend/internal/students"
)

var studentStatuses = map[string]bool{"all": true, "paid": true, "unpaid": true, "certified": true}

func (s *Server) listStudents(w http.ResponseWriter, r *http.Request) {
	f, msg := parseStudentFilter(r)
	if msg != "" {
		writeError(w, http.StatusBadRequest, msg)
		return
	}
	res, err := s.Students.List(r.Context(), f)
	if err != nil {
		log.Printf("list students: %v", err)
		writeError(w, http.StatusInternalServerError, "could not load students")
		return
	}
	writeJSON(w, http.StatusOK, res)
}

// exportStudents streams the filtered directory as CSV, for Excel.
func (s *Server) exportStudents(w http.ResponseWriter, r *http.Request) {
	f, msg := parseStudentFilter(r)
	if msg != "" {
		writeError(w, http.StatusBadRequest, msg)
		return
	}
	f.Limit = 0 // everything that matches
	res, err := s.Students.List(r.Context(), f)
	if err != nil {
		log.Printf("export students: %v", err)
		writeError(w, http.StatusInternalServerError, "could not export students")
		return
	}

	filename := fmt.Sprintf("students-%s.csv", time.Now().Format("2006-01-02"))
	w.Header().Set("Content-Type", "text/csv; charset=utf-8")
	w.Header().Set("Content-Disposition", `attachment; filename="`+filename+`"`)

	// UTF-8 byte order mark so Excel opens Hindi and other Indian-language names correctly.
	_, _ = w.Write([]byte("\xEF\xBB\xBF"))
	cw := csv.NewWriter(w)
	_ = cw.Write([]string{"Student ID", "Name", "Email", "Mobile", "City", "State", "Language",
		"Registered", "Enrolments", "Certificates", "Paid (INR)", "Status", "Last activity"})
	for _, it := range res.Items {
		_ = cw.Write([]string{
			strconv.FormatInt(it.ID, 10), it.Name, deref(it.Email), deref(it.Mobile), it.City, it.State,
			it.PreferredLanguage, it.RegisteredAt.Format("2006-01-02"),
			strconv.FormatInt(it.Enrollments, 10), strconv.FormatInt(it.Certificates, 10),
			fmt.Sprintf("%.2f", float64(it.PaidPaise)/100), it.Status,
			it.LastActivityAt.Format("2006-01-02 15:04"),
		})
	}
	cw.Flush()
}

func parseStudentFilter(r *http.Request) (students.ListFilter, string) {
	q := r.URL.Query()
	status := q.Get("status")
	if status == "" {
		status = "all"
	}
	if !studentStatuses[status] {
		return students.ListFilter{}, "status must be all, paid, unpaid or certified"
	}
	page, _ := strconv.Atoi(q.Get("page"))
	limit, _ := strconv.Atoi(q.Get("limit"))
	if limit <= 0 || limit > 100 {
		limit = 10
	}
	if page <= 0 {
		page = 1
	}
	courseID, _ := strconv.ParseInt(q.Get("course"), 10, 64)
	return students.ListFilter{
		Status:   status,
		Query:    q.Get("q"),
		CourseID: courseID,
		Page:     page,
		Limit:    limit,
	}, ""
}

func (s *Server) getStudent(w http.ResponseWriter, r *http.Request) {
	id, ok := parseID(r, "id")
	if !ok {
		writeError(w, http.StatusBadRequest, "invalid student id")
		return
	}
	d, err := s.Students.Get(r.Context(), id)
	if err != nil {
		s.writeStudentError(w, err, "could not load student")
		return
	}
	writeJSON(w, http.StatusOK, d)
}

type manualEnrollRequest struct {
	Name      string `json:"name"`
	Email     string `json:"email"`
	Mobile    string `json:"mobile"`
	CourseID  int64  `json:"courseId"`
	Method    string `json:"method"`
	Reference string `json:"reference"`
}

func (s *Server) manualEnroll(w http.ResponseWriter, r *http.Request) {
	var req manualEnrollRequest
	if err := decodeJSON(w, r, &req); err != nil {
		writeError(w, http.StatusBadRequest, "invalid request body")
		return
	}
	if req.CourseID <= 0 {
		writeError(w, http.StatusBadRequest, "choose a course")
		return
	}
	if strings.TrimSpace(req.Email) == "" && strings.TrimSpace(req.Mobile) == "" {
		writeError(w, http.StatusBadRequest, "enter the student's email or mobile number")
		return
	}
	if e := strings.TrimSpace(req.Email); e != "" {
		if _, err := mail.ParseAddress(e); err != nil {
			writeError(w, http.StatusBadRequest, "enter a valid email")
			return
		}
	}
	if strings.TrimSpace(req.Method) == "" {
		writeError(w, http.StatusBadRequest, "choose how the payment was received")
		return
	}
	if strings.TrimSpace(req.Reference) == "" {
		writeError(w, http.StatusBadRequest, "enter a payment reference or note")
		return
	}

	res, err := s.Students.ManualEnroll(r.Context(), students.ManualEnrollInput{
		Name:      req.Name,
		Email:     req.Email,
		Mobile:    req.Mobile,
		CourseID:  req.CourseID,
		Method:    strings.TrimSpace(req.Method),
		Reference: strings.TrimSpace(req.Reference),
	})
	switch {
	case errors.Is(err, students.ErrNotFound):
		writeError(w, http.StatusNotFound, "course not found")
	case errors.Is(err, students.ErrCourseNotLive):
		writeError(w, http.StatusUnprocessableEntity, err.Error())
	case errors.Is(err, students.ErrAlreadyEnrolled), errors.Is(err, students.ErrContactMismatch):
		writeError(w, http.StatusConflict, err.Error())
	case errors.Is(err, students.ErrNeedsName):
		writeError(w, http.StatusBadRequest, err.Error())
	case err != nil:
		log.Printf("manual enrol: %v", err)
		writeError(w, http.StatusInternalServerError, "could not enrol the student")
	default:
		writeJSON(w, http.StatusCreated, res)
	}
}

type certificateRequest struct {
	CourseID int64 `json:"courseId"`
}

func (s *Server) issueCertificate(w http.ResponseWriter, r *http.Request) {
	id, ok := parseID(r, "id")
	if !ok {
		writeError(w, http.StatusBadRequest, "invalid student id")
		return
	}
	var req certificateRequest
	if err := decodeJSON(w, r, &req); err != nil || req.CourseID <= 0 {
		writeError(w, http.StatusBadRequest, "courseId is required")
		return
	}
	cert, err := s.Students.IssueCertificate(r.Context(), id, req.CourseID)
	switch {
	case errors.Is(err, students.ErrNotEnrolled):
		writeError(w, http.StatusUnprocessableEntity, err.Error())
	case errors.Is(err, students.ErrCertificateExist):
		writeError(w, http.StatusConflict, err.Error())
	case err != nil:
		log.Printf("issue certificate: %v", err)
		writeError(w, http.StatusInternalServerError, "could not issue the certificate")
	default:
		writeJSON(w, http.StatusCreated, cert)
	}
}

func (s *Server) revokeStudentSessions(w http.ResponseWriter, r *http.Request) {
	id, ok := parseID(r, "id")
	if !ok {
		writeError(w, http.StatusBadRequest, "invalid student id")
		return
	}
	n, err := s.Students.RevokeAllSessions(r.Context(), id)
	if err != nil {
		s.writeStudentError(w, err, "could not sign the student out")
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"signedOutDevices": n})
}

func (s *Server) writeStudentError(w http.ResponseWriter, err error, fallback string) {
	if errors.Is(err, students.ErrNotFound) {
		writeError(w, http.StatusNotFound, "not found")
		return
	}
	log.Printf("%s: %v", fallback, err)
	writeError(w, http.StatusInternalServerError, fallback)
}

func deref(s *string) string {
	if s == nil {
		return ""
	}
	return *s
}
