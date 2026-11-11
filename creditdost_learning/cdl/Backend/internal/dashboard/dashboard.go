// Package dashboard builds the admin dashboard from live database data.
// Every value comes from a query. Empty tables produce zeros and empty lists.
package dashboard

import (
	"context"
	"fmt"
	"time"

	"github.com/jackc/pgx/v5/pgxpool"
)

// SupportedLanguages are the 9 languages from the PRD.
var SupportedLanguages = []string{"hi", "en", "ta", "te", "kn", "ml", "mr", "bn", "gu"}

var rangeDays = map[string]int{"7d": 7, "30d": 30, "90d": 90, "365d": 365}

// NormalizeRange returns a known range key and its length in days.
// Unknown keys fall back to 30 days.
func NormalizeRange(key string) (string, int) {
	if days, ok := rangeDays[key]; ok {
		return key, days
	}
	return "30d", 30
}

// Metric is a value plus its change against the previous period.
// ChangePct is nil when there is nothing to compare against.
type Metric struct {
	Value     int64    `json:"value"`
	ChangePct *float64 `json:"changePct"`
}

type Dashboard struct {
	Range         string            `json:"range"`
	KPIs          KPIs              `json:"kpis"`
	RevenueSeries []MonthPoint      `json:"revenueSeries"`
	Checkout      CheckoutStats     `json:"checkout"`
	TopCourses    []CourseSpotlight `json:"topCourses"`
	RecentOrders  []RecentOrder     `json:"recentOrders"`
	RecentEvents  []Event           `json:"recentEvents"`
	Dubbing       Dubbing           `json:"dubbing"`
}

type KPIs struct {
	TotalStudents     Metric        `json:"totalStudents"`
	TotalEnrollments  Metric        `json:"totalEnrollments"`
	TotalRevenuePaise Metric        `json:"totalRevenuePaise"`
	Courses           CourseCounts  `json:"courses"`
	PendingOrders     PendingOrders `json:"pendingOrders"`
	SupportTickets    TicketStats   `json:"supportTickets"`
}

type CourseCounts struct {
	Active   int64 `json:"active"`
	Draft    int64 `json:"draft"`
	Archived int64 `json:"archived"`
}

type PendingOrders struct {
	Count       int64 `json:"count"`
	AmountPaise int64 `json:"amountPaise"`
}

type TicketStats struct {
	Open                    int64    `json:"open"`
	Urgent                  int64    `json:"urgent"`
	Unassigned              int64    `json:"unassigned"`
	AvgFirstResponseMinutes *float64 `json:"avgFirstResponseMinutes"`
}

type MonthPoint struct {
	Month        string `json:"month"` // "2026-06"
	RevenuePaise int64  `json:"revenuePaise"`
	Enrollments  int64  `json:"enrollments"`
}

type CheckoutStats struct {
	AvgOrderValuePaise float64 `json:"avgOrderValuePaise"`
	ConversionRatePct  float64 `json:"conversionRatePct"` // students with an enrolment / all students
	RefundRatioPct     float64 `json:"refundRatioPct"`    // refunded / (paid + refunded) orders in range
	CompletionRatePct  float64 `json:"completionRatePct"` // certificates / enrolments
}

type CourseSpotlight struct {
	ID           int64    `json:"id"`
	Title        string   `json:"title"`
	Students     int64    `json:"students"`
	AvgRating    *float64 `json:"avgRating"`
	RevenuePaise int64    `json:"revenuePaise"`
	GrowthPct    *float64 `json:"growthPct"` // revenue vs previous period
}

type RecentOrder struct {
	ID          int64     `json:"id"`
	Code        string    `json:"code"` // e.g. "CD-9824"
	StudentName string    `json:"studentName"`
	CourseTitle string    `json:"courseTitle"`
	TotalPaise  int64     `json:"totalPaise"`
	Gateway     string    `json:"gateway"`
	Status      string    `json:"status"`
	CreatedAt   time.Time `json:"createdAt"`
}

