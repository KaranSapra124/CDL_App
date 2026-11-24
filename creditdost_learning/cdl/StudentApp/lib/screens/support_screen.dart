import 'package:flutter/material.dart';

import '../core/api_client.dart';
import '../core/models.dart';
import '../core/portal_repository.dart';
import '../core/theme.dart';
import 'home_shell.dart';
import 'ticket_screen.dart';
import 'widgets.dart';

/// Stitch "Customer Support": greeting, contact card, the student's tickets and an FAQ.
/// The design's WhatsApp and phone cards are replaced by an in-app ticket card (no verified
/// contact channels exist yet). Not shown: quick-action hub and grievance officer block.
class SupportScreen extends StatefulWidget {
  const SupportScreen({super.key, required this.repo, required this.profile, required this.onTab});

  final PortalRepository repo;
  final Profile profile;
  final ValueChanged<int> onTab;

  @override
  State<SupportScreen> createState() => _SupportScreenState();
}

class _SupportScreenState extends State<SupportScreen> {
  late Future<List<SupportTicket>> _future = widget.repo.tickets();
  String _faqTopic = 'All';

  static const categories = ['Courses', 'Devices & Security', 'Payments & GST', 'Certificates', 'Other'];

  static const _faqs = [
    ('Account', 'Can I use my account on more than 2 devices?',
        'You can be signed in on two devices at once. A third sign-in signs out the device you used least recently.'),
    ('Account', 'I forgot my password. What do I do?',
        'On the sign-in screen tap "Forgot password?" and set a new one. You will be signed out on other devices.'),
    ('Courses', 'Why is a lesson locked?',
        'Locked lessons are part of a course you have not enrolled in yet. Lessons marked FREE can be watched without enrolling.'),
    ('Courses', 'A lesson says "Being processed".',
        'The video is still being prepared for streaming. It becomes playable automatically, usually within minutes.'),
    ('Payments', 'How do I get a GST invoice?',
        'A tax invoice is issued for every payment. If you need a copy, raise a ticket under Payments & GST.'),
  ];

  Future<void> _refresh() async {
    setState(() => _future = widget.repo.tickets());
    await _future;
  }

  Future<void> _openTicket(SupportTicket t) async {
    await Navigator.of(context).push(MaterialPageRoute(
      builder: (_) => TicketScreen(repo: widget.repo, ticketId: t.id, reference: t.reference),
    ));
    // Replies can change the status (e.g. reopen), so refresh the list.
    if (mounted) _refresh();
  }

  Future<void> _raise() async {
    final sent = await showModalBottomSheet<bool>(
      context: context,
      isScrollControlled: true,
      showDragHandle: true,
      backgroundColor: AppColors.surfaceLowest,
      builder: (_) => _NewTicketSheet(repo: widget.repo),
    );
    if (sent == true && mounted) {
      ScaffoldMessenger.of(context)
          .showSnackBar(const SnackBar(content: Text('Ticket raised. Our team will reply here.')));
      _refresh();
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: CdHeader(
        title: 'Customer Support',
        onBell: () => widget.onTab(Tabs.updates),
        onAvatar: () => widget.onTab(Tabs.profile),
      ),
      body: RefreshIndicator(
        onRefresh: _refresh,
        child: FutureBuilder<List<SupportTicket>>(
          future: _future,
          builder: (context, snap) {
            if (snap.connectionState != ConnectionState.done) {
              return const Center(child: CircularProgressIndicator());
            }
            if (snap.hasError) {
              return ErrorState(
                message: snap.error is ApiException ? snap.error.toString() : 'Could not load your tickets.',
                onRetry: _refresh,
              );
            }
            final tickets = snap.data!;
            final open = tickets.where((t) => t.status != 'resolved').length;
            return ListView(
              physics: const AlwaysScrollableScrollPhysics(),
              padding: const EdgeInsets.fromLTRB(16, 12, 16, 24),
              children: [
                const Pill(
                  label: 'Support desk · replies in this app',
                  background: AppColors.secondaryContainer,
                  foreground: AppColors.onSecondaryContainer,
                  dot: AppColors.secondary,
                ),
                const SizedBox(height: 10),
                _greeting(),
                const SizedBox(height: 16),
                _ticketCta(),
                const SizedBox(height: 24),
                Row(
                  children: [
                    const Text('Your Support Tickets', style: AppText.headlineSm),
                    const SizedBox(width: 8),
                    if (open > 0)
                      Pill(label: '$open', background: AppColors.tertiaryFixed, foreground: AppColors.onTertiaryFixed),
                  ],
                ),
                const SizedBox(height: 8),
                if (tickets.isEmpty)
                  const AppCard(
                    child: EmptyState(
                      icon: Icons.inbox_outlined,
                      title: 'No tickets yet',
                      body: 'If something is not working, raise a ticket and we will follow up.',
                    ),
                  )
                else
                  for (final t in tickets)
                    Padding(padding: const EdgeInsets.only(bottom: 10), child: _TicketCard(ticket: t, onOpen: () => _openTicket(t))),
                const SizedBox(height: 20),
                const Row(
                  children: [
                    Icon(Icons.quiz_outlined, size: 20, color: AppColors.primaryContainer),
                    SizedBox(width: 6),
                    Text('Frequently Asked Questions', style: AppText.headlineSm),
                  ],
                ),
                Text('Instant answers to common questions',
                    style: AppText.bodySm.copyWith(color: AppColors.onSurfaceVariant)),
                const SizedBox(height: 10),
                SingleChildScrollView(
                  scrollDirection: Axis.horizontal,
                  child: Row(children: [for (final t in const ['All', 'Account', 'Courses', 'Payments']) _topic(t)]),
                ),
                const SizedBox(height: 10),
                for (final f in _faqs)
                  if (_faqTopic == 'All' || f.$1 == _faqTopic) FaqTile(question: f.$2, answer: f.$3),
              ],
            );
          },
        ),
      ),
    );
  }

