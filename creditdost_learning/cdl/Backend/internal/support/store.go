// Package support holds the support-ticket queries: the admin queue, threads, replies and status.
package support

import (
	"context"
	"errors"
	"fmt"
	"strings"
	"time"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
)

var (
	ErrNotFound      = errors.New("not found")
	ErrNoAdmin       = errors.New("admin not found")
	ErrBadStatus     = errors.New("status must be open, in_progress or resolved")
	ErrNothingToSend = errors.New("write a reply or attach a screenshot")
)

type Store struct {
	DB *pgxpool.Pool
}

type ListFilter struct {
	Status   string // all | open | in_progress | resolved
	Priority string // all | urgent
	Query    string
	Page     int
	Limit    int
}

type ListItem struct {
	ID            int64      `json:"id"`
	Subject       string     `json:"subject"`
	Category      string     `json:"category"`
	Status        string     `json:"status"`
	Priority      string     `json:"priority"`
	StudentID     int64      `json:"studentId"`
	StudentName   string     `json:"studentName"`
	AssignedTo    *string    `json:"assignedTo"`
	CreatedAt     time.Time  `json:"createdAt"`
	LastMessageAt time.Time  `json:"lastMessageAt"`
	Messages      int64      `json:"messages"`
	ResolvedAt    *time.Time `json:"resolvedAt"`
}

type Summary struct {
	Open                    int64    `json:"open"`
	InProgress              int64    `json:"inProgress"`
	Resolved                int64    `json:"resolved"`
	Urgent                  int64    `json:"urgent"`
	Unassigned              int64    `json:"unassigned"`
	AvgFirstResponseMinutes *float64 `json:"avgFirstResponseMinutes"`
}

type ListResult struct {
	Items   []ListItem       `json:"items"`
	Total   int64            `json:"total"`
	Page    int              `json:"page"`
	Limit   int              `json:"limit"`
	Counts  map[string]int64 `json:"counts"`
	Summary Summary          `json:"summary"`
}

// List returns one page of tickets. Oldest unresolved tickets come first.
func (s *Store) List(ctx context.Context, f ListFilter) (ListResult, error) {
	res := ListResult{Page: f.Page, Limit: f.Limit, Counts: map[string]int64{}}
	if f.Page <= 0 {
		f.Page = 1
	}
	if f.Limit <= 0 || f.Limit > 100 {
		f.Limit = 20
	}
	res.Limit = f.Limit

	rows, err := s.DB.Query(ctx, `
		select t.id, t.subject, t.category, t.status, t.priority, st.id, st.name,
		       a.name, t.created_at,
		       coalesce((select max(m.created_at) from ticket_messages m where m.ticket_id = t.id), t.created_at),
		       (select count(*) from ticket_messages m where m.ticket_id = t.id)::bigint,
		       t.resolved_at,
		       count(*) over()
		from support_tickets t
		join students st on st.id = t.student_id
		left join admins a on a.id = t.assigned_admin_id
		where ($1 = 'all' or t.status = $1)
		  and ($2 = 'all' or t.priority = $2)
		  and ($3 = '' or t.subject ilike '%' || $3 || '%' or st.name ilike '%' || $3 || '%'
		       or ('#' || t.id) = $3)
		order by (t.status = 'resolved'), t.created_at, t.id
		limit $4 offset $5`,
		f.Status, f.Priority, strings.TrimSpace(f.Query), f.Limit, (f.Page-1)*f.Limit)
	if err != nil {
		return res, fmt.Errorf("list tickets: %w", err)
	}
	defer rows.Close()

	res.Items = []ListItem{}
	for rows.Next() {
		var it ListItem
		if err := rows.Scan(&it.ID, &it.Subject, &it.Category, &it.Status, &it.Priority, &it.StudentID,
			&it.StudentName, &it.AssignedTo, &it.CreatedAt, &it.LastMessageAt, &it.Messages,
			&it.ResolvedAt, &res.Total); err != nil {
			return res, err
		}
		res.Items = append(res.Items, it)
	}
	if err := rows.Err(); err != nil {
		return res, err
	}

	err = s.DB.QueryRow(ctx, `
		select
		  count(*) filter (where status = 'open')::bigint,
		  count(*) filter (where status = 'in_progress')::bigint,
		  count(*) filter (where status = 'resolved')::bigint,
		  count(*) filter (where status <> 'resolved' and priority = 'urgent')::bigint,
		  count(*) filter (where status <> 'resolved' and assigned_admin_id is null)::bigint,
		  (avg(extract(epoch from (first_response_at - created_at)) / 60)
		     filter (where first_response_at is not null and created_at >= now() - interval '30 days'))::float8
		from support_tickets`).
		Scan(&res.Summary.Open, &res.Summary.InProgress, &res.Summary.Resolved, &res.Summary.Urgent,
			&res.Summary.Unassigned, &res.Summary.AvgFirstResponseMinutes)
	if err != nil {
		return res, err
	}
	res.Counts = map[string]int64{
		"all":         res.Summary.Open + res.Summary.InProgress + res.Summary.Resolved,
		"open":        res.Summary.Open,
		"in_progress": res.Summary.InProgress,
		"resolved":    res.Summary.Resolved,
	}
	return res, nil
}

