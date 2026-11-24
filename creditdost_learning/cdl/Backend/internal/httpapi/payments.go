package httpapi

import (
	"encoding/csv"
	"fmt"
	"log"
	"net/http"
	"strconv"
	"time"

	"creditdost/backend/internal/payments"
)

var (
	revenueRanges      = map[string]int{"7d": 7, "30d": 30, "90d": 90, "365d": 365}
	transactionStatus  = map[string]bool{"all": true, "paid": true, "pending": true, "failed": true, "refunded": true}
	transactionGateway = map[string]bool{"all": true, "razorpay": true, "manual": true}
)

func (s *Server) revenueSummary(w http.ResponseWriter, r *http.Request) {
	key := r.URL.Query().Get("range")
	days, ok := revenueRanges[key]
	if !ok {
		key, days = "30d", 30
	}
	rev, err := s.Payments.Revenue(r.Context(), key, days)
	if err != nil {
		log.Printf("revenue: %v", err)
		writeError(w, http.StatusInternalServerError, "could not load revenue")
		return
	}
	writeJSON(w, http.StatusOK, rev)
}

func parseTransactionFilter(r *http.Request) (payments.Filter, string) {
	q := r.URL.Query()
	status := q.Get("status")
	if status == "" {
		status = "all"
	}
	gateway := q.Get("gateway")
	if gateway == "" {
		gateway = "all"
	}
	if !transactionStatus[status] {
		return payments.Filter{}, "status must be all, paid, pending, failed or refunded"
	}
	if !transactionGateway[gateway] {
		return payments.Filter{}, "gateway must be all, razorpay or manual"
	}
	page, _ := strconv.Atoi(q.Get("page"))
	if page <= 0 {
		page = 1
	}
	limit, _ := strconv.Atoi(q.Get("limit"))
	if limit <= 0 || limit > 100 {
		limit = 10
	}
	return payments.Filter{Status: status, Gateway: gateway, Query: q.Get("q"), Page: page, Limit: limit}, ""
}

func (s *Server) listTransactions(w http.ResponseWriter, r *http.Request) {
	f, msg := parseTransactionFilter(r)
	if msg != "" {
		writeError(w, http.StatusBadRequest, msg)
		return
	}
	res, err := s.Payments.List(r.Context(), f)
	if err != nil {
		log.Printf("transactions: %v", err)
		writeError(w, http.StatusInternalServerError, "could not load transactions")
		return
	}
	writeJSON(w, http.StatusOK, res)
}

// exportTransactions downloads the filtered transactions as CSV for the accountant.
func (s *Server) exportTransactions(w http.ResponseWriter, r *http.Request) {
	f, msg := parseTransactionFilter(r)
	if msg != "" {
		writeError(w, http.StatusBadRequest, msg)
		return
	}
	f.Limit = 0
	res, err := s.Payments.List(r.Context(), f)
	if err != nil {
		log.Printf("export transactions: %v", err)
		writeError(w, http.StatusInternalServerError, "could not export transactions")
		return
	}

	filename := fmt.Sprintf("transactions-%s.csv", time.Now().Format("2006-01-02"))
	w.Header().Set("Content-Type", "text/csv; charset=utf-8")
	w.Header().Set("Content-Disposition", `attachment; filename="`+filename+`"`)
	_, _ = w.Write([]byte("\xEF\xBB\xBF"))
	cw := csv.NewWriter(w)
	_ = cw.Write([]string{"Order", "Date", "Student", "Course", "Base (INR)", "Discount (INR)", "GST (INR)",
		"Total (INR)", "Status", "Gateway", "Reference", "Method"})
	for _, t := range res.Items {
		_ = cw.Write([]string{
			t.Code, t.CreatedAt.Format("2006-01-02 15:04"), t.StudentName, t.CourseTitle,
			paise(t.BasePaise), paise(t.DiscountPaise), paise(t.GSTPaise), paise(t.TotalPaise),
			t.Status, t.Gateway, t.Reference, t.ManualMethod,
		})
	}
	cw.Flush()
}

func paise(p int64) string {
	return fmt.Sprintf("%.2f", float64(p)/100)
}
