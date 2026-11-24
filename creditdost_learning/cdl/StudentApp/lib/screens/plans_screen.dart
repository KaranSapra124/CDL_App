import 'package:flutter/material.dart';

import '../core/api_client.dart';
import '../core/models.dart';
import '../core/portal_repository.dart';
import '../core/theme.dart';
import 'course_screen.dart';
import 'home_shell.dart';
import 'widgets.dart';

/// Stitch "Explore & Plans". Each published course is shown in the design's plan card. Not shown
/// (no backend data yet): launch-offer coupon, All-Access bundle tab and EMI pricing.
class PlansScreen extends StatefulWidget {
  const PlansScreen({super.key, required this.repo, required this.onTab});

  final PortalRepository repo;
  final ValueChanged<int> onTab;

  @override
  State<PlansScreen> createState() => _PlansScreenState();
}

class _PlansScreenState extends State<PlansScreen> {
  late Future<List<CourseCard>> _catalogue = widget.repo.catalogue();

  Future<void> _refresh() async {
    setState(() => _catalogue = widget.repo.catalogue());
    await _catalogue;
  }

  Future<void> _open(CourseCard c) async {
    await Navigator.of(context).push(MaterialPageRoute(
      builder: (_) => CourseScreen(repo: widget.repo, courseId: c.id, title: c.title),
    ));
    if (mounted) _refresh();
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: CdHeader(
        title: 'Explore & Plans',
        onBell: () => widget.onTab(Tabs.updates),
        onAvatar: () => widget.onTab(Tabs.profile),
      ),
      body: RefreshIndicator(
        onRefresh: _refresh,
        child: FutureBuilder<List<CourseCard>>(
          future: _catalogue,
          builder: (context, snap) {
            if (snap.connectionState != ConnectionState.done) {
              return const Center(child: CircularProgressIndicator());
            }
            if (snap.hasError) {
              return ErrorState(
                message: snap.error is ApiException ? snap.error.toString() : 'Could not load courses.',
                onRetry: _refresh,
              );
            }
            // Courses to buy first, then the ones already owned.
            final courses = [...snap.data!]..sort((a, b) => (a.enrolled ? 1 : 0).compareTo(b.enrolled ? 1 : 0));
            return ListView(
              physics: const AlwaysScrollableScrollPhysics(),
              padding: const EdgeInsets.fromLTRB(16, 16, 16, 24),
              children: [
                const Text('Learning Plans & Programs', style: AppText.headlineLg),
                const SizedBox(height: 4),
                Text(
                  'Master Indian credit bureaus, banking policies and debt optimisation with practical programmes.',
                  style: AppText.bodyMd.copyWith(color: AppColors.onSurfaceVariant, height: 1.5),
                ),
                const SizedBox(height: 16),
                if (courses.isEmpty)
                  const EmptyState(
                    icon: Icons.menu_book_outlined,
                    title: 'No programmes yet',
                    body: 'New courses will appear here as soon as they are published.',
                  )
                else
                  for (final c in courses)
                    Padding(
                      padding: const EdgeInsets.only(bottom: 16),
                      child: _PlanCard(course: c, onOpen: () => _open(c)),
                    ),
                const SizedBox(height: 4),
                const _Assurance(),
                const SizedBox(height: 24),
                const Text('Frequently Asked Questions', style: AppText.headlineSm),
                const SizedBox(height: 8),
                const FaqTile(
                  question: 'How does the 2-device limit work?',
                  answer: 'You can stay signed in on two devices at once. Signing in on a third device signs '
                      'out the one you used least recently.',
                ),
                const FaqTile(
                  question: 'Can I try a course before buying?',
                  answer: 'Yes. Lessons marked FREE can be watched without enrolling. Open a course to see them.',
                ),
                const FaqTile(
                  question: 'Do I get a GST invoice?',
                  answer: 'Yes. GST is added at checkout and a tax invoice is issued for every payment.',
                ),
              ],
            );
          },
        ),
      ),
    );
  }
}

class _PlanCard extends StatelessWidget {
  const _PlanCard({required this.course, required this.onOpen});

  final CourseCard course;
  final VoidCallback onOpen;

