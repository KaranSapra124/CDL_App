import 'dart:typed_data';

import 'package:flutter/material.dart';

import '../core/api_client.dart';
import '../core/models.dart';
import '../core/portal_repository.dart';
import '../core/theme.dart';

/// The student's profile photo, or their initials when there is none.
///
/// The photo is private, so it is fetched through the API client (which sends the session) and
/// shown from memory. One copy is cached per student; call [StudentAvatar.evict] after the photo
/// changes.
class StudentAvatar extends StatefulWidget {
  const StudentAvatar({
    super.key,
    required this.repo,
    required this.profile,
    this.radius = 32,
    this.preview,
  });

  final PortalRepository repo;
  final Profile profile;
  final double radius;

  /// Bytes to show instead of the server copy (e.g. a photo just picked, before upload).
  final Uint8List? preview;

  static final Map<int, Uint8List> _cache = {};

  static void evict(int studentId) => _cache.remove(studentId);

  @override
  State<StudentAvatar> createState() => _StudentAvatarState();
}

class _StudentAvatarState extends State<StudentAvatar> {
  Uint8List? _bytes;

  @override
  void initState() {
    super.initState();
    _load();
  }

  @override
  void didUpdateWidget(StudentAvatar old) {
    super.didUpdateWidget(old);
    if (!identical(old.profile, widget.profile)) _load();
  }

  Future<void> _load() async {
    final p = widget.profile;
    if (!p.hasAvatar) {
      if (_bytes != null) setState(() => _bytes = null);
      return;
    }
    final cached = StudentAvatar._cache[p.id];
    if (cached != null) {
      setState(() => _bytes = cached);
      return;
    }
    try {
      final data = await widget.repo.avatarBytes();
      if (data == null || !mounted) return;
      final bytes = Uint8List.fromList(data);
      StudentAvatar._cache[p.id] = bytes;
      setState(() => _bytes = bytes);
    } on ApiException {
      // Fall back to initials if the photo cannot be loaded.
    }
  }

  @override
  Widget build(BuildContext context) {
    final image = widget.preview ?? _bytes;
    return CircleAvatar(
      radius: widget.radius,
      backgroundColor: AppColors.primaryContainer,
      foregroundImage: image != null ? MemoryImage(image) : null,
      child: Text(
        widget.profile.initials,
        style: AppText.headlineMd.copyWith(color: Colors.white, fontSize: widget.radius * 0.62),
      ),
    );
  }
}
