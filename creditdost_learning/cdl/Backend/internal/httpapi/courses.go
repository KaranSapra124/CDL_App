package httpapi

import (
	"errors"
	"log"
	"net/http"
	"strconv"
	"strings"

	"github.com/go-chi/chi/v5"
	"github.com/jackc/pgx/v5/pgconn"

	"creditdost/backend/internal/courses"
)

var (
	courseStatuses   = map[string]bool{"draft": true, "active": true, "archived": true}
	courseVisibility = map[string]bool{"public": true, "private_link": true, "invite_only": true}
)

// courseRequest is the body for creating and editing a course. Pointer fields are optional:
// a field left out of the JSON is not changed.
type courseRequest struct {
	Title              *string   `json:"title"`
	Description        *string   `json:"description"`
	Status             *string   `json:"status"`
	PricePaise         *int64    `json:"pricePaise"`
	MRPPaise           *int64    `json:"mrpPaise"`
	CertificateEnabled *bool     `json:"certificateEnabled"`
	Visibility         *string   `json:"visibility"`
	PrimaryLanguage    *string   `json:"primaryLanguage"`
	CategoryID         *int64    `json:"categoryId"`
	Tags               *[]string `json:"tags"`
	InstructorIDs      *[]int64  `json:"instructorIds"`
}

// toPatch checks the request and converts it to a store patch.
func (req courseRequest) toPatch() (courses.CoursePatch, string) {
	var p courses.CoursePatch
	if req.Title != nil {
		t := strings.TrimSpace(*req.Title)
		if t == "" {
			return p, "title cannot be empty"
		}
		p.Title = &t
	}
	if req.Description != nil {
		p.Description = req.Description
	}
	if req.Status != nil {
		if !courseStatuses[*req.Status] {
			return p, "status must be draft, active or archived"
		}
		p.Status = req.Status
	}
	if req.PricePaise != nil {
		if *req.PricePaise < 0 {
			return p, "price cannot be negative"
		}
		p.PricePaise = req.PricePaise
	}
	if req.MRPPaise != nil {
		if *req.MRPPaise < 0 {
			return p, "MRP cannot be negative"
		}
		p.MRPPaise = req.MRPPaise
	}
	if req.CertificateEnabled != nil {
		p.CertificateEnabled = req.CertificateEnabled
	}
	if req.Visibility != nil {
		if !courseVisibility[*req.Visibility] {
			return p, "visibility must be public, private_link or invite_only"
		}
		p.Visibility = req.Visibility
	}
	if req.PrimaryLanguage != nil {
		lang := strings.TrimSpace(*req.PrimaryLanguage)
		if lang == "" {
			return p, "primary language cannot be empty"
		}
		p.PrimaryLanguage = &lang
	}
	if req.CategoryID != nil {
		p.CategoryID = req.CategoryID
	}
	p.Tags = req.Tags
	p.InstructorIDs = req.InstructorIDs
	return p, ""
}

// isForeignKeyViolation reports whether err is a PostgreSQL foreign key error (SQLSTATE 23503).
func isForeignKeyViolation(err error) bool {
	var pgErr *pgconn.PgError
	return errors.As(err, &pgErr) && pgErr.Code == "23503"
}

// parseID reads a numeric {id} URL parameter.
func parseID(r *http.Request, name string) (int64, bool) {
	id, err := strconv.ParseInt(chi.URLParam(r, name), 10, 64)
	return id, err == nil && id > 0
}

// ---------- Courses ----------