  Widget _greeting() => Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text('How can we assist you today, ${widget.profile.firstName}?', style: AppText.headlineMd),
                const SizedBox(height: 4),
                Text('Course access, technical issues and payments, in one place.',
                    style: AppText.bodySm.copyWith(color: AppColors.onSurfaceVariant)),
              ],
            ),
          ),
          const SizedBox(width: 12),
          Stack(
            clipBehavior: Clip.none,
            children: [
              const IconBox(icon: Icons.headset_mic_outlined, size: 48, iconSize: 26, radius: 14),
              Positioned(
                right: -2,
                top: -2,
                child: Container(
                  width: 12,
                  height: 12,
                  decoration: BoxDecoration(
                    color: AppColors.secondary,
                    shape: BoxShape.circle,
                    border: Border.all(color: AppColors.surface, width: 2),
                  ),
                ),
              ),
            ],
          ),
        ],
      );

  Widget _ticketCta() => AppCard(
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            const Row(
              children: [
                IconBox(
                  icon: Icons.confirmation_number_outlined,
                  size: 44,
                  iconSize: 24,
                  radius: 12,
                  background: AppColors.secondaryContainer,
                  foreground: AppColors.onSecondaryContainer,
                ),
                Spacer(),
                Pill(label: 'IN-APP', background: AppColors.secondaryContainer, foreground: AppColors.onSecondaryContainer),
              ],
            ),
            const SizedBox(height: 10),
            const Text('Raise a Support Ticket', style: AppText.headlineSm),
            const SizedBox(height: 2),
            Text('Describe the problem and our team replies right here. Track every request below.',
                style: AppText.bodySm.copyWith(color: AppColors.onSurfaceVariant)),
            const SizedBox(height: 12),
            FilledButton.icon(
              onPressed: _raise,
              style: FilledButton.styleFrom(
                backgroundColor: AppColors.secondary,
                minimumSize: const Size.fromHeight(46),
                shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(10)),
                textStyle: AppText.bodyMd.copyWith(fontWeight: FontWeight.w600),
              ),
              icon: const Icon(Icons.add_comment_outlined, size: 20),
              label: const Text('New Ticket'),
            ),
          ],
        ),
      );

  Widget _topic(String t) {
    final selected = _faqTopic == t;
    return Padding(
      padding: const EdgeInsets.only(right: 8),
      child: InkWell(
        borderRadius: BorderRadius.circular(999),
        onTap: () => setState(() => _faqTopic = t),
        child: Container(
          padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 6),
          decoration: BoxDecoration(
            color: selected ? AppColors.primaryContainer : AppColors.surfaceContainer,
            borderRadius: BorderRadius.circular(999),
          ),
          child: Text(t,
              style: AppText.labelMd.copyWith(
                  color: selected ? Colors.white : AppColors.onSurfaceVariant, fontWeight: FontWeight.w600)),
        ),
      ),
    );
  }
}

class _TicketCard extends StatelessWidget {
  const _TicketCard({required this.ticket, required this.onOpen});

  final SupportTicket ticket;
  final VoidCallback onOpen;

  String _when(DateTime? d) {
    if (d == null) return '';
    final l = d.toLocal();
    final diff = DateTime.now().difference(l);
    final hh = l.hour % 12 == 0 ? 12 : l.hour % 12;
    final time = '${hh.toString().padLeft(2, '0')}:${l.minute.toString().padLeft(2, '0')} ${l.hour < 12 ? 'AM' : 'PM'}';
    if (diff.inDays == 0 && l.day == DateTime.now().day) return 'Today, $time';
    if (diff.inDays <= 1) return 'Yesterday, $time';
    return '${l.day}/${l.month}/${l.year}, $time';
  }

