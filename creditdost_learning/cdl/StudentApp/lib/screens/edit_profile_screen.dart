import 'dart:typed_data';

import 'package:flutter/foundation.dart' show kIsWeb;
import 'package:flutter/material.dart';
import 'package:image_picker/image_picker.dart';

import '../core/api_client.dart';
import '../core/models.dart';
import '../core/portal_repository.dart';
import '../core/theme.dart';
import 'student_avatar.dart';
import 'widgets.dart';

/// Edit profile: photo, name, mobile, city, state and preferred language.
/// Email is the sign-in identity and is shown read-only.
/// Every successful change is reported through [onChanged] so the rest of the app updates.
class EditProfileScreen extends StatefulWidget {
  const EditProfileScreen({super.key, required this.repo, required this.profile, required this.onChanged});

  final PortalRepository repo;
  final Profile profile;
  final ValueChanged<Profile> onChanged;

  @override
  State<EditProfileScreen> createState() => _EditProfileScreenState();
}

class _EditProfileScreenState extends State<EditProfileScreen> {
  final _formKey = GlobalKey<FormState>();
  late Profile _profile = widget.profile;
  late final _name = TextEditingController(text: _profile.name);
  late final _mobile = TextEditingController(text: _profile.mobile);
  late final _city = TextEditingController(text: _profile.city);
  late final _state = TextEditingController(text: _profile.state);
  late String _language = _profile.preferredLanguage;

  // Fallback if the language list cannot be loaded; matches Backend/internal/portal/profile.go.
  List<(String, String)> _languages = const [
    ('bn', 'Bengali'), ('en', 'English'), ('gu', 'Gujarati'), ('hi', 'Hindi'), ('kn', 'Kannada'),
    ('ml', 'Malayalam'), ('mr', 'Marathi'), ('pa', 'Punjabi'), ('ta', 'Tamil'), ('te', 'Telugu'),
  ];

  bool _saving = false;
  bool _uploading = false;
  Uint8List? _preview;
  String? _error;

  @override
  void initState() {
    super.initState();
    widget.repo.languages().then((list) {
      if (mounted && list.isNotEmpty) setState(() => _languages = list);
    }).catchError((_) {});
  }

  @override
  void dispose() {
    _name.dispose();
    _mobile.dispose();
    _city.dispose();
    _state.dispose();
    super.dispose();
  }

  void _changed(Profile p) {
    _profile = p;
    widget.onChanged(p);
  }

  Future<void> _save() async {
    if (!(_formKey.currentState?.validate() ?? false)) return;
    setState(() {
      _saving = true;
      _error = null;
    });
    try {
      final p = await widget.repo.updateProfile(
        name: _name.text.trim(),
        mobile: _mobile.text.trim(),
        city: _city.text.trim(),
        state: _state.text.trim(),
        preferredLanguage: _language,
      );
      _changed(p);
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(const SnackBar(content: Text('Profile saved.')));
      Navigator.of(context).pop();
    } on ApiException catch (e) {
      if (mounted) setState(() => _error = e.message);
    } finally {
      if (mounted) setState(() => _saving = false);
    }
  }