func (s *Server) listCourses(w http.ResponseWriter, r *http.Request) {
	q := r.URL.Query()
	status := q.Get("status")
	if status == "" {
		status = "all"
	}
	if status != "all" && !courseStatuses[status] {
		writeError(w, http.StatusBadRequest, "status must be all, draft, active or archived")
		return
	}
	sort := q.Get("sort")
	if sort != "title" && sort != "revenue" {
		sort = "recent"
	}
	page, _ := strconv.Atoi(q.Get("page"))
	limit, _ := strconv.Atoi(q.Get("limit"))
	categoryID, _ := strconv.ParseInt(q.Get("category"), 10, 64)

	res, err := s.Courses.List(r.Context(), courses.ListFilter{
		Status:     status,
		Query:      q.Get("q"),
		CategoryID: categoryID,
		Sort:       sort,
		Page:       page,
		Limit:      limit,
	})
	if err != nil {
		log.Printf("list courses: %v", err)
		writeError(w, http.StatusInternalServerError, "could not load courses")
		return
	}
	writeJSON(w, http.StatusOK, res)
}

func (s *Server) createCourse(w http.ResponseWriter, r *http.Request) {
	var req courseRequest
	if err := decodeJSON(w, r, &req); err != nil {
		writeError(w, http.StatusBadRequest, "invalid request body")
		return
	}
	if req.Title == nil || strings.TrimSpace(*req.Title) == "" {
		writeError(w, http.StatusBadRequest, "title is required")
		return
	}
	title := strings.TrimSpace(*req.Title)
	slug := courses.Slugify(title)
	if slug == "" {
		writeError(w, http.StatusBadRequest, "title must contain letters or numbers")
		return
	}

	id, err := s.Courses.Create(r.Context(), title, slug)
	if errors.Is(err, courses.ErrSlugTaken) {
		writeError(w, http.StatusConflict, "a course with this title already exists")
		return
	}
	if err != nil {
		log.Printf("create course: %v", err)
		writeError(w, http.StatusInternalServerError, "could not create course")
		return
	}

	// Apply the rest of the details. Title is already set, so drop it from the patch.
	req.Title = nil
	patch, msg := req.toPatch()
	if msg != "" {
		writeError(w, http.StatusBadRequest, msg)
		return
	}
	if err := s.Courses.Update(r.Context(), id, patch); err != nil {
		log.Printf("create course details: %v", err)
		writeError(w, http.StatusInternalServerError, "course created but details could not be saved")
		return
	}
	s.writeCourse(w, r, id, http.StatusCreated)
}

func (s *Server) getCourse(w http.ResponseWriter, r *http.Request) {
	id, ok := parseID(r, "id")
	if !ok {
		writeError(w, http.StatusBadRequest, "invalid course id")
		return
	}
	s.writeCourse(w, r, id, http.StatusOK)
}

func (s *Server) updateCourse(w http.ResponseWriter, r *http.Request) {
	id, ok := parseID(r, "id")
	if !ok {
		writeError(w, http.StatusBadRequest, "invalid course id")
		return
	}
	var req courseRequest
	if err := decodeJSON(w, r, &req); err != nil {
		writeError(w, http.StatusBadRequest, "invalid request body")
		return
	}
	patch, msg := req.toPatch()
	if msg != "" {
		writeError(w, http.StatusBadRequest, msg)
		return
	}
	if patch.Title != nil {
		slug := courses.Slugify(*patch.Title)
		if slug != "" {
			patch.Slug = &slug
		}
	}
	if err := s.Courses.Update(r.Context(), id, patch); err != nil {
		s.writeCourseError(w, err, "could not update course")
		return
	}
	s.writeCourse(w, r, id, http.StatusOK)
}

// publishCourse makes a course active. A course needs a title, a price above zero, and at least one module with a ready video.
func (s *Server) publishCourse(w http.ResponseWriter, r *http.Request) {
	id, ok := parseID(r, "id")
	if !ok {
		writeError(w, http.StatusBadRequest, "invalid course id")
		return
	}
	course, err := s.Courses.Get(r.Context(), id)
	if err != nil {
		s.writeCourseError(w, err, "could not load course")
		return
	}

	var problems []string
	if course.Title == "" {
		problems = append(problems, "add a title")
	}
	if course.PricePaise <= 0 {
		problems = append(problems, "set a price above zero")
	}
	ready, err := s.Courses.CanPublish(r.Context(), id)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "could not check videos")
		return
	}
	if !ready {
		problems = append(problems, "upload at least one module video that has finished processing")
	}
	if len(problems) > 0 {
		writeJSON(w, http.StatusUnprocessableEntity, map[string]any{
			"error":    "course is not ready to publish",
			"problems": problems,
		})
		return
	}

	active := "active"
	if err := s.Courses.Update(r.Context(), id, courses.CoursePatch{Status: &active}); err != nil {
		s.writeCourseError(w, err, "could not publish course")
		return
	}
	s.writeCourse(w, r, id, http.StatusOK)
}

