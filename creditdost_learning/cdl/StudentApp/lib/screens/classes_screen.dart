import 'package:flutter/material.dart';

import '../core/api_client.dart';
import '../core/models.dart';
import '../core/portal_repository.dart';
import '../core/theme.dart';
import 'course_screen.dart';
import 'home_shell.dart';
import 'lesson_screen.dart';
import 'widgets.dart';

/// Stitch "Dashboard & Classes". Continue-watching hero, quick actions and enrolled courses come
/// from the catalogue and course progress. Not shown (no backend data yet): cohort switcher,
/// streak, live class banner, AI dub switcher, legal templates and the daily credit rule.
class ClassesScreen extends StatefulWidget {
  const ClassesScreen({super.key, required this.repo, required this.profile, required this.onTab});

  final PortalRepository repo;
  final Profile profile;
  final ValueChanged<int> onTab;

  @override
  State<ClassesScreen> createState() => _ClassesScreenState();
}

class _Dashboard {
  const _Dashboard(this.enrolled, this.resumeCourse, this.resumeModule);

  final List<CourseCard> enrolled;
  final CourseDetail? resumeCourse;
  final ModuleItem? resumeModule;
}

class _ClassesScreenState extends State<ClassesScreen> {
  late Future<_Dashboard> _future = _load();

  Future<_Dashboard> _load() async {
    final all = await widget.repo.catalogue();
    final enrolled = all.where((c) => c.enrolled).toList();

    // Resume the furthest-along unfinished course, at the lesson in progress (or the next one).
    final candidates = enrolled.where((c) => c.completedModules < c.modules).toList()
      ..sort((a, b) => b.progress.compareTo(a.progress));
    for (final c in candidates) {
      try {
        final d = await widget.repo.course(c.id);
        final open = d.modules.where((m) => m.playable && !m.completed).toList();
        if (open.isEmpty) continue;
        final m = open.firstWhere((m) => m.watchedSeconds > 0, orElse: () => open.first);
        return _Dashboard(enrolled, d, m);
      } on ApiException {
        continue;
      }
    }
    return _Dashboard(enrolled, null, null);
  }

  Future<void> _refresh() async {
    setState(() => _future = _load());
    await _future;
  }

  String get _greeting {
    final h = DateTime.now().hour;
    if (h < 12) return 'Good morning';
    if (h < 17) return 'Good afternoon';
    return 'Good evening';
  }

  Future<void> _openLesson(CourseDetail course, ModuleItem m) async {
    await Navigator.of(context).push(MaterialPageRoute(
      builder: (_) => LessonScreen(repo: widget.repo, course: course, module: m),
    ));
    if (mounted) _refresh();
  }

