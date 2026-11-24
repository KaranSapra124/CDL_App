package httpapi

import (
	"errors"
	"log"
	"net/http"

	"creditdost/backend/internal/students"
)

// deleteStudent permanently removes a student and their data. Students with payment records
// cannot be deleted (409); suspend them instead.
func (s *Server) deleteStudent(w http.ResponseWriter, r *http.Request) {
	id, ok := parseID(r, "id")
	if !ok {
		writeError(w, http.StatusBadRequest, "invalid student id")
		return
	}
	admin, _ := r.Context().Value(ctxKey{}).(AdminUser)
	d, err := s.Students.Delete(r.Context(), id, admin.ID)
	switch {
	case errors.Is(err, students.ErrNotFound):
		writeError(w, http.StatusNotFound, "student not found")
		return
	case errors.Is(err, students.ErrHasPayments):
		writeError(w, http.StatusConflict, err.Error())
		return
	case err != nil:
		log.Printf("delete student %d: %v", id, err)
		writeError(w, http.StatusInternalServerError, "could not delete the student")
		return
	}
	for _, f := range d.Files {
		s.removeMedia(f)
	}
	writeJSON(w, http.StatusOK, map[string]any{"deleted": true, "name": d.Name})
}