// writeCourse loads a course with its modules and writes it as the response.
func (s *Server) writeCourse(w http.ResponseWriter, r *http.Request, id int64, status int) {
	course, err := s.Courses.Get(r.Context(), id)
	if err != nil {
		s.writeCourseError(w, err, "could not load course")
		return
	}
	writeJSON(w, status, course)
}

func (s *Server) writeCourseError(w http.ResponseWriter, err error, fallback string) {
	switch {
	case errors.Is(err, courses.ErrNotFound):
		writeError(w, http.StatusNotFound, "not found")
	case errors.Is(err, courses.ErrSlugTaken):
		writeError(w, http.StatusConflict, "a course with this title already exists")
	default:
		log.Printf("%s: %v", fallback, err)
		writeError(w, http.StatusInternalServerError, fallback)
	}
}

// ---------- Modules ----------

type moduleRequest struct {
	Title           *string `json:"title"`
	Description     *string `json:"description"`
	DurationSeconds *int    `json:"durationSeconds"`
	IsFreePreview   *bool   `json:"isFreePreview"`
	IsNew           *bool   `json:"isNew"`
}

func (s *Server) createModule(w http.ResponseWriter, r *http.Request) {
	courseID, ok := parseID(r, "id")
	if !ok {
		writeError(w, http.StatusBadRequest, "invalid course id")
		return
	}
	var req moduleRequest
	if err := decodeJSON(w, r, &req); err != nil {
		writeError(w, http.StatusBadRequest, "invalid request body")
		return
	}
	if req.Title == nil || strings.TrimSpace(*req.Title) == "" {
		writeError(w, http.StatusBadRequest, "module title is required")
		return
	}
	if req.DurationSeconds != nil && *req.DurationSeconds < 0 {
		writeError(w, http.StatusBadRequest, "duration cannot be negative")
		return
	}
	description := ""
	if req.Description != nil {
		description = *req.Description
	}
	freePreview := req.IsFreePreview != nil && *req.IsFreePreview
	isNew := req.IsNew != nil && *req.IsNew

	m, err := s.Courses.CreateModule(r.Context(), courseID, strings.TrimSpace(*req.Title),
		description, req.DurationSeconds, freePreview, isNew)
	if isForeignKeyViolation(err) {
		writeError(w, http.StatusNotFound, "course not found")
		return
	}
	if err != nil {
		log.Printf("create module: %v", err)
		writeError(w, http.StatusInternalServerError, "could not create module")
		return
	}
	writeJSON(w, http.StatusCreated, m)
}

func (s *Server) updateModule(w http.ResponseWriter, r *http.Request) {
	id, ok := parseID(r, "id")
	if !ok {
		writeError(w, http.StatusBadRequest, "invalid module id")
		return
	}
	var req moduleRequest
	if err := decodeJSON(w, r, &req); err != nil {
		writeError(w, http.StatusBadRequest, "invalid request body")
		return
	}
	patch := courses.ModulePatch{
		Description:     req.Description,
		DurationSeconds: req.DurationSeconds,
		IsFreePreview:   req.IsFreePreview,
		IsNew:           req.IsNew,
	}
	if req.Title != nil {
		t := strings.TrimSpace(*req.Title)
		if t == "" {
			writeError(w, http.StatusBadRequest, "module title cannot be empty")
			return
		}
		patch.Title = &t
	}
	if req.DurationSeconds != nil && *req.DurationSeconds < 0 {
		writeError(w, http.StatusBadRequest, "duration cannot be negative")
		return
	}

	m, err := s.Courses.UpdateModule(r.Context(), id, patch)
	if err != nil {
		s.writeCourseError(w, err, "could not update module")
		return
	}
	writeJSON(w, http.StatusOK, m)
}

