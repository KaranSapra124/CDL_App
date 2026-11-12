// Package courses holds the database operations for the course studio:
// courses, their modules (one video each), instructors, categories and tags.
package courses

import (
	"context"
	"errors"
	"fmt"
	"strings"
	"time"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgconn"
	"github.com/jackc/pgx/v5/pgxpool"
)

var (
	ErrNotFound  = errors.New("not found")
	ErrSlugTaken = errors.New("slug already in use")
)

// Store runs course queries against PostgreSQL.
type Store struct {
	DB *pgxpool.Pool
}

// ---------- Types returned to the API ----------

type Category struct {
	ID   int64  `json:"id"`
	Name string `json:"name"`
	Slug string `json:"slug"`
}

type Instructor struct {
	ID    int64  `json:"id"`
	Name  string `json:"name"`
	Title string `json:"title"`
}

type Module struct {
	ID              int64     `json:"id"`
	CourseID        int64     `json:"courseId"`
	ModuleNumber    int       `json:"moduleNumber"`
	Title           string    `json:"title"`
	Description     string    `json:"description"`
	DurationSeconds *int      `json:"durationSeconds"`
	IsFreePreview   bool      `json:"isFreePreview"`
	IsNew           bool      `json:"isNew"`
	VideoStatus     string    `json:"videoStatus"`
	VideoError      *string   `json:"videoError"`
	VideoSizeBytes  *int64    `json:"videoSizeBytes"`
	UpdatedAt       time.Time `json:"updatedAt"`
}

type Course struct {
	ID                 int64        `json:"id"`
	Slug               string       `json:"slug"`
	Title              string       `json:"title"`
	Description        string       `json:"description"`
	Status             string       `json:"status"`
	PricePaise         int64        `json:"pricePaise"`
	MRPPaise           *int64       `json:"mrpPaise"`
	CertificateEnabled bool         `json:"certificateEnabled"`
	Visibility         string       `json:"visibility"`
	PrimaryLanguage    string       `json:"primaryLanguage"`
	Category           *Category    `json:"category"`
	HasThumbnail       bool         `json:"hasThumbnail"`
	Tags               []string     `json:"tags"`
	Instructors        []Instructor `json:"instructors"`
	Modules            []Module     `json:"modules"`
	CreatedAt          time.Time    `json:"createdAt"`
	UpdatedAt          time.Time    `json:"updatedAt"`
}

type ListItem struct {
	ID           int64     `json:"id"`
	Slug         string    `json:"slug"`
	Title        string    `json:"title"`
	Status       string    `json:"status"`
	PricePaise   int64     `json:"pricePaise"`
	MRPPaise     *int64    `json:"mrpPaise"`
	Category     *string   `json:"category"`
	Instructors  []string  `json:"instructors"`
	ModuleCount  int64     `json:"moduleCount"`
	ReadyVideos  int64     `json:"readyVideos"`
	Students     int64     `json:"students"`
	RevenuePaise int64     `json:"revenuePaise"`
	HasThumbnail bool      `json:"hasThumbnail"`
	UpdatedAt    time.Time `json:"updatedAt"`
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
	TotalRevenuePaise int64 `json:"totalRevenuePaise"`
	ActiveCourses     int64 `json:"activeCourses"`
}

// ---------- Inputs ----------

type ListFilter struct {
	Status     string // all | draft | active | archived
	Query      string
	CategoryID int64
	Sort       string // recent | title | revenue
	Page       int
	Limit      int
}

// CoursePatch holds only the fields the caller wants to change. nil means "leave as is".
type CoursePatch struct {
	Title              *string
	Slug               *string
	Description        *string
	Status             *string
	PricePaise         *int64
	MRPPaise           *int64 // 0 clears it
	CertificateEnabled *bool
	Visibility         *string
	PrimaryLanguage    *string
	CategoryID         *int64 // 0 clears it
	Tags               *[]string
	InstructorIDs      *[]int64
}

type ModulePatch struct {
	Title           *string
	Description     *string
	DurationSeconds *int // 0 clears it
	IsFreePreview   *bool
	IsNew           *bool
}

// ---------- Helpers ----------

// Slugify turns a title into a URL slug: "Credit Card 101!" -> "credit-card-101".
func Slugify(s string) string {
	var b strings.Builder
	dash := false
	for _, r := range strings.ToLower(s) {
		if (r >= 'a' && r <= 'z') || (r >= '0' && r <= '9') {
			b.WriteRune(r)
			dash = false
		} else if !dash && b.Len() > 0 {
			b.WriteByte('-')
			dash = true
		}
	}
	return strings.TrimSuffix(b.String(), "-")
}

