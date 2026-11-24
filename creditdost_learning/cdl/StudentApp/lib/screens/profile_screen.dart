import 'package:flutter/material.dart';

import '../core/api_client.dart';
import '../core/models.dart';
import '../core/portal_repository.dart';
import '../core/theme.dart';
import 'course_screen.dart';
import 'edit_profile_screen.dart';
import 'home_shell.dart';
import 'student_avatar.dart';
import 'widgets.dart';

/// Stitch "Student Profile": identity card, stat tiles, course progress, menu and sign out.
/// Not shown (no backend data yet): KYC tier, cohort, registered devices, certificates with
/// DigiLocker sync, offline downloads and AI audio preference.
class ProfileScreen extends StatefulWidget {
  const ProfileScreen({
    super.key,
    required this.repo,
    required this.profile,
    required this.onSignedOut,
    required this.onTab,
    required this.onProfileChanged,
  });

  final PortalRepository repo;
  final Profile profile;
  final VoidCallback onSignedOut;
  final ValueChanged<int> onTab;
  final ValueChanged<Profile> onProfileChanged;

  @override
  State<ProfileScreen> createState() => _ProfileScreenState();
}

class _Stats {
  const _Stats(this.courses, this.watchedSeconds);

  final List<CourseCard> courses;
  final int watchedSeconds;

  int get modules => courses.fold(0, (s, c) => s + c.modules);
  int get done => courses.fold(0, (s, c) => s + c.completedModules);
  int get pct => modules == 0 ? 0 : (done * 100 / modules).round();
}

class _ProfileScreenState extends State<ProfileScreen> {
  bool _signingOut = false;
  late Future<_Stats> _future = _load();

  Future<_Stats> _load() async {
    final enrolled = (await widget.repo.catalogue()).where((c) => c.enrolled).toList();
    // Watch time is the sum of saved positions across enrolled courses' lessons.
    var watched = 0;
    for (final c in enrolled) {
      try {
        final d = await widget.repo.course(c.id);
        for (final m in d.modules) {
          watched += m.completed && m.durationSeconds != null ? m.durationSeconds! : m.watchedSeconds;
        }
      } on ApiException {
        // Skip a course that fails to load; the rest of the stats are still useful.
      }
    }
    return _Stats(enrolled, watched);
  }

  Future<void> _refresh() async {
    setState(() => _future = _load());
    await _future;
  }

  Future<void> _signOut() async {
    final ok = await showDialog<bool>(
      context: context,
      builder: (context) => AlertDialog(
        backgroundColor: AppColors.surfaceLowest,
        title: const Text('Sign out?', style: AppText.headlineMd),
        content: Text('You can sign back in with your email and password.',
            style: AppText.bodyMd.copyWith(color: AppColors.onSurfaceVariant)),
        actions: [
          TextButton(onPressed: () => Navigator.pop(context, false), child: const Text('Cancel')),
          FilledButton(
            style: FilledButton.styleFrom(backgroundColor: AppColors.error),
            onPressed: () => Navigator.pop(context, true),
            child: const Text('Sign out'),
          ),
        ],
      ),
    );
    if (ok != true) return;
    setState(() => _signingOut = true);
    try {
      await widget.repo.logout();
    } on ApiException {
      // Even if the server is unreachable, drop the local session.
    }
    if (mounted) widget.onSignedOut();
  }

