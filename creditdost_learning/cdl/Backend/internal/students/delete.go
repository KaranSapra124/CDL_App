package students

import (
	"context"
	"errors"
	"fmt"

	"github.com/jackc/pgx/v5"
)

// ErrHasPayments stops deleting a student who has orders: payment records are kept for GST and
// accounting (orders.student_id is ON DELETE RESTRICT). Suspend such a student instead.
var ErrHasPayments = errors.New("this student has payment records, which must be kept for GST and accounting. Suspend the account instead")

// Deleted describes a removed student and the files on disk that belonged to them.
type Deleted struct {
	Name  string
	Files []string // paths relative to MEDIA_DIR: profile photo and ticket attachments
}

// Delete permanently removes a student. Enrolments, progress, sessions, tickets (with messages),
// certificates, ratings and notifications are removed by the database's ON DELETE CASCADE rules.
// The caller deletes the returned files after this succeeds.
func (s *Store) Delete(ctx context.Context, studentID, adminID int64) (Deleted, error) {
	var d Deleted
	tx, err := s.DB.Begin(ctx)
	if err != nil {
		return d, err
	}
	defer tx.Rollback(ctx) //nolint:errcheck

	var avatar *string
	err = tx.QueryRow(ctx, `select name, avatar_path from students where id = $1 for update`, studentID).
		Scan(&d.Name, &avatar)
	if errors.Is(err, pgx.ErrNoRows) {
		return d, ErrNotFound
	}
	if err != nil {
		return d, err
	}

	var orders int64
	if err := tx.QueryRow(ctx, `select count(*) from orders where student_id = $1`, studentID).Scan(&orders); err != nil {
		return d, err
	}
	if orders > 0 {
		return d, ErrHasPayments
	}

	if avatar != nil {
		d.Files = append(d.Files, *avatar)
	}
	rows, err := tx.Query(ctx, `
		select m.attachment_path from ticket_messages m
		join support_tickets t on t.id = m.ticket_id
		where t.student_id = $1 and m.attachment_path is not null`, studentID)
	if err != nil {
		return d, err
	}
	for rows.Next() {
		var p string
		if err := rows.Scan(&p); err != nil {
			rows.Close()
			return d, err
		}
		d.Files = append(d.Files, p)
	}
	rows.Close()
	if err := rows.Err(); err != nil {
		return d, err
	}

	if _, err := tx.Exec(ctx, `delete from students where id = $1`, studentID); err != nil {
		return d, err
	}
	var adminName string
	_ = tx.QueryRow(ctx, `select name from admins where id = $1`, adminID).Scan(&adminName)
	if _, err := tx.Exec(ctx, `insert into activity_events (kind, message) values ('student_deleted', $1)`,
		fmt.Sprintf("Student %s (STU-%d) was deleted by %s", d.Name, studentID, adminName)); err != nil {
		return d, err
	}
	return d, tx.Commit(ctx)
}
