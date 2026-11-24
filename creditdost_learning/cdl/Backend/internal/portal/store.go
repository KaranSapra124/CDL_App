// Package portal holds the student-facing queries: registration, login, sessions, the catalogue,
// course pages and stream access. Every query is scoped to the signed-in student.
package portal

import (
	"context"
	"errors"
	"strings"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"

	"creditdost/backend/internal/auth"
)

var (
	ErrEmailTaken      = errors.New("an account with this email already exists. Sign in instead")
	ErrInvalidLogin    = errors.New("invalid email or password")
	ErrSuspended       = errors.New("this account is suspended. Contact support for help")
	ErrNotFound        = errors.New("not found")
	ErrSessionInactive = errors.New("session is no longer active")
	ErrNeedsName       = errors.New("name is required")
	ErrNeedsEmail      = errors.New("a valid email is required")
	ErrWeakPassword    = errors.New("password must be at least 12 characters")
	ErrLongPassword    = errors.New("password must be at most 72 bytes")
	ErrLocked          = errors.New("this lesson is locked. Enrol in the course to watch it")
	ErrNotReady        = errors.New("this lesson is still being prepared")
)

// DeviceLimit is how many devices one student may be signed in on (PRD: 2).
const DeviceLimit = 2

type Store struct {
	DB *pgxpool.Pool
}

// dummyHash is checked when the email is unknown, so timing does not reveal which emails exist.
var dummyHash, _ = auth.HashPassword("timing-equaliser-password")

// Register creates a student account. A manually enrolled student with this email and no password yet
// is claimed: the password is set and the existing record (and its enrolments) is kept.
func (s *Store) Register(ctx context.Context, name, email, password string) (int64, error) {
	name = strings.TrimSpace(name)
	email = strings.ToLower(strings.TrimSpace(email))
	if name == "" {
		return 0, ErrNeedsName
	}
	if email == "" || !strings.Contains(email, "@") {
		return 0, ErrNeedsEmail
	}
	if len(password) < 12 {
		return 0, ErrWeakPassword
	}
	if len(password) > auth.MaxPasswordBytes {
		return 0, ErrLongPassword
	}
	hash, err := auth.HashPassword(password)
	if err != nil {
		return 0, err
	}

	tx, err := s.DB.Begin(ctx)
	if err != nil {
		return 0, err
	}
	defer tx.Rollback(ctx) //nolint:errcheck

	var id int64
	var existingHash *string
	err = tx.QueryRow(ctx, `select id, password_hash from students where lower(email) = $1 for update`, email).
		Scan(&id, &existingHash)
	switch {
	case errors.Is(err, pgx.ErrNoRows):
		if err := tx.QueryRow(ctx, `
			insert into students (name, email, password_hash, password_set_at)
			values ($1, $2, $3, now()) returning id`, name, email, hash).Scan(&id); err != nil {
			return 0, err
		}
	case err != nil:
		return 0, err
	case existingHash != nil:
		return 0, ErrEmailTaken
	default:
		if _, err := tx.Exec(ctx, `
			update students set password_hash = $2, password_set_at = now(), updated_at = now()
			where id = $1`, id, hash); err != nil {
			return 0, err
		}
	}
	return id, tx.Commit(ctx)
}

// Login checks credentials and starts a session. At most DeviceLimit sessions stay active: signing in
// on a new device signs out the oldest one.
func (s *Store) Login(ctx context.Context, email, password, deviceLabel, ip string) (studentID, sessionID int64, err error) {
	email = strings.ToLower(strings.TrimSpace(email))

	var hash *string
	var suspended bool
	err = s.DB.QueryRow(ctx, `
		select id, password_hash, suspended_at is not null from students where lower(email) = $1`, email).
		Scan(&studentID, &hash, &suspended)
	if errors.Is(err, pgx.ErrNoRows) {
		auth.CheckPassword(dummyHash, password)
		return 0, 0, ErrInvalidLogin
	}
	if err != nil {
		return 0, 0, err
	}
	if hash == nil || !auth.CheckPassword(*hash, password) {
		return 0, 0, ErrInvalidLogin
	}
	if suspended {
		return 0, 0, ErrSuspended
	}

	tx, err := s.DB.Begin(ctx)
	if err != nil {
		return 0, 0, err
	}
	defer tx.Rollback(ctx) //nolint:errcheck

	if err := tx.QueryRow(ctx, `
		insert into sessions (student_id, device_label, ip_address)
		values ($1, $2, $3) returning id`, studentID, deviceLabel, ip).Scan(&sessionID); err != nil {
		return 0, 0, err
	}
	if _, err := tx.Exec(ctx, `
		update sessions set revoked_at = now()
		where id in (
		  select id from sessions
		  where student_id = $1 and revoked_at is null
		  order by created_at desc, id desc
		  offset $2)`, studentID, DeviceLimit); err != nil {
		return 0, 0, err
	}
	return studentID, sessionID, tx.Commit(ctx)
}