  void _soon(String what) =>
      ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text('$what is coming soon.')));

  void _openEdit() => Navigator.of(context).push(MaterialPageRoute(
        builder: (_) => EditProfileScreen(
          repo: widget.repo,
          profile: widget.profile,
          onChanged: widget.onProfileChanged,
        ),
      ));

  Widget _contactChip(IconData icon, String text) => Container(
        padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 6),
        decoration: BoxDecoration(color: AppColors.surfaceLow, borderRadius: BorderRadius.circular(8)),
        child: Row(
          mainAxisSize: MainAxisSize.min,
          children: [
            Icon(icon, size: 15, color: AppColors.onSurfaceVariant),
            const SizedBox(width: 6),
            Flexible(
              child: Text(text,
                  overflow: TextOverflow.ellipsis, style: AppText.labelMd.copyWith(color: AppColors.onSurface)),
            ),
          ],
        ),
      );

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: CdHeader(
        title: 'Student Profile',
        onBell: () => widget.onTab(Tabs.updates),
      ),
      body: RefreshIndicator(
        onRefresh: _refresh,
        child: FutureBuilder<_Stats>(
          future: _future,
          builder: (context, snap) {
            final stats = snap.data;
            return ListView(
              physics: const AlwaysScrollableScrollPhysics(),
              padding: const EdgeInsets.fromLTRB(16, 12, 16, 24),
              children: [
                _identity(),
                const SizedBox(height: 12),
                if (snap.connectionState != ConnectionState.done)
                  const Padding(
                    padding: EdgeInsets.symmetric(vertical: 32),
                    child: Center(child: CircularProgressIndicator()),
                  )
                else if (snap.hasError)
                  AppCard(
                    child: Text(
                      snap.error is ApiException ? snap.error.toString() : 'Could not load your progress.',
                      style: AppText.bodySm.copyWith(color: AppColors.error),
                    ),
                  )
                else ...[
                  _statGrid(stats!),
                  const SizedBox(height: 20),
                  SectionTitle(
                    title: 'Course Progress',
                    action: stats.courses.isEmpty
                        ? null
                        : '${stats.courses.where((c) => c.modules > 0 && c.completedModules == c.modules).length}'
                            ' of ${stats.courses.length} Complete',
                  ),
                  const SizedBox(height: 8),
                  if (stats.courses.isEmpty)
                    AppCard(
                      onTap: () => widget.onTab(Tabs.plans),
                      child: Row(
                        children: [
                          const IconBox(icon: Icons.explore_outlined),
                          const SizedBox(width: 12),
                          Expanded(
                            child: Text('No courses yet. Explore plans to get started.',
                                style: AppText.bodySm.copyWith(color: AppColors.onSurfaceVariant)),
                          ),
                          const Icon(Icons.chevron_right, color: AppColors.outline),
                        ],
                      ),
                    )
                  else
                    for (final c in stats.courses)
                      Padding(
                        padding: const EdgeInsets.only(bottom: 10),
                        child: _CourseRow(
                          course: c,
                          onTap: () => Navigator.of(context).push(MaterialPageRoute(
                            builder: (_) => CourseScreen(repo: widget.repo, courseId: c.id, title: c.title),
                          )),
                        ),
                      ),
                ],
                const SizedBox(height: 10),
                AppCard(
                  padding: const EdgeInsets.symmetric(vertical: 4),
                  child: Column(
                    children: [
                      _MenuRow(
                        icon: Icons.receipt_long_outlined,
                        title: 'Billing & Payment History',
                        subtitle: 'Invoices, GST receipts & plans',
                        onTap: () => _soon('Billing history'),
                      ),
                      const _Divider(),
                      _MenuRow(
                        icon: Icons.campaign_outlined,
                        title: 'Updates & Notices',
                        subtitle: 'Circulars and course announcements',
                        onTap: () => widget.onTab(Tabs.updates),
                      ),
                      const _Divider(),
                      _MenuRow(
                        icon: Icons.help_outline,
                        title: 'Help & Customer Support',
                        subtitle: 'Raise and track support tickets',
                        onTap: () => widget.onTab(Tabs.support),
                      ),
                      const _Divider(),
                      _MenuRow(
                        icon: Icons.manage_accounts_outlined,
                        title: 'Account & Privacy Settings',
                        subtitle: 'Password and session security',
                        onTap: () => _soon('Account settings'),
                      ),
                    ],
                  ),
                ),
                const SizedBox(height: 16),
                Material(
                  color: AppColors.errorContainer,
                  borderRadius: BorderRadius.circular(12),
                  child: InkWell(
                    borderRadius: BorderRadius.circular(12),
                    onTap: _signingOut ? null : _signOut,
                    child: Padding(
                      padding: const EdgeInsets.symmetric(vertical: 14),
                      child: Row(
                        mainAxisAlignment: MainAxisAlignment.center,
                        children: [
                          const Icon(Icons.logout, size: 20, color: AppColors.onErrorContainer),
                          const SizedBox(width: 8),
                          Text(_signingOut ? 'Signing out…' : 'Sign Out of Student Account',
                              style: AppText.headlineSm.copyWith(color: AppColors.onErrorContainer)),
                        ],
                      ),
                    ),
                  ),
                ),
                const SizedBox(height: 16),
                Text('Credit Dost Learning · Student App v0.1.0',
                    textAlign: TextAlign.center, style: AppText.caption.copyWith(color: AppColors.outline)),
              ],
            );
          },
        ),
      ),
    );
  }

  Widget _identity() {
    final p = widget.profile;
    return AppCard(
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              Stack(
                children: [
                  StudentAvatar(repo: widget.repo, profile: p, radius: 32),
                  Positioned(
                    right: 0,
                    bottom: 0,
                    child: Container(
                      width: 16,
                      height: 16,
                      decoration: BoxDecoration(
                        color: AppColors.secondary,
                        shape: BoxShape.circle,
                        border: Border.all(color: AppColors.surfaceLowest, width: 2.5),
                      ),
                    ),
                  ),
                ],
              ),
              const SizedBox(width: 14),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(p.name, style: AppText.headlineMd, maxLines: 1, overflow: TextOverflow.ellipsis),
                    const SizedBox(height: 4),
                    const Pill(
                      label: 'Active Learner',
                      background: AppColors.secondaryContainer,
                      foreground: AppColors.onSecondaryContainer,
                      icon: Icons.verified_outlined,
                    ),
                    const SizedBox(height: 4),
                    Text(
                      ['STU-${p.id}', if (p.location.isNotEmpty) p.location].join('  •  '),
                      style: AppText.bodySm.copyWith(color: AppColors.onSurfaceVariant),
                    ),
                  ],
                ),
              ),
              IconButton.filledTonal(
                tooltip: 'Edit profile',
                onPressed: _openEdit,
                style: IconButton.styleFrom(backgroundColor: AppColors.surfaceContainer),
                icon: const Icon(Icons.edit_outlined, size: 18, color: AppColors.primary),
              ),
            ],
          ),
          const SizedBox(height: 12),
          Wrap(
            spacing: 6,
            runSpacing: 6,
            children: [
              _contactChip(Icons.alternate_email, p.email),
              if (p.mobile.isNotEmpty) _contactChip(Icons.phone_iphone, p.mobileLabel),
            ],
          ),
        ],
      ),
    );
  }

  Widget _statGrid(_Stats s) {
    final hours = s.watchedSeconds / 3600;
    final watchValue = hours >= 1 ? hours.toStringAsFixed(1) : (s.watchedSeconds / 60).round().toString();
    final watchUnit = hours >= 1 ? 'hrs' : 'min';
    // Height follows the content and font size (see the dashboard quick actions).
    return GridView(
      gridDelegate: SliverGridDelegateWithFixedCrossAxisCount(
        crossAxisCount: 2,
        mainAxisSpacing: 10,
        crossAxisSpacing: 10,
        mainAxisExtent: 66 + MediaQuery.textScalerOf(context).scale(62),
      ),
      shrinkWrap: true,
      physics: const NeverScrollableScrollPhysics(),
      children: [
        _StatTile(
          label: 'ENROLLED',
          value: '${s.courses.length}',
          caption: 'Active Courses',
          icon: Icons.school_outlined,
          iconBg: AppColors.primaryFixed,
          iconFg: AppColors.primary,
        ),
        _StatTile(
          label: 'COMPLETION',
          value: '${s.pct}%',
          caption: '${s.done} of ${s.modules} lessons',
          captionColor: AppColors.secondary,
          icon: Icons.donut_large,
          iconBg: AppColors.secondaryContainer,
          iconFg: AppColors.onSecondaryContainer,
        ),
        _StatTile(
          label: 'LESSONS DONE',
          value: '${s.done}',
          caption: 'Completed lessons',
          captionColor: AppColors.tertiaryContainer,
          icon: Icons.workspace_premium_outlined,
          iconBg: AppColors.tertiaryFixed,
          iconFg: AppColors.onTertiaryFixed,
        ),
        _StatTile(
          label: 'WATCH TIME',
          value: watchValue,
          unit: watchUnit,
          caption: 'Total time learning',
          icon: Icons.schedule,
          iconBg: AppColors.surfaceHighest,
          iconFg: AppColors.primary,
        ),
      ],
    );
  }
}

