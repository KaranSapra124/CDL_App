package httpapi

import (
	"bytes"
	"crypto/rand"
	"encoding/hex"
	"errors"
	"fmt"
	"io"
	"log"
	"mime/multipart"
	"net/http"
	"os"
	"path"
	"path/filepath"
	"strings"

	"github.com/go-chi/chi/v5"
)

// Accepted file types, found by reading the file's first bytes (not the file name or the client's claim).
var (
	videoTypes = map[string]string{
		"video/mp4":       ".mp4",
		"video/quicktime": ".mov",
		"video/webm":      ".webm",
	}
	imageTypes = map[string]string{
		"image/jpeg": ".jpg",
		"image/png":  ".png",
		"image/webp": ".webp",
	}
)

var errUnsupportedType = errors.New("unsupported file type")

// randomName returns a 32-character random hex string for file names.
func randomName() string {
	b := make([]byte, 16)
	_, _ = rand.Read(b)
	return hex.EncodeToString(b)
}

// saveUpload streams one uploaded file into MediaDir and returns its path relative to MediaDir.
// It sniffs the first 512 bytes to check the real type, writes to a temporary file, and renames
// it into place only when the copy has finished, so a half-written upload never looks complete.
func (s *Server) saveUpload(src io.Reader, subdir string, allowed map[string]string) (string, int64, error) {
	head := make([]byte, 512)
	n, err := io.ReadFull(src, head)
	if err != nil && !errors.Is(err, io.ErrUnexpectedEOF) && !errors.Is(err, io.EOF) {
		return "", 0, err
	}
	head = head[:n]

	ext, ok := allowed[http.DetectContentType(head)]
	if !ok {
		return "", 0, errUnsupportedType
	}

	tmpDir := filepath.Join(s.Cfg.MediaDir, "tmp")
	if err := os.MkdirAll(tmpDir, 0o755); err != nil {
		return "", 0, err
	}
	tmp, err := os.CreateTemp(tmpDir, "upload-*")
	if err != nil {
		return "", 0, err
	}
	tmpPath := tmp.Name()
	defer os.Remove(tmpPath) // no-op once the file has been renamed away

	size, err := io.Copy(tmp, io.MultiReader(bytes.NewReader(head), src))
	closeErr := tmp.Close()
	if err != nil {
		return "", 0, err
	}
	if closeErr != nil {
		return "", 0, closeErr
	}

	rel := path.Join(subdir, randomName()+ext)
	finalPath := filepath.Join(s.Cfg.MediaDir, filepath.FromSlash(rel))
	if err := os.MkdirAll(filepath.Dir(finalPath), 0o755); err != nil {
		return "", 0, err
	}
	if err := os.Rename(tmpPath, finalPath); err != nil {
		return "", 0, err
	}
	return rel, size, nil
}

// removeMedia deletes a file that the database no longer references. Paths that escape
// MediaDir are refused. A file that is already gone is not an error.
func (s *Server) removeMedia(rel string) {
	clean := path.Clean(rel)
	if clean == "." || strings.HasPrefix(clean, "..") || path.IsAbs(clean) {
		log.Printf("refusing to remove unsafe media path %q", rel)
		return
	}
	full := filepath.Join(s.Cfg.MediaDir, filepath.FromSlash(clean))
	if err := os.Remove(full); err != nil && !errors.Is(err, os.ErrNotExist) {
		log.Printf("remove media %s: %v", full, err)
	}
}

// findPart walks a multipart body and returns the part with the given form field name.
func findPart(mr *multipart.Reader, field string) (*multipart.Part, error) {
	for {
		part, err := mr.NextPart()
		if err != nil {
			return nil, err
		}
		if part.FormName() == field {
			return part, nil
		}
		_ = part.Close()
	}
}

// writeUploadError maps upload failures to HTTP status codes.
func writeUploadError(w http.ResponseWriter, err error) {
	var tooLarge *http.MaxBytesError
	switch {
	case errors.As(err, &tooLarge):
		writeError(w, http.StatusRequestEntityTooLarge, "the file is larger than the allowed size")
	case errors.Is(err, errUnsupportedType):
		writeError(w, http.StatusUnsupportedMediaType, "unsupported file type")
	case errors.Is(err, io.EOF), errors.Is(err, io.ErrUnexpectedEOF):
		writeError(w, http.StatusBadRequest, "the upload ended early")
	default:
		log.Printf("upload: %v", err)
		writeError(w, http.StatusInternalServerError, "upload failed")
	}
}

