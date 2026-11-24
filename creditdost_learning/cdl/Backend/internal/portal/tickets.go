package portal

import (
	"context"
	"errors"
	"fmt"
	"strings"
	"time"

	"github.com/jackc/pgx/v5"
)

// ErrInvalidReply is returned for an empty or over-long ticket reply.
var ErrInvalidReply = errors.New("write a message of up to 5000 characters")

// TicketMessage is one message in a ticket conversation, as the student sees it.
type TicketMessage struct {
	ID            int64     `json:"id"`
	AuthorType    string    `json:"authorType"` // student | admin
	AuthorName    string    `json:"authorName"`
	Body          string    `json:"body"`
	HasAttachment bool      `json:"hasAttachment"`
	CreatedAt     time.Time `json:"createdAt"`
}

// TicketThread is one of the student's tickets with its full conversation.
type TicketThread struct {
	Ticket
	ResolvedAt *time.Time      `json:"resolvedAt"`
	Messages   []TicketMessage `json:"messages"`
}

// TicketThread returns a ticket and its messages. Tickets of other students return ErrNotFound.
func (s *Store) TicketThread(ctx context.Context, studentID, ticketID int64) (TicketThread, error) {
	var t TicketThread
	err := s.DB.QueryRow(ctx, `
		select id, category, subject, status, created_at, resolved_at
		from support_tickets where id = $1 and student_id = $2`, ticketID, studentID).
		Scan(&t.ID, &t.Category, &t.Subject, &t.Status, &t.CreatedAt, &t.ResolvedAt)
	if errors.Is(err, pgx.ErrNoRows) {
		return t, ErrNotFound
	}
	if err != nil {
		return t, err
	}
	t.Reference = fmt.Sprintf("CD-T-%d", t.ID)

	// Admin replies show the admin's name under "Support team" in the app.
	rows, err := s.DB.Query(ctx, `
		select m.id, m.author_type,
		       case when m.author_type = 'admin' then coalesce(a.name, 'Support team') else 'You' end,
		       m.body, m.attachment_path is not null, m.created_at
		from ticket_messages m
		left join admins a on a.id = m.author_admin_id
		where m.ticket_id = $1
		order by m.created_at, m.id`, ticketID)
	if err != nil {
		return t, err
	}
	defer rows.Close()
	t.Messages = []TicketMessage{}
	for rows.Next() {
		var m TicketMessage
		if err := rows.Scan(&m.ID, &m.AuthorType, &m.AuthorName, &m.Body, &m.HasAttachment, &m.CreatedAt); err != nil {
			return t, err
		}
		t.Messages = append(t.Messages, m)
	}
	return t, rows.Err()
}

// ReplyToTicket adds the student's message. Replying to a resolved ticket reopens it, so the
// support team sees it again in the open queue.
func (s *Store) ReplyToTicket(ctx context.Context, studentID, ticketID int64, body string) error {
	body = strings.TrimSpace(body)
	if body == "" || len(body) > 5000 {
		return ErrInvalidReply
	}
	tx, err := s.DB.Begin(ctx)
	if err != nil {
		return err
	}
	defer tx.Rollback(ctx) //nolint:errcheck

	var status string
	err = tx.QueryRow(ctx, `
		select status from support_tickets where id = $1 and student_id = $2 for update`,
		ticketID, studentID).Scan(&status)
	if errors.Is(err, pgx.ErrNoRows) {
		return ErrNotFound
	}
	if err != nil {
		return err
	}
	if _, err := tx.Exec(ctx, `
		insert into ticket_messages (ticket_id, author_type, body) values ($1, 'student', $2)`,
		ticketID, body); err != nil {
		return err
	}
	if status == "resolved" {
		if _, err := tx.Exec(ctx, `
			update support_tickets set status = 'open', resolved_at = null where id = $1`, ticketID); err != nil {
			return err
		}
	}
	return tx.Commit(ctx)
}

// TicketAttachment returns the stored path and type of an attachment on the student's own ticket.
func (s *Store) TicketAttachment(ctx context.Context, studentID, ticketID, messageID int64) (path, contentType string, err error) {
	var p, ct *string
	err = s.DB.QueryRow(ctx, `
		select m.attachment_path, m.attachment_type
		from ticket_messages m
		join support_tickets t on t.id = m.ticket_id
		where m.id = $1 and m.ticket_id = $2 and t.student_id = $3`, messageID, ticketID, studentID).Scan(&p, &ct)
	if errors.Is(err, pgx.ErrNoRows) || (err == nil && p == nil) {
		return "", "", ErrNotFound
	}
	if err != nil {
		return "", "", err
	}
	if ct == nil {
		return *p, "application/octet-stream", nil
	}
	return *p, *ct, nil
}