// CheckSession confirms the session is active and the student is not suspended, and records activity.
// Every student request runs this, so suspension and sign-out take effect on the next request.
func (s *Store) CheckSession(ctx context.Context, sessionID, studentID int64) error {
	var ok bool
	err := s.DB.QueryRow(ctx, `
		update sessions ss set last_seen_at = now()
		from students st
		where ss.id = $1 and ss.student_id = $2 and ss.revoked_at is null
		  and st.id = ss.student_id and st.suspended_at is null
		returning true`, sessionID, studentID).Scan(&ok)
	if errors.Is(err, pgx.ErrNoRows) {
		return ErrSessionInactive
	}
	return err
}

// Logout ends one session.
func (s *Store) Logout(ctx context.Context, sessionID, studentID int64) error {
	_, err := s.DB.Exec(ctx, `
		update sessions set revoked_at = now() where id = $1 and student_id = $2 and revoked_at is null`,
		sessionID, studentID)
	return err
}

type Profile struct {
	ID        int64  `json:"id"`
	Name      string `json:"name"`
	Email     string `json:"email"`
	Mobile    string `json:"mobile"`
	City      string `json:"city"`
	State     string `json:"state"`
	Language  string `json:"preferredLanguage"`
	HasAvatar bool   `json:"hasAvatar"`
}

// Me returns the signed-in student's profile.
func (s *Store) Me(ctx context.Context, studentID int64) (Profile, error) {
	var p Profile
	err := s.DB.QueryRow(ctx, `
		select id, name, coalesce(email, ''), coalesce(mobile, ''), city, state, preferred_language,
		       avatar_path is not null
		from students where id = $1`,
		studentID).Scan(&p.ID, &p.Name, &p.Email, &p.Mobile, &p.City, &p.State, &p.Language, &p.HasAvatar)
	if errors.Is(err, pgx.ErrNoRows) {
		return p, ErrNotFound
	}
	return p, err
}

// CourseCard is one course in the catalogue.
type CourseCard struct {
	ID               int64    `json:"id"`
	Slug             string   `json:"slug"`
	Title            string   `json:"title"`
	Category         *string  `json:"category"`
	Instructors      []string `json:"instructors"`
	PricePaise       int64    `json:"pricePaise"`
	MRPPaise         *int64   `json:"mrpPaise"`
	HasThumbnail     bool     `json:"hasThumbnail"`
	Modules          int64    `json:"modules"`
	FreeModules      int64    `json:"freeModules"`
	Enrolled         bool     `json:"enrolled"`
	CompletedModules int64    `json:"completedModules"`
}

