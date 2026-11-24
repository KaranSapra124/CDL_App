package httpapi

import (
	"context"
	"errors"
	"fmt"
	"log"
	"net/http"
	"path"
	"path/filepath"
	"strings"

	"github.com/go-chi/chi/v5"

	"creditdost/backend/internal/auth"
	"creditdost/backend/internal/portal"
)

type studentCtxKey struct{}

// StudentContext is the signed-in student for one request.
type StudentContext struct {
	StudentID int64
	SessionID int64
}

// requireStudent accepts a student token from the HTTP-only cookie (web) or an
// "Authorization: Bearer" header (Android app). Each request re-checks the session and suspension.
func (s *Server) requireStudent(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		token := ""
		if h := r.Header.Get("Authorization"); strings.HasPrefix(h, "Bearer ") {
			token = strings.TrimPrefix(h, "Bearer ")
		} else if c, err := r.Cookie(auth.StudentCookieName); err == nil {
			token = c.Value
		}
		if token == "" {
			writeError(w, http.StatusUnauthorized, "sign in to continue")
			return
		}
		claims, err := auth.ParseStudentToken(s.Cfg.JWTSecret, token)
		if err != nil {
			writeError(w, http.StatusUnauthorized, "your session has ended. Sign in again")
			return
		}
		if err := s.Portal.CheckSession(r.Context(), claims.SessionID, claims.StudentID); err != nil {
			writeError(w, http.StatusUnauthorized, "your session has ended. Sign in again")
			return
		}
		ctx := context.WithValue(r.Context(), studentCtxKey{}, StudentContext{
			StudentID: claims.StudentID, SessionID: claims.SessionID,
		})
		next.ServeHTTP(w, r.WithContext(ctx))
	})
}

func studentFrom(r *http.Request) StudentContext {
	sc, _ := r.Context().Value(studentCtxKey{}).(StudentContext)
	return sc
}

type studentLoginRequest struct {
	Email       string `json:"email"`
	Password    string `json:"password"`
	DeviceLabel string `json:"deviceLabel"`
	DeviceName  string `json:"deviceName"`
}

// studentLogin checks credentials. The response includes the token for the Android app, and the
// same token is set as an HTTP-only cookie for the web.
func (s *Server) studentLogin(w http.ResponseWriter, r *http.Request) {
	var req studentLoginRequest
	if err := decodeJSON(w, r, &req); err != nil {
		writeError(w, http.StatusBadRequest, "invalid request body")
		return
	}
	device := strings.TrimSpace(req.DeviceLabel)
	if device == "" {
		device = strings.TrimSpace(req.DeviceName)
	}
	if device == "" {
		device = r.UserAgent()
	}
	if len(device) > 200 {
		device = device[:200]
	}
	studentID, sessionID, err := s.Portal.Login(r.Context(), req.Email, req.Password, device, r.RemoteAddr)
	switch {
	case errors.Is(err, portal.ErrInvalidLogin):
		writeError(w, http.StatusUnauthorized, err.Error())
		return
	case errors.Is(err, portal.ErrSuspended):
		writeError(w, http.StatusForbidden, err.Error())
		return
	case err != nil:
		log.Printf("student login: %v", err)
		writeError(w, http.StatusInternalServerError, "could not sign in")
		return
	}
	token, err := auth.IssueStudentToken(s.Cfg.JWTSecret, studentID, sessionID)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "could not sign in")
		return
	}
	http.SetCookie(w, s.studentCookie(token, int(auth.SessionTTL.Seconds())))
	writeJSON(w, http.StatusOK, map[string]any{"token": token, "expiresInSeconds": int(auth.SessionTTL.Seconds())})
}

type studentRegisterRequest struct {
	Name     string `json:"name"`
	Email    string `json:"email"`
	Password string `json:"password"`
}

// studentRegister creates an account, or claims a manually enrolled one that has no password yet.
func (s *Server) studentRegister(w http.ResponseWriter, r *http.Request) {
	var req studentRegisterRequest
	if err := decodeJSON(w, r, &req); err != nil {
		writeError(w, http.StatusBadRequest, "invalid request body")
		return
	}
	_, err := s.Portal.Register(r.Context(), req.Name, req.Email, req.Password)
	switch {
	case errors.Is(err, portal.ErrEmailTaken):
		writeError(w, http.StatusConflict, err.Error())
	case errors.Is(err, portal.ErrNeedsName), errors.Is(err, portal.ErrNeedsEmail),
		errors.Is(err, portal.ErrWeakPassword), errors.Is(err, portal.ErrLongPassword):
		writeError(w, http.StatusBadRequest, err.Error())
	case err != nil:
		log.Printf("student register: %v", err)
		writeError(w, http.StatusInternalServerError, "could not create the account")
	default:
		writeJSON(w, http.StatusCreated, map[string]string{"status": "account ready. Sign in to continue"})
	}
}