  Future<void> _openCourse(CourseCard c) async {
    await Navigator.of(context).push(MaterialPageRoute(
      builder: (_) => CourseScreen(repo: widget.repo, courseId: c.id, title: c.title),
    ));
    if (mounted) _refresh();
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: CdHeader(
        title: 'Dashboard & Classes',
        onBell: () => widget.onTab(Tabs.updates),
        onAvatar: () => widget.onTab(Tabs.profile),
      ),
      body: RefreshIndicator(
        onRefresh: _refresh,
        child: FutureBuilder<_Dashboard>(
          future: _future,
          builder: (context, snap) {
            if (snap.connectionState != ConnectionState.done) {
              return const Center(child: CircularProgressIndicator());
            }
            if (snap.hasError) {
              final msg = snap.error is ApiException ? snap.error.toString() : 'Could not load your classes.';
              return ErrorState(message: msg, onRetry: _refresh);
            }
            final data = snap.data!;
            return ListView(
              physics: const AlwaysScrollableScrollPhysics(),
              padding: const EdgeInsets.fromLTRB(16, 12, 16, 24),
              children: [
                _greetingRow(),
                const SizedBox(height: 16),
                if (data.resumeCourse != null && data.resumeModule != null) ...[
                  _ContinueCard(
                    course: data.resumeCourse!,
                    module: data.resumeModule!,
                    onResume: () => _openLesson(data.resumeCourse!, data.resumeModule!),
                  ),
                  const SizedBox(height: 24),
                ],
                const SectionTitle(title: 'Quick Actions', action: 'Self-Serve'),
                const SizedBox(height: 8),
                _quickActions(),
                const SizedBox(height: 24),
                SectionTitle(
                  title: 'Enrolled Courses',
                  caption: 'Track your certification milestones',
                  action: data.enrolled.isEmpty ? null : 'View All (${data.enrolled.length})',
                ),
                const SizedBox(height: 8),
                if (data.enrolled.isEmpty)
                  _NoCoursesCard(onBrowse: () => widget.onTab(Tabs.plans))
                else
                  for (var i = 0; i < data.enrolled.length; i++)
                    Padding(
                      padding: const EdgeInsets.only(bottom: 12),
                      child: _CourseProgressCard(
                        course: data.enrolled[i],
                        index: i,
                        onOpen: () => _openCourse(data.enrolled[i]),
                      ),
                    ),
              ],
            );
          },
        ),
      ),
    );
  }

  Widget _greetingRow() => Row(
        children: [
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text('STUDENT DASHBOARD', style: AppText.caption.copyWith(color: AppColors.outline)),
                const SizedBox(height: 2),
                Text('$_greeting, ${widget.profile.firstName} 👋', style: AppText.headlineMd),
              ],
            ),
          ),
          Material(
            color: AppColors.surfaceHigh,
            shape: const CircleBorder(),
            child: InkWell(
              customBorder: const CircleBorder(),
              onTap: () => widget.onTab(Tabs.updates),
              child: const SizedBox(
                width: 36,
                height: 36,
                child: Icon(Icons.notifications_outlined, size: 20, color: AppColors.onSurface),
              ),
            ),
          ),
        ],
      );

  // Tile height follows its content (padding + icon + two text lines) and the phone's font size,
  // so it never overflows on narrow screens or with large system fonts.
  Widget _quickActions() => GridView(
        gridDelegate: SliverGridDelegateWithFixedCrossAxisCount(
          crossAxisCount: 2,
          mainAxisSpacing: 8,
          crossAxisSpacing: 8,
          mainAxisExtent: 82 + MediaQuery.textScalerOf(context).scale(42),
        ),
        shrinkWrap: true,
        physics: const NeverScrollableScrollPhysics(),
        children: [
          _ToolTile(
            icon: Icons.explore_outlined,
            iconBg: AppColors.primaryFixed,
            iconFg: AppColors.primary,
            title: 'Explore Courses',
            caption: 'Plans & free previews',
            onTap: () => widget.onTab(Tabs.plans),
          ),
          _ToolTile(
            icon: Icons.campaign_outlined,
            iconBg: AppColors.secondaryFixed,
            iconFg: AppColors.onSecondaryFixedVariant,
            title: 'Updates',
            caption: 'Circulars & notices',
            onTap: () => widget.onTab(Tabs.updates),
          ),
          _ToolTile(
            icon: Icons.forum_outlined,
            iconBg: AppColors.tertiaryFixed,
            iconFg: AppColors.onTertiaryFixed,
            title: 'Ask Support',
            caption: 'Raise a ticket',
            onTap: () => widget.onTab(Tabs.support),
          ),
          _ToolTile(
            icon: Icons.account_circle_outlined,
            iconBg: AppColors.surfaceHighest,
            iconFg: AppColors.primary,
            title: 'My Profile',
            caption: 'Progress & account',
            onTap: () => widget.onTab(Tabs.profile),
          ),
        ],
      );
}

/// Gradient "Continue watching" hero card.
class _ContinueCard extends StatelessWidget {
  const _ContinueCard({required this.course, required this.module, required this.onResume});

  final CourseDetail course;
  final ModuleItem module;
  final VoidCallback onResume;

