# Credit Dost Learning - Student App (Flutter)

Screens are built from the Stitch export `stitch_credit_dost_learning_student_app_screens.zip`
(the zip's folder is named `admin_console`, but its 9 screens are the student app). Each screen is
adjusted to what the Go backend returns today.

## Run

Requires Flutter 3.33+ (uses `DropdownButtonFormField(initialValue:)`, `CardThemeData` and `withValues`).

```
cd cdl/StudentApp
flutter create --platforms=android,ios --project-name credit_dost_student .   # adds android/ and ios/ folders
flutter pub get
flutter run --dart-define=API_BASE_URL=http://10.0.2.2:8080                  # Android emulator -> host API
```

`flutter create .` only adds the platform folders. It keeps the existing `lib/` and `pubspec.yaml`.

## Screen mapping

| Stitch screen | Flutter file | Status |
|---|---|---|
| Login / Sign Up | `lib/screens/login_screen.dart` | Email + password (backend auth). OTP, WhatsApp and Google sign-in removed. |
| Dashboard & Classes | `lib/screens/classes_screen.dart` | Enrolled courses with progress. Cohort, live class, streak and accelerator tiles removed. |
| (course page, implied) | `lib/screens/course_screen.dart` | Module list with locked/processing states. |
| Lesson Video Player | `lib/screens/lesson_screen.dart` | HLS playback with session cookie. AI dub, templates, timestamps removed. |
| Explore & Plans | `lib/screens/plans_screen.dart` | Individual courses only. Pro-pass bundle, launch offer and EMI removed. |
| Important Updates | `lib/screens/updates_screen.dart` | Student's emails from `notifications`. Live-class RSVP and knowledge feed removed. |
| Customer Support | `lib/screens/support_screen.dart` | Tickets list and new-ticket form. WhatsApp, helpline and quick-action hub removed. |
| Student Profile | `lib/screens/profile_screen.dart` | Identity, stats, sign out. Devices, KYC, offline and AI audio removed. |
| Transactions & Invoices | not built | Needs a student orders endpoint. Shown as "Coming soon" under Profile. |
| Settings & Security | not built | Needs password change, sessions and 2FA endpoints. "Coming soon" under Profile. |

## Backend contract the app expects

Mounted under `/api/student`. Shapes match `Backend/internal/portal/store.go`.

| Method | Path | Status in backend |
|---|---|---|
| POST | `/auth/register` | Store exists (`portal.Register`). No HTTP route yet. |
| POST | `/auth/login` | Store exists (`portal.Login`). Must set the `cdl_student` cookie. No route yet. |
| POST | `/auth/logout` | Store exists (`portal.Logout`). No route yet. |
| GET | `/me` | Store exists (`portal.Me`). No route yet. |
| GET | `/catalogue` | Store exists (`portal.Catalogue`). No route yet. |
| GET | `/courses/{id}` | Store exists (`portal.Course`). No route yet. |
| GET | `/modules/{id}/hls/index.m3u8` | Missing. Only the admin HLS route exists. |
| PUT | `/modules/{id}/progress` | Missing. Writes `module_progress`. |
| GET | `/notifications` | Missing. Returns `[{id, subject, body, sentAt}]`. |
| GET / POST | `/tickets` | Missing. Backed by `support_tickets` and `ticket_messages`. |

Money is in paise (`pricePaise`, `mrpPaise`). The app shows rupees.
Each `TODO(backend)` in `lib/core/portal_repository.dart` marks one of these.

## Not verified

The Flutter SDK is not installed on the machine where this was written, so the code has not been
compiled or run. Run `flutter analyze` first and fix any issues it reports.
