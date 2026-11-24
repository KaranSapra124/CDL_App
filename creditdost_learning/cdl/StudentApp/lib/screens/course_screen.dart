import 'package:flutter/material.dart';

import '../core/api_client.dart';
import '../core/models.dart';
import '../core/portal_repository.dart';
import '../core/theme.dart';
import 'lesson_screen.dart';
import 'widgets.dart';

/// One course and its lessons. No Stitch screen exists for this, so it is assembled from the same
/// parts: course header card, lesson rows styled like the player's timestamp list, and the plan
/// price box for courses the student has not enrolled in.
class CourseScreen extends StatefulWidget {
  const CourseScreen({super.key, required this.repo, required this.courseId, required this.title});

  final PortalRepository repo;
  final int courseId;
  final String title;

  @override
  State<CourseScreen> createState() => _CourseScreenState();
}

class _CourseScreenState extends State<CourseScreen> {
  late Future<CourseDetail> _future = widget.repo.course(widget.courseId);

  Future<void> _reload() async {
    setState(() => _future = widget.repo.course(widget.courseId));
    await _future;
  }

  Future<void> _open(ModuleItem m, CourseDetail detail) async {
    await Navigator.of(context).push(MaterialPageRoute(
      builder: (_) => LessonScreen(repo: widget.repo, course: detail, module: m),
    ));
    if (mounted) _reload();
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: CdBackHeader(title: widget.title),
      body: RefreshIndicator(
        onRefresh: _reload,
        child: FutureBuilder<CourseDetail>(
          future: _future,
          builder: (context, snap) {
            if (snap.connectionState != ConnectionState.done) {
              return const Center(child: CircularProgressIndicator());
            }
            if (snap.hasError) {
              return ErrorState(
                message: snap.error is ApiException ? snap.error.toString() : 'Could not load this course.',
                onRetry: _reload,
              );
            }
            final detail = snap.data!;
            final card = detail.card;
            return ListView(
              physics: const AlwaysScrollableScrollPhysics(),
              padding: const EdgeInsets.fromLTRB(16, 8, 16, 24),
              children: [
                _header(detail),
                const SizedBox(height: 16),
                if (!card.enrolled) ...[
                  _EnrolBox(card: card),
                  const SizedBox(height: 16),
                ],
                SectionTitle(
                  title: 'Course Lessons',
                  caption: '${detail.modules.length} lessons · ${card.freeModules} free preview',
                ),
                const SizedBox(height: 8),
                AppCard(
                  padding: const EdgeInsets.all(8),
                  child: Column(
                    children: [
                      for (final m in detail.modules)
                        _LessonRow(module: m, onTap: m.playable ? () => _open(m, detail) : null),
                    ],
                  ),
                ),
              ],
            );
          },
        ),
      ),
    );
  }

  Widget _header(CourseDetail detail) {
    final card = detail.card;
    return AppCard(
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Wrap(
            spacing: 6,
            runSpacing: 6,
            children: [
              if (card.category != null)
                Pill(label: card.category!, background: AppColors.surfaceContainer, foreground: AppColors.onSurfaceVariant),
              Pill(
                label: card.enrolled ? 'Enrolled' : 'Not enrolled',
                background: card.enrolled ? AppColors.secondaryContainer : AppColors.tertiaryFixed,
                foreground: card.enrolled ? AppColors.onSecondaryContainer : AppColors.onTertiaryFixed,
              ),
            ],
          ),
          const SizedBox(height: 10),
          Text(card.title, style: AppText.headlineMd),
          if (card.instructors.isNotEmpty) ...[
            const SizedBox(height: 10),
            Row(
              children: [
                CircleAvatar(
                  radius: 16,
                  backgroundColor: AppColors.primaryFixed,
                  child: Text(card.instructors.first.characters.first.toUpperCase(),
                      style: AppText.labelMd.copyWith(color: AppColors.primary, fontWeight: FontWeight.w700)),
                ),
                const SizedBox(width: 10),
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(card.instructors.join(', '), style: AppText.bodyMd.copyWith(fontWeight: FontWeight.w600)),
                      Text('Faculty', style: AppText.caption.copyWith(color: AppColors.onSurfaceVariant)),
                    ],
                  ),
                ),
              ],
            ),
          ],
          if (detail.description.isNotEmpty) ...[
            const SizedBox(height: 12),
            Text(detail.description, style: AppText.bodyMd.copyWith(color: AppColors.onSurfaceVariant)),
          ],
          if (card.enrolled) ...[
            const SizedBox(height: 14),
            Row(
              children: [
                Text('${card.completedModules} of ${card.modules} lessons completed',
                    style: AppText.labelMd.copyWith(color: AppColors.onSurfaceVariant)),
                const Spacer(),
                Text('${(card.progress * 100).round()}%',
                    style: AppText.labelSm.copyWith(color: AppColors.secondary, fontWeight: FontWeight.w700)),
              ],
            ),
            const SizedBox(height: 6),
            ProgressTrack(value: card.progress),
          ],
        ],
      ),
    );
  }
}

class _LessonRow extends StatelessWidget {
  const _LessonRow({required this.module, required this.onTap});

  final ModuleItem module;
  final VoidCallback? onTap;