func isUniqueViolation(err error) bool {
	var pgErr *pgconn.PgError
	return errors.As(err, &pgErr) && pgErr.Code == "23505"
}

// ---------- Courses ----------

// List returns one page of courses plus tab counts and summary numbers.
func (s *Store) List(ctx context.Context, f ListFilter) (ListResult, error) {
	if f.Limit <= 0 || f.Limit > 100 {
		f.Limit = 10
	}
	if f.Page <= 0 {
		f.Page = 1
	}
	res := ListResult{Page: f.Page, Limit: f.Limit, Counts: map[string]int64{}}

	rows, err := s.DB.Query(ctx, `
		with rev as (
		  select course_id, sum(total_paise)::bigint as r from orders
		  where status = 'paid' group by course_id),
		st as (
		  select course_id, count(*)::bigint as n from enrollments group by course_id),
		mc as (
		  select course_id, count(*)::bigint as n,
		         count(*) filter (where video_status = 'ready')::bigint as ready
		  from modules group by course_id)
		select c.id, c.slug, c.title, c.status, c.price_paise, c.mrp_paise,
		       cat.name,
		       coalesce((select array_agg(i.name order by ci.position, i.id)
		                 from course_instructors ci join instructors i on i.id = ci.instructor_id
		                 where ci.course_id = c.id), '{}'),
		       coalesce(mc.n, 0), coalesce(mc.ready, 0), coalesce(st.n, 0), coalesce(rev.r, 0),
		       c.thumbnail_path is not null, c.updated_at,
		       count(*) over () as total
		from courses c
		left join categories cat on cat.id = c.category_id
		left join rev on rev.course_id = c.id
		left join st  on st.course_id = c.id
		left join mc  on mc.course_id = c.id
		where ($1 = 'all' or c.status = $1)
		  and ($2 = '' or c.title ilike '%' || $2 || '%' or c.slug ilike '%' || $2 || '%'
		       or exists (select 1 from course_tags t where t.course_id = c.id and t.tag ilike '%' || $2 || '%'))
		  and ($3::bigint = 0 or c.category_id = $3)
		order by case when $4 = 'revenue' then coalesce(rev.r, 0) else 0 end desc,
		         case when $4 = 'title' then c.title else '' end asc,
		         c.updated_at desc, c.id desc
		limit $5 offset $6`,
		f.Status, strings.TrimSpace(f.Query), f.CategoryID, f.Sort, f.Limit, (f.Page-1)*f.Limit)
	if err != nil {
		return res, fmt.Errorf("list courses: %w", err)
	}
	defer rows.Close()

	res.Items = []ListItem{}
	for rows.Next() {
		var it ListItem
		var catName *string
		if err := rows.Scan(&it.ID, &it.Slug, &it.Title, &it.Status, &it.PricePaise, &it.MRPPaise,
			&catName, &it.Instructors, &it.ModuleCount, &it.ReadyVideos, &it.Students,
			&it.RevenuePaise, &it.HasThumbnail, &it.UpdatedAt, &res.Total); err != nil {
			return res, err
		}
		it.Category = catName
		res.Items = append(res.Items, it)
	}
	if err := rows.Err(); err != nil {
		return res, err
	}

	// Tab counts. The total in the query above only counts rows matching the current filter.
	countRows, err := s.DB.Query(ctx, `select status, count(*)::bigint from courses group by status`)
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
	if err := countRows.Err(); err != nil {
		return res, err
	}

	err = s.DB.QueryRow(ctx, `
		select
		  coalesce((select sum(total_paise) from orders where status = 'paid'), 0)::bigint,
		  (select count(*) from courses where status = 'active')::bigint`).
		Scan(&res.Summary.TotalRevenuePaise, &res.Summary.ActiveCourses)
	return res, err
}

// Create inserts a draft course with defaults. Callers then apply the details with Update.
func (s *Store) Create(ctx context.Context, title, slug string) (int64, error) {
	var id int64
	err := s.DB.QueryRow(ctx, `
		insert into courses (slug, title, price_paise, status)
		values ($1, $2, 0, 'draft')
		returning id`, slug, title).Scan(&id)
	if isUniqueViolation(err) {
		return 0, ErrSlugTaken
	}
	return id, err
}

