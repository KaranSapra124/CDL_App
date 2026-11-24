import 'package:flutter/material.dart';

import '../core/api_client.dart';
import '../core/portal_repository.dart';
import '../core/theme.dart';
import 'home_shell.dart';
import 'widgets.dart';

/// Stitch "Important Updates": search, filter chips and update cards. Cards are the emails the
/// student has been sent. Not shown (no backend data yet): live masterclass RSVP, audio
/// previews, bookmarks and the knowledge-capsule feed.
class UpdatesScreen extends StatefulWidget {
  const UpdatesScreen({super.key, required this.repo, required this.onTab});

  final PortalRepository repo;
  final ValueChanged<int> onTab;

  @override
  State<UpdatesScreen> createState() => _UpdatesScreenState();
}

enum _Filter { all, week, older }

class _UpdatesScreenState extends State<UpdatesScreen> {
  late Future<List<AppNotice>> _future = widget.repo.notifications();
  final _search = TextEditingController();
  _Filter _filter = _Filter.all;

  @override
  void dispose() {
    _search.dispose();
    super.dispose();
  }

  Future<void> _refresh() async {
    setState(() => _future = widget.repo.notifications());
    await _future;
  }

  bool _isRecent(AppNotice n) =>
      n.sentAt != null && DateTime.now().difference(n.sentAt!.toLocal()) < const Duration(days: 7);

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: CdHeader(
        title: 'Important Updates',
        onBell: () {},
        onAvatar: () => widget.onTab(Tabs.profile),
      ),
      body: RefreshIndicator(
        onRefresh: _refresh,
        child: FutureBuilder<List<AppNotice>>(
          future: _future,
          builder: (context, snap) {
            if (snap.connectionState != ConnectionState.done) {
              return const Center(child: CircularProgressIndicator());
            }
            if (snap.hasError) {
              return ErrorState(
                message: snap.error is ApiException ? snap.error.toString() : 'Could not load updates.',
                onRetry: _refresh,
              );
            }
            final all = snap.data!;
            final recent = all.where(_isRecent).length;
            final q = _search.text.trim().toLowerCase();
            final shown = all.where((n) {
              final inFilter = switch (_filter) {
                _Filter.all => true,
                _Filter.week => _isRecent(n),
                _Filter.older => !_isRecent(n),
              };
              final inSearch =
                  q.isEmpty || n.subject.toLowerCase().contains(q) || n.body.toLowerCase().contains(q);
              return inFilter && inSearch;
            }).toList();

            return ListView(
              physics: const AlwaysScrollableScrollPhysics(),
              padding: const EdgeInsets.fromLTRB(16, 12, 16, 24),
              children: [
                if (recent > 0) ...[
                  Container(
                    padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 10),
                    decoration: BoxDecoration(color: AppColors.errorContainer, borderRadius: BorderRadius.circular(12)),
                    child: Row(
                      children: [
                        const Icon(Icons.campaign, size: 18, color: AppColors.onErrorContainer),
                        const SizedBox(width: 8),
                        Expanded(
                          child: Text('$recent new ${recent == 1 ? 'update' : 'updates'} this week',
                              style: AppText.bodySm.copyWith(
                                  color: AppColors.onErrorContainer, fontWeight: FontWeight.w600)),
                        ),
                      ],
                    ),
                  ),
                  const SizedBox(height: 12),
                ],
                TextField(
                  controller: _search,
                  onChanged: (_) => setState(() {}),
                  decoration: InputDecoration(
                    hintText: 'Search circulars, schedules, modules…',
                    fillColor: AppColors.surfaceLowest,
                    prefixIcon: const Icon(Icons.search, size: 20, color: AppColors.onSurfaceVariant),
                    enabledBorder: OutlineInputBorder(
                      borderRadius: BorderRadius.circular(12),
                      borderSide: const BorderSide(color: AppColors.surfaceContainer),
                    ),
                  ),
                ),
                const SizedBox(height: 12),
                SingleChildScrollView(
                  scrollDirection: Axis.horizontal,
                  child: Row(
                    children: [
                      _chip('All Updates (${all.length})', _Filter.all),
                      _chip('This Week ($recent)', _Filter.week),
                      _chip('Older (${all.length - recent})', _Filter.older),
                    ],
                  ),
                ),
                const SizedBox(height: 16),
                if (shown.isEmpty)
                  EmptyState(
                    icon: Icons.campaign_outlined,
                    title: all.isEmpty ? 'No updates yet' : 'Nothing matches',
                    body: all.isEmpty
                        ? 'Circulars, schedule changes and certification deadlines will appear here.'
                        : 'Try a different search or filter.',
                  )
                else
                  for (final n in shown)
                    Padding(
                      padding: const EdgeInsets.only(bottom: 12),
                      child: _UpdateCard(item: n, recent: _isRecent(n)),
                    ),
                const SizedBox(height: 12),
                Column(
                  children: [
                    const Icon(Icons.verified_outlined, size: 22, color: AppColors.outline),
                    const SizedBox(height: 6),
                    Text('ALL CAUGHT UP FOR TODAY', style: AppText.caption.copyWith(color: AppColors.outline)),
                  ],
                ),
              ],
            );
          },
        ),
      ),
    );
  }

  Widget _chip(String label, _Filter f) {
    final selected = _filter == f;
    return Padding(
      padding: const EdgeInsets.only(right: 8),
      child: InkWell(
        borderRadius: BorderRadius.circular(999),
        onTap: () => setState(() => _filter = f),
        child: Container(
          padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 7),
          decoration: BoxDecoration(
            color: selected ? AppColors.primaryContainer : AppColors.surfaceLowest,
            borderRadius: BorderRadius.circular(999),
            border: selected ? null : Border.all(color: AppColors.surfaceContainer),
          ),
          child: Text(label,
              style: AppText.labelMd.copyWith(
                  color: selected ? Colors.white : AppColors.onSurfaceVariant,
                  fontWeight: selected ? FontWeight.w600 : FontWeight.w500)),
        ),
      ),
    );
  }
}