class _StatTile extends StatelessWidget {
  const _StatTile({
    required this.label,
    required this.value,
    required this.caption,
    required this.icon,
    required this.iconBg,
    required this.iconFg,
    this.unit,
    this.captionColor,
  });

  final String label;
  final String value;
  final String? unit;
  final String caption;
  final Color? captionColor;
  final IconData icon;
  final Color iconBg;
  final Color iconFg;

  @override
  Widget build(BuildContext context) => AppCard(
        padding: const EdgeInsets.all(14),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Row(
              children: [
                Expanded(child: Text(label, style: AppText.labelSm.copyWith(color: AppColors.onSurfaceVariant))),
                IconBox(icon: icon, size: 28, iconSize: 16, radius: 8, background: iconBg, foreground: iconFg),
              ],
            ),
            const Spacer(),
            Text.rich(
              TextSpan(
                children: [
                  TextSpan(text: value, style: AppText.headlineLg.copyWith(fontSize: 26)),
                  if (unit != null)
                    TextSpan(text: ' $unit', style: AppText.bodySm.copyWith(color: AppColors.onSurfaceVariant)),
                ],
              ),
            ),
            Text(caption,
                maxLines: 1,
                overflow: TextOverflow.ellipsis,
                style: AppText.labelMd.copyWith(color: captionColor ?? AppColors.onSurfaceVariant)),
          ],
        ),
      );
}