func (s *Server) deleteModule(w http.ResponseWriter, r *http.Request) {
	id, ok := parseID(r, "id")
	if !ok {
		writeError(w, http.StatusBadRequest, "invalid module id")
		return
	}
	files, err := s.Courses.DeleteModule(r.Context(), id)
	if err != nil {
		s.writeCourseError(w, err, "could not delete module")
		return
	}
	// The row is gone; now remove its files. A failed file removal is logged, not returned.
	for _, rel := range files {
		s.removeMedia(rel)
	}
	writeJSON(w, http.StatusOK, map[string]string{"status": "deleted"})
}

// reorderModules takes the full list of module ids in their new order.
func (s *Server) reorderModules(w http.ResponseWriter, r *http.Request) {
	courseID, ok := parseID(r, "id")
	if !ok {
		writeError(w, http.StatusBadRequest, "invalid course id")
		return
	}
	var req struct {
		ModuleIDs []int64 `json:"moduleIds"`
	}
	if err := decodeJSON(w, r, &req); err != nil || len(req.ModuleIDs) == 0 {
		writeError(w, http.StatusBadRequest, "moduleIds must be a non-empty list")
		return
	}
	if err := s.Courses.ReorderModules(r.Context(), courseID, req.ModuleIDs); err != nil {
		log.Printf("reorder modules: %v", err)
		writeError(w, http.StatusBadRequest, "the list must contain exactly this course's modules")
		return
	}
	modules, err := s.Courses.ListModules(r.Context(), courseID)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "could not load modules")
		return
	}
	writeJSON(w, http.StatusOK, modules)
}

// ---------- Editor lookups ----------

func (s *Server) courseMeta(w http.ResponseWriter, r *http.Request) {
	cats, err := s.Courses.Categories(r.Context())
	if err != nil {
		writeError(w, http.StatusInternalServerError, "could not load categories")
		return
	}
	ins, err := s.Courses.Instructors(r.Context())
	if err != nil {
		writeError(w, http.StatusInternalServerError, "could not load instructors")
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"categories": cats, "instructors": ins})
}

func (s *Server) createCategory(w http.ResponseWriter, r *http.Request) {
	var req struct {
		Name string `json:"name"`
	}
	if err := decodeJSON(w, r, &req); err != nil || strings.TrimSpace(req.Name) == "" {
		writeError(w, http.StatusBadRequest, "name is required")
		return
	}
	name := strings.TrimSpace(req.Name)
	c, err := s.Courses.CreateCategory(r.Context(), name, courses.Slugify(name))
	if errors.Is(err, courses.ErrSlugTaken) {
		writeError(w, http.StatusConflict, "this category already exists")
		return
	}
	if err != nil {
		writeError(w, http.StatusInternalServerError, "could not create category")
		return
	}
	writeJSON(w, http.StatusCreated, c)
}

func (s *Server) createInstructor(w http.ResponseWriter, r *http.Request) {
	var req struct {
		Name  string `json:"name"`
		Title string `json:"title"`
	}
	if err := decodeJSON(w, r, &req); err != nil || strings.TrimSpace(req.Name) == "" {
		writeError(w, http.StatusBadRequest, "name is required")
		return
	}
	in, err := s.Courses.CreateInstructor(r.Context(), strings.TrimSpace(req.Name), strings.TrimSpace(req.Title))
	if err != nil {
		writeError(w, http.StatusInternalServerError, "could not create instructor")
		return
	}
	writeJSON(w, http.StatusCreated, in)
}