  @override
  Widget build(BuildContext context) {
    final duration = module.durationSeconds ?? 0;
    final watched = module.watchedSeconds;
    final pct = duration > 0 ? (watched / duration).clamp(0.0, 1.0) : 0.0;
    final started = watched > 0;

    return Container(
      clipBehavior: Clip.antiAlias,
      decoration: BoxDecoration(
        borderRadius: BorderRadius.circular(20),
        gradient: const LinearGradient(
          begin: Alignment.topLeft,
          end: Alignment.bottomRight,
          colors: [AppColors.primary, AppColors.primaryContainer, AppColors.surfaceTint],
        ),
        boxShadow: AppShadows.xl,
      ),
      child: Stack(
        children: [
          Positioned(
            right: -40,
            bottom: -40,
            child: Container(
              width: 176,
              height: 176,
              decoration: BoxDecoration(color: Colors.white.withValues(alpha: 0.08), shape: BoxShape.circle),
            ),
          ),
          Positioned(
            right: 0,
            top: -20,
            child: Container(
              width: 120,
              height: 120,
              decoration: BoxDecoration(
                  color: AppColors.secondaryFixed.withValues(alpha: 0.10), shape: BoxShape.circle),
            ),
          ),
          Padding(
            padding: const EdgeInsets.all(16),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Row(
                  children: [
                    Pill(
                      label: started ? 'CONTINUE WATCHING' : 'UP NEXT',
                      background: Colors.white.withValues(alpha: 0.2),
                      foreground: Colors.white,
                      dot: AppColors.secondaryFixed,
                    ),
                    const Spacer(),
                    if (module.isNew)
                      Pill(
                        label: 'NEW',
                        background: Colors.black.withValues(alpha: 0.25),
                        foreground: Colors.white,
                        icon: Icons.auto_awesome,
                      ),
                  ],
                ),
                const SizedBox(height: 12),
                Text(
                  'Module ${module.moduleNumber} of ${course.modules.length}'
                  '${course.card.category != null ? '  •  ${course.card.category}' : ''}',
                  maxLines: 1,
                  overflow: TextOverflow.ellipsis,
                  style: AppText.labelSm.copyWith(color: AppColors.onPrimaryContainer, letterSpacing: 0),
                ),
                const SizedBox(height: 4),
                Text('Lesson ${module.moduleNumber}: ${module.title}',
                    style: AppText.headlineSm.copyWith(color: Colors.white, height: 1.35)),
                const SizedBox(height: 2),
                Text(course.card.title,
                    maxLines: 1,
                    overflow: TextOverflow.ellipsis,
                    style: AppText.bodySm.copyWith(color: AppColors.onPrimaryContainer)),
                const SizedBox(height: 14),
                Row(
                  children: [
                    const Icon(Icons.timer_outlined, size: 14, color: AppColors.onPrimaryContainer),
                    const SizedBox(width: 4),
                    Text(
                      duration > 0 ? '${clock(watched)} / ${clock(duration)} min' : 'Ready to play',
                      style: AppText.labelSm.copyWith(color: AppColors.onPrimaryContainer, letterSpacing: 0),
                    ),
                    const Spacer(),
                    if (duration > 0)
                      Text('${(pct * 100).round()}% Done',
                          style: AppText.labelSm.copyWith(color: Colors.white, fontWeight: FontWeight.w700)),
                  ],
                ),
                const SizedBox(height: 8),
                ProgressTrack(
                  value: pct,
                  height: 8,
                  track: Colors.black.withValues(alpha: 0.3),
                  fill: AppColors.secondaryFixed,
                ),
                const SizedBox(height: 14),
                Row(
                  children: [
                    if (course.card.instructors.isNotEmpty)
                      Expanded(
                        child: Text(
                          'with ${course.card.instructors.join(', ')}',
                          maxLines: 1,
                          overflow: TextOverflow.ellipsis,
                          style: AppText.caption.copyWith(color: AppColors.onPrimaryContainer, letterSpacing: 0.2),
                        ),
                      )
                    else
                      const Spacer(),
                    const SizedBox(width: 8),
                    FilledButton.icon(
                      onPressed: onResume,
                      style: FilledButton.styleFrom(
                        backgroundColor: Colors.white,
                        foregroundColor: AppColors.primary,
                        padding: const EdgeInsets.symmetric(horizontal: 18, vertical: 12),
                        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
                        textStyle: AppText.headlineSm,
                        elevation: 2,
                      ),
                      icon: const Icon(Icons.play_arrow_rounded, size: 22),
                      label: Text(started ? 'Resume' : 'Start'),
                    ),
                  ],
                ),
              ],
            ),
          ),
        ],
      ),
    );
  }
}

class _ToolTile extends StatelessWidget {
  const _ToolTile({
    required this.icon,
    required this.iconBg,
    required this.iconFg,
    required this.title,
    required this.caption,
    required this.onTap,
  });