type Event struct {
	ID        int64     `json:"id"`
	Kind      string    `json:"kind"`
	Message   string    `json:"message"`
	CreatedAt time.Time `json:"createdAt"`
}

type Dubbing struct {
	LanguagesLive    int64 `json:"languagesLive"` // languages where every track is live
	LanguagesTotal   int64 `json:"languagesTotal"`
	TracksProcessing int64 `json:"tracksProcessing"`
}

// Load runs every dashboard query for the given range key.
func Load(ctx context.Context, db *pgxpool.Pool, rangeKey string) (Dashboard, error) {
	key, days := NormalizeRange(rangeKey)
	d := Dashboard{Range: key}
	var err error

	if d.KPIs.TotalStudents, err = countMetric(ctx, db, "students", "created_at", days); err != nil {
		return d, fmt.Errorf("students: %w", err)
	}
	if d.KPIs.TotalEnrollments, err = countMetric(ctx, db, "enrollments", "created_at", days); err != nil {
		return d, fmt.Errorf("enrollments: %w", err)
	}
	if d.KPIs.TotalRevenuePaise, err = revenueMetric(ctx, db, days); err != nil {
		return d, fmt.Errorf("revenue: %w", err)
	}
	if d.KPIs.Courses, err = courseCounts(ctx, db); err != nil {
		return d, fmt.Errorf("courses: %w", err)
	}
	if d.KPIs.PendingOrders, err = pendingOrders(ctx, db); err != nil {
		return d, fmt.Errorf("pending orders: %w", err)
	}
	if d.KPIs.SupportTickets, err = ticketStats(ctx, db, days); err != nil {
		return d, fmt.Errorf("tickets: %w", err)
	}
	if d.RevenueSeries, err = revenueSeries(ctx, db); err != nil {
		return d, fmt.Errorf("revenue series: %w", err)
	}
	if d.Checkout, err = checkoutStats(ctx, db, days); err != nil {
		return d, fmt.Errorf("checkout stats: %w", err)
	}
	if d.TopCourses, err = topCourses(ctx, db, days); err != nil {
		return d, fmt.Errorf("top courses: %w", err)
	}
	if d.RecentOrders, err = recentOrders(ctx, db); err != nil {
		return d, fmt.Errorf("recent orders: %w", err)
	}
	if d.RecentEvents, err = recentEvents(ctx, db); err != nil {
		return d, fmt.Errorf("events: %w", err)
	}
	if d.Dubbing, err = dubbing(ctx, db); err != nil {
		return d, fmt.Errorf("dubbing: %w", err)
	}
	return d, nil
}

// changePct returns the percentage change from prev to cur, or nil if prev is 0.
func changePct(cur, prev int64) *float64 {
	if prev == 0 {
		return nil
	}
	v := float64(cur-prev) * 100 / float64(prev)
	return &v
}

// countMetric counts all rows in a table, plus the change in new rows between periods.
// table and column are fixed internal names, never user input.
func countMetric(ctx context.Context, db *pgxpool.Pool, table, column string, days int) (Metric, error) {
	query := fmt.Sprintf(`
		select
		  (select count(*) from %[1]s),
		  (select count(*) from %[1]s where %[2]s >= now() - make_interval(days => $1)),
		  (select count(*) from %[1]s
		     where %[2]s >= now() - make_interval(days => $1 * 2)
		       and %[2]s <  now() - make_interval(days => $1))`, table, column)

	var total, cur, prev int64
	if err := db.QueryRow(ctx, query, days).Scan(&total, &cur, &prev); err != nil {
		return Metric{}, err
	}
	return Metric{Value: total, ChangePct: changePct(cur, prev)}, nil
}

// revenueMetric sums paid orders in the range. The change compares against the previous period.
func revenueMetric(ctx context.Context, db *pgxpool.Pool, days int) (Metric, error) {
	var cur, prev int64
	err := db.QueryRow(ctx, `
		select
		  coalesce(sum(total_paise) filter (where paid_at >= now() - make_interval(days => $1)), 0)::bigint,
		  coalesce(sum(total_paise) filter (where paid_at >= now() - make_interval(days => $1 * 2)
		                                      and paid_at <  now() - make_interval(days => $1)), 0)::bigint
		from orders
		where status = 'paid'`, days).Scan(&cur, &prev)
	if err != nil {
		return Metric{}, err
	}
	return Metric{Value: cur, ChangePct: changePct(cur, prev)}, nil
}