  @override
  Widget build(BuildContext context) {
    final IconData icon;
    final Color iconColor;
    final String status;
    if (module.locked) {
      icon = Icons.lock_outline;
      iconColor = AppColors.outline;
      status = 'Enrol to unlock';
    } else if (!module.ready) {
      icon = Icons.hourglass_top;
      iconColor = AppColors.tertiaryContainer;
      status = 'Being processed';
    } else if (module.completed) {
      icon = Icons.check_circle;
      iconColor = AppColors.secondary;
      status = 'Completed';
    } else {
      icon = Icons.play_circle_fill;
      iconColor = AppColors.primaryContainer;
      status = module.watchedSeconds > 0 ? 'In progress · ${clock(module.watchedSeconds)} watched' : 'Not started';
    }

    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 3),
      child: Material(
        color: module.completed ? AppColors.surfaceLow : AppColors.surfaceLowest,
        borderRadius: BorderRadius.circular(10),
        child: InkWell(
          borderRadius: BorderRadius.circular(10),
          onTap: onTap,
          child: Container(
            padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 10),
            decoration: BoxDecoration(
              borderRadius: BorderRadius.circular(10),
              border: Border.all(color: AppColors.surfaceContainer),
            ),
            child: Row(
              children: [
                Container(
                  padding: const EdgeInsets.symmetric(horizontal: 7, vertical: 3),
                  decoration: BoxDecoration(color: AppColors.primaryFixed, borderRadius: BorderRadius.circular(6)),
                  child: Text(module.moduleNumber.toString().padLeft(2, '0'),
                      style: AppText.labelSm.copyWith(
                          color: AppColors.primary, fontFamily: 'monospace', letterSpacing: 0)),
                ),
                const SizedBox(width: 10),
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Row(
                        children: [
                          Flexible(
                            child: Text(module.title,
                                maxLines: 1,
                                overflow: TextOverflow.ellipsis,
                                style: AppText.bodyMd.copyWith(
                                    fontWeight: FontWeight.w500,
                                    color: module.locked ? AppColors.onSurfaceVariant : AppColors.onSurface)),
                          ),
                          if (module.isNew) ...[
                            const SizedBox(width: 6),
                            const Pill(
                                label: 'NEW',
                                background: AppColors.secondaryContainer,
                                foreground: AppColors.onSecondaryContainer),
                          ],
                          if (module.isFreePreview && module.locked == false && !module.completed) ...[
                            const SizedBox(width: 6),
                            const Pill(
                                label: 'FREE',
                                background: AppColors.tertiaryFixed,
                                foreground: AppColors.onTertiaryFixed),
                          ],
                        ],
                      ),
                      const SizedBox(height: 2),
                      Text(
                        [if (module.durationLabel.isNotEmpty) module.durationLabel, status].join('  •  '),
                        style: AppText.caption.copyWith(color: AppColors.onSurfaceVariant, letterSpacing: 0.2),
                      ),
                    ],
                  ),
                ),
                const SizedBox(width: 8),
                Icon(icon, size: 22, color: iconColor),
              ],
            ),
          ),
        ),
      ),
    );
  }
}

/// Price box from the plans design, for a course the student has not bought yet.
class _EnrolBox extends StatelessWidget {
  const _EnrolBox({required this.card});

  final CourseCard card;

  @override
  Widget build(BuildContext context) {
    final mrp = card.mrpPaise;
    final off = mrp != null && mrp > card.pricePaise ? ((1 - card.pricePaise / mrp) * 100).round() : 0;
    return AppCard(
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          Container(
            padding: const EdgeInsets.all(12),
            decoration: BoxDecoration(color: AppColors.surfaceLow, borderRadius: BorderRadius.circular(10)),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Wrap(
                  crossAxisAlignment: WrapCrossAlignment.end,
                  spacing: 8,
                  children: [
                    Text(card.priceLabel, style: AppText.displayMobile.copyWith(color: AppColors.primary)),
                    if (off > 0)
                      Text(card.mrpLabel!,
                          style: AppText.bodyMd.copyWith(
                              color: AppColors.outline, decoration: TextDecoration.lineThrough)),
                    if (off > 0)
                      Text('$off% OFF', style: AppText.labelSm.copyWith(color: AppColors.secondary, fontWeight: FontWeight.w700)),
                  ],
                ),
                const SizedBox(height: 4),
                Text('GST added at checkout. Tax invoice provided.',
                    style: AppText.caption.copyWith(color: AppColors.onSurfaceVariant, letterSpacing: 0.2)),
              ],
            ),
          ),
          const SizedBox(height: 12),
          PrimaryButton(
            label: 'Enroll Now',
            icon: Icons.arrow_forward,
            onPressed: () => ScaffoldMessenger.of(context).showSnackBar(
              const SnackBar(content: Text('Online checkout is coming soon. Contact support to enrol.')),
            ),
          ),
          if (card.freeModules > 0) ...[
            const SizedBox(height: 8),
            Text('Try the free preview lessons below before you buy.',
                textAlign: TextAlign.center,
                style: AppText.caption.copyWith(color: AppColors.onSurfaceVariant, letterSpacing: 0.2)),
          ],
        ],
      ),
    );
  }
}
