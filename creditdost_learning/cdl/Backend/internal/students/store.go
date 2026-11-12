// Package students holds the admin's student queries: the directory, the detail view,
// manual enrolment, certificates and device sessions.
package students

import (
	"context"
	"crypto/rand"
	"encoding/hex"
	"errors"
	"fmt"
	"strings"
	"time"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgconn"
	"github.com/jackc/pgx/v5/pgxpool"
)

var (
	ErrNotFound         = errors.New("not found")
	ErrAlreadyEnrolled  = errors.New("student is already enrolled in this course")
	ErrCourseNotLive    = errors.New("course must be published before enrolling students")
	ErrNotEnrolled      = errors.New("student is not enrolled in this course")
	ErrCertificateExist = errors.New("a certificate for this course already exists")
	ErrContactMismatch  = errors.New("the email and mobile belong to two different students")
	ErrNeedsName        = errors.New("name is required to create a new student")
	ErrNeedsContact     = errors.New("email or mobile is required")
)

type Store struct {
	DB *pgxpool.Pool
}

// ---------- Directory ----------

type ListFilter struct {
	Status   string // all | paid | unpaid | certified
	Query    string
	CourseID int64
	Page     int
	Limit    int // 0 = no paging (used by CSV export)
}

type ListItem struct {
	ID                int64     `json:"id"`
	Name              string    `json:"name"`
	Email             *string   `json:"email"`
	Mobile            *string   `json:"mobile"`
	City              string    `json:"city"`
	State             string    `json:"state"`
	PreferredLanguage string    `json:"preferredLanguage"`
	RegisteredAt      time.Time `json:"registeredAt"`
	Enrollments       int64     `json:"enrollments"`
	Certificates      int64     `json:"certificates"`
	PaidPaise         int64     `json:"paidPaise"`
	LastActivityAt    time.Time `json:"lastActivityAt"`
	Status            string    `json:"status"` // paid | unpaid
}

type ListResult struct {
	Items   []ListItem       `json:"items"`
	Total   int64            `json:"total"`
	Page    int              `json:"page"`
	Limit   int              `json:"limit"`
	Counts  map[string]int64 `json:"counts"`
	Summary Summary          `json:"summary"`
}

type Summary struct {
	Registered   int64 `json:"registered"`
	Paid         int64 `json:"paid"`
	Unpaid       int64 `json:"unpaid"`
	Certified    int64 `json:"certified"`
	RevenuePaise int64 `json:"revenuePaise"`
}

const directoryFrom = `
	from students st
	left join lateral (select count(*)::bigint n from enrollments e where e.student_id = st.id) enr on true
	left join lateral (select count(*)::bigint n from certificates c where c.student_id = st.id) certs on true
	left join lateral (select coalesce(sum(o.total_paise) filter (where o.status = 'paid'), 0)::bigint paid
	                   from orders o where o.student_id = st.id) pays on true
	left join lateral (select greatest(st.created_at,
	                     (select max(s.last_seen_at) from sessions s where s.student_id = st.id),
	                     (select max(mp.updated_at) from module_progress mp where mp.student_id = st.id)) last_at) act on true`

