import 'api_client.dart';
import 'models.dart';

/// Every call the student app makes. Paths are under /api/student, which the backend's
/// portal package mounts (see Backend/internal/httpapi/router.go).
class PortalRepository {
  PortalRepository(this._api);

  final ApiClient _api;
  static const _base = '/api/student';

  Map<String, dynamic> _map(dynamic d) => Map<String, dynamic>.from(d as Map);

  /// List endpoints return either a bare JSON array or {"items": [...]}; accept both.
  List<dynamic> _list(dynamic d) {
    if (d is List) return d;
    if (d is Map && d['items'] is List) return d['items'] as List;
    throw ApiException('Unexpected response from the server.');
  }

  // --- Session ---------------------------------------------------------------

  Future<void> register({required String name, required String email, required String password}) =>
      _api.send('POST', '$_base/auth/register', body: {'name': name, 'email': email, 'password': password});

  Future<Profile> login({required String email, required String password}) async {
    await _api.send('POST', '$_base/auth/login', body: {
      'email': email,
      'password': password,
      'deviceLabel': 'Student app',
    });
    return me();
  }

  Future<void> logout() => _api.send('POST', '$_base/auth/logout');

  /// Sets a new password from the forgot-password form. Signs out the student's other sessions.
  Future<void> resetPassword({required String email, required String password}) =>
      _api.send('POST', '$_base/auth/reset-password', body: {'email': email, 'password': password});

  Future<Profile> me() async => Profile.fromJson(_map(await _api.send('GET', '$_base/me')));

  // --- Profile ---------------------------------------------------------------

  /// Saves name, mobile, city, state and language. Returns the updated profile.
  Future<Profile> updateProfile({
    required String name,
    required String mobile,
    required String city,
    required String state,
    required String preferredLanguage,
  }) async =>
      Profile.fromJson(_map(await _api.send('PATCH', '$_base/me', body: {
        'name': name,
        'mobile': mobile,
        'city': city,
        'state': state,
        'preferredLanguage': preferredLanguage,
      })));

  /// Uploads a new profile photo (JPEG, PNG or WebP, up to 5 MB). Returns the updated profile.
  Future<Profile> uploadAvatar(List<int> bytes, String filename) async =>
      Profile.fromJson(_map(await _api.sendFile('$_base/me/avatar', field: 'avatar', bytes: bytes, filename: filename)));

  /// Removes the profile photo. Returns the updated profile.
  Future<Profile> deleteAvatar() async => Profile.fromJson(_map(await _api.send('DELETE', '$_base/me/avatar')));

  /// The student's photo bytes, or null when they have none.
  Future<List<int>?> avatarBytes() => _api.getBytes('$_base/me/avatar');

  /// Languages the student can choose, as (code, name) pairs.
  Future<List<(String, String)>> languages() async {
    final list = _list(await _api.send('GET', '$_base/languages'));
    return [for (final e in list) (_map(e)['code'] as String, _map(e)['name'] as String)];
  }

  // --- Catalogue and courses -------------------------------------------------

  Future<List<CourseCard>> catalogue() async {
    final list = _list(await _api.send('GET', '$_base/catalogue'));
    return list.map((e) => CourseCard.fromJson(_map(e))).toList();
  }

  Future<CourseDetail> course(int id) async =>
      CourseDetail.fromJson(_map(await _api.send('GET', '$_base/courses/$id')));

  /// Streaming URL for a module. Needs the session cookie (see ApiClient.cookieHeaderFor).
  Uri moduleStreamUrl(int moduleId) => _api.resolve('$_base/modules/$moduleId/hls/index.m3u8');

  /// Headers the video player must send with [uri] so the session cookie is accepted.
  Future<Map<String, String>> streamHeaders(Uri uri) async => {'Cookie': await _api.cookieHeaderFor(uri)};

  /// Saves watch position and completion (PUT /modules/{id}/progress).
  Future<void> saveProgress(int moduleId, {required int watchedSeconds, required bool completed}) =>
      _api.send('PUT', '$_base/modules/$moduleId/progress',
          body: {'watchedSeconds': watchedSeconds, 'completed': completed});

  // --- Updates and support ---------------------------------------------------