type Message struct {
	ID             int64     `json:"id"`
	AuthorType     string    `json:"authorType"` // admin | student
	AuthorName     string    `json:"authorName"`
	Body           string    `json:"body"`
	HasAttachment  bool      `json:"hasAttachment"`
	AttachmentType *string   `json:"attachmentType"`
	CreatedAt      time.Time `json:"createdAt"`
}

type Ticket struct {
	ID            int64      `json:"id"`
	Subject       string     `json:"subject"`
	Category      string     `json:"category"`
	Status        string     `json:"status"`
	Priority      string     `json:"priority"`
	CreatedAt     time.Time  `json:"createdAt"`
	ResolvedAt    *time.Time `json:"resolvedAt"`
	AssignedAdmin *int64     `json:"assignedAdminId"`
	AssignedTo    *string    `json:"assignedTo"`
	StudentID     int64      `json:"studentId"`
	StudentName   string     `json:"studentName"`
	StudentEmail  *string    `json:"studentEmail"`
	StudentMobile *string    `json:"studentMobile"`
	Messages      []Message  `json:"messages"`
}

// Get returns a ticket with its full thread.
func (s *Store) Get(ctx context.Context, id int64) (Ticket, error) {
	var t Ticket
	err := s.DB.QueryRow(ctx, `
		select t.id, t.subject, t.category, t.status, t.priority, t.created_at, t.resolved_at,
		       t.assigned_admin_id, a.name, st.id, st.name, st.email, st.mobile
		from support_tickets t
		join students st on st.id = t.student_id
		left join admins a on a.id = t.assigned_admin_id
		where t.id = $1`, id).
		Scan(&t.ID, &t.Subject, &t.Category, &t.Status, &t.Priority, &t.CreatedAt, &t.ResolvedAt,
			&t.AssignedAdmin, &t.AssignedTo, &t.StudentID, &t.StudentName, &t.StudentEmail, &t.StudentMobile)
	if errors.Is(err, pgx.ErrNoRows) {
		return t, ErrNotFound
	}
	if err != nil {
		return t, err
	}

	t.Messages = []Message{}
	rows, err := s.DB.Query(ctx, `
		select m.id, m.author_type, coalesce(a.name, st.name, ''), m.body,
		       m.attachment_path is not null, m.attachment_type, m.created_at
		from ticket_messages m
		join support_tickets tk on tk.id = m.ticket_id
		join students st on st.id = tk.student_id
		left join admins a on a.id = m.author_admin_id
		where m.ticket_id = $1
		order by m.created_at, m.id`, id)
	if err != nil {
		return t, err
	}
	defer rows.Close()
	for rows.Next() {
		var m Message
		if err := rows.Scan(&m.ID, &m.AuthorType, &m.AuthorName, &m.Body, &m.HasAttachment,
			&m.AttachmentType, &m.CreatedAt); err != nil {
			return t, err
		}
		t.Messages = append(t.Messages, m)
	}
	return t, rows.Err()
}