// List returns one page of the directory plus tab counts and the summary.
func (s *Store) List(ctx context.Context, f ListFilter) (ListResult, error) {
	res := ListResult{Page: f.Page, Limit: f.Limit, Counts: map[string]int64{}}
	if f.Page <= 0 {
		f.Page = 1
	}
	if f.Limit < 0 {
		f.Limit = 0
	}

	where := `
		where ($1 = 'all'
		       or ($1 = 'paid' and enr.n > 0)
		       or ($1 = 'unpaid' and enr.n = 0)
		       or ($1 = 'certified' and certs.n > 0))
		  and ($2 = '' or st.name ilike '%' || $2 || '%' or st.email ilike '%' || $2 || '%'
		       or st.mobile like '%' || $2 || '%')
		  and ($3::bigint = 0 or exists (select 1 from enrollments e
		                                  where e.student_id = st.id and e.course_id = $3))`

	limitClause := ""
	args := []any{f.Status, strings.TrimSpace(f.Query), f.CourseID}
	if f.Limit > 0 {
		limitClause = " limit $4 offset $5"
		args = append(args, f.Limit, (f.Page-1)*f.Limit)
	}

	rows, err := s.DB.Query(ctx, `
		select st.id, st.name, st.email, st.mobile, st.city, st.state, st.preferred_language,
		       st.created_at, enr.n, certs.n, pays.paid, act.last_at,
		       count(*) over()`+directoryFrom+where+`
		order by st.created_at desc, st.id desc`+limitClause, args...)
	if err != nil {
		return res, fmt.Errorf("list students: %w", err)
	}
	defer rows.Close()

	res.Items = []ListItem{}
	for rows.Next() {
		var it ListItem
		if err := rows.Scan(&it.ID, &it.Name, &it.Email, &it.Mobile, &it.City, &it.State,
			&it.PreferredLanguage, &it.RegisteredAt, &it.Enrollments, &it.Certificates,
			&it.PaidPaise, &it.LastActivityAt, &res.Total); err != nil {
			return res, err
		}
		it.Status = "unpaid"
		if it.Enrollments > 0 {
			it.Status = "paid"
		}
		res.Items = append(res.Items, it)
	}
	if err := rows.Err(); err != nil {
		return res, err
	}

	// Tab counts and summary are over all students, not just the current filter.
	err = s.DB.QueryRow(ctx, `
		select count(*)::bigint,
		       count(*) filter (where enr.n > 0)::bigint,
		       count(*) filter (where enr.n = 0)::bigint,
		       count(*) filter (where certs.n > 0)::bigint,
		       coalesce(sum(pays.paid), 0)::bigint`+directoryFrom).
		Scan(&res.Summary.Registered, &res.Summary.Paid, &res.Summary.Unpaid,
			&res.Summary.Certified, &res.Summary.RevenuePaise)
	if err != nil {
		return res, err
	}
	res.Counts = map[string]int64{
		"all":       res.Summary.Registered,
		"paid":      res.Summary.Paid,
		"unpaid":    res.Summary.Unpaid,
		"certified": res.Summary.Certified,
	}
	return res, nil
}

// ---------- Detail ----------

type Profile struct {
	ID                int64     `json:"id"`
	Name              string    `json:"name"`
	Email             *string   `json:"email"`
	Mobile            *string   `json:"mobile"`
	City              string    `json:"city"`
	State             string    `json:"state"`
	PreferredLanguage string    `json:"preferredLanguage"`
	RegisteredAt      time.Time `json:"registeredAt"`
	LastActivityAt    time.Time `json:"lastActivityAt"`
}

type Module struct {
	ID              int64  `json:"id"`
	ModuleNumber    int    `json:"moduleNumber"`
	Title           string `json:"title"`
	DurationSeconds *int   `json:"durationSeconds"`
	Completed       bool   `json:"completed"`
	WatchedSeconds  int    `json:"watchedSeconds"`
}

type Enrollment struct {
	ID               int64     `json:"id"`
	CourseID         int64     `json:"courseId"`
	CourseTitle      string    `json:"courseTitle"`
	Source           string    `json:"source"`
	EnrolledAt       time.Time `json:"enrolledAt"`
	TotalModules     int64     `json:"totalModules"`
	CompletedModules int64     `json:"completedModules"`
	Certified        bool      `json:"certified"`
	Modules          []Module  `json:"modules"`
}

type Payment struct {
	ID               int64     `json:"id"`
	Code             string    `json:"code"`
	CourseTitle      string    `json:"courseTitle"`
	BasePaise        int64     `json:"basePaise"`
	DiscountPaise    int64     `json:"discountPaise"`
	GSTPaise         int64     `json:"gstPaise"`
	TotalPaise       int64     `json:"totalPaise"`
	Status           string    `json:"status"`
	Gateway          string    `json:"gateway"`
	GatewayPaymentID *string   `json:"gatewayPaymentId"`
	ManualMethod     *string   `json:"manualMethod"`
	ManualReference  *string   `json:"manualReference"`
	CreatedAt        time.Time `json:"createdAt"`
}

type Certificate struct {
	ID          int64     `json:"id"`
	Code        string    `json:"code"`
	CourseID    int64     `json:"courseId"`
	CourseTitle string    `json:"courseTitle"`
	IssuedAt    time.Time `json:"issuedAt"`
}

type Session struct {
	ID          int64     `json:"id"`
	DeviceLabel string    `json:"deviceLabel"`
	IPAddress   string    `json:"ipAddress"`
	CreatedAt   time.Time `json:"createdAt"`
	LastSeenAt  time.Time `json:"lastSeenAt"`
}