func courseCounts(ctx context.Context, db *pgxpool.Pool) (CourseCounts, error) {
	var c CourseCounts
	rows, err := db.Query(ctx, `select status, count(*)::bigint from courses group by status`)
	if err != nil {
		return c, err
	}
	defer rows.Close()
	for rows.Next() {
		var status string
		var n int64
		if err := rows.Scan(&status, &n); err != nil {
			return c, err
		}
		switch status {
		case "active":
			c.Active = n
		case "draft":
			c.Draft = n
		case "archived":
			c.Archived = n
		}
	}
	return c, rows.Err()
}

func pendingOrders(ctx context.Context, db *pgxpool.Pool) (PendingOrders, error) {
	var p PendingOrders
	err := db.QueryRow(ctx, `
		select count(*)::bigint, coalesce(sum(total_paise), 0)::bigint
		from orders where status = 'pending'`).Scan(&p.Count, &p.AmountPaise)
	return p, err
}

// ticketStats counts unresolved tickets. Response time averages tickets created in the range.
func ticketStats(ctx context.Context, db *pgxpool.Pool, days int) (TicketStats, error) {
	var t TicketStats
	err := db.QueryRow(ctx, `
		select
		  count(*) filter (where status <> 'resolved')::bigint,
		  count(*) filter (where status <> 'resolved' and priority = 'urgent')::bigint,
		  count(*) filter (where status <> 'resolved' and assigned_admin_id is null)::bigint,
		  (avg(extract(epoch from (first_response_at - created_at)) / 60)
		     filter (where first_response_at is not null
		               and created_at >= now() - make_interval(days => $1)))::float8
		from support_tickets`, days).
		Scan(&t.Open, &t.Urgent, &t.Unassigned, &t.AvgFirstResponseMinutes)
	return t, err
}

