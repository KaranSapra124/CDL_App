package httpapi

import (
	"log"
	"net/http"

	"creditdost/backend/internal/dashboard"
)

// dashboardHandler returns all dashboard data for ?range=7d|30d|90d|365d (default 30d).
func (s *Server) dashboardHandler(w http.ResponseWriter, r *http.Request) {
	data, err := dashboard.Load(r.Context(), s.DB, r.URL.Query().Get("range"))
	if err != nil {
		log.Printf("dashboard: %v", err)
		writeError(w, http.StatusInternalServerError, "could not load dashboard")
		return
	}
	writeJSON(w, http.StatusOK, data)
}