  @override
  Widget build(BuildContext context) {
    final c = course;
    final mrp = c.mrpPaise;
    final off = mrp != null && mrp > c.pricePaise ? ((1 - c.pricePaise / mrp) * 100).round() : 0;

    return Container(
      clipBehavior: Clip.antiAlias,
      decoration: BoxDecoration(
        color: AppColors.surfaceLowest,
        borderRadius: BorderRadius.circular(16),
        boxShadow: AppShadows.md,
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          // Gradient ribbon.
          Container(
            padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 10),
            decoration: const BoxDecoration(
              gradient: LinearGradient(colors: [AppColors.primary, AppColors.primaryContainer]),
            ),
            child: Row(
              children: [
                const Icon(Icons.verified_outlined, size: 18, color: Colors.white),
                const SizedBox(width: 6),
                Expanded(
                  child: Text(
                    (c.category ?? 'Programme').toUpperCase(),
                    maxLines: 1,
                    overflow: TextOverflow.ellipsis,
                    style: AppText.labelSm.copyWith(color: Colors.white),
                  ),
                ),
                if (c.enrolled)
                  const Pill(label: 'ENROLLED', background: AppColors.secondary, foreground: Colors.white)
                else if (off > 0)
                  Pill(label: '$off% SAVED', background: AppColors.secondary, foreground: Colors.white),
              ],
            ),
          ),
          Padding(
            padding: const EdgeInsets.all(16),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.stretch,
              children: [
                Text(c.title, style: AppText.headlineMd.copyWith(height: 1.25)),
                if (c.instructors.isNotEmpty) ...[
                  const SizedBox(height: 4),
                  Text('Taught by ${c.instructors.join(', ')}',
                      style: AppText.bodySm.copyWith(color: AppColors.onSurfaceVariant)),
                ],
                const SizedBox(height: 14),
                // Visual band in place of the design's cover photo.
                Container(
                  height: 112,
                  decoration: BoxDecoration(
                    borderRadius: BorderRadius.circular(10),
                    gradient: const LinearGradient(
                      begin: Alignment.topLeft,
                      end: Alignment.bottomRight,
                      colors: [AppColors.inverseSurface, AppColors.primary],
                    ),
                  ),
                  child: Stack(
                    children: [
                      Positioned(
                        right: 12,
                        top: 12,
                        child: Icon(Icons.insights, size: 56, color: Colors.white.withValues(alpha: 0.18)),
                      ),
                      Positioned(
                        left: 12,
                        bottom: 10,
                        child: Row(
                          children: [
                            const Icon(Icons.school, size: 16, color: AppColors.secondaryFixed),
                            const SizedBox(width: 6),
                            Text('Includes ${c.modules} video lessons',
                                style: AppText.labelSm.copyWith(color: Colors.white, letterSpacing: 0.2)),
                          ],
                        ),
                      ),
                    ],
                  ),
                ),
                const SizedBox(height: 14),
                if (!c.enrolled) ...[
                  Container(
                    padding: const EdgeInsets.all(12),
                    decoration: BoxDecoration(color: AppColors.surfaceLow, borderRadius: BorderRadius.circular(10)),
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Wrap(
                          spacing: 8,
                          crossAxisAlignment: WrapCrossAlignment.end,
                          children: [
                            Text(c.priceLabel, style: AppText.displayMobile.copyWith(color: AppColors.primary)),
                            if (off > 0)
                              Text(c.mrpLabel!,
                                  style: AppText.bodyMd.copyWith(
                                      color: AppColors.outline,
                                      fontWeight: FontWeight.w500,
                                      decoration: TextDecoration.lineThrough)),
                            if (off > 0)
                              Text('FLAT $off% OFF',
                                  style: AppText.labelSm.copyWith(color: AppColors.secondary, fontWeight: FontWeight.w700)),
                          ],
                        ),
                        const SizedBox(height: 2),
                        Text('GST added at checkout (tax invoice provided)',
                            style: AppText.caption.copyWith(color: AppColors.onSurfaceVariant, letterSpacing: 0.2)),
                      ],
                    ),
                  ),
                  const SizedBox(height: 14),
                ] else ...[
                  Row(
                    children: [
                      Text('${c.completedModules} of ${c.modules} lessons completed',
                          style: AppText.labelMd.copyWith(color: AppColors.onSurfaceVariant)),
                      const Spacer(),
                      Text('${(c.progress * 100).round()}%',
                          style: AppText.labelSm.copyWith(color: AppColors.secondary, fontWeight: FontWeight.w700)),
                    ],
                  ),
                  const SizedBox(height: 6),
                  ProgressTrack(value: c.progress),
                  const SizedBox(height: 14),
                ],
                Text("WHAT'S INSIDE", style: AppText.labelSm.copyWith(color: AppColors.outline)),
                const SizedBox(height: 8),
                CheckBullet('${c.modules} HD video lessons, streamed securely'),
                if (c.freeModules > 0)
                  CheckBullet('${c.freeModules} free preview ${c.freeModules == 1 ? 'lesson' : 'lessons'} to try first'),
                const CheckBullet('Progress saved across your devices (2 at a time)'),
                const CheckBullet('Raise doubts with the support team in the app'),
                const SizedBox(height: 6),
                PrimaryButton(
                  label: c.enrolled ? 'Continue Learning' : 'View Course & Enroll',
                  icon: Icons.arrow_forward,
                  onPressed: onOpen,
                ),
              ],
            ),
          ),
        ],
      ),
    );
  }
}

class _Assurance extends StatelessWidget {
  const _Assurance();

  @override
  Widget build(BuildContext context) => AppCard(
        color: AppColors.surfaceContainer,
        shadow: const [],
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            Row(
              children: [
                const IconBox(icon: Icons.shield_outlined, background: AppColors.surfaceLowest),
                const SizedBox(width: 10),
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text('Secure & Transparent', style: AppText.bodyMd.copyWith(fontWeight: FontWeight.w600)),
                      Text('What you get with every purchase',
                          style: AppText.caption.copyWith(color: AppColors.onSurfaceVariant, letterSpacing: 0.2)),
                    ],
                  ),
                ),
              ],
            ),
            const SizedBox(height: 10),
            const _AssuranceRow(icon: Icons.lock_outline, text: 'Secure checkout via Razorpay'),
            const _AssuranceRow(icon: Icons.receipt_long_outlined, text: 'Valid GST invoice for every payment'),
            const _AssuranceRow(icon: Icons.devices_outlined, text: 'Watch on phone and web, 2 devices at a time'),
          ],
        ),
      );
}

class _AssuranceRow extends StatelessWidget {
  const _AssuranceRow({required this.icon, required this.text});

  final IconData icon;
  final String text;

  @override
  Widget build(BuildContext context) => Container(
        margin: const EdgeInsets.only(top: 6),
        padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 10),
        decoration: BoxDecoration(color: AppColors.surfaceLowest, borderRadius: BorderRadius.circular(10)),
        child: Row(
          children: [
            Icon(icon, size: 20, color: AppColors.secondary),
            const SizedBox(width: 10),
            Expanded(child: Text(text, style: AppText.bodySm.copyWith(color: AppColors.onSurface))),
          ],
        ),
      );
}