// Get returns one course with its category, instructors, tags and modules.
func (s *Store) Get(ctx context.Context, id int64) (Course, error) {
	var c Course
	var catID *int64
	var catName, catSlug *string
	err := s.DB.QueryRow(ctx, `
		select c.id, c.slug, c.title, c.description, c.status, c.price_paise, c.mrp_paise,
		       c.certificate_enabled, c.visibility, c.primary_language,
		       cat.id, cat.name, cat.slug, c.thumbnail_path is not null,
		       c.created_at, c.updated_at
		from courses c
		left join categories cat on cat.id = c.category_id
		where c.id = $1`, id).
		Scan(&c.ID, &c.Slug, &c.Title, &c.Description, &c.Status, &c.PricePaise, &c.MRPPaise,
			&c.CertificateEnabled, &c.Visibility, &c.PrimaryLanguage,
			&catID, &catName, &catSlug, &c.HasThumbnail, &c.CreatedAt, &c.UpdatedAt)
	if errors.Is(err, pgx.ErrNoRows) {
		return c, ErrNotFound
	}
	if err != nil {
		return c, err
	}
	if catID != nil {
		c.Category = &Category{ID: *catID, Name: *catName, Slug: *catSlug}
	}

	c.Tags = []string{}
	tagRows, err := s.DB.Query(ctx, `select tag from course_tags where course_id = $1 order by tag`, id)
	if err != nil {
		return c, err
	}
	for tagRows.Next() {
		var t string
		if err := tagRows.Scan(&t); err != nil {
			tagRows.Close()
			return c, err
		}
		c.Tags = append(c.Tags, t)
	}
	tagRows.Close()

	c.Instructors = []Instructor{}
	insRows, err := s.DB.Query(ctx, `
		select i.id, i.name, i.title
		from course_instructors ci join instructors i on i.id = ci.instructor_id
		where ci.course_id = $1
		order by ci.position, i.id`, id)
	if err != nil {
		return c, err
	}
	for insRows.Next() {
		var in Instructor
		if err := insRows.Scan(&in.ID, &in.Name, &in.Title); err != nil {
			insRows.Close()
			return c, err
		}
		c.Instructors = append(c.Instructors, in)
	}
	insRows.Close()

	c.Modules, err = s.ListModules(ctx, id)
	return c, err
}

// Update applies a partial change in one transaction.
func (s *Store) Update(ctx context.Context, id int64, p CoursePatch) error {
	tx, err := s.DB.Begin(ctx)
	if err != nil {
		return err
	}
	defer tx.Rollback(ctx) //nolint:errcheck // no-op after commit

	var exists bool
	if err := tx.QueryRow(ctx, `select exists(select 1 from courses where id = $1)`, id).Scan(&exists); err != nil {
		return err
	}
	if !exists {
		return ErrNotFound
	}

	if _, err := tx.Exec(ctx, `
		update courses set
		  title               = coalesce($2, title),
		  slug                = coalesce($3, slug),
		  description         = coalesce($4, description),
		  status              = coalesce($5, status),
		  price_paise         = coalesce($6, price_paise),
		  mrp_paise           = case when $7::int is null then mrp_paise
		                             when $7::int = 0 then null else $7::int end,
		  certificate_enabled = coalesce($8, certificate_enabled),
		  visibility          = coalesce($9, visibility),
		  primary_language    = coalesce($10, primary_language),
		  category_id         = case when $11::bigint is null then category_id
		                             when $11::bigint = 0 then null else $11::bigint end,
		  updated_at          = now()
		where id = $1`,
		id, p.Title, p.Slug, p.Description, p.Status, p.PricePaise, p.MRPPaise,
		p.CertificateEnabled, p.Visibility, p.PrimaryLanguage, p.CategoryID,
	); err != nil {
		if isUniqueViolation(err) {
			return ErrSlugTaken
		}
		return err
	}

	if p.Tags != nil {
		if _, err := tx.Exec(ctx, `delete from course_tags where course_id = $1`, id); err != nil {
			return err
		}
		for _, tag := range *p.Tags {
			tag = strings.TrimSpace(tag)
			if tag == "" {
				continue
			}
			if _, err := tx.Exec(ctx,
				`insert into course_tags (course_id, tag) values ($1, $2) on conflict do nothing`,
				id, tag); err != nil {
				return err
			}
		}
	}

	if p.InstructorIDs != nil {
		if _, err := tx.Exec(ctx, `delete from course_instructors where course_id = $1`, id); err != nil {
			return err
		}
		for pos, instructorID := range *p.InstructorIDs {
			if _, err := tx.Exec(ctx,
				`insert into course_instructors (course_id, instructor_id, position) values ($1, $2, $3)`,
				id, instructorID, pos); err != nil {
				return err
			}
		}
	}

	return tx.Commit(ctx)
}