type Detail struct {
	Profile        Profile       `json:"profile"`
	Enrollments    []Enrollment  `json:"enrollments"`
	Payments       []Payment     `json:"payments"`
	Certificates   []Certificate `json:"certificates"`
	Sessions       []Session     `json:"sessions"`
	TotalPaidPaise int64         `json:"totalPaidPaise"`
	CompletionPct  float64       `json:"completionPct"` // completed modules / total modules across enrolments
	DeviceLimit    int           `json:"deviceLimit"`
}

// DeviceLimit is the PRD's concurrent-device allowance per student.
const DeviceLimit = 2

// Get loads everything the detail page shows for one student.
func (s *Store) Get(ctx context.Context, id int64) (Detail, error) {
	var d Detail
	d.DeviceLimit = DeviceLimit
	err := s.DB.QueryRow(ctx, `
		select st.id, st.name, st.email, st.mobile, st.city, st.state, st.preferred_language,
		       st.created_at,
		       greatest(st.created_at,
		         (select max(last_seen_at) from sessions where student_id = st.id),
		         (select max(updated_at) from module_progress where student_id = st.id))
		from students st where st.id = $1`, id).
		Scan(&d.Profile.ID, &d.Profile.Name, &d.Profile.Email, &d.Profile.Mobile, &d.Profile.City,
			&d.Profile.State, &d.Profile.PreferredLanguage, &d.Profile.RegisteredAt, &d.Profile.LastActivityAt)
	if errors.Is(err, pgx.ErrNoRows) {
		return d, ErrNotFound
	}
	if err != nil {
		return d, err
	}

	// Enrolments with course titles and completion counts.
	d.Enrollments = []Enrollment{}
	rows, err := s.DB.Query(ctx, `
		select e.id, e.course_id, c.title, e.source, e.created_at,
		       (select count(*) from modules m where m.course_id = e.course_id)::bigint,
		       (select count(*) from module_progress mp join modules m on m.id = mp.module_id
		         where mp.student_id = e.student_id and m.course_id = e.course_id and mp.completed)::bigint,
		       exists (select 1 from certificates cert where cert.student_id = e.student_id and cert.course_id = e.course_id)
		from enrollments e join courses c on c.id = e.course_id
		where e.student_id = $1
		order by e.created_at desc`, id)
	if err != nil {
		return d, err
	}
	for rows.Next() {
		var en Enrollment
		if err := rows.Scan(&en.ID, &en.CourseID, &en.CourseTitle, &en.Source, &en.EnrolledAt,
			&en.TotalModules, &en.CompletedModules, &en.Certified); err != nil {
			rows.Close()
			return d, err
		}
		en.Modules = []Module{}
		d.Enrollments = append(d.Enrollments, en)
	}
	rows.Close()

	// Module-level progress for every enrolled course, attached to its enrolment.
	mrows, err := s.DB.Query(ctx, `
		select m.course_id, m.id, m.module_number, m.title, m.duration_seconds,
		       coalesce(mp.completed, false), coalesce(mp.watched_seconds, 0)
		from modules m
		join enrollments e on e.course_id = m.course_id and e.student_id = $1
		left join module_progress mp on mp.module_id = m.id and mp.student_id = $1
		order by m.course_id, m.module_number`, id)
	if err != nil {
		return d, err
	}
	byCourse := map[int64]*Enrollment{}
	for i := range d.Enrollments {
		byCourse[d.Enrollments[i].CourseID] = &d.Enrollments[i]
	}
	for mrows.Next() {
		var courseID int64
		var m Module
		if err := mrows.Scan(&courseID, &m.ID, &m.ModuleNumber, &m.Title, &m.DurationSeconds,
			&m.Completed, &m.WatchedSeconds); err != nil {
			mrows.Close()
			return d, err
		}
		if en, ok := byCourse[courseID]; ok {
			en.Modules = append(en.Modules, m)
		}
	}
	mrows.Close()

	// Payments, newest first.
	d.Payments = []Payment{}
	prows, err := s.DB.Query(ctx, `
		select o.id, o.base_paise, o.discount_paise, o.gst_paise, o.total_paise, o.status, o.gateway,
		       o.gateway_payment_id, o.manual_method, o.manual_reference, o.created_at, c.title
		from orders o join courses c on c.id = o.course_id
		where o.student_id = $1
		order by o.created_at desc`, id)
	if err != nil {
		return d, err
	}
	for prows.Next() {
		var p Payment
		if err := prows.Scan(&p.ID, &p.BasePaise, &p.DiscountPaise, &p.GSTPaise, &p.TotalPaise,
			&p.Status, &p.Gateway, &p.GatewayPaymentID, &p.ManualMethod, &p.ManualReference,
			&p.CreatedAt, &p.CourseTitle); err != nil {
			prows.Close()
			return d, err
		}
		p.Code = fmt.Sprintf("CD-%d", p.ID)
		if p.Status == "paid" {
			d.TotalPaidPaise += p.TotalPaise
		}
		d.Payments = append(d.Payments, p)
	}
	prows.Close()

	// Certificates.
	d.Certificates = []Certificate{}
	crows, err := s.DB.Query(ctx, `
		select cert.id, cert.certificate_code, cert.course_id, c.title, cert.issued_at
		from certificates cert join courses c on c.id = cert.course_id
		where cert.student_id = $1 order by cert.issued_at desc`, id)
	if err != nil {
		return d, err
	}
	for crows.Next() {
		var c Certificate
		if err := crows.Scan(&c.ID, &c.Code, &c.CourseID, &c.CourseTitle, &c.IssuedAt); err != nil {
			crows.Close()
			return d, err
		}
		d.Certificates = append(d.Certificates, c)
	}
	crows.Close()

	// Active sessions (devices).
	d.Sessions = []Session{}
	srows, err := s.DB.Query(ctx, `
		select id, device_label, ip_address, created_at, last_seen_at
		from sessions where student_id = $1 and revoked_at is null
		order by last_seen_at desc`, id)
	if err != nil {
		return d, err
	}
	for srows.Next() {
		var se Session
		if err := srows.Scan(&se.ID, &se.DeviceLabel, &se.IPAddress, &se.CreatedAt, &se.LastSeenAt); err != nil {
			srows.Close()
			return d, err
		}
		d.Sessions = append(d.Sessions, se)
	}
	srows.Close()

	var done, total int64
	for _, en := range d.Enrollments {
		done += en.CompletedModules
		total += en.TotalModules
	}
	if total > 0 {
		d.CompletionPct = float64(done) * 100 / float64(total)
	}
	return d, nil
}