  final IconData icon;
  final Color iconBg;
  final Color iconFg;
  final String title;
  final String caption;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) => AppCard(
        color: AppColors.surfaceLow,
        shadow: const [],
        radius: 12,
        padding: const EdgeInsets.all(14),
        onTap: onTap,
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          mainAxisAlignment: MainAxisAlignment.center,
          children: [
            IconBox(icon: icon, background: iconBg, foreground: iconFg),
            const SizedBox(height: 8),
            Text(title, style: AppText.headlineSm, maxLines: 1, overflow: TextOverflow.ellipsis),
            Text(caption,
                maxLines: 1,
                overflow: TextOverflow.ellipsis,
                style: AppText.bodySm.copyWith(color: AppColors.onSurfaceVariant)),
          ],
        ),
      );
}

class _CourseProgressCard extends StatelessWidget {
  const _CourseProgressCard({required this.course, required this.index, required this.onOpen});

  final CourseCard course;
  final int index;
  final VoidCallback onOpen;

  static const _icons = [Icons.account_balance, Icons.credit_card, Icons.savings_outlined, Icons.receipt_long];

  @override
  Widget build(BuildContext context) {
    final pct = (course.progress * 100).round();
    final remaining = course.modules - course.completedModules;
    final strong = pct >= 50;
    final lead = index == 0;
    return AppCard(
      onTap: onOpen,
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              IconBox(
                icon: _icons[index % _icons.length],
                size: 48,
                iconSize: 26,
                radius: 12,
                background: lead ? AppColors.primaryFixed.withValues(alpha: 0.6) : AppColors.surfaceContainer,
                foreground: lead ? AppColors.primary : AppColors.onSurfaceVariant,
              ),
              const SizedBox(width: 12),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Row(
                      children: [
                        Expanded(
                          child: Text((course.category ?? 'Course').toUpperCase(),
                              maxLines: 1,
                              overflow: TextOverflow.ellipsis,
                              style: AppText.caption.copyWith(color: AppColors.outline)),
                        ),
                        Text('$pct% Complete',
                            style: AppText.labelSm.copyWith(
                                color: strong ? AppColors.secondary : AppColors.onSurfaceVariant,
                                fontWeight: FontWeight.w700,
                                letterSpacing: 0)),
                      ],
                    ),
                    const SizedBox(height: 2),
                    Text(course.title,
                        maxLines: 1, overflow: TextOverflow.ellipsis, style: AppText.headlineSm.copyWith(height: 1.3)),
                    Text('${course.completedModules} of ${course.modules} lessons completed',
                        style: AppText.bodySm.copyWith(color: AppColors.onSurfaceVariant)),
                  ],
                ),
              ),
            ],
          ),
          const SizedBox(height: 12),
          ProgressTrack(
            value: course.progress,
            fill: index.isEven ? AppColors.primaryContainer : AppColors.secondary,
          ),
          const SizedBox(height: 12),
          Row(
            children: [
              Flexible(
                child: Container(
                  padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 4),
                  decoration: BoxDecoration(
                    color: AppColors.secondaryContainer.withValues(alpha: 0.4),
                    borderRadius: BorderRadius.circular(8),
                  ),
                  child: Row(
                    mainAxisSize: MainAxisSize.min,
                    children: [
                      Icon(remaining == 0 ? Icons.verified : Icons.workspace_premium_outlined,
                          size: 15, color: AppColors.onSecondaryContainer),
                      const SizedBox(width: 6),
                      Flexible(
                        child: Text(
                          remaining == 0
                              ? 'All lessons completed'
                              : '$remaining ${remaining == 1 ? 'lesson' : 'lessons'} to go',
                          overflow: TextOverflow.ellipsis,
                          style: AppText.labelSm.copyWith(
                              color: AppColors.onSecondaryContainer, fontWeight: FontWeight.w500, letterSpacing: 0),
                        ),
                      ),
                    ],
                  ),
                ),
              ),
              const Spacer(),
              Text('View Modules', style: AppText.labelMd.copyWith(color: AppColors.primary, fontWeight: FontWeight.w600)),
              const Icon(Icons.chevron_right, size: 16, color: AppColors.primary),
            ],
          ),
        ],
      ),
    );
  }
}

class _NoCoursesCard extends StatelessWidget {
  const _NoCoursesCard({required this.onBrowse});

  final VoidCallback onBrowse;

  @override
  Widget build(BuildContext context) => AppCard(
        child: Column(
          children: [
            const EmptyState(
              icon: Icons.school_outlined,
              title: 'No courses yet',
              body: 'Enrol in a programme to start tracking your certification milestones.',
            ),
            PrimaryButton(label: 'Explore plans', icon: Icons.arrow_forward, onPressed: onBrowse),
          ],
        ),
      );
}