class _UpdateCard extends StatefulWidget {
  const _UpdateCard({required this.item, required this.recent});

  final AppNotice item;
  final bool recent;

  @override
  State<_UpdateCard> createState() => _UpdateCardState();
}

class _UpdateCardState extends State<_UpdateCard> {
  bool _open = false;

  String _when(DateTime? d) {
    if (d == null) return '';
    final local = d.toLocal();
    final diff = DateTime.now().difference(local);
    if (diff.inMinutes < 60) return '${diff.inMinutes.clamp(1, 59)} min ago';
    if (diff.inHours < 24) return '${diff.inHours} h ago';
    if (diff.inDays == 1) return 'Yesterday';
    if (diff.inDays < 7) return '${diff.inDays} days ago';
    const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    return '${local.day} ${months[local.month - 1]} ${local.year}';
  }

  @override
  Widget build(BuildContext context) {
    final n = widget.item;
    final long = n.body.length > 180;
    return AppCard(
      onTap: long ? () => setState(() => _open = !_open) : null,
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              widget.recent
                  ? const Pill(
                      label: 'NEW NOTICE',
                      background: AppColors.secondaryContainer,
                      foreground: AppColors.onSecondaryContainer,
                      dot: AppColors.secondary,
                    )
                  : const Pill(
                      label: 'NOTICE',
                      background: AppColors.tertiaryFixed,
                      foreground: AppColors.onTertiaryFixed,
                      dot: AppColors.tertiaryContainer,
                    ),
              const Spacer(),
              Text(_when(n.sentAt), style: AppText.caption.copyWith(color: AppColors.outline)),
            ],
          ),
          const SizedBox(height: 10),
          Text(n.subject, style: AppText.headlineSm.copyWith(height: 1.35)),
          const SizedBox(height: 6),
          Text(
            n.body,
            maxLines: _open ? null : 4,
            overflow: _open ? TextOverflow.visible : TextOverflow.ellipsis,
            style: AppText.bodySm.copyWith(color: AppColors.onSurfaceVariant, height: 1.5),
          ),
          if (long) ...[
            const SizedBox(height: 8),
            Text(_open ? 'Show less' : 'Read full update →',
                style: AppText.labelMd.copyWith(color: AppColors.primary, fontWeight: FontWeight.w600)),
          ],
        ],
      ),
    );
  }
}
