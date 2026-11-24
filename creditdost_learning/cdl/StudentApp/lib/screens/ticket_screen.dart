import 'dart:typed_data';

import 'package:flutter/material.dart';

import '../core/api_client.dart';
import '../core/portal_repository.dart';
import '../core/theme.dart';
import 'widgets.dart';

/// One support ticket: header, the conversation with the support team, and a reply box.
/// Replying to a resolved ticket reopens it. Pull down to check for new replies.
class TicketScreen extends StatefulWidget {
  const TicketScreen({super.key, required this.repo, required this.ticketId, required this.reference});

  final PortalRepository repo;
  final int ticketId;
  final String reference;

  @override
  State<TicketScreen> createState() => _TicketScreenState();
}

class _TicketScreenState extends State<TicketScreen> {
  final _reply = TextEditingController();
  final _scroll = ScrollController();
  TicketThread? _thread;
  String? _loadError;
  String? _sendError;
  bool _sending = false;

  @override
  void initState() {
    super.initState();
    _load();
  }

  @override
  void dispose() {
    _reply.dispose();
    _scroll.dispose();
    super.dispose();
  }

  Future<void> _load() async {
    try {
      final t = await widget.repo.ticket(widget.ticketId);
      if (!mounted) return;
      setState(() {
        _thread = t;
        _loadError = null;
      });
      _scrollToEnd();
    } on ApiException catch (e) {
      if (mounted) setState(() => _loadError = e.message);
    } catch (_) {
      if (mounted) setState(() => _loadError = 'Could not load this ticket.');
    }
  }

  void _scrollToEnd() {
    WidgetsBinding.instance.addPostFrameCallback((_) {
      if (_scroll.hasClients) {
        _scroll.animateTo(_scroll.position.maxScrollExtent,
            duration: const Duration(milliseconds: 250), curve: Curves.easeOut);
      }
    });
  }