  @override
  Widget build(BuildContext context) {
    final (bg, fg) = switch (ticket.status) {
      'resolved' => (AppColors.secondaryContainer, AppColors.onSecondaryContainer),
      'in_progress' => (AppColors.tertiaryFixed, AppColors.onTertiaryFixed),
      _ => (AppColors.primaryFixed, AppColors.primary),
    };
    return AppCard(
      onTap: onOpen,
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              if (ticket.reference.isNotEmpty)
                Container(
                  padding: const EdgeInsets.symmetric(horizontal: 6, vertical: 2),
                  decoration: BoxDecoration(color: AppColors.surfaceContainer, borderRadius: BorderRadius.circular(4)),
                  child: Text('#${ticket.reference}',
                      style: AppText.caption.copyWith(color: AppColors.onSurfaceVariant, fontFamily: 'monospace')),
                ),
              const SizedBox(width: 8),
              Expanded(
                child: Text(ticket.category,
                    maxLines: 1,
                    overflow: TextOverflow.ellipsis,
                    style: AppText.caption.copyWith(color: AppColors.outline, letterSpacing: 0.2)),
              ),
              Pill(label: ticket.statusLabel, background: bg, foreground: fg, dot: fg),
            ],
          ),
          const SizedBox(height: 10),
          Text(ticket.subject, style: AppText.headlineSm.copyWith(height: 1.35)),
          const SizedBox(height: 6),
          Row(
            children: [
              const Icon(Icons.schedule, size: 14, color: AppColors.onSurfaceVariant),
              const SizedBox(width: 4),
              Text(_when(ticket.createdAt), style: AppText.labelMd.copyWith(color: AppColors.onSurfaceVariant)),
            ],
          ),
        ],
      ),
    );
  }
}

class _NewTicketSheet extends StatefulWidget {
  const _NewTicketSheet({required this.repo});

  final PortalRepository repo;

  @override
  State<_NewTicketSheet> createState() => _NewTicketSheetState();
}

class _NewTicketSheetState extends State<_NewTicketSheet> {
  final _formKey = GlobalKey<FormState>();
  final _subject = TextEditingController();
  final _body = TextEditingController();
  String _category = _SupportScreenState.categories.first;
  bool _busy = false;
  String? _error;

  @override
  void dispose() {
    _subject.dispose();
    _body.dispose();
    super.dispose();
  }

  Future<void> _send() async {
    if (!(_formKey.currentState?.validate() ?? false)) return;
    setState(() {
      _busy = true;
      _error = null;
    });
    try {
      await widget.repo.raiseTicket(category: _category, subject: _subject.text.trim(), body: _body.text.trim());
      if (mounted) Navigator.of(context).pop(true);
    } on ApiException catch (e) {
      if (mounted) setState(() => _error = e.message);
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: EdgeInsets.fromLTRB(16, 0, 16, MediaQuery.viewInsetsOf(context).bottom + 16),
      child: Form(
        key: _formKey,
        child: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            const Text('New Support Ticket', style: AppText.headlineMd),
            const SizedBox(height: 4),
            Text('Pick a topic and tell us what happened.',
                style: AppText.bodySm.copyWith(color: AppColors.onSurfaceVariant)),
            const SizedBox(height: 14),
            Wrap(
              spacing: 6,
              runSpacing: 6,
              children: [
                for (final c in _SupportScreenState.categories)
                  ChoiceChip(
                    label: Text(c),
                    selected: _category == c,
                    onSelected: _busy ? null : (_) => setState(() => _category = c),
                    selectedColor: AppColors.primaryContainer,
                    backgroundColor: AppColors.surfaceContainer,
                    side: BorderSide.none,
                    showCheckmark: false,
                    shape: const StadiumBorder(),
                    labelStyle: AppText.labelMd.copyWith(
                        color: _category == c ? Colors.white : AppColors.onSurfaceVariant,
                        fontWeight: FontWeight.w600),
                  ),
              ],
            ),
            const SizedBox(height: 12),
            TextFormField(
              controller: _subject,
              decoration: const InputDecoration(hintText: 'Subject, e.g. "Lesson 4 video not loading"'),
              validator: (v) => (v == null || v.trim().isEmpty) ? 'Add a short subject' : null,
            ),
            const SizedBox(height: 10),
            TextFormField(
              controller: _body,
              maxLines: 4,
              decoration: const InputDecoration(hintText: 'Describe the problem'),
              validator: (v) => (v == null || v.trim().isEmpty) ? 'Tell us what happened' : null,
            ),
            if (_error != null) ...[
              const SizedBox(height: 10),
              Text(_error!, style: AppText.bodySm.copyWith(color: AppColors.error)),
            ],
            const SizedBox(height: 14),
            PrimaryButton(label: 'Submit Ticket', leading: Icons.send, busy: _busy, onPressed: _send),
          ],
        ),
      ),
    );
  }
}
