package portal

import (
	"context"
	"errors"
	"regexp"
	"strings"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgconn"
)

var (
	ErrInvalidMobile   = errors.New("enter a valid 10-digit Indian mobile number")
	ErrMobileTaken     = errors.New("this mobile number is already used by another account")
	ErrInvalidLanguage = errors.New("choose a supported language")
	ErrFieldTooLong    = errors.New("name, city and state must be at most 100 characters")
)

// Languages a student can pick for course audio and app content (ISO 639-1 codes).
var Languages = map[string]string{
	"en": "English", "hi": "Hindi", "bn": "Bengali", "ta": "Tamil", "te": "Telugu",
	"mr": "Marathi", "gu": "Gujarati", "kn": "Kannada", "ml": "Malayalam", "pa": "Punjabi",
}

var mobileRe = regexp.MustCompile(`^[6-9][0-9]{9}$`)

// ProfileUpdate is what a student may change about themselves. Email is the sign-in identity
// and is not editable here.
type ProfileUpdate struct {
	Name     string
	Mobile   string // empty clears it
	City     string
	State    string
	Language string
}

// NormalizeMobile accepts "98765 43210", "+91 9876543210" or "09876543210" and returns 10 digits.
func NormalizeMobile(in string) (string, error) {
	var b strings.Builder
	for _, r := range in {
		if r >= '0' && r <= '9' {
			b.WriteRune(r)
		}
	}
	d := b.String()
	switch {
	case d == "":
		return "", nil
	case len(d) == 12 && strings.HasPrefix(d, "91"):
		d = d[2:]
	case len(d) == 11 && strings.HasPrefix(d, "0"):
		d = d[1:]
	}
	if !mobileRe.MatchString(d) {
		return "", ErrInvalidMobile
	}
	return d, nil
}

// UpdateProfile saves the student's editable details.
func (s *Store) UpdateProfile(ctx context.Context, studentID int64, u ProfileUpdate) error {
	u.Name = strings.TrimSpace(u.Name)
	u.City = strings.TrimSpace(u.City)
	u.State = strings.TrimSpace(u.State)
	u.Language = strings.TrimSpace(strings.ToLower(u.Language))
	if u.Name == "" {
		return ErrNeedsName
	}
	if len(u.Name) > 100 || len(u.City) > 100 || len(u.State) > 100 {
		return ErrFieldTooLong
	}
	if _, ok := Languages[u.Language]; !ok {
		return ErrInvalidLanguage
	}
	mobile, err := NormalizeMobile(u.Mobile)
	if err != nil {
		return err
	}
	var mobileArg *string
	if mobile != "" {
		mobileArg = &mobile
	}

	// A student must keep at least one contact; email is always set for app sign-ups, and the
	// students_contact_required check enforces this for manually enrolled ones.
	tag, err := s.DB.Exec(ctx, `
		update students
		set name = $2, mobile = $3, city = $4, state = $5, preferred_language = $6, updated_at = now()
		where id = $1`, studentID, u.Name, mobileArg, u.City, u.State, u.Language)
	var pgErr *pgconn.PgError
	if errors.As(err, &pgErr) && pgErr.Code == "23505" {
		return ErrMobileTaken
	}
	if errors.As(err, &pgErr) && pgErr.Code == "23514" {
		return ErrInvalidMobile
	}
	if err != nil {
		return err
	}
	if tag.RowsAffected() == 0 {
		return ErrNotFound
	}
	return nil
}

// SetAvatar stores a new photo path and returns the previous one (to delete), if any.
func (s *Store) SetAvatar(ctx context.Context, studentID int64, rel *string) (old *string, err error) {
	err = s.DB.QueryRow(ctx, `
		update students st set avatar_path = $2, updated_at = now()
		from (select avatar_path from students where id = $1 for update) prev
		where st.id = $1
		returning prev.avatar_path`, studentID, rel).Scan(&old)
	if errors.Is(err, pgx.ErrNoRows) {
		return nil, ErrNotFound
	}
	return old, err
}

// AvatarPath returns the student's photo path, or "" when there is none.
func (s *Store) AvatarPath(ctx context.Context, studentID int64) (string, error) {
	var p *string
	err := s.DB.QueryRow(ctx, `select avatar_path from students where id = $1`, studentID).Scan(&p)
	if errors.Is(err, pgx.ErrNoRows) {
		return "", ErrNotFound
	}
	if err != nil || p == nil {
		return "", err
	}
	return *p, nil
}
