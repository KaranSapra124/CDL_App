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
	"creditdost/backend/internal/payments"
	"creditdost/backend/internal/portal"
	"creditdost/backend/internal/students"
	"creditdost/backend/internal/support"
)

// Server bundles the dependencies every handler needs.
type Server struct {
	DB       *pgxpool.Pool
	Cfg      config.Config
	Courses  *courses.Store
	Students *students.Store
	Payments *payments.Store
	Support  *support.Store
	Portal   *portal.Store
}

// Router builds the full route tree for the API.
func (s *Server) Router() http.Handler {
	r := chi.NewRouter()
	r.Use(middleware.RequestID)
	r.Use(middleware.RealIP)
	r.Use(middleware.Recoverer)
	r.Use(middleware.Timeout(30 * time.Second))

	// Lets the admin and student web apps call the API directly (development).
	// Credentials are allowed so the session cookies are sent. Only the configured origins are accepted.
	var origins []string
	for _, o := range []string{s.Cfg.AdminOrigin, s.Cfg.StudentOrigin} {
		if o != "" {
			origins = append(origins, o)
		}
	}
	if len(origins) > 0 {
		r.Use(cors.Handler(cors.Options{
			AllowedOrigins:   origins,
			AllowedMethods:   []string{"GET", "POST", "PATCH", "PUT", "DELETE", "OPTIONS"},
			AllowedHeaders:   []string{"Content-Type"},
			AllowCredentials: true,
			MaxAge:           300,
		}))
	}

	r.Get("/healthz", s.healthz)

	r.Route("/api/student", func(r chi.Router) {
		r.Post("/auth/register", s.studentRegister)
		r.Post("/auth/login", s.studentLogin)
		r.Group(func(r chi.Router) {
			r.Use(s.requireStudent)
			r.Post("/auth/logout", s.studentLogout)
			r.Get("/me", s.studentMe)
			r.Patch("/me", s.studentUpdateProfile)
			r.Get("/me/avatar", s.studentAvatar)
			r.Post("/me/avatar", s.studentUploadAvatar)
			r.Delete("/me/avatar", s.studentDeleteAvatar)
			r.Get("/languages", s.studentLanguages)
			r.Get("/catalogue", s.studentCatalogue)
			r.Get("/notifications", s.studentNotices)
			r.Get("/tickets", s.studentTickets)
			r.Post("/tickets", s.studentRaiseTicket)
			r.Get("/tickets/{id}", s.studentTicket)
			r.Post("/tickets/{id}/messages", s.studentReplyToTicket)
			r.Get("/tickets/{id}/messages/{messageId}/attachment", s.studentTicketAttachment)
			r.Get("/courses", s.studentCatalogue)
			r.Get("/courses/{id}", s.studentCourse)
			r.Put("/modules/{id}/progress", s.studentProgress)
			r.Post("/modules/{id}/progress", s.studentProgress)
			r.Get("/modules/{id}/hls/*", s.studentStream)
		})
	})

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
			r.Post("/students/{id}/suspend", s.suspendStudent)
			r.Post("/students/{id}/reactivate", s.reactivateStudent)
			r.Delete("/students/{id}", s.deleteStudent)

			r.Get("/revenue", s.revenueSummary)
			r.Get("/transactions", s.listTransactions)
			r.Get("/transactions/export", s.exportTransactions)

			r.Get("/tickets", s.listTickets)
			r.Get("/tickets/{id}", s.getTicket)
			r.Post("/tickets/{id}/messages", s.replyToTicket)
			r.Get("/tickets/{id}/messages/{messageId}/attachment", s.ticketAttachment)
			r.Patch("/tickets/{id}/status", s.setTicketStatus)
			r.Post("/tickets/{id}/assign", s.assignTicket)

			r.Get("/notifications/config", s.notificationsConfig)
			r.Get("/notifications", s.listNotifications)
			r.Post("/notifications", s.sendNotification)

			r.Get("/certificates", s.listCertificates)
			r.Get("/certificates/{code}/pdf", s.certificatePDF)
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