  Future<void> _send() async {
    final text = _reply.text.trim();
    if (text.isEmpty || _sending) return;
    setState(() {
      _sending = true;
      _sendError = null;
    });
    try {
      final t = await widget.repo.replyToTicket(widget.ticketId, text);
      if (!mounted) return;
      _reply.clear();
      setState(() => _thread = t);
      _scrollToEnd();
    } on ApiException catch (e) {
      if (mounted) setState(() => _sendError = e.message);
    } finally {
      if (mounted) setState(() => _sending = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final t = _thread;
    return Scaffold(
      appBar: CdBackHeader(title: '#${widget.reference}'),
      body: Column(
        children: [
          Expanded(
            child: RefreshIndicator(
              onRefresh: _load,
              child: _loadError != null
                  ? ErrorState(message: _loadError!, onRetry: _load)
                  : t == null
                      ? const Center(child: CircularProgressIndicator())
                      : ListView(
                          controller: _scroll,
                          physics: const AlwaysScrollableScrollPhysics(),
                          padding: const EdgeInsets.fromLTRB(16, 8, 16, 16),
                          children: [
                            _Header(ticket: t.ticket),
                            const SizedBox(height: 16),
                            for (final m in t.messages)
                              _Bubble(repo: widget.repo, ticketId: widget.ticketId, message: m),
                            if (t.messages.every((m) => m.fromStudent))
                              Padding(
                                padding: const EdgeInsets.only(top: 8),
                                child: Text(
                                  'Our support team will reply here. Pull down to check for new replies.',
                                  textAlign: TextAlign.center,
                                  style: AppText.caption.copyWith(color: AppColors.outline, letterSpacing: 0.2),
                                ),
                              ),
                          ],
                        ),
            ),
          ),
          if (t != null) _composer(t.ticket),
        ],
      ),
    );
  }

  Widget _composer(SupportTicket ticket) => Container(
        decoration: const BoxDecoration(
          color: AppColors.surfaceLowest,
          boxShadow: [BoxShadow(color: Color(0x0D000000), blurRadius: 12, offset: Offset(0, -1))],
        ),
        child: SafeArea(
          top: false,
          child: Padding(
            padding: const EdgeInsets.fromLTRB(12, 8, 8, 8),
            child: Column(
              mainAxisSize: MainAxisSize.min,
              crossAxisAlignment: CrossAxisAlignment.stretch,
              children: [
                if (ticket.status == 'resolved')
                  Padding(
                    padding: const EdgeInsets.only(bottom: 6, left: 4),
                    child: Text('This ticket is resolved. Sending a message reopens it.',
                        style: AppText.caption.copyWith(color: AppColors.onSurfaceVariant, letterSpacing: 0.2)),
                  ),
                if (_sendError != null)
                  Padding(
                    padding: const EdgeInsets.only(bottom: 6, left: 4),
                    child: Text(_sendError!, style: AppText.bodySm.copyWith(color: AppColors.error)),
                  ),
                Row(
                  crossAxisAlignment: CrossAxisAlignment.end,
                  children: [
                    Expanded(
                      child: TextField(
                        controller: _reply,
                        minLines: 1,
                        maxLines: 5,
                        maxLength: 5000,
                        textCapitalization: TextCapitalization.sentences,
                        decoration: const InputDecoration(
                          hintText: 'Write a reply…',
                          counterText: '',
                          contentPadding: EdgeInsets.symmetric(horizontal: 14, vertical: 12),
                        ),
                      ),
                    ),
                    const SizedBox(width: 6),
                    IconButton.filled(
                      onPressed: _sending ? null : _send,
                      style: IconButton.styleFrom(
                        backgroundColor: AppColors.primaryContainer,
                        minimumSize: const Size(46, 46),
                      ),
                      icon: _sending
                          ? const SizedBox(
                              width: 18, height: 18, child: CircularProgressIndicator(strokeWidth: 2, color: Colors.white))
                          : const Icon(Icons.send, size: 20, color: Colors.white),
                    ),
                  ],
                ),
              ],
            ),
          ),
        ),
      );
}

class _Header extends StatelessWidget {
  const _Header({required this.ticket});

  final SupportTicket ticket;

  @override
  Widget build(BuildContext context) {
    final (bg, fg) = switch (ticket.status) {
      'resolved' => (AppColors.secondaryContainer, AppColors.onSecondaryContainer),
      'in_progress' => (AppColors.tertiaryFixed, AppColors.onTertiaryFixed),
      _ => (AppColors.primaryFixed, AppColors.primary),
    };
    return AppCard(
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              Expanded(
                child: Text(ticket.category.toUpperCase(),
                    style: AppText.caption.copyWith(color: AppColors.outline)),
              ),
              Pill(label: ticket.statusLabel, background: bg, foreground: fg, dot: fg),
            ],
          ),
          const SizedBox(height: 8),
          Text(ticket.subject, style: AppText.headlineSm.copyWith(height: 1.35)),
          if (ticket.createdAt != null) ...[
            const SizedBox(height: 4),
            Text('Opened ${_stamp(ticket.createdAt!)}',
                style: AppText.labelMd.copyWith(color: AppColors.onSurfaceVariant)),
          ],
        ],
      ),
    );
  }
}

class _Bubble extends StatelessWidget {
  const _Bubble({required this.repo, required this.ticketId, required this.message});

  final PortalRepository repo;
  final int ticketId;
  final TicketMessage message;