// revenueSeries returns the last six calendar months, oldest first, with zeros for empty months.
func revenueSeries(ctx context.Context, db *pgxpool.Pool) ([]MonthPoint, error) {
	rows, err := db.Query(ctx, `
		with months as (
		  select generate_series(date_trunc('month', now()) - interval '5 months',
		                         date_trunc('month', now()),
		                         interval '1 month') as m
		)
		select to_char(mo.m, 'YYYY-MM'),
		       coalesce(sum(o.total_paise) filter (where o.status = 'paid'), 0)::bigint,
		       (select count(*) from enrollments e where date_trunc('month', e.created_at) = mo.m)::bigint
		from months mo
		left join orders o on date_trunc('month', o.paid_at) = mo.m
		group by mo.m
		order by mo.m`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	points := []MonthPoint{}
	for rows.Next() {
		var p MonthPoint
		if err := rows.Scan(&p.Month, &p.RevenuePaise, &p.Enrollments); err != nil {
			return nil, err
		}
		points = append(points, p)
	}
	return points, rows.Err()
}

func checkoutStats(ctx context.Context, db *pgxpool.Pool, days int) (CheckoutStats, error) {
	var c CheckoutStats
	err := db.QueryRow(ctx, `
		select
		  coalesce((select avg(total_paise)::float8 from orders
		             where status = 'paid' and paid_at >= now() - make_interval(days => $1)), 0),
		  coalesce((select 100.0 * count(distinct student_id) / nullif((select count(*) from students), 0)
		              from enrollments), 0)::float8,
		  coalesce((select 100.0 * count(*) filter (where status = 'refunded')
		                 / nullif(count(*) filter (where status in ('paid', 'refunded')), 0)
		              from orders where created_at >= now() - make_interval(days => $1)), 0)::float8,
		  coalesce((select 100.0 * (select count(*) from certificates)
		                 / nullif((select count(*) from enrollments), 0)), 0)::float8`, days).
		Scan(&c.AvgOrderValuePaise, &c.ConversionRatePct, &c.RefundRatioPct, &c.CompletionRatePct)
	return c, err
}

// topCourses returns up to three non-archived courses ranked by revenue in the range.
func topCourses(ctx context.Context, db *pgxpool.Pool, days int) ([]CourseSpotlight, error) {
	rows, err := db.Query(ctx, `
		with cur as (
		  select course_id, sum(total_paise)::bigint as revenue
		  from orders
		  where status = 'paid' and paid_at >= now() - make_interval(days => $1)
		  group by course_id
		),
		prev as (
		  select course_id, sum(total_paise)::bigint as revenue
		  from orders
		  where status = 'paid'
		    and paid_at >= now() - make_interval(days => $1 * 2)
		    and paid_at <  now() - make_interval(days => $1)
		  group by course_id
		),
		students_per_course as (
		  select course_id, count(*)::bigint as n from enrollments group by course_id
		),
		ratings as (
		  select m.course_id, avg(r.stars)::float8 as avg_stars
		  from module_ratings r join modules m on m.id = r.module_id
		  group by m.course_id
		)
		select c.id, c.title,
		       coalesce(s.n, 0),
		       rt.avg_stars,
		       coalesce(cur.revenue, 0),
		       coalesce(prev.revenue, 0)
		from courses c
		left join cur on cur.course_id = c.id
		left join prev on prev.course_id = c.id
		left join students_per_course s on s.course_id = c.id
		left join ratings rt on rt.course_id = c.id
		where c.status <> 'archived'
		order by coalesce(cur.revenue, 0) desc, coalesce(s.n, 0) desc, c.id
		limit 3`, days)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	list := []CourseSpotlight{}
	for rows.Next() {
		var (
			c       CourseSpotlight
			prevRev int64
		)
		if err := rows.Scan(&c.ID, &c.Title, &c.Students, &c.AvgRating, &c.RevenuePaise, &prevRev); err != nil {
			return nil, err
		}
		c.GrowthPct = changePct(c.RevenuePaise, prevRev)
		list = append(list, c)
	}
	return list, rows.Err()
}

func recentOrders(ctx context.Context, db *pgxpool.Pool) ([]RecentOrder, error) {
	rows, err := db.Query(ctx, `
		select o.id, s.name, c.title, o.total_paise, o.gateway, o.status, o.created_at
		from orders o
		join students s on s.id = o.student_id
		join courses c on c.id = o.course_id
		order by o.created_at desc
		limit 5`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	list := []RecentOrder{}
	for rows.Next() {
		var o RecentOrder
		if err := rows.Scan(&o.ID, &o.StudentName, &o.CourseTitle, &o.TotalPaise,
			&o.Gateway, &o.Status, &o.CreatedAt); err != nil {
			return nil, err
		}
		o.Code = fmt.Sprintf("CD-%d", o.ID)
		list = append(list, o)
	}
	return list, rows.Err()
}

func recentEvents(ctx context.Context, db *pgxpool.Pool) ([]Event, error) {
	rows, err := db.Query(ctx, `
		select id, kind, message, created_at
		from activity_events
		order by created_at desc
		limit 10`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	list := []Event{}
	for rows.Next() {
		var e Event
		if err := rows.Scan(&e.ID, &e.Kind, &e.Message, &e.CreatedAt); err != nil {
			return nil, err
		}
		list = append(list, e)
	}
	return list, rows.Err()
}

func dubbing(ctx context.Context, db *pgxpool.Pool) (Dubbing, error) {
	d := Dubbing{LanguagesTotal: int64(len(SupportedLanguages))}
	err := db.QueryRow(ctx, `
		select
		  (select count(*) from (
		     select language from module_audio_tracks
		     group by language
		     having bool_and(status = 'live')) x)::bigint,
		  (select count(*) from module_audio_tracks where status = 'processing')::bigint`).
		Scan(&d.LanguagesLive, &d.TracksProcessing)
	return d, err
}
