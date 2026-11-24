package httpapi

import (
	"bytes"
	"fmt"
	"log"
	"net/http"
	"strconv"
	"time"

	"github.com/go-chi/chi/v5"
	"github.com/go-pdf/fpdf"

	"creditdost/backend/internal/students"
)

// listCertificates returns issued certificates with search and paging.
func (s *Server) listCertificates(w http.ResponseWriter, r *http.Request) {
	q := r.URL.Query()
	page, _ := strconv.Atoi(q.Get("page"))
	limit, _ := strconv.Atoi(q.Get("limit"))
	res, err := s.Students.ListCertificates(r.Context(), q.Get("q"), page, limit)
	if err != nil {
		log.Printf("list certificates: %v", err)
		writeError(w, http.StatusInternalServerError, "could not load certificates")
		return
	}
	writeJSON(w, http.StatusOK, res)
}

// certificatePDF renders a completion certificate with the student's name, the course, the date and the code.
// The design is a plain placeholder until the official template is supplied.
func (s *Server) certificatePDF(w http.ResponseWriter, r *http.Request) {
	code := chi.URLParam(r, "code")
	cert, err := s.Students.CertificateByCode(r.Context(), code)
	if err == students.ErrNotFound {
		writeError(w, http.StatusNotFound, "certificate not found")
		return
	}
	if err != nil {
		log.Printf("certificate lookup: %v", err)
		writeError(w, http.StatusInternalServerError, "could not load the certificate")
		return
	}

	pdf := fpdf.New("L", "mm", "A4", "")
	pdf.SetAutoPageBreak(false, 0)
	pdf.AddPage()
	w_, _ := pdf.GetPageSize()

	pdf.SetDrawColor(79, 70, 229)
	pdf.SetLineWidth(1.2)
	pdf.Rect(10, 10, w_-20, 190, "D")

	pdf.SetFont("Helvetica", "B", 34)
	pdf.SetXY(0, 45)
	pdf.CellFormat(w_, 15, "Certificate of Completion", "", 0, "C", false, 0, "")

	pdf.SetFont("Helvetica", "", 16)
	pdf.SetXY(0, 75)
	pdf.CellFormat(w_, 10, "This certifies that", "", 0, "C", false, 0, "")

	pdf.SetFont("Helvetica", "B", 30)
	pdf.SetXY(0, 90)
	pdf.CellFormat(w_, 14, cert.StudentName, "", 0, "C", false, 0, "")

	pdf.SetFont("Helvetica", "", 16)
	pdf.SetXY(0, 110)
	pdf.CellFormat(w_, 10, "has successfully completed", "", 0, "C", false, 0, "")

	pdf.SetFont("Helvetica", "B", 22)
	pdf.SetXY(0, 124)
	pdf.CellFormat(w_, 12, cert.CourseTitle, "", 0, "C", false, 0, "")

	pdf.SetFont("Helvetica", "", 12)
	pdf.SetXY(20, 172)
	pdf.CellFormat(0, 8, "Issued "+cert.IssuedAt.Format("02 January 2006"), "", 0, "L", false, 0, "")
	pdf.SetXY(0, 172)
	pdf.CellFormat(w_-20, 8, "Certificate ID: "+cert.Code, "", 0, "R", false, 0, "")

	var buf bytes.Buffer
	if err := pdf.Output(&buf); err != nil {
		log.Printf("render certificate: %v", err)
		writeError(w, http.StatusInternalServerError, "could not create the PDF")
		return
	}

	w.Header().Set("Content-Type", "application/pdf")
	w.Header().Set("Content-Disposition",
		fmt.Sprintf(`attachment; filename="certificate-%s-%s.pdf"`, cert.Code, time.Now().Format("2006-01-02")))
	_, _ = w.Write(buf.Bytes())
}
