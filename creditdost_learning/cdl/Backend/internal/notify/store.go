package notify

import (
	"context"
	"fmt"
	"time"

	"github.com/jackc/pgx/v5/pgconn"
	"github.com/jackc/pgx/v5/pgxpool"
)

// Audience values accepted by Broadcast. "student" needs a student id.
var Audiences = map[string]bool{"all": true, "paid": true, "unpaid": true, "student": true}

type BroadcastResult struct {
	Queued  int64 `json:"queued"`
	Skipped int64 `json:"skippedNoEmail"`
}

// Broadcast queues one email per matching student who has an email address.
// Students without an email are counted in Skipped; nothing is sent to them.
func Broadcast(ctx context.Context, db *pgxpool.Pool, audience string, studentID int64,
	subject, body string, adminID int64) (BroadcastResult, error) {
	var res BroadcastResult

	// Same audience rules as the students directory.
	const match = `
		from students st
		where ($1 = 'all'
		       or ($1 = 'paid' and exists (select 1 from enrollments e where e.student_id = st.id))
		       or ($1 = 'unpaid' and not exists (select 1 from enrollments e where e.student_id = st.id))
		       or ($1 = 'student' and st.id = $2))`

	err := db.QueryRow(ctx, `select count(*) filter (where st.email is null)::bigint`+match, audience, studentID).
		Scan(&res.Skipped)
	if err != nil {
		return res, err
	}

	tag, err := db.Exec(ctx, `
		insert into notifications (audience, student_id, recipient, subject, body, created_by)
		select $1, st.id, st.email, $3, $4, $5`+match+` and st.email is not null`,
		audience, studentID, subject, body, adminID)
	if err != nil {
		return res, fmt.Errorf("queue broadcast: %w", err)
	}
	res.Queued = tag.RowsAffected()
	return res, nil
}

// EnqueueToStudent queues one email to a single student, if they have an address.
// It is used for automatic messages such as manual enrolment confirmations.
func EnqueueToStudent(ctx context.Context, db execer, studentID int64, subject, body string) error {
	_, err := db.Exec(ctx, `
		insert into notifications (audience, student_id, recipient, subject, body)
		select 'student', st.id, st.email, $2, $3
		from students st where st.id = $1 and st.email is not null`, studentID, subject, body)
	return err
}

// execer is satisfied by both *pgxpool.Pool and pgx.Tx, so callers can enqueue inside a transaction.
type execer interface {
	Exec(ctx context.Context, sql string, args ...any) (pgconn.CommandTag, error)
}

type HistoryItem struct {
	ID        int64      `json:"id"`
	Audience  string     `json:"audience"`
	Recipient string     `json:"recipient"`
	Subject   string     `json:"subject"`
	Status    string     `json:"status"`
	Error     *string    `json:"error"`
	CreatedAt time.Time  `json:"createdAt"`
	SentAt    *time.Time `json:"sentAt"`
}

type History struct {
	Items  []HistoryItem    `json:"items"`
	Total  int64            `json:"total"`
	Page   int              `json:"page"`
	Limit  int              `json:"limit"`
	Counts map[string]int64 `json:"counts"`
}

// ListHistory returns recent emails, newest first, with counts per status.
func ListHistory(ctx context.Context, db *pgxpool.Pool, status string, page, limit int) (History, error) {
	if page <= 0 {
		page = 1
	}
	if limit <= 0 || limit > 100 {
		limit = 20
	}
	res := History{Page: page, Limit: limit, Counts: map[string]int64{}}

	rows, err := db.Query(ctx, `
		select id, audience, recipient, subject, status, error, created_at, sent_at, count(*) over()
		from notifications
		where ($1 = 'all' or status = $1)
		order by created_at desc, id desc
		limit $2 offset $3`, status, limit, (page-1)*limit)
	if err != nil {
		return res, err
	}
	defer rows.Close()
	res.Items = []HistoryItem{}
	for rows.Next() {
		var it HistoryItem
		if err := rows.Scan(&it.ID, &it.Audience, &it.Recipient, &it.Subject, &it.Status, &it.Error,
			&it.CreatedAt, &it.SentAt, &res.Total); err != nil {
			return res, err
		}
		res.Items = append(res.Items, it)
	}
	if err := rows.Err(); err != nil {
		return res, err
	}

	countRows, err := db.Query(ctx, `select status, count(*)::bigint from notifications group by status`)
	if err != nil {
		return res, err
	}
	defer countRows.Close()
	for countRows.Next() {
		var s string
		var n int64
		if err := countRows.Scan(&s, &n); err != nil {
			return res, err
		}
		res.Counts[s] = n
		res.Counts["all"] += n
	}
	return res, countRows.Err()
}