class _CourseRow extends StatelessWidget {
  const _CourseRow({required this.course, required this.onTap});

  final CourseCard course;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    final done = course.modules > 0 && course.completedModules == course.modules;
    final left = course.modules - course.completedModules;
    return AppCard(
      onTap: onTap,
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              IconBox(
                icon: done ? Icons.military_tech_outlined : Icons.credit_score,
                size: 44,
                iconSize: 24,
                radius: 12,
                background: done ? AppColors.secondaryContainer : AppColors.primaryFixed,
                foreground: done ? AppColors.onSecondaryContainer : AppColors.primary,
              ),
              const SizedBox(width: 12),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(course.title, maxLines: 1, overflow: TextOverflow.ellipsis, style: AppText.headlineSm),
                    Text(course.category ?? 'Course',
                        style: AppText.caption.copyWith(color: AppColors.onSurfaceVariant, letterSpacing: 0.2)),
                  ],
                ),
              ),
              done
                  ? const Pill(label: 'Completed', background: AppColors.secondaryContainer, foreground: AppColors.onSecondaryContainer)
                  : Pill(
                      label: '${(course.progress * 100).round()}%',
                      background: AppColors.primaryFixed,
                      foreground: AppColors.primary,
                    ),
            ],
          ),
          const SizedBox(height: 12),
          ProgressTrack(value: course.progress, fill: done ? AppColors.secondary : AppColors.primaryContainer),
          const SizedBox(height: 6),
          Row(
            children: [
              Text('${course.completedModules} of ${course.modules} lessons completed',
                  style: AppText.caption.copyWith(color: AppColors.onSurfaceVariant, letterSpacing: 0.2)),
              const Spacer(),
              if (!done)
                Text('$left lessons left',
                    style: AppText.caption.copyWith(color: AppColors.onSurfaceVariant, letterSpacing: 0.2)),
            ],
          ),
        ],
      ),
    );
  }
}

class _MenuRow extends StatelessWidget {
  const _MenuRow({required this.icon, required this.title, required this.subtitle, required this.onTap});

  final IconData icon;
  final String title;
  final String subtitle;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) => InkWell(
        onTap: onTap,
        child: Padding(
          padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 12),
          child: Row(
            children: [
              IconBox(icon: icon, background: AppColors.surfaceContainer, foreground: AppColors.primary),
              const SizedBox(width: 12),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(title, style: AppText.bodyMd.copyWith(fontWeight: FontWeight.w600)),
                    Text(subtitle, style: AppText.caption.copyWith(color: AppColors.onSurfaceVariant, letterSpacing: 0.2)),
                  ],
                ),
              ),
              const Icon(Icons.chevron_right, color: AppColors.outline),
            ],
          ),
        ),
      );
}

class _Divider extends StatelessWidget {
  const _Divider();

  @override
  Widget build(BuildContext context) =>
      const Divider(height: 1, thickness: 1, indent: 14, endIndent: 14, color: AppColors.surfaceContainer);
}
