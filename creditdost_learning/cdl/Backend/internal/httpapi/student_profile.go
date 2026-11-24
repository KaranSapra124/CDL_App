package httpapi

import (
	"errors"
	"fmt"
	"log"
	"net/http"
	"path"
	"path/filepath"
	"sort"

	"creditdost/backend/internal/portal"
)

type updateProfileRequest struct {
	Name              string `json:"name"`
	Mobile            string `json:"mobile"`
	City              string `json:"city"`
	State             string `json:"state"`
	PreferredLanguage string `json:"preferredLanguage"`
}

// studentUpdateProfile saves the signed-in student's name, mobile, city, state and language,
// then returns the updated profile (same shape as GET /me).
func (s *Server) studentUpdateProfile(w http.ResponseWriter, r *http.Request) {
	var req updateProfileRequest
	if err := decodeJSON(w, r, &req); err != nil {
		writeError(w, http.StatusBadRequest, "invalid request body")
		return
	}
	id := studentFrom(r).StudentID
	err := s.Portal.UpdateProfile(r.Context(), id, portal.ProfileUpdate{
		Name: req.Name, Mobile: req.Mobile, City: req.City, State: req.State, Language: req.PreferredLanguage,
	})
	switch {
	case errors.Is(err, portal.ErrMobileTaken):
		writeError(w, http.StatusConflict, err.Error())
		return
	case errors.Is(err, portal.ErrNeedsName), errors.Is(err, portal.ErrInvalidMobile),
		errors.Is(err, portal.ErrInvalidLanguage), errors.Is(err, portal.ErrFieldTooLong):
		writeError(w, http.StatusBadRequest, err.Error())
		return
	case err != nil:
		log.Printf("update profile: %v", err)
		writeError(w, http.StatusInternalServerError, "could not save your profile")
		return
	}
	s.studentMe(w, r)
}

// studentUploadAvatar replaces the profile photo. Multipart field "avatar", JPEG/PNG/WebP, max 5 MB.
// The file type is checked from its contents, not the name.
func (s *Server) studentUploadAvatar(w http.ResponseWriter, r *http.Request) {
	const maxAvatarBytes = 5 << 20
	r.Body = http.MaxBytesReader(w, r.Body, maxAvatarBytes)
	mr, err := r.MultipartReader()
	if err != nil {
		writeError(w, http.StatusBadRequest, "send the photo as multipart form data in a field named 'avatar'")
		return
	}
	part, err := findPart(mr, "avatar")
	if err != nil {
		writeUploadError(w, err)
		return
	}
	defer part.Close()

	id := studentFrom(r).StudentID
	rel, _, err := s.saveUpload(part, fmt.Sprintf("avatars/student-%d", id), imageTypes)
	if err != nil {
		writeUploadError(w, err)
		return
	}
	old, err := s.Portal.SetAvatar(r.Context(), id, &rel)
	if err != nil {
		s.removeMedia(rel)
		log.Printf("set avatar: %v", err)
		writeError(w, http.StatusInternalServerError, "could not save your photo")
		return
	}
	if old != nil {
		s.removeMedia(*old)
	}
	s.studentMe(w, r)
}

// studentDeleteAvatar removes the profile photo.
func (s *Server) studentDeleteAvatar(w http.ResponseWriter, r *http.Request) {
	old, err := s.Portal.SetAvatar(r.Context(), studentFrom(r).StudentID, nil)
	if err != nil {
		log.Printf("delete avatar: %v", err)
		writeError(w, http.StatusInternalServerError, "could not remove your photo")
		return
	}
	if old != nil {
		s.removeMedia(*old)
	}
	s.studentMe(w, r)
}

// studentAvatar serves the signed-in student's own photo. It is private, so it is not cached by
// shared caches.
func (s *Server) studentAvatar(w http.ResponseWriter, r *http.Request) {
	rel, err := s.Portal.AvatarPath(r.Context(), studentFrom(r).StudentID)
	if err != nil {
		log.Printf("avatar path: %v", err)
		writeError(w, http.StatusInternalServerError, "could not load your photo")
		return
	}
	if rel == "" {
		writeError(w, http.StatusNotFound, "no profile photo")
		return
	}
	w.Header().Set("Cache-Control", "private, no-cache")
	http.ServeFile(w, r, filepath.Join(s.Cfg.MediaDir, filepath.FromSlash(path.Clean("/"+rel))))
}

// studentLanguages lists the languages a student can choose in their profile.
func (s *Server) studentLanguages(w http.ResponseWriter, r *http.Request) {
	type lang struct {
		Code string `json:"code"`
		Name string `json:"name"`
	}
	list := make([]lang, 0, len(portal.Languages))
	for c, n := range portal.Languages {
		list = append(list, lang{c, n})
	}
	sort.Slice(list, func(i, j int) bool { return list[i].Name < list[j].Name })
	writeJSON(w, http.StatusOK, map[string]any{"items": list})
}