// Catalogue lists published courses the student can see: public ones, plus any they are enrolled in.
func (s *Store) Catalogue(ctx context.Context, studentID int64) ([]CourseCard, error) {
	rows, err := s.DB.Query(ctx, `
		select c.id, c.slug, c.title, cat.name,
		       coalesce((select array_agg(i.name order by ci.position, i.id)
		                 from course_instructors ci join instructors i on i.id = ci.instructor_id
		                 where ci.course_id = c.id), '{}'),
		       c.price_paise, c.mrp_paise, c.thumbnail_path is not null,
		       (select count(*) from modules m where m.course_id = c.id)::bigint,
		       (select count(*) from modules m where m.course_id = c.id and m.is_free_preview)::bigint,
		       exists (select 1 from enrollments e where e.course_id = c.id and e.student_id = $1),
		       (select count(*) from module_progress mp join modules m on m.id = mp.module_id
		         where mp.student_id = $1 and m.course_id = c.id and mp.completed)::bigint
		from courses c
		left join categories cat on cat.id = c.category_id
		where c.status = 'active'
		  and (c.visibility = 'public'
		       or exists (select 1 from enrollments e where e.course_id = c.id and e.student_id = $1))
		order by c.title`, studentID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	list := []CourseCard{}
	for rows.Next() {
		var c CourseCard
		if err := rows.Scan(&c.ID, &c.Slug, &c.Title, &c.Category, &c.Instructors, &c.PricePaise, &c.MRPPaise,
			&c.HasThumbnail, &c.Modules, &c.FreeModules, &c.Enrolled, &c.CompletedModules); err != nil {
			return nil, err
		}
		list = append(list, c)
	}
	return list, rows.Err()
}

// ModuleItem is one lesson. Locked lessons hide their description and progress.
type ModuleItem struct {
	ID              int64  `json:"id"`
	ModuleNumber    int    `json:"moduleNumber"`
	Title           string `json:"title"`
	Description     string `json:"description"`
	DurationSeconds *int   `json:"durationSeconds"`
	IsFreePreview   bool   `json:"isFreePreview"`
	IsNew           bool   `json:"isNew"`
	Ready           bool   `json:"ready"`
	Locked          bool   `json:"locked"`
	Completed       bool   `json:"completed"`
	WatchedSeconds  int    `json:"watchedSeconds"`
}

type CourseDetail struct {
	CourseCard
	Description string       `json:"description"`
	Modules     []ModuleItem `json:"modules"`
}

// Course returns one course for the student. Courses the student may not see return ErrNotFound.
func (s *Store) Course(ctx context.Context, courseID, studentID int64) (CourseDetail, error) {
	var d CourseDetail
	err := s.DB.QueryRow(ctx, `
		select c.id, c.slug, c.title, cat.name, c.description, c.price_paise, c.mrp_paise,
		       c.thumbnail_path is not null,
		       exists (select 1 from enrollments e where e.course_id = c.id and e.student_id = $2)
		from courses c
		left join categories cat on cat.id = c.category_id
		where c.id = $1 and c.status = 'active'
		  and (c.visibility = 'public'
		       or exists (select 1 from enrollments e where e.course_id = c.id and e.student_id = $2))`,
		courseID, studentID).
		Scan(&d.ID, &d.Slug, &d.Title, &d.Category, &d.Description, &d.PricePaise, &d.MRPPaise,
			&d.HasThumbnail, &d.Enrolled)
	if errors.Is(err, pgx.ErrNoRows) {
		return d, ErrNotFound
	}
	if err != nil {
		return d, err
	}

	d.Instructors = []string{}
	if err := s.DB.QueryRow(ctx, `
		select coalesce(array_agg(i.name order by ci.position, i.id), '{}')
		from course_instructors ci join instructors i on i.id = ci.instructor_id
		where ci.course_id = $1`, courseID).Scan(&d.Instructors); err != nil {
		return d, err
	}

	rows, err := s.DB.Query(ctx, `
		select m.id, m.module_number, m.title, m.description, m.duration_seconds,
		       m.is_free_preview, m.is_new, m.video_status = 'ready',
		       coalesce(mp.completed, false), coalesce(mp.watched_seconds, 0)
		from modules m
		left join module_progress mp on mp.module_id = m.id and mp.student_id = $2
		where m.course_id = $1
		order by m.module_number`, courseID, studentID)
	if err != nil {
		return d, err
	}
	defer rows.Close()

	d.Modules = []ModuleItem{}
	for rows.Next() {
		var m ModuleItem
		if err := rows.Scan(&m.ID, &m.ModuleNumber, &m.Title, &m.Description, &m.DurationSeconds,
			&m.IsFreePreview, &m.IsNew, &m.Ready, &m.Completed, &m.WatchedSeconds); err != nil {
			return d, err
		}
		m.Locked = !(d.Enrolled || m.IsFreePreview)
		if m.Locked {
			m.Description = ""
			m.Completed = false
			m.WatchedSeconds = 0
		}
		if m.Completed {
			d.CompletedModules++
		}
		d.Modules = append(d.Modules, m)
	}
	return d, rows.Err()
}

// CanWatch reports whether the student may stream a module: it must be ready, and either the student is
// enrolled in its course or the module is a free preview. Suspension is checked by CheckSession.
func (s *Store) CanWatch(ctx context.Context, moduleID, studentID int64) error {
	var ready, free, enrolled bool
	err := s.DB.QueryRow(ctx, `
		select m.video_status = 'ready', m.is_free_preview,
		       exists (select 1 from enrollments e where e.course_id = m.course_id and e.student_id = $2)
		from modules m join courses c on c.id = m.course_id
		where m.id = $1 and c.status = 'active'`, moduleID, studentID).Scan(&ready, &free, &enrolled)
	if errors.Is(err, pgx.ErrNoRows) {
		return ErrNotFound
	}
	if err != nil {
		return err
	}
	if !enrolled && !free {
		return ErrLocked
	}
	if !ready {
		return ErrNotReady
	}
	return nil
}