// uploadModuleVideo accepts one video file for a module, multipart field "video".
// Re-uploading replaces the old file. Transcoding to HLS is a separate step that runs later.
func (s *Server) uploadModuleVideo(w http.ResponseWriter, r *http.Request) {
	id, ok := parseID(r, "id")
	if !ok {
		writeError(w, http.StatusBadRequest, "invalid module id")
		return
	}
	if _, err := s.Courses.GetModule(r.Context(), id); err != nil {
		s.writeCourseError(w, err, "could not load module")
		return
	}

	r.Body = http.MaxBytesReader(w, r.Body, s.Cfg.MaxVideoBytes)
	mr, err := r.MultipartReader()
	if err != nil {
		writeError(w, http.StatusBadRequest, "send the video as multipart form data in a field named 'video'")
		return
	}
	part, err := findPart(mr, "video")
	if err != nil {
		writeUploadError(w, err)
		return
	}
	defer part.Close()

	rel, size, err := s.saveUpload(part, fmt.Sprintf("originals/module-%d", id), videoTypes)
	if err != nil {
		writeUploadError(w, err)
		return
	}

	oldPath, err := s.Courses.SetModuleVideo(r.Context(), id, rel, size)
	if err != nil {
		s.removeMedia(rel) // the database did not accept it, so do not keep the file
		s.writeCourseError(w, err, "could not save video")
		return
	}
	if oldPath != nil {
		s.removeMedia(*oldPath)
	}

	module, err := s.Courses.GetModule(r.Context(), id)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "video saved but module could not be loaded")
		return
	}
	writeJSON(w, http.StatusOK, module)
}

// uploadCourseThumbnail accepts a JPEG, PNG or WebP image, multipart field "thumbnail".
func (s *Server) uploadCourseThumbnail(w http.ResponseWriter, r *http.Request) {
	id, ok := parseID(r, "id")
	if !ok {
		writeError(w, http.StatusBadRequest, "invalid course id")
		return
	}

	const maxImageBytes = 10 << 20 // 10 MiB
	r.Body = http.MaxBytesReader(w, r.Body, maxImageBytes)
	mr, err := r.MultipartReader()
	if err != nil {
		writeError(w, http.StatusBadRequest, "send the image as multipart form data in a field named 'thumbnail'")
		return
	}
	part, err := findPart(mr, "thumbnail")
	if err != nil {
		writeUploadError(w, err)
		return
	}
	defer part.Close()

	rel, _, err := s.saveUpload(part, fmt.Sprintf("thumbnails/course-%d", id), imageTypes)
	if err != nil {
		writeUploadError(w, err)
		return
	}

	oldPath, err := s.Courses.SetThumbnail(r.Context(), id, rel)
	if err != nil {
		s.removeMedia(rel)
		s.writeCourseError(w, err, "could not save thumbnail")
		return
	}
	if oldPath != nil {
		s.removeMedia(*oldPath)
	}
	s.writeCourse(w, r, id, http.StatusOK)
}

// serveHLS serves a ready module's stream files (master.m3u8, variant playlists, segments) to admins.
// It is for checking the output; student playback gets its own signed access later.
func (s *Server) serveHLS(w http.ResponseWriter, r *http.Request) {
	id, ok := parseID(r, "id")
	if !ok {
		writeError(w, http.StatusBadRequest, "invalid module id")
		return
	}
	module, err := s.Courses.GetModule(r.Context(), id)
	if err != nil {
		s.writeCourseError(w, err, "could not load module")
		return
	}
	if module.VideoStatus != "ready" {
		writeError(w, http.StatusNotFound, "this video is not ready yet")
		return
	}

	// The requested file must sit inside this module's stream folder.
	rel := path.Clean("/" + chi.URLParam(r, "*"))
	if rel == "/" {
		rel = "/master.m3u8"
	}
	root := filepath.Join(s.Cfg.MediaDir, "hls", fmt.Sprintf("module-%d", id))
	full := filepath.Join(root, filepath.FromSlash(rel))
	if !strings.HasPrefix(full, root+string(filepath.Separator)) {
		writeError(w, http.StatusBadRequest, "invalid path")
		return
	}
	http.ServeFile(w, r, full)
}

// serveThumbnail returns the course thumbnail file so the admin can preview it.
func (s *Server) serveThumbnail(w http.ResponseWriter, r *http.Request) {
	id, ok := parseID(r, "id")
	if !ok {
		writeError(w, http.StatusBadRequest, "invalid course id")
		return
	}
	rel, err := s.Courses.ThumbnailPath(r.Context(), id)
	if err != nil {
		s.writeCourseError(w, err, "could not load thumbnail")
		return
	}
	if rel == "" {
		writeError(w, http.StatusNotFound, "no thumbnail")
		return
	}
	full := filepath.Join(s.Cfg.MediaDir, filepath.FromSlash(path.Clean(rel)))
	http.ServeFile(w, r, full)
}
