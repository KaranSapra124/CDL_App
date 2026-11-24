// Package payments holds the revenue and transaction queries for the admin panel.
package payments

import (
	"context"
	"fmt"
	"strings"
	"time"

	"github.com/jackc/pgx/v5/pgxpool"
)

type Store struct {
	DB *pgxpool.Pool
}

// Revenue is the breakdown for a period. Amounts are in paise.
// "Discounted" means an online order that had a discount applied (early-payment or coupon;
// the two are not stored separately yet). "Standard" means an online order with no discount.
type Revenue struct {
	Range           string `json:"range"`
	GrossPaise      int64  `json:"grossPaise"`
	StandardPaise   int64  `json:"standardPaise"`
	DiscountedPaise int64  `json:"discountedPaise"`
	ManualPaise     int64  `json:"manualPaise"`
	DiscountsPaise  int64  `json:"discountsPaise"`
	GSTPaise        int64  `json:"gstPaise"`
	PaidOrders      int64  `json:"paidOrders"`
	RefundedOrders  int64  `json:"refundedOrders"`
	RefundedPaise   int64  `json:"refundedPaise"`
	PendingOrders   int64  `json:"pendingOrders"`
	FailedOrders    int64  `json:"failedOrders"`
}

// Revenue summarises paid orders in the last `days` days.
func (s *Store) Revenue(ctx context.Context, rangeKey string, days int) (Revenue, error) {
	r := Revenue{Range: rangeKey}
	err := s.DB.QueryRow(ctx, `
		select
		  coalesce(sum(total_paise) filter (where status = 'paid' and paid_at >= now() - make_interval(days => $1)), 0)::bigint,
		  coalesce(sum(total_paise) filter (where status = 'paid' and gateway = 'razorpay' and discount_paise = 0
		                                      and paid_at >= now() - make_interval(days => $1)), 0)::bigint,
		  coalesce(sum(total_paise) filter (where status = 'paid' and gateway = 'razorpay' and discount_paise > 0
		                                      and paid_at >= now() - make_interval(days => $1)), 0)::bigint,
		  coalesce(sum(total_paise) filter (where status = 'paid' and gateway = 'manual'
		                                      and paid_at >= now() - make_interval(days => $1)), 0)::bigint,
		  coalesce(sum(discount_paise) filter (where status = 'paid' and paid_at >= now() - make_interval(days => $1)), 0)::bigint,
		  coalesce(sum(gst_paise) filter (where status = 'paid' and paid_at >= now() - make_interval(days => $1)), 0)::bigint,
		  count(*) filter (where status = 'paid' and paid_at >= now() - make_interval(days => $1))::bigint,
		  count(*) filter (where status = 'refunded' and created_at >= now() - make_interval(days => $1))::bigint,
		  coalesce(sum(total_paise) filter (where status = 'refunded' and created_at >= now() - make_interval(days => $1)), 0)::bigint,
		  count(*) filter (where status = 'pending')::bigint,
		  count(*) filter (where status = 'failed' and created_at >= now() - make_interval(days => $1))::bigint
		from orders`, days).
		Scan(&r.GrossPaise, &r.StandardPaise, &r.DiscountedPaise, &r.ManualPaise, &r.DiscountsPaise,
			&r.GSTPaise, &r.PaidOrders, &r.RefundedOrders, &r.RefundedPaise, &r.PendingOrders, &r.FailedOrders)
	return r, err
}

// Transaction is one order, shown in the transactions table.
type Transaction struct {
	ID            int64     `json:"id"`
	Code          string    `json:"code"`
	StudentID     int64     `json:"studentId"`
	StudentName   string    `json:"studentName"`
	CourseTitle   string    `json:"courseTitle"`
	BasePaise     int64     `json:"basePaise"`
	DiscountPaise int64     `json:"discountPaise"`
	GSTPaise      int64     `json:"gstPaise"`
	TotalPaise    int64     `json:"totalPaise"`
	Status        string    `json:"status"`
	Gateway       string    `json:"gateway"`
	Reference     string    `json:"reference"`
	ManualMethod  string    `json:"manualMethod"`
	CreatedAt     time.Time `json:"createdAt"`
}

type Filter struct {
	Status  string // all | paid | pending | failed | refunded
	Gateway string // all | razorpay | manual
	Query   string
	Page    int
	Limit   int // 0 = no paging (export)
}

type ListResult struct {
	Items  []Transaction    `json:"items"`
	Total  int64            `json:"total"`
	Page   int              `json:"page"`
	Limit  int              `json:"limit"`
	Counts map[string]int64 `json:"counts"`
}

// List returns one page of transactions plus per-status counts.
func (s *Store) List(ctx context.Context, f Filter) (ListResult, error) {
	res := ListResult{Page: f.Page, Limit: f.Limit, Counts: map[string]int64{}}
	if f.Page <= 0 {
		f.Page = 1
	}

	where := `
		where ($1 = 'all' or o.status = $1)
		  and ($2 = 'all' or o.gateway = $2)
		  and ($3 = '' or st.name ilike '%' || $3 || '%' or c.title ilike '%' || $3 || '%'
		       or coalesce(o.gateway_payment_id, '') ilike '%' || $3 || '%')`
	args := []any{f.Status, f.Gateway, strings.TrimSpace(f.Query)}
	limit := ""
	if f.Limit > 0 {
		limit = " limit $4 offset $5"
		args = append(args, f.Limit, (f.Page-1)*f.Limit)
	}

	rows, err := s.DB.Query(ctx, `
		select o.id, st.id, st.name, c.title, o.base_paise, o.discount_paise, o.gst_paise, o.total_paise,
		       o.status, o.gateway, coalesce(o.gateway_payment_id, ''), coalesce(o.manual_method, ''), o.created_at,
		       count(*) over()
		from orders o
		join students st on st.id = o.student_id
		join courses c on c.id = o.course_id`+where+`
		order by o.created_at desc, o.id desc`+limit, args...)
	if err != nil {
		return res, fmt.Errorf("list transactions: %w", err)
	}
	defer rows.Close()

	res.Items = []Transaction{}
	for rows.Next() {
		var t Transaction
		if err := rows.Scan(&t.ID, &t.StudentID, &t.StudentName, &t.CourseTitle, &t.BasePaise, &t.DiscountPaise,
			&t.GSTPaise, &t.TotalPaise, &t.Status, &t.Gateway, &t.Reference, &t.ManualMethod, &t.CreatedAt, &res.Total); err != nil {
			return res, err
		}
		t.Code = fmt.Sprintf("CD-%d", t.ID)
		res.Items = append(res.Items, t)
	}
	if err := rows.Err(); err != nil {
		return res, err
	}

	countRows, err := s.DB.Query(ctx, `select status, count(*)::bigint from orders group by status`)
	if err != nil {
		return res, err
	}
	defer countRows.Close()
	for countRows.Next() {
		var status string
		var n int64
		if err := countRows.Scan(&status, &n); err != nil {
			return res, err
		}
		res.Counts[status] = n
		res.Counts["all"] += n
	}
	return res, countRows.Err()
}