// ---------- Manual enrolment ----------

type ManualEnrollInput struct {
	Name      string
	Email     string
	Mobile    string
	CourseID  int64
	Method    string // e.g. "cash", "bank transfer", "offline UPI"
	Reference string
}

type ManualEnrollResult struct {
	StudentID int64  `json:"studentId"`
	OrderID   int64  `json:"orderId"`
	Created   bool   `json:"createdStudent"`
	Course    string `json:"course"`
}

// ManualEnroll records an offline payment, creates the student if needed, and grants course access.
// It runs in one transaction, so a failure leaves nothing half-done.
func (s *Store) ManualEnroll(ctx context.Context, in ManualEnrollInput) (ManualEnrollResult, error) {
	var res ManualEnrollResult
	in.Email = strings.ToLower(strings.TrimSpace(in.Email))
	in.Mobile = strings.TrimSpace(in.Mobile)
	in.Name = strings.TrimSpace(in.Name)

	if in.Email == "" && in.Mobile == "" {
		return res, ErrNeedsContact
	}

	tx, err := s.DB.Begin(ctx)
	if err != nil {
		return res, err
	}
	defer tx.Rollback(ctx) //nolint:errcheck

	// Course must be published, and its price is what the order records.
	var courseStatus, courseTitle string
	var price int64
	err = tx.QueryRow(ctx, `select status, title, price_paise from courses where id = $1`, in.CourseID).
		Scan(&courseStatus, &courseTitle, &price)
	if errors.Is(err, pgx.ErrNoRows) {
		return res, ErrNotFound
	}
	if err != nil {
		return res, err
	}
	if courseStatus != "active" {
		return res, ErrCourseNotLive
	}
	res.Course = courseTitle

	// Find an existing student by email or mobile.
	var byEmail, byMobile *int64
	if in.Email != "" {
		var id int64
		if err := tx.QueryRow(ctx, `select id from students where lower(email) = $1`, in.Email).Scan(&id); err == nil {
			byEmail = &id
		} else if !errors.Is(err, pgx.ErrNoRows) {
			return res, err
		}
	}
	if in.Mobile != "" {
		var id int64
		if err := tx.QueryRow(ctx, `select id from students where mobile = $1`, in.Mobile).Scan(&id); err == nil {
			byMobile = &id
		} else if !errors.Is(err, pgx.ErrNoRows) {
			return res, err
		}
	}
	if byEmail != nil && byMobile != nil && *byEmail != *byMobile {
		return res, ErrContactMismatch
	}

	var studentID int64
	switch {
	case byEmail != nil:
		studentID = *byEmail
	case byMobile != nil:
		studentID = *byMobile
	default:
		if in.Name == "" {
			return res, ErrNeedsName
		}
		err := tx.QueryRow(ctx, `
			insert into students (name, email, mobile) values ($1, nullif($2, ''), nullif($3, ''))
			returning id`, in.Name, in.Email, in.Mobile).Scan(&studentID)
		if err != nil {
			return res, err
		}
		res.Created = true
	}
	res.StudentID = studentID

	// Already enrolled? Check before inserting so the message is clear.
	var exists bool
	if err := tx.QueryRow(ctx, `
		select exists(select 1 from enrollments where student_id = $1 and course_id = $2)`,
		studentID, in.CourseID).Scan(&exists); err != nil {
		return res, err
	}
	if exists {
		return res, ErrAlreadyEnrolled
	}

	err = tx.QueryRow(ctx, `
		insert into orders (student_id, course_id, base_paise, discount_paise, gst_paise, total_paise,
		                    status, gateway, gateway_payment_id, manual_method, manual_reference, paid_at)
		values ($1, $2, $3, 0, 0, $3, 'paid', 'manual', $4, $5, $4, now())
		returning id`,
		studentID, in.CourseID, price, in.Reference, in.Method).Scan(&res.OrderID)
	if err != nil {
		return res, err
	}

	if _, err := tx.Exec(ctx, `
		insert into enrollments (student_id, course_id, source) values ($1, $2, 'manual')`,
		studentID, in.CourseID); err != nil {
		return res, err
	}

	var who string
	if err := tx.QueryRow(ctx, `select name from students where id = $1`, studentID).Scan(&who); err != nil {
		return res, err
	}
	if _, err := tx.Exec(ctx, `
		insert into activity_events (kind, message) values ('manual_enrollment', $1)`,
		fmt.Sprintf("%s enrolled in %s (manual, %s)", who, courseTitle, in.Method)); err != nil {
		return res, err
	}

	return res, tx.Commit(ctx)
}