// CourseStatus returns the status of a course, or ErrNotFound.
func (s *Store) CourseStatus(ctx context.Context, id int64) (string, error) {
	var status string
	err := s.DB.QueryRow(ctx, `select status from courses where id = $1`, id).Scan(&status)
	if errors.Is(err, pgx.ErrNoRows) {
		return "", ErrNotFound
	}
	return status, err
}

// CanPublish reports whether a course has at least one module with a ready video.
func (s *Store) CanPublish(ctx context.Context, id int64) (bool, error) {
	var ok bool
	err := s.DB.QueryRow(ctx, `
		select exists(select 1 from modules where course_id = $1 and video_status = 'ready')`, id).
		Scan(&ok)
	return ok, err
}

// SetThumbnail stores the relative path of a course's thumbnail and returns the old one.
func (s *Store) SetThumbnail(ctx context.Context, id int64, path string) (old *string, err error) {
	err = s.DB.QueryRow(ctx, `
		update courses set thumbnail_path = $2, updated_at = now()
		where id = $1
		returning (select thumbnail_path from courses where id = $1)`, id, path).Scan(&old)
	if errors.Is(err, pgx.ErrNoRows) {
		return nil, ErrNotFound
	}
	return old, err
}

// ThumbnailPath returns the stored thumbnail path, or "" when the course has none.
func (s *Store) ThumbnailPath(ctx context.Context, id int64) (string, error) {
	var p *string
	err := s.DB.QueryRow(ctx, `select thumbnail_path from courses where id = $1`, id).Scan(&p)
	if errors.Is(err, pgx.ErrNoRows) {
		return "", ErrNotFound
	}
	if err != nil || p == nil {
		return "", err
	}
	return *p, nil
}

// ---------- Modules ----------

const moduleColumns = `id, course_id, module_number, title, description, duration_seconds,
	is_free_preview, is_new, video_status, video_error, video_size_bytes, updated_at`

func scanModule(row pgx.Row, m *Module) error {
	return row.Scan(&m.ID, &m.CourseID, &m.ModuleNumber, &m.Title, &m.Description,
		&m.DurationSeconds, &m.IsFreePreview, &m.IsNew, &m.VideoStatus, &m.VideoError,
		&m.VideoSizeBytes, &m.UpdatedAt)
}

