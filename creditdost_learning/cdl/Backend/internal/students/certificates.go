package students

import (
	"context"
	"errors"
	"time"

	"github.com/jackc/pgx/v5"
)

// CertificateRow is one issued certificate, for the certificates list and the PDF.
type CertificateRow struct {
	ID          int64     `json:"id"`
	Code        string    `json:"code"`
	StudentID   int64     `json:"studentId"`
	StudentName string    `json:"studentName"`
	CourseID    int64     `json:"courseId"`
	CourseTitle string    `json:"courseTitle"`
	IssuedAt    time.Time `json:"issuedAt"`
}

type CertificateList struct {
	Items []CertificateRow `json:"items"`
	Total int64            `json:"total"`
	Page  int              `json:"page"`
	Limit int              `json:"limit"`
}

// ListCertificates returns issued certificates, newest first, filtered by name, course or code.
func (s *Store) ListCertificates(ctx context.Context, q string, page, limit int) (CertificateList, error) {
	if page <= 0 {
		page = 1
	}
	if limit <= 0 || limit > 100 {
		limit = 10
	}
	res := CertificateList{Page: page, Limit: limit}
	rows, err := s.DB.Query(ctx, `
		select cert.id, cert.certificate_code, st.id, st.name, c.id, c.title, cert.issued_at,
		       count(*) over()
		from certificates cert
		join students st on st.id = cert.student_id
		join courses c on c.id = cert.course_id
		where ($1 = '' or st.name ilike '%' || $1 || '%' or c.title ilike '%' || $1 || '%'
		       or cert.certificate_code ilike '%' || $1 || '%')
		order by cert.issued_at desc, cert.id desc
		limit $2 offset $3`, q, limit, (page-1)*limit)
	if err != nil {
		return res, err
	}
	defer rows.Close()
	res.Items = []CertificateRow{}
	for rows.Next() {
		var c CertificateRow
		if err := rows.Scan(&c.ID, &c.Code, &c.StudentID, &c.StudentName, &c.CourseID, &c.CourseTitle,
			&c.IssuedAt, &res.Total); err != nil {
			return res, err
		}
		res.Items = append(res.Items, c)
	}
	return res, rows.Err()
}

// CertificateByCode returns one certificate, or ErrNotFound.
func (s *Store) CertificateByCode(ctx context.Context, code string) (CertificateRow, error) {
	var c CertificateRow
	err := s.DB.QueryRow(ctx, `
		select cert.id, cert.certificate_code, st.id, st.name, c.id, c.title, cert.issued_at
		from certificates cert
		join students st on st.id = cert.student_id
		join courses c on c.id = cert.course_id
		where cert.certificate_code = $1`, code).
		Scan(&c.ID, &c.Code, &c.StudentID, &c.StudentName, &c.CourseID, &c.CourseTitle, &c.IssuedAt)
	if errors.Is(err, pgx.ErrNoRows) {
		return c, ErrNotFound
	}
	return c, err
}