  Future<void> _photoOptions() async {
    final choice = await showModalBottomSheet<String>(
      context: context,
      showDragHandle: true,
      backgroundColor: AppColors.surfaceLowest,
      builder: (context) => SafeArea(
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            ListTile(
              leading: const IconBox(icon: Icons.photo_library_outlined),
              title: const Text('Choose from gallery'),
              onTap: () => Navigator.pop(context, 'gallery'),
            ),
            if (!kIsWeb)
              ListTile(
                leading: const IconBox(icon: Icons.photo_camera_outlined),
                title: const Text('Take a photo'),
                onTap: () => Navigator.pop(context, 'camera'),
              ),
            if (_profile.hasAvatar)
              ListTile(
                leading: const IconBox(
                  icon: Icons.delete_outline,
                  background: AppColors.errorContainer,
                  foreground: AppColors.error,
                ),
                title: const Text('Remove photo', style: TextStyle(color: AppColors.error)),
                onTap: () => Navigator.pop(context, 'remove'),
              ),
            const SizedBox(height: 8),
          ],
        ),
      ),
    );
    if (choice == null || !mounted) return;
    if (choice == 'remove') {
      await _removePhoto();
    } else {
      await _pickAndUpload(choice == 'camera' ? ImageSource.camera : ImageSource.gallery);
    }
  }

  Future<void> _pickAndUpload(ImageSource source) async {
    final XFile? file;
    try {
      // Resize on device so uploads stay well under the 5 MB limit.
      file = await ImagePicker().pickImage(source: source, maxWidth: 1024, maxHeight: 1024, imageQuality: 85);
    } catch (e) {
      if (mounted) setState(() => _error = 'Could not open the photo picker: $e');
      return;
    }
    if (file == null) return;
    final bytes = await file.readAsBytes();
    setState(() {
      _preview = bytes;
      _uploading = true;
      _error = null;
    });
    try {
      final p = await widget.repo.uploadAvatar(bytes, file.name.isEmpty ? 'avatar.jpg' : file.name);
      StudentAvatar.evict(p.id);
      _changed(p);
      if (mounted) ScaffoldMessenger.of(context).showSnackBar(const SnackBar(content: Text('Photo updated.')));
    } on ApiException catch (e) {
      if (mounted) {
        setState(() {
          _preview = null;
          _error = e.message;
        });
      }
    } finally {
      if (mounted) setState(() => _uploading = false);
    }
  }

  Future<void> _removePhoto() async {
    setState(() {
      _uploading = true;
      _error = null;
    });
    try {
      final p = await widget.repo.deleteAvatar();
      StudentAvatar.evict(p.id);
      _changed(p);
      if (mounted) setState(() => _preview = null);
    } on ApiException catch (e) {
      if (mounted) setState(() => _error = e.message);
    } finally {
      if (mounted) setState(() => _uploading = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: const CdBackHeader(title: 'Edit Profile'),
      body: SafeArea(
        child: ListView(
          padding: const EdgeInsets.fromLTRB(16, 8, 16, 32),
          children: [
            Center(
              child: GestureDetector(
                onTap: _uploading ? null : _photoOptions,
                child: Stack(
                  clipBehavior: Clip.none,
                  children: [
                    StudentAvatar(repo: widget.repo, profile: _profile, radius: 48, preview: _preview),
                    if (_uploading)
                      const Positioned.fill(
                        child: CircleAvatar(
                          backgroundColor: Color(0x66000000),
                          child: SizedBox(
                            width: 28,
                            height: 28,
                            child: CircularProgressIndicator(strokeWidth: 2.5, color: Colors.white),
                          ),
                        ),
                      ),
                    Positioned(
                      right: -2,
                      bottom: -2,
                      child: Container(
                        width: 34,
                        height: 34,
                        decoration: BoxDecoration(
                          color: AppColors.primaryContainer,
                          shape: BoxShape.circle,
                          border: Border.all(color: AppColors.surface, width: 3),
                        ),
                        child: const Icon(Icons.photo_camera, size: 16, color: Colors.white),
                      ),
                    ),
                  ],
                ),
              ),
            ),
            const SizedBox(height: 8),
            Center(
              child: TextButton(
                onPressed: _uploading ? null : _photoOptions,
                child: Text(_profile.hasAvatar ? 'Change photo' : 'Add a photo',
                    style: AppText.labelMd.copyWith(color: AppColors.primary, fontWeight: FontWeight.w600)),
              ),
            ),
            const SizedBox(height: 8),
            Container(
              padding: const EdgeInsets.all(16),
              decoration: BoxDecoration(
                color: AppColors.surfaceLowest,
                borderRadius: BorderRadius.circular(16),
                boxShadow: AppShadows.sm,
              ),
              child: Form(
                key: _formKey,
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.stretch,
                  children: [
                    const _Label('Full name'),
                    TextFormField(
                      controller: _name,
                      textCapitalization: TextCapitalization.words,
                      textInputAction: TextInputAction.next,
                      decoration: const InputDecoration(prefixIcon: Icon(Icons.person_outline, size: 20)),
                      validator: (v) {
                        if (v == null || v.trim().isEmpty) return 'Enter your name';
                        if (v.trim().length > 100) return 'Keep it under 100 characters';
                        return null;
                      },
                    ),
                    const SizedBox(height: 12),
                    const _Label('Email (used to sign in)'),
                    TextFormField(
                      initialValue: _profile.email,
                      enabled: false,
                      decoration: const InputDecoration(prefixIcon: Icon(Icons.alternate_email, size: 20)),
                    ),
                    const SizedBox(height: 12),
                    const _Label('Mobile number'),
                    TextFormField(
                      controller: _mobile,
                      keyboardType: TextInputType.phone,
                      textInputAction: TextInputAction.next,
                      maxLength: 10,
                      decoration: const InputDecoration(
                        counterText: '',
                        hintText: '10-digit mobile',
                        prefixIcon: Padding(
                          padding: EdgeInsets.only(left: 14, right: 8),
                          child: Text('🇮🇳 +91', style: TextStyle(fontWeight: FontWeight.w600)),
                        ),
                        prefixIconConstraints: BoxConstraints(minWidth: 0, minHeight: 0),
                      ),
                      validator: (v) {
                        final d = (v ?? '').replaceAll(RegExp(r'\D'), '');
                        if (d.isEmpty) return null; // optional
                        if (!RegExp(r'^[6-9]\d{9}$').hasMatch(d)) return 'Enter a valid 10-digit mobile number';
                        return null;
                      },
                    ),
                    const SizedBox(height: 12),
                    Row(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Expanded(
                          child: Column(
                            crossAxisAlignment: CrossAxisAlignment.stretch,
                            children: [
                              const _Label('City'),
                              TextFormField(
                                controller: _city,
                                textCapitalization: TextCapitalization.words,
                                textInputAction: TextInputAction.next,
                              ),
                            ],
                          ),
                        ),
                        const SizedBox(width: 10),
                        Expanded(
                          child: Column(
                            crossAxisAlignment: CrossAxisAlignment.stretch,
                            children: [
                              const _Label('State'),
                              TextFormField(
                                controller: _state,
                                textCapitalization: TextCapitalization.words,
                              ),
                            ],
                          ),
                        ),
                      ],
                    ),
                    const SizedBox(height: 12),
                    const _Label('Preferred language'),
                    DropdownButtonFormField<String>(
                      initialValue: _languages.any((l) => l.$1 == _language) ? _language : null,
                      isExpanded: true,
                      decoration: const InputDecoration(prefixIcon: Icon(Icons.translate, size: 20)),
                      items: [
                        for (final l in _languages) DropdownMenuItem(value: l.$1, child: Text(l.$2)),
                      ],
                      onChanged: (v) => setState(() => _language = v ?? _language),
                    ),
                    if (_error != null) ...[
                      const SizedBox(height: 12),
                      Container(
                        padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 10),
                        decoration:
                            BoxDecoration(color: AppColors.errorContainer, borderRadius: BorderRadius.circular(10)),
                        child: Text(_error!, style: AppText.bodySm.copyWith(color: AppColors.onErrorContainer)),
                      ),
                    ],
                    const SizedBox(height: 16),
                    PrimaryButton(label: 'Save changes', leading: Icons.check, busy: _saving, onPressed: _save),
                  ],
                ),
              ),
            ),
          ],
        ),
      ),
    );
  }
}

class _Label extends StatelessWidget {
  const _Label(this.text);

  final String text;

  @override
  Widget build(BuildContext context) => Padding(
        padding: const EdgeInsets.only(bottom: 4),
        child: Text(text, style: AppText.labelMd.copyWith(color: AppColors.onSurface)),
      );
}