  /// Emails the student has been sent (GET /notifications).
  Future<List<AppNotice>> notifications() async {
    final list = _list(await _api.send('GET', '$_base/notifications'));
    return list.map((e) => AppNotice.fromJson(_map(e))).toList();
  }

  /// The student's support tickets (GET /tickets).
  Future<List<SupportTicket>> tickets() async {
    final list = _list(await _api.send('GET', '$_base/tickets'));
    return list.map((e) => SupportTicket.fromJson(_map(e))).toList();
  }

  /// One ticket with its conversation (GET /tickets/{id}).
  Future<TicketThread> ticket(int id) async =>
      TicketThread.fromJson(_map(await _api.send('GET', '$_base/tickets/$id')));

  /// Adds the student's reply; a resolved ticket is reopened. Returns the updated conversation.
  Future<TicketThread> replyToTicket(int id, String body) async =>
      TicketThread.fromJson(_map(await _api.send('POST', '$_base/tickets/$id/messages', body: {'body': body})));

  /// Bytes of a screenshot attached to a message, or null if it is gone.
  Future<List<int>?> ticketAttachment(int ticketId, int messageId) =>
      _api.getBytes('$_base/tickets/$ticketId/messages/$messageId/attachment');

  /// Opens a support ticket (POST /tickets).
  Future<void> raiseTicket({required String category, required String subject, required String body}) =>
      _api.send('POST', '$_base/tickets', body: {'category': category, 'subject': subject, 'body': body});
}

class AppNotice {
  const AppNotice({required this.id, required this.subject, required this.body, required this.sentAt});

  final int id;
  final String subject;
  final String body;
  final DateTime? sentAt;

  factory AppNotice.fromJson(Map<String, dynamic> j) => AppNotice(
        id: (j['id'] as num?)?.toInt() ?? 0,
        subject: j['subject'] as String? ?? '',
        body: j['body'] as String? ?? '',
        sentAt: j['sentAt'] == null ? null : DateTime.tryParse(j['sentAt'] as String),
      );
}

class SupportTicket {
  const SupportTicket({
    required this.id,
    required this.reference,
    required this.subject,
    required this.category,
    required this.status,
    required this.createdAt,
  });

  final int id;
  final String reference;
  final String subject;
  final String category;
  final String status; // open | in_progress | resolved
  final DateTime? createdAt;

  String get statusLabel => switch (status) {
        'in_progress' => 'In progress',
        'resolved' => 'Resolved',
        _ => 'Open',
      };

  factory SupportTicket.fromJson(Map<String, dynamic> j) => SupportTicket(
        id: (j['id'] as num?)?.toInt() ?? 0,
        reference: j['reference'] as String? ?? '',
        subject: j['subject'] as String? ?? '',
        category: j['category'] as String? ?? '',
        status: j['status'] as String? ?? 'open',
        createdAt: j['createdAt'] == null ? null : DateTime.tryParse(j['createdAt'] as String),
      );
}

class TicketMessage {
  const TicketMessage({
    required this.id,
    required this.fromStudent,
    required this.authorName,
    required this.body,
    required this.hasAttachment,
    required this.createdAt,
  });

  final int id;
  final bool fromStudent;
  final String authorName;
  final String body;
  final bool hasAttachment;
  final DateTime? createdAt;

  factory TicketMessage.fromJson(Map<String, dynamic> j) => TicketMessage(
        id: (j['id'] as num?)?.toInt() ?? 0,
        fromStudent: j['authorType'] == 'student',
        authorName: j['authorName'] as String? ?? '',
        body: j['body'] as String? ?? '',
        hasAttachment: j['hasAttachment'] as bool? ?? false,
        createdAt: j['createdAt'] == null ? null : DateTime.tryParse(j['createdAt'] as String),
      );
}

/// A ticket with its full conversation (GET /tickets/{id}).
class TicketThread {
  const TicketThread({required this.ticket, required this.messages});

  final SupportTicket ticket;
  final List<TicketMessage> messages;

  factory TicketThread.fromJson(Map<String, dynamic> j) => TicketThread(
        ticket: SupportTicket.fromJson(j),
        messages: (j['messages'] as List? ?? const [])
            .map((m) => TicketMessage.fromJson(Map<String, dynamic>.from(m as Map)))
            .toList(),
      );
}