  @override
  Widget build(BuildContext context) {
    final mine = message.fromStudent;
    final bubble = Container(
      constraints: BoxConstraints(maxWidth: MediaQuery.sizeOf(context).width * 0.78),
      padding: const EdgeInsets.fromLTRB(12, 10, 12, 8),
      decoration: BoxDecoration(
        color: mine ? AppColors.primaryContainer : AppColors.surfaceLowest,
        borderRadius: BorderRadius.only(
          topLeft: const Radius.circular(16),
          topRight: const Radius.circular(16),
          bottomLeft: Radius.circular(mine ? 16 : 4),
          bottomRight: Radius.circular(mine ? 4 : 16),
        ),
        boxShadow: mine ? null : AppShadows.sm,
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          if (!mine)
            Padding(
              padding: const EdgeInsets.only(bottom: 4),
              child: Row(
                mainAxisSize: MainAxisSize.min,
                children: [
                  const Icon(Icons.support_agent, size: 14, color: AppColors.secondary),
                  const SizedBox(width: 4),
                  Flexible(
                    child: Text('Support · ${message.authorName}',
                        overflow: TextOverflow.ellipsis,
                        style: AppText.labelSm.copyWith(color: AppColors.secondary, letterSpacing: 0)),
                  ),
                ],
              ),
            ),
          if (message.body.isNotEmpty)
            Text(message.body,
                style: AppText.bodyMd.copyWith(color: mine ? Colors.white : AppColors.onSurface, height: 1.4)),
          if (message.hasAttachment) ...[
            if (message.body.isNotEmpty) const SizedBox(height: 8),
            _Attachment(repo: repo, ticketId: ticketId, messageId: message.id),
          ],
          const SizedBox(height: 4),
          Align(
            alignment: Alignment.centerRight,
            child: Text(
              message.createdAt == null ? '' : _stamp(message.createdAt!),
              style: AppText.caption.copyWith(
                  color: mine ? AppColors.onPrimaryContainer : AppColors.outline, letterSpacing: 0.1),
            ),
          ),
        ],
      ),
    );
    return Padding(
      padding: const EdgeInsets.only(bottom: 10),
      child: Align(alignment: mine ? Alignment.centerRight : Alignment.centerLeft, child: bubble),
    );
  }
}

/// A screenshot from the support team. Loaded through the API (it is private); tap to view.
class _Attachment extends StatefulWidget {
  const _Attachment({required this.repo, required this.ticketId, required this.messageId});

  final PortalRepository repo;
  final int ticketId;
  final int messageId;

  @override
  State<_Attachment> createState() => _AttachmentState();
}

class _AttachmentState extends State<_Attachment> {
  late final Future<List<int>?> _bytes = widget.repo.ticketAttachment(widget.ticketId, widget.messageId);

  @override
  Widget build(BuildContext context) => FutureBuilder<List<int>?>(
        future: _bytes,
        builder: (context, snap) {
          if (snap.connectionState != ConnectionState.done) {
            return Container(
              height: 120,
              alignment: Alignment.center,
              decoration: BoxDecoration(color: AppColors.surfaceLow, borderRadius: BorderRadius.circular(10)),
              child: const SizedBox(width: 20, height: 20, child: CircularProgressIndicator(strokeWidth: 2)),
            );
          }
          final data = snap.data;
          if (snap.hasError || data == null) {
            return Row(
              mainAxisSize: MainAxisSize.min,
              children: [
                const Icon(Icons.broken_image_outlined, size: 16, color: AppColors.outline),
                const SizedBox(width: 4),
                Text('Attachment unavailable', style: AppText.labelMd.copyWith(color: AppColors.outline)),
              ],
            );
          }
          final bytes = Uint8List.fromList(data);
          return GestureDetector(
            onTap: () => Navigator.of(context).push(MaterialPageRoute(
              builder: (_) => Scaffold(
                backgroundColor: Colors.black,
                appBar: AppBar(backgroundColor: Colors.black, foregroundColor: Colors.white),
                body: Center(child: InteractiveViewer(maxScale: 5, child: Image.memory(bytes))),
              ),
            )),
            child: ClipRRect(
              borderRadius: BorderRadius.circular(10),
              child: ConstrainedBox(
                constraints: const BoxConstraints(maxHeight: 220),
                child: Image.memory(
                  bytes,
                  fit: BoxFit.cover,
                  errorBuilder: (_, __, ___) =>
                      Text('Attachment cannot be shown', style: AppText.labelMd.copyWith(color: AppColors.outline)),
                ),
              ),
            ),
          );
        },
      );
}

String _stamp(DateTime d) {
  final l = d.toLocal();
  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  final h = l.hour % 12 == 0 ? 12 : l.hour % 12;
  final m = l.minute.toString().padLeft(2, '0');
  return '${l.day} ${months[l.month - 1]}, $h:$m ${l.hour < 12 ? 'AM' : 'PM'}';
}
