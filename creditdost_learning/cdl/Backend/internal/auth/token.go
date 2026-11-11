package auth

import (
	"fmt"
	"strconv"
	"time"

	"github.com/golang-jwt/jwt/v5"
)

// SessionCookieName is the HTTP-only cookie that carries the admin session.
const SessionCookieName = "cdl_admin"

// SessionTTL is how long a session stays valid (PRD: 24 hours).
const SessionTTL = 24 * time.Hour

// Claims is the payload stored inside the session token.
type Claims struct {
	AdminID int64  `json:"aid"`
	Role    string `json:"role"`
	jwt.RegisteredClaims
}

// IssueToken creates a signed token for an admin, valid for SessionTTL.
func IssueToken(secret []byte, adminID int64, role string) (string, error) {
	now := time.Now()
	claims := Claims{
		AdminID: adminID,
		Role:    role,
		RegisteredClaims: jwt.RegisteredClaims{
			Subject:   strconv.FormatInt(adminID, 10),
			IssuedAt:  jwt.NewNumericDate(now),
			ExpiresAt: jwt.NewNumericDate(now.Add(SessionTTL)),
		},
	}
	token, err := jwt.NewWithClaims(jwt.SigningMethodHS256, claims).SignedString(secret)
	if err != nil {
		return "", fmt.Errorf("sign token: %w", err)
	}
	return token, nil
}

// ParseToken checks the signature, algorithm and expiry, and returns the claims.
func ParseToken(secret []byte, token string) (*Claims, error) {
	claims := &Claims{}
	_, err := jwt.ParseWithClaims(token, claims,
		func(*jwt.Token) (any, error) { return secret, nil },
		jwt.WithValidMethods([]string{jwt.SigningMethodHS256.Alg()}),
		jwt.WithExpirationRequired(),
	)
	if err != nil {
		return nil, err
	}
	return claims, nil
}
