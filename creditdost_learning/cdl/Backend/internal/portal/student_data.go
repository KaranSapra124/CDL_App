package portal

import (
	"context"
	"errors"
	"fmt"
	"strings"
	"time"

	"github.com/jackc/pgx/v5"

	"creditdost/backend/internal/auth"
)

// ErrInvalidTicket is returned when a support ticket is missing a required field.
var ErrInvalidTicket = errors.New("subject, category and a description are required")

// ModuleAccess reports whether the student may watch the module (enrolled, or a free preview)
// and whether its video has finished processing. Unknown or inactive modules return ErrNotFound.
func (s *Store) ModuleAccess(ctx context.Context, studentID, moduleID int64) (allowed, ready bool, err error) {
	err = s.DB.QueryRow(ctx, `
		select m.is_free_preview or exists (
		         select 1 from enrollments e where e.course_id = m.course_id and e.student_id = $2),
		       m.video_status = 'ready'
		from modules m
		join courses c on c.id = m.course_id
		where m.id = $1 and c.status = 'active'`, moduleID, studentID).Scan(&allowed, &ready)
	if errors.Is(err, pgx.ErrNoRows) {
		return false, false, ErrNotFound
	}
	return allowed, ready, err
}

// SaveProgress records watch position and completion. Watch position never moves backwards,
// and completion, once set, stays set.
func (s *Store) SaveProgress(ctx context.Context, studentID, moduleID int64, watchedSeconds int, completed bool) error {
	allowed, _, err := s.ModuleAccess(ctx, studentID, moduleID)
	if err != nil {
		return err
	}
	if !allowed {
		return ErrNotFound
	}
	if watchedSeconds < 0 {
		watchedSeconds = 0
	}
	// A lesson also counts as completed once the furthest watch position reaches 95% of the
	// video's length (leaves room for end credits). Lessons with no known length need the explicit flag.
	_, err = s.DB.Exec(ctx, `
		insert into module_progress (student_id, module_id, watched_seconds, completed)
		select $1::bigint, $2::bigint, $3::int,
		       $4::boolean or coalesce(m.duration_seconds > 0 and $3::int >= m.duration_seconds * 0.95, false)
		from modules m where m.id = $2::bigint
		on conflict (student_id, module_id) do update set
		  watched_seconds = greatest(module_progress.watched_seconds, excluded.watched_seconds),
		  completed       = module_progress.completed or excluded.completed,
		  updated_at      = now()`,
		studentID, moduleID, watchedSeconds, completed)
	return err
}

// Notice is an email the student was sent (only rows that went out over SMTP).
type Notice struct {
	ID      int64      `json:"id"`
	Subject string     `json:"subject"`
	Body    string     `json:"body"`
	SentAt  *time.Time `json:"sentAt"`
}

// Notices lists the student's sent emails, newest first.
func (s *Store) Notices(ctx context.Context, studentID int64) ([]Notice, error) {
	rows, err := s.DB.Query(ctx, `
		select id, subject, body, sent_at from notifications
		where student_id = $1 and status = 'sent'
		order by sent_at desc nulls last, id desc
		limit 100`, studentID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	list := []Notice{}
	for rows.Next() {
		var n Notice
		if err := rows.Scan(&n.ID, &n.Subject, &n.Body, &n.SentAt); err != nil {
			return nil, err
		}
		list = append(list, n)
	}
	return list, rows.Err()
}

// Ticket is one support ticket raised by the student.
type Ticket struct {
	ID        int64     `json:"id"`
	Reference string    `json:"reference"`
	Category  string    `json:"category"`
	Subject   string    `json:"subject"`
	Status    string    `json:"status"`
	CreatedAt time.Time `json:"createdAt"`
}

// Tickets lists the student's tickets, newest first.
func (s *Store) Tickets(ctx context.Context, studentID int64) ([]Ticket, error) {
	rows, err := s.DB.Query(ctx, `
		select id, category, subject, status, created_at from support_tickets
		where student_id = $1
		order by created_at desc
		limit 100`, studentID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	list := []Ticket{}
	for rows.Next() {
		var t Ticket
		if err := rows.Scan(&t.ID, &t.Category, &t.Subject, &t.Status, &t.CreatedAt); err != nil {
			return nil, err
		}
		t.Reference = fmt.Sprintf("CD-T-%d", t.ID)
		list = append(list, t)
	}
	return list, rows.Err()
}

// CreateTicket opens a ticket and stores the student's first message in it.
func (s *Store) CreateTicket(ctx context.Context, studentID int64, category, subject, body string) (int64, error) {
	category = strings.TrimSpace(category)
	subject = strings.TrimSpace(subject)
	body = strings.TrimSpace(body)
	if category == "" || subject == "" || body == "" || len(subject) > 200 || len(body) > 5000 {
		return 0, ErrInvalidTicket
	}

	tx, err := s.DB.Begin(ctx)
	if err != nil {
		return 0, err
	}
	defer tx.Rollback(ctx) //nolint:errcheck

	var id int64
	if err := tx.QueryRow(ctx, `
		insert into support_tickets (student_id, category, subject)
		values ($1, $2, $3) returning id`, studentID, category, subject).Scan(&id); err != nil {
		return 0, err
	}
	if _, err := tx.Exec(ctx, `
		insert into ticket_messages (ticket_id, author_type, body)
		values ($1, 'student', $2)`, id, body); err != nil {
		return 0, err
	}
	return id, tx.Commit(ctx)
}

// ResetPassword sets a new password for the student with this email and signs them out everywhere.
// It is form-only for now: no email is sent to confirm the request.
func (s *Store) ResetPassword(ctx context.Context, email, password string) error {
	email = strings.ToLower(strings.TrimSpace(email))
	if email == "" || !strings.Contains(email, "@") {
		return ErrNeedsEmail
	}
	if len(password) < 12 {
		return ErrWeakPassword
	}
	if len(password) > auth.MaxPasswordBytes {
		return ErrLongPassword
	}
	hash, err := auth.HashPassword(password)
	if err != nil {
		return err
	}

	tx, err := s.DB.Begin(ctx)
	if err != nil {
		return err
	}
	defer tx.Rollback(ctx) //nolint:errcheck

	var id int64
	err = tx.QueryRow(ctx, `
		update students set password_hash = $2, password_set_at = now(), updated_at = now()
		where lower(email) = $1
		returning id`, email, hash).Scan(&id)
	if errors.Is(err, pgx.ErrNoRows) {
		return ErrNotFound
	}
	if err != nil {
		return err
	}
	if _, err := tx.Exec(ctx, `
		update sessions set revoked_at = now() where student_id = $1 and revoked_at is null`, id); err != nil {
		return err
	}
	return tx.Commit(ctx)
}
