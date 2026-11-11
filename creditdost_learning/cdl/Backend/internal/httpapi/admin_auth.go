package httpapi

import (
	"context"
	"crypto/subtle"
	"errors"
	"net/http"
	"net/mail"
	"strings"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgconn"

	"creditdost/backend/internal/auth"
)

// AdminUser is the public view of an admin account. Never includes the password hash.
type AdminUser struct {
	ID    int64  `json:"id"`
	Email string `json:"email"`
	Name  string `json:"name"`
	Role  string `json:"role"`
}

// ctxKey is a private type so no other package can collide with our context keys.
type ctxKey struct{}

// dummyHash is compared when an email is not found, so a failed login takes the same time
// whether or not the email exists. This stops attackers learning which emails are registered.
var dummyHash, _ = auth.HashPassword("timing-equaliser-password")

type loginRequest struct {
	Email    string `json:"email"`
	Password string `json:"password"`
}

// login verifies email and password, then sets the session cookie.
func (s *Server) login(w http.ResponseWriter, r *http.Request) {
	var req loginRequest
	if err := decodeJSON(w, r, &req); err != nil {
		writeError(w, http.StatusBadRequest, "invalid request body")
		return
	}
	email := strings.ToLower(strings.TrimSpace(req.Email))

	var (
		u        AdminUser
		hash     string
		isActive bool
	)
	err := s.DB.QueryRow(r.Context(),
		`select id, email, name, role, password_hash, is_active
		   from admins
		  where lower(email) = $1`, email,
	).Scan(&u.ID, &u.Email, &u.Name, &u.Role, &hash, &isActive)

	found := true
	if errors.Is(err, pgx.ErrNoRows) {
		found = false
		hash = dummyHash
	} else if err != nil {
		writeError(w, http.StatusInternalServerError, "internal error")
		return
	}

	passwordOK := auth.CheckPassword(hash, req.Password)
	if !found || !passwordOK || !isActive {
		// Same message for every failure: never reveal which part was wrong.
		writeError(w, http.StatusUnauthorized, "invalid email or password")
		return
	}

	token, err := auth.IssueToken(s.Cfg.JWTSecret, u.ID, u.Role)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "internal error")
		return
	}
	http.SetCookie(w, s.sessionCookie(token, int(auth.SessionTTL.Seconds())))
	writeJSON(w, http.StatusOK, u)
}

type signupRequest struct {
	Name       string `json:"name"`
	Email      string `json:"email"`
	Password   string `json:"password"`
	InviteCode string `json:"inviteCode"`
}

// signup creates a new admin. It only works when ADMIN_INVITE_CODE is set on the
// server, and the caller must supply that exact code.
func (s *Server) signup(w http.ResponseWriter, r *http.Request) {
	if s.Cfg.AdminInviteCode == "" {
		writeError(w, http.StatusForbidden, "admin signup is disabled")
		return
	}

	var req signupRequest
	if err := decodeJSON(w, r, &req); err != nil {
		writeError(w, http.StatusBadRequest, "invalid request body")
		return
	}

	// Compare in constant time so the invite code cannot be guessed by timing.
	if subtle.ConstantTimeCompare([]byte(req.InviteCode), []byte(s.Cfg.AdminInviteCode)) != 1 {
		writeError(w, http.StatusForbidden, "invalid invite code")
		return
	}

	name := strings.TrimSpace(req.Name)
	email := strings.ToLower(strings.TrimSpace(req.Email))

	if name == "" {
		writeError(w, http.StatusBadRequest, "name is required")
		return
	}
	if _, err := mail.ParseAddress(email); err != nil {
		writeError(w, http.StatusBadRequest, "enter a valid email")
		return
	}
	if len(req.Password) < 12 {
		writeError(w, http.StatusBadRequest, "password must be at least 12 characters")
		return
	}
	if len(req.Password) > auth.MaxPasswordBytes {
		writeError(w, http.StatusBadRequest, "password must be at most 72 bytes")
		return
	}

	hash, err := auth.HashPassword(req.Password)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "internal error")
		return
	}

	var u AdminUser
	err = s.DB.QueryRow(r.Context(),
		`insert into admins (email, password_hash, name, role)
		 values ($1, $2, $3, 'admin')
		 returning id, email, name, role`,
		email, hash, name,
	).Scan(&u.ID, &u.Email, &u.Name, &u.Role)

	var pgErr *pgconn.PgError
	if errors.As(err, &pgErr) && pgErr.Code == "23505" { // unique_violation
		writeError(w, http.StatusConflict, "an account with this email already exists")
		return
	}
	if err != nil {
		writeError(w, http.StatusInternalServerError, "internal error")
		return
	}

	// Signup does not log the user in. The frontend sends them to the login page.
	writeJSON(w, http.StatusCreated, u)
}

// logout clears the session cookie.
func (s *Server) logout(w http.ResponseWriter, _ *http.Request) {
	http.SetCookie(w, s.sessionCookie("", -1))
	writeJSON(w, http.StatusOK, map[string]string{"status": "signed out"})
}

// requireAdmin lets a request through only with a valid session for an active admin.
// It re-reads the admin row on every request, so disabling an admin takes effect immediately.
func (s *Server) requireAdmin(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		cookie, err := r.Cookie(auth.SessionCookieName)
		if err != nil {
			writeError(w, http.StatusUnauthorized, "not signed in")
			return
		}

		claims, err := auth.ParseToken(s.Cfg.JWTSecret, cookie.Value)
		if err != nil {
			writeError(w, http.StatusUnauthorized, "session expired, sign in again")
			return
		}

		var u AdminUser
		var isActive bool
		err = s.DB.QueryRow(r.Context(),
			`select id, email, name, role, is_active from admins where id = $1`,
			claims.AdminID,
		).Scan(&u.ID, &u.Email, &u.Name, &u.Role, &isActive)
		if err != nil || !isActive {
			writeError(w, http.StatusUnauthorized, "session no longer valid")
			return
		}

		ctx := context.WithValue(r.Context(), ctxKey{}, u)
		next.ServeHTTP(w, r.WithContext(ctx))
	})
}

// me returns the currently signed-in admin.
func (s *Server) me(w http.ResponseWriter, r *http.Request) {
	u, ok := r.Context().Value(ctxKey{}).(AdminUser)
	if !ok {
		writeError(w, http.StatusUnauthorized, "not signed in")
		return
	}
	writeJSON(w, http.StatusOK, u)
}

// sessionCookie builds the HTTP-only, same-site session cookie.
func (s *Server) sessionCookie(value string, maxAge int) *http.Cookie {
	return &http.Cookie{
		Name:     auth.SessionCookieName,
		Value:    value,
		Path:     "/",
		MaxAge:   maxAge,
		HttpOnly: true,
		Secure:   s.Cfg.CookieSecure,
		SameSite: http.SameSiteStrictMode,
	}
}
