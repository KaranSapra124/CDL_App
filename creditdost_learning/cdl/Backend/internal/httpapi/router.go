// Package httpapi defines the HTTP routes and shared response helpers.
package httpapi

import (
	"encoding/json"
	"net/http"
	"time"

	"github.com/go-chi/chi/v5"
	"github.com/go-chi/chi/v5/middleware"
	"github.com/go-chi/cors"
	"github.com/jackc/pgx/v5/pgxpool"

	"creditdost/backend/internal/config"
	"creditdost/backend/internal/courses"
	"creditdost/backend/internal/students"
)

// Server bundles the dependencies every handler needs.
type Server struct {
	DB       *pgxpool.Pool
	Cfg      config.Config
	Courses  *courses.Store
	Students *students.Store
}

// Router builds the full route tree for the API.
func (s *Server) Router() http.Handler {
	r := chi.NewRouter()
	r.Use(middleware.RequestID)
	r.Use(middleware.RealIP)
	r.Use(middleware.Recoverer)
	r.Use(middleware.Timeout(30 * time.Second))

	// Lets the admin app call the API directly (used for large video uploads in development).
	// Credentials are allowed so the session cookie is sent. Only the configured origin is accepted.
	if s.Cfg.AdminOrigin != "" {
		r.Use(cors.Handler(cors.Options{
			AllowedOrigins:   []string{s.Cfg.AdminOrigin},
			AllowedMethods:   []string{"GET", "POST", "PATCH", "PUT", "DELETE", "OPTIONS"},
			AllowedHeaders:   []string{"Content-Type"},
			AllowCredentials: true,
			MaxAge:           300,
		}))
	}

	r.Get("/healthz", s.healthz)

	r.Route("/api/admin", func(r chi.Router) {
		r.Post("/auth/login", s.login)
		r.Post("/auth/signup", s.signup)
		r.Post("/auth/logout", s.logout)

		r.Group(func(r chi.Router) {
			r.Use(s.requireAdmin)
			r.Get("/auth/me", s.me)
			r.Get("/dashboard", s.dashboardHandler)

			r.Get("/course-meta", s.courseMeta)
			r.Post("/categories", s.createCategory)
			r.Post("/instructors", s.createInstructor)

			r.Get("/courses", s.listCourses)
			r.Post("/courses", s.createCourse)
			r.Get("/courses/{id}", s.getCourse)
			r.Patch("/courses/{id}", s.updateCourse)
			r.Post("/courses/{id}/publish", s.publishCourse)
			r.Post("/courses/{id}/thumbnail", s.uploadCourseThumbnail)
			r.Get("/courses/{id}/thumbnail", s.serveThumbnail)
			r.Post("/courses/{id}/modules", s.createModule)
			r.Put("/courses/{id}/modules/order", s.reorderModules)

			r.Patch("/modules/{id}", s.updateModule)
			r.Delete("/modules/{id}", s.deleteModule)
			r.Post("/modules/{id}/video", s.uploadModuleVideo)
			r.Get("/modules/{id}/hls/*", s.serveHLS)

			r.Get("/students", s.listStudents)
			r.Get("/students/export", s.exportStudents)
			r.Post("/students/manual-enrollment", s.manualEnroll)
			r.Get("/students/{id}", s.getStudent)
			r.Post("/students/{id}/certificates", s.issueCertificate)
			r.Post("/students/{id}/sessions/revoke-all", s.revokeStudentSessions)
		})
	})

	return r
}

func (s *Server) healthz(w http.ResponseWriter, r *http.Request) {
	if err := s.DB.Ping(r.Context()); err != nil {
		writeError(w, http.StatusServiceUnavailable, "database unavailable")
		return
	}
	writeJSON(w, http.StatusOK, map[string]string{"status": "ok", "database": "ok"})
}

// writeJSON sends v as JSON with the given status code.
func writeJSON(w http.ResponseWriter, status int, v any) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	_ = json.NewEncoder(w).Encode(v)
}

// writeError sends a consistent error body: {"error": "..."}.
func writeError(w http.ResponseWriter, status int, msg string) {
	writeJSON(w, status, map[string]string{"error": msg})
}

// decodeJSON reads a small JSON body. It rejects unknown fields and bodies over 1 MB.
func decodeJSON(w http.ResponseWriter, r *http.Request, v any) error {
	r.Body = http.MaxBytesReader(w, r.Body, 1<<20)
	dec := json.NewDecoder(r.Body)
	dec.DisallowUnknownFields()
	return dec.Decode(v)
}