// ListModules returns a course's modules in play order.
func (s *Store) ListModules(ctx context.Context, courseID int64) ([]Module, error) {
	rows, err := s.DB.Query(ctx,
		`select `+moduleColumns+` from modules where course_id = $1 order by module_number`, courseID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	list := []Module{}
	for rows.Next() {
		var m Module
		if err := scanModule(rows, &m); err != nil {
			return nil, err
		}
		list = append(list, m)
	}
	return list, rows.Err()
}

// GetModule returns one module, or ErrNotFound.
func (s *Store) GetModule(ctx context.Context, id int64) (Module, error) {
	var m Module
	err := scanModule(s.DB.QueryRow(ctx, `select `+moduleColumns+` from modules where id = $1`, id), &m)
	if errors.Is(err, pgx.ErrNoRows) {
		return m, ErrNotFound
	}
	return m, err
}

// CreateModule appends a module to the end of the course.
func (s *Store) CreateModule(ctx context.Context, courseID int64, title, description string,
	duration *int, freePreview, isNew bool) (Module, error) {
	var m Module
	err := scanModule(s.DB.QueryRow(ctx, `
		insert into modules (course_id, module_number, title, description, duration_seconds,
		                     is_free_preview, is_new)
		values ($1,
		        (select coalesce(max(module_number), 0) + 1 from modules where course_id = $1),
		        $2, $3, $4, $5, $6)
		returning `+moduleColumns,
		courseID, title, description, duration, freePreview, isNew), &m)
	return m, err
}

// UpdateModule applies a partial change to a module.
func (s *Store) UpdateModule(ctx context.Context, id int64, p ModulePatch) (Module, error) {
	var m Module
	err := scanModule(s.DB.QueryRow(ctx, `
		update modules set
		  title            = coalesce($2, title),
		  description      = coalesce($3, description),
		  duration_seconds = case when $4::int is null then duration_seconds
		                          when $4::int = 0 then null else $4::int end,
		  is_free_preview  = coalesce($5, is_free_preview),
		  is_new           = coalesce($6, is_new),
		  updated_at       = now()
		where id = $1
		returning `+moduleColumns,
		id, p.Title, p.Description, p.DurationSeconds, p.IsFreePreview, p.IsNew), &m)
	if errors.Is(err, pgx.ErrNoRows) {
		return m, ErrNotFound
	}
	return m, err
}

// DeleteModule removes a module and returns its stored file paths so the caller can delete the files.
func (s *Store) DeleteModule(ctx context.Context, id int64) ([]string, error) {
	var original, hls string
	err := s.DB.QueryRow(ctx, `
		delete from modules where id = $1
		returning coalesce(video_original_path, ''), coalesce(hls_path, '')`, id).
		Scan(&original, &hls)
	if errors.Is(err, pgx.ErrNoRows) {
		return nil, ErrNotFound
	}
	if err != nil {
		return nil, err
	}
	files := []string{}
	for _, p := range []string{original, hls} {
		if p != "" {
			files = append(files, p)
		}
	}
	return files, nil
}

// ReorderModules sets module_number from the given order. ids must be exactly the course's modules.
func (s *Store) ReorderModules(ctx context.Context, courseID int64, ids []int64) error {
	tx, err := s.DB.Begin(ctx)
	if err != nil {
		return err
	}
	defer tx.Rollback(ctx) //nolint:errcheck

	var count int64
	if err := tx.QueryRow(ctx, `select count(*) from modules where course_id = $1`, courseID).Scan(&count); err != nil {
		return err
	}
	if count != int64(len(ids)) {
		return fmt.Errorf("expected %d module ids, got %d", count, len(ids))
	}

	for i, id := range ids {
		tag, err := tx.Exec(ctx,
			`update modules set module_number = $3, updated_at = now() where id = $1 and course_id = $2`,
			id, courseID, i+1)
		if err != nil {
			return err
		}
		if tag.RowsAffected() == 0 {
			return fmt.Errorf("module %d does not belong to this course", id)
		}
	}
	return tx.Commit(ctx)
}

// SetModuleVideo records a newly uploaded original file and returns the previous original path.
func (s *Store) SetModuleVideo(ctx context.Context, id int64, path string, size int64) (oldPath *string, err error) {
	err = s.DB.QueryRow(ctx, `
		update modules set
		  video_status = 'uploaded', video_original_path = $2, video_size_bytes = $3,
		  hls_path = null, video_error = null, updated_at = now()
		where id = $1
		returning (select video_original_path from modules where id = $1)`, id, path, size).
		Scan(&oldPath)
	if errors.Is(err, pgx.ErrNoRows) {
		return nil, ErrNotFound
	}
	return oldPath, err
}

// ModuleCourse returns the course a module belongs to.
func (s *Store) ModuleCourse(ctx context.Context, moduleID int64) (int64, error) {
	var courseID int64
	err := s.DB.QueryRow(ctx, `select course_id from modules where id = $1`, moduleID).Scan(&courseID)
	if errors.Is(err, pgx.ErrNoRows) {
		return 0, ErrNotFound
	}
	return courseID, err
}

// ---------- Lookup lists for the editor ----------

func (s *Store) Categories(ctx context.Context) ([]Category, error) {
	rows, err := s.DB.Query(ctx, `select id, name, slug from categories order by name`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	list := []Category{}
	for rows.Next() {
		var c Category
		if err := rows.Scan(&c.ID, &c.Name, &c.Slug); err != nil {
			return nil, err
		}
		list = append(list, c)
	}
	return list, rows.Err()
}

func (s *Store) Instructors(ctx context.Context) ([]Instructor, error) {
	rows, err := s.DB.Query(ctx, `select id, name, title from instructors order by name`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	list := []Instructor{}
	for rows.Next() {
		var in Instructor
		if err := rows.Scan(&in.ID, &in.Name, &in.Title); err != nil {
			return nil, err
		}
		list = append(list, in)
	}
	return list, rows.Err()
}

func (s *Store) CreateCategory(ctx context.Context, name, slug string) (Category, error) {
	var c Category
	err := s.DB.QueryRow(ctx, `
		insert into categories (name, slug) values ($1, $2)
		returning id, name, slug`, name, slug).Scan(&c.ID, &c.Name, &c.Slug)
	if isUniqueViolation(err) {
		return c, ErrSlugTaken
	}
	return c, err
}

func (s *Store) CreateInstructor(ctx context.Context, name, title string) (Instructor, error) {
	var in Instructor
	err := s.DB.QueryRow(ctx, `
		insert into instructors (name, title) values ($1, $2)
		returning id, name, title`, name, title).Scan(&in.ID, &in.Name, &in.Title)
	return in, err
}
