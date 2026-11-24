package auth

import (
	"strconv"
	"time"

	"github.com/golang-jwt/jwt/v5"
)

// StudentCookieName is the HTTP-only cookie for the student portal. It is separate from the admin cookie.
const StudentCookieName = "cdl_student"

// studentAudience stops an admin token being accepted as a student token, and the reverse.
const studentAudience = "cdl-student"

// StudentClaims identifies a student session.
type StudentClaims struct {
	StudentID int64 `json:"stu"`
	SessionID int64 `json:"sid"`
	jwt.RegisteredClaims
}

// IssueStudentToken signs a token for one student session. It lasts as long as SessionTTL.
func IssueStudentToken(secret []byte, studentID, sessionID int64) (string, error) {
	now := time.Now()
	claims := StudentClaims{
		StudentID: studentID,
		SessionID: sessionID,
		RegisteredClaims: jwt.RegisteredClaims{
			Subject:   strconv.FormatInt(studentID, 10),
			Audience:  jwt.ClaimStrings{studentAudience},
			IssuedAt:  jwt.NewNumericDate(now),
			ExpiresAt: jwt.NewNumericDate(now.Add(SessionTTL)),
		},
	}
	return jwt.NewWithClaims(jwt.SigningMethodHS256, claims).SignedString(secret)
}

// ParseStudentToken checks signature, algorithm, expiry and audience, then returns the claims.
func ParseStudentToken(secret []byte, token string) (*StudentClaims, error) {
	claims := &StudentClaims{}
	_, err := jwt.ParseWithClaims(token, claims,
		func(*jwt.Token) (any, error) { return secret, nil },
		jwt.WithValidMethods([]string{jwt.SigningMethodHS256.Alg()}),
		jwt.WithExpirationRequired(),
		jwt.WithAudience(studentAudience),
	)
	if err != nil {
		return nil, err
	}
	if claims.SessionID == 0 || claims.StudentID == 0 {
		return nil, jwt.ErrTokenInvalidClaims
	}
	return claims, nil
}