func (s *Server) studentLogout(w http.ResponseWriter, r *http.Request) {
	sc := studentFrom(r)
	if err := s.Portal.Logout(r.Context(), sc.SessionID, sc.StudentID); err != nil {
		writeError(w, http.StatusInternalServerError, "could not sign out")
		return
	}
	http.SetCookie(w, s.studentCookie("", -1))
	writeJSON(w, http.StatusOK, map[string]string{"status": "signed out"})
}

func (s *Server) studentMe(w http.ResponseWriter, r *http.Request) {
	p, err := s.Portal.Me(r.Context(), studentFrom(r).StudentID)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "could not load your profile")
		return
	}
	writeJSON(w, http.StatusOK, p)
}

func (s *Server) studentCatalogue(w http.ResponseWriter, r *http.Request) {
	list, err := s.Portal.Catalogue(r.Context(), studentFrom(r).StudentID)
	if err != nil {
		log.Printf("catalogue: %v", err)
		writeError(w, http.StatusInternalServerError, "could not load courses")
		return
	}
	writeJSON(w, http.StatusOK, list)
}

func (s *Server) studentCourse(w http.ResponseWriter, r *http.Request) {
	id, ok := parseID(r, "id")
	if !ok {
		writeError(w, http.StatusBadRequest, "invalid course id")
		return
	}
	d, err := s.Portal.Course(r.Context(), id, studentFrom(r).StudentID)
	if errors.Is(err, portal.ErrNotFound) {
		writeError(w, http.StatusNotFound, "course not found")
		return
	}
	if err != nil {
		log.Printf("course: %v", err)
		writeError(w, http.StatusInternalServerError, "could not load the course")
		return
	}
	writeJSON(w, http.StatusOK, d)
}

type progressRequest struct {
	WatchedSeconds int  `json:"watchedSeconds"`
	Completed      bool `json:"completed"`
}

func (s *Server) studentProgress(w http.ResponseWriter, r *http.Request) {
	id, ok := parseID(r, "id")
	if !ok {
		writeError(w, http.StatusBadRequest, "invalid lesson id")
		return
	}
	var req progressRequest
	if err := decodeJSON(w, r, &req); err != nil || req.WatchedSeconds < 0 {
		writeError(w, http.StatusBadRequest, "watchedSeconds must be zero or more")
		return
	}
	err := s.Portal.SaveProgress(r.Context(), studentFrom(r).StudentID, id, req.WatchedSeconds, req.Completed)
	if writeStreamError(w, err) {
		return
	}
	writeJSON(w, http.StatusOK, map[string]string{"status": "saved"})
}

// studentStream serves a lesson's HLS files. Access is re-checked on every request, so a student who
// is suspended, signed out, or no longer enrolled loses playback at the next segment request.
func (s *Server) studentStream(w http.ResponseWriter, r *http.Request) {
	id, ok := parseID(r, "id")
	if !ok {
		writeError(w, http.StatusBadRequest, "invalid lesson id")
		return
	}
	if err := s.Portal.CanWatch(r.Context(), id, studentFrom(r).StudentID); writeStreamError(w, err) {
		return
	}

	rel := path.Clean("/" + chi.URLParam(r, "*"))
	if rel == "/" || rel == "/index.m3u8" {
		rel = "/master.m3u8"
	}
	root := filepath.Join(s.Cfg.MediaDir, "hls", fmt.Sprintf("module-%d", id))
	full := filepath.Join(root, filepath.FromSlash(rel))
	if !strings.HasPrefix(full, root+string(filepath.Separator)) {
		writeError(w, http.StatusBadRequest, "invalid path")
		return
	}
	// Streams are private to the student and must not be cached by shared caches.
	w.Header().Set("Cache-Control", "private, no-store")
	http.ServeFile(w, r, full)
}

// writeStreamError maps access errors to HTTP statuses. It returns true when it wrote a response.
func writeStreamError(w http.ResponseWriter, err error) bool {
	switch {
	case err == nil:
		return false
	case errors.Is(err, portal.ErrNotFound):
		writeError(w, http.StatusNotFound, "lesson not found")
	case errors.Is(err, portal.ErrLocked):
		writeError(w, http.StatusForbidden, err.Error())
	case errors.Is(err, portal.ErrNotReady):
		writeError(w, http.StatusConflict, err.Error())
	default:
		log.Printf("student access: %v", err)
		writeError(w, http.StatusInternalServerError, "could not check access")
	}
	return true
}

func (s *Server) studentCookie(value string, maxAge int) *http.Cookie {
	return &http.Cookie{
		Name:     auth.StudentCookieName,
		Value:    value,
		Path:     "/",
		MaxAge:   maxAge,
		HttpOnly: true,
		Secure:   s.Cfg.CookieSecure,
		SameSite: http.SameSiteLaxMode,
	}
}
