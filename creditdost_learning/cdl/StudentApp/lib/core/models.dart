// JSON models that mirror the student-facing structs in Backend/internal/portal/store.go.

int _int(Object? v) => v is num ? v.toInt() : 0;

List<String> _strings(Object? v) => v is List ? v.map((e) => e.toString()).toList() : const [];

class Profile {
  const Profile({
    required this.id,
    required this.name,
    required this.email,
    required this.city,
    required this.state,
    required this.preferredLanguage,
    this.mobile = '',
    this.hasAvatar = false,
  });

  final int id;
  final String name;
  final String email;
  final String mobile;
  final String city;
  final String state;
  final String preferredLanguage;
  final bool hasAvatar;

  /// "+91 98765 43210" for display, or empty.
  String get mobileLabel =>
      mobile.length == 10 ? '+91 ${mobile.substring(0, 5)} ${mobile.substring(5)}' : mobile;

  String get firstName => name.trim().split(' ').first;

  String get initials {
    final parts = name.trim().split(RegExp(r'\s+')).where((p) => p.isNotEmpty).toList();
    if (parts.isEmpty) return '?';
    if (parts.length == 1) return parts.first[0].toUpperCase();
    return (parts.first[0] + parts.last[0]).toUpperCase();
  }

  String get location => [city, state].where((s) => s.isNotEmpty).join(', ');

  factory Profile.fromJson(Map<String, dynamic> j) => Profile(
        id: _int(j['id']),
        name: j['name'] as String? ?? '',
        email: j['email'] as String? ?? '',
        mobile: j['mobile'] as String? ?? '',
        city: j['city'] as String? ?? '',
        state: j['state'] as String? ?? '',
        preferredLanguage: j['preferredLanguage'] as String? ?? 'hi',
        hasAvatar: j['hasAvatar'] as bool? ?? false,
      );
}

class CourseCard {
  const CourseCard({
    required this.id,
    required this.slug,
    required this.title,
    required this.category,
    required this.instructors,
    required this.pricePaise,
    required this.mrpPaise,
    required this.hasThumbnail,
    required this.modules,
    required this.freeModules,
    required this.enrolled,
    required this.completedModules,
  });

  final int id;
  final String slug;
  final String title;
  final String? category;
  final List<String> instructors;
  final int pricePaise;
  final int? mrpPaise;
  final bool hasThumbnail;
  final int modules;
  final int freeModules;
  final bool enrolled;
  final int completedModules;

  double get progress => modules == 0 ? 0 : completedModules / modules;

  /// Price in rupees for display. Money is stored in paise on the server.
  String get priceLabel => '₹${(pricePaise / 100).toStringAsFixed(0)}';

  String? get mrpLabel => mrpPaise == null ? null : '₹${(mrpPaise! / 100).toStringAsFixed(0)}';

  factory CourseCard.fromJson(Map<String, dynamic> j) => CourseCard(
        id: _int(j['id']),
        slug: j['slug'] as String? ?? '',
        title: j['title'] as String? ?? '',
        category: j['category'] as String?,
        instructors: _strings(j['instructors']),
        pricePaise: _int(j['pricePaise']),
        mrpPaise: j['mrpPaise'] == null ? null : _int(j['mrpPaise']),
        hasThumbnail: j['hasThumbnail'] as bool? ?? false,
        modules: _int(j['modules']),
        freeModules: _int(j['freeModules']),
        enrolled: j['enrolled'] as bool? ?? false,
        completedModules: _int(j['completedModules']),
      );
}

class ModuleItem {
  const ModuleItem({
    required this.id,
    required this.moduleNumber,
    required this.title,
    required this.description,
    required this.durationSeconds,
    required this.isFreePreview,
    required this.isNew,
    required this.ready,
    required this.locked,
    required this.completed,
    required this.watchedSeconds,
  });

  final int id;
  final int moduleNumber;
  final String title;
  final String description;
  final int? durationSeconds;
  final bool isFreePreview;
  final bool isNew;
  final bool ready;
  final bool locked;
  final bool completed;
  final int watchedSeconds;

  bool get playable => !locked && ready;

  String get durationLabel {
    final s = durationSeconds;
    if (s == null || s == 0) return '';
    final m = (s / 60).round();
    return '$m min';
  }

  factory ModuleItem.fromJson(Map<String, dynamic> j) => ModuleItem(
        id: _int(j['id']),
        moduleNumber: _int(j['moduleNumber']),
        title: j['title'] as String? ?? '',
        description: j['description'] as String? ?? '',
        durationSeconds: j['durationSeconds'] == null ? null : _int(j['durationSeconds']),
        isFreePreview: j['isFreePreview'] as bool? ?? false,
        isNew: j['isNew'] as bool? ?? false,
        ready: j['ready'] as bool? ?? false,
        locked: j['locked'] as bool? ?? true,
        completed: j['completed'] as bool? ?? false,
        watchedSeconds: _int(j['watchedSeconds']),
      );
}

class CourseDetail {
  const CourseDetail({required this.card, required this.description, required this.modules});

  final CourseCard card;
  final String description;
  final List<ModuleItem> modules;

  factory CourseDetail.fromJson(Map<String, dynamic> j) => CourseDetail(
        card: CourseCard.fromJson(j),
        description: j['description'] as String? ?? '',
        modules: (j['modules'] as List? ?? const [])
            .map((m) => ModuleItem.fromJson(m as Map<String, dynamic>))
            .toList(),
      );
}