// ---------- Certificates and sessions ----------

// IssueCertificate creates a completion certificate for a student who is enrolled in the course.
func (s *Store) IssueCertificate(ctx context.Context, studentID, courseID int64) (Certificate, error) {
	var c Certificate
	var enrolled bool
	if err := s.DB.QueryRow(ctx, `
		select exists(select 1 from enrollments where student_id = $1 and course_id = $2)`,
		studentID, courseID).Scan(&enrolled); err != nil {
		return c, err
	}
	if !enrolled {
		return c, ErrNotEnrolled
	}

	code := "CDL-" + strings.ToUpper(randomHex(6))
	err := s.DB.QueryRow(ctx, `
		insert into certificates (certificate_code, student_id, course_id)
		values ($1, $2, $3)
		returning id, certificate_code, course_id, issued_at`, code, studentID, courseID).
		Scan(&c.ID, &c.Code, &c.CourseID, &c.IssuedAt)
	var pgErr *pgconn.PgError
	if errors.As(err, &pgErr) && pgErr.Code == "23505" {
		return c, ErrCertificateExist
	}
	if err != nil {
		return c, err
	}
	err = s.DB.QueryRow(ctx, `select title from courses where id = $1`, courseID).Scan(&c.CourseTitle)
	return c, err
}

// RevokeAllSessions signs the student out everywhere. It returns how many sessions were ended.
func (s *Store) RevokeAllSessions(ctx context.Context, studentID int64) (int64, error) {
	var exists bool
	if err := s.DB.QueryRow(ctx, `select exists(select 1 from students where id = $1)`, studentID).Scan(&exists); err != nil {
		return 0, err
	}
	if !exists {
		return 0, ErrNotFound
	}
	tag, err := s.DB.Exec(ctx, `
		update sessions set revoked_at = now() where student_id = $1 and revoked_at is null`, studentID)
	if err != nil {
		return 0, err
	}
	return tag.RowsAffected(), nil
}

func randomHex(n int) string {
	b := make([]byte, n)
	_, _ = rand.Read(b)
	return hex.EncodeToString(b)
}