// AddReply stores an admin message. The first admin reply sets first_response_at, and an open ticket
// moves to in_progress.
func (s *Store) AddReply(ctx context.Context, ticketID, adminID int64, body, attachPath, attachType string) error {
	if body == "" && attachPath == "" {
		return ErrNothingToSend
	}
	tx, err := s.DB.Begin(ctx)
	if err != nil {
		return err
	}
	defer tx.Rollback(ctx) //nolint:errcheck

	var status string
	err = tx.QueryRow(ctx, `select status from support_tickets where id = $1 for update`, ticketID).Scan(&status)
	if errors.Is(err, pgx.ErrNoRows) {
		return ErrNotFound
	}
	if err != nil {
		return err
	}

	var attachP, attachT *string
	if attachPath != "" {
		attachP = &attachPath
		attachT = &attachType
	}
	if _, err := tx.Exec(ctx, `
		insert into ticket_messages (ticket_id, author_type, author_admin_id, body, attachment_path, attachment_type)
		values ($1, 'admin', $2, $3, $4, $5)`, ticketID, adminID, body, attachP, attachT); err != nil {
		return err
	}
	if _, err := tx.Exec(ctx, `
		update support_tickets
		   set first_response_at = coalesce(first_response_at, now()),
		       status = case when status = 'open' then 'in_progress' else status end
		 where id = $1`, ticketID); err != nil {
		return err
	}
	return tx.Commit(ctx)
}

// SetStatus changes the status. Resolving sets resolved_at, reopening clears it.
func (s *Store) SetStatus(ctx context.Context, ticketID int64, status string) error {
	if status != "open" && status != "in_progress" && status != "resolved" {
		return ErrBadStatus
	}
	tag, err := s.DB.Exec(ctx, `
		update support_tickets
		   set status = $2,
		       resolved_at = case when $2 = 'resolved' then coalesce(resolved_at, now()) else null end
		 where id = $1`, ticketID, status)
	if err != nil {
		return err
	}
	if tag.RowsAffected() == 0 {
		return ErrNotFound
	}
	return nil
}

// Assign sets the admin responsible for a ticket. Pass 0 to unassign.
func (s *Store) Assign(ctx context.Context, ticketID, adminID int64) error {
	var assigned *int64
	if adminID > 0 {
		var exists bool
		if err := s.DB.QueryRow(ctx, `select exists(select 1 from admins where id = $1)`, adminID).Scan(&exists); err != nil {
			return err
		}
		if !exists {
			return ErrNoAdmin
		}
		assigned = &adminID
	}
	tag, err := s.DB.Exec(ctx, `update support_tickets set assigned_admin_id = $2 where id = $1`, ticketID, assigned)
	if err != nil {
		return err
	}
	if tag.RowsAffected() == 0 {
		return ErrNotFound
	}
	return nil
}

// Attachment returns the stored path and content type of one message's attachment.
func (s *Store) Attachment(ctx context.Context, ticketID, messageID int64) (path, contentType string, err error) {
	var p, ct *string
	err = s.DB.QueryRow(ctx, `
		select attachment_path, attachment_type from ticket_messages
		where id = $1 and ticket_id = $2`, messageID, ticketID).Scan(&p, &ct)
	if errors.Is(err, pgx.ErrNoRows) || (err == nil && p == nil) {
		return "", "", ErrNotFound
	}
	if err != nil {
		return "", "", err
	}
	return *p, derefOr(ct, "application/octet-stream"), nil
}

func derefOr(s *string, fallback string) string {
	if s == nil {
		return fallback
	}
	return *s
}
