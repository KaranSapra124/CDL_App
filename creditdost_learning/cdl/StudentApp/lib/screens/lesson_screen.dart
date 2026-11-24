import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:video_player/video_player.dart';

import '../core/api_client.dart';
import '../core/models.dart';
import '../core/portal_repository.dart';
import '../core/theme.dart';
import 'widgets.dart';

/// Stitch "Lesson Video Player". Streams the module's HLS playlist with the session cookie and
/// saves watch position on exit. The playlist and "Up next" come from the course's lessons.
/// Not shown (no backend data yet): AI dubbed audio tracks, legal templates, timestamps and notes.
class LessonScreen extends StatefulWidget {
  const LessonScreen({super.key, required this.repo, required this.course, required this.module});

  final PortalRepository repo;
  final CourseDetail course;
  final ModuleItem module;

  @override
  State<LessonScreen> createState() => _LessonScreenState();
}

class _LessonScreenState extends State<LessonScreen> {
  VideoPlayerController? _controller;
  String? _error;
  late bool _completed = widget.module.completed;
  double _speed = 1.0;
  bool _saving = false;

  ModuleItem get m => widget.module;

  ModuleItem? get _next {
    final list = widget.course.modules;
    final i = list.indexWhere((x) => x.id == m.id);
    if (i < 0 || i + 1 >= list.length) return null;
    return list[i + 1];
  }

  @override
  void initState() {
    super.initState();
    _init();
  }

  Future<void> _init() async {
    try {
      final uri = widget.repo.moduleStreamUrl(m.id);
      final headers = await widget.repo.streamHeaders(uri);
      final controller = VideoPlayerController.networkUrl(uri, httpHeaders: headers);
      await controller.initialize();
      if (m.watchedSeconds > 0 && !m.completed) {
        await controller.seekTo(Duration(seconds: m.watchedSeconds));
      }
      if (!mounted) {
        await controller.dispose();
        return;
      }
      setState(() => _controller = controller);
    } on ApiException catch (e) {
      if (mounted) setState(() => _error = e.message);
    } catch (_) {
      if (mounted) setState(() => _error = 'This lesson could not be played. Check your connection and try again.');
    }
  }

  void _togglePlay() {
    final c = _controller;
    if (c == null) return;
    // The player's ValueListenableBuilder rebuilds the controls, so no setState is needed here.
    if (c.value.isPlaying) {
      c.pause();
    } else {
      c.play();
    }
  }

  void _seekBy(int seconds) {
    final c = _controller;
    if (c == null) return;
    final target = c.value.position + Duration(seconds: seconds);
    c.seekTo(target < Duration.zero ? Duration.zero : (target > c.value.duration ? c.value.duration : target));
  }

  void _cycleSpeed() {
    const speeds = [1.0, 1.25, 1.5, 2.0];
    final next = speeds[(speeds.indexOf(_speed) + 1) % speeds.length];
    setState(() => _speed = next);
    _controller?.setPlaybackSpeed(next);
  }

  String get _speedLabel => _speed == 1.0 ? '1x' : '${_speed}x';

  Future<void> _markComplete() async {
    if (_completed) return;
    setState(() => _saving = true);
    try {
      await widget.repo.saveProgress(
        m.id,
        watchedSeconds: _controller?.value.position.inSeconds ?? m.watchedSeconds,
        completed: true,
      );
      if (mounted) setState(() => _completed = true);
    } on ApiException catch (e) {
      if (mounted) ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(e.message)));
    } finally {
      if (mounted) setState(() => _saving = false);
    }
  }

  /// Opens the same player full screen (landscape, system bars hidden). Playback continues.
  Future<void> _enterFullscreen() async {
    final c = _controller;
    if (c == null) return;
    await Navigator.of(context).push(PageRouteBuilder<void>(
      opaque: true,
      transitionDuration: const Duration(milliseconds: 200),
      pageBuilder: (_, __, ___) => _FullscreenPlayer(
        controller: c,
        onTogglePlay: _togglePlay,
        onSeekBack: () => _seekBy(-10),
        onSeekForward: () => _seekBy(10),
        onSpeed: _cycleSpeed,
      ),
      transitionsBuilder: (_, anim, __, child) => FadeTransition(opacity: anim, child: child),
    ));
  }

  void _openModule(ModuleItem other) {
    if (!other.playable || other.id == m.id) return;
    Navigator.of(context).pushReplacement(MaterialPageRoute(
      builder: (_) => LessonScreen(repo: widget.repo, course: widget.course, module: other),
    ));
  }

  @override
  void dispose() {
    final c = _controller;
    if (c != null) {
      // Best-effort save of the watch position. The screen is closing, so errors are ignored.
      widget.repo
          .saveProgress(m.id, watchedSeconds: c.value.position.inSeconds, completed: _completed)
          .catchError((_) {});
      c.dispose();
    }
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final course = widget.course;
    final next = _next;
    return Scaffold(
      appBar: const CdBackHeader(title: 'Lesson Video Player'),
      body: ListView(
        padding: EdgeInsets.zero,
        children: [
          _Player(
            controller: _controller,
            error: _error,
            onTogglePlay: _togglePlay,
            onSeekBack: () => _seekBy(-10),
            onSeekForward: () => _seekBy(10),
            onSpeed: _cycleSpeed,
            onToggleFullscreen: _enterFullscreen,
          ),
          Padding(
            padding: const EdgeInsets.fromLTRB(16, 16, 16, 24),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Wrap(
                  spacing: 6,
                  runSpacing: 6,
                  children: [
                    if (course.card.category != null)
                      _Tag(course.card.category!, AppColors.surfaceContainer, AppColors.onSurfaceVariant),
                    _Tag('Module ${m.moduleNumber} of ${course.modules.length}', AppColors.surfaceContainer,
                        AppColors.onSurfaceVariant),
                    if (m.isFreePreview) const _Tag('Free Preview', AppColors.primaryFixed, AppColors.primary),
                    if (_completed) const _Tag('Completed', AppColors.secondaryContainer, AppColors.onSecondaryContainer),
                  ],
                ),
                const SizedBox(height: 12),
                Text('Lesson ${m.moduleNumber}: ${m.title}', style: AppText.headlineMd),
                if (m.description.isNotEmpty) ...[
                  const SizedBox(height: 6),
                  Text(m.description, style: AppText.bodyMd.copyWith(color: AppColors.onSurfaceVariant)),
                ],
                if (course.card.instructors.isNotEmpty) ...[
                  const SizedBox(height: 14),
                  _InstructorCard(names: course.card.instructors),
                ],
                const SizedBox(height: 14),
                Row(
                  children: [
                    _ActionTile(
                      icon: _completed ? Icons.task_alt : Icons.check_circle_outline,
                      label: _completed ? 'Done' : (_saving ? 'Saving…' : 'Mark Done'),
                      active: _completed,
                      onTap: _completed || _saving ? null : _markComplete,
                    ),
                    const SizedBox(width: 8),
                    _ActionTile(icon: Icons.speed, label: 'Speed ($_speedLabel)', onTap: _cycleSpeed),
                    const SizedBox(width: 8),
                    _ActionTile(icon: Icons.replay_10, label: 'Rewind 10s', onTap: () => _seekBy(-10)),
                    const SizedBox(width: 8),
                    _ActionTile(
                      icon: Icons.restart_alt,
                      label: 'Restart',
                      onTap: () => _controller?.seekTo(Duration.zero),
                    ),
                  ],
                ),
                const SizedBox(height: 20),
                AppCard(
                  color: AppColors.surfaceLow,
                  shadow: const [],
                  padding: const EdgeInsets.all(12),
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Row(
                        children: [
                          const Text('Course Playlist', style: AppText.headlineSm),
                          const Spacer(),
                          Text('${course.modules.length} lessons',
                              style: AppText.labelSm.copyWith(color: AppColors.primary)),
                        ],
                      ),
                      const SizedBox(height: 8),
                      for (final x in course.modules)
                        _PlaylistRow(module: x, current: x.id == m.id, onTap: () => _openModule(x)),
                    ],
                  ),
                ),
                if (next != null) ...[
                  const SizedBox(height: 16),
                  _UpNext(module: next, onTap: next.playable ? () => _openModule(next) : null),
                ],
              ],
            ),
          ),
        ],
      ),
    );
  }
}

class _Player extends StatelessWidget {
  const _Player({
    required this.controller,
    required this.error,
    required this.onTogglePlay,
    required this.onSeekBack,
    required this.onSeekForward,
    required this.onSpeed,
    required this.onToggleFullscreen,
    this.fullscreen = false,
  });

  final VideoPlayerController? controller;
  final String? error;
  final VoidCallback onTogglePlay;
  final VoidCallback onSeekBack;
  final VoidCallback onSeekForward;
  final VoidCallback onSpeed;
  final VoidCallback onToggleFullscreen;

  /// Fills the screen instead of a 16:9 box, and the button exits full screen.
  final bool fullscreen;

  @override
  Widget build(BuildContext context) {
    final c = controller;
    if (error != null || c == null) {
      return AspectRatio(
        aspectRatio: 16 / 9,
        child: Container(
          color: AppColors.inverseSurface,
          alignment: Alignment.center,
          padding: const EdgeInsets.all(20),
          child: error != null
              ? Column(
                  mainAxisSize: MainAxisSize.min,
                  children: [
                    const Icon(Icons.videocam_off_outlined, color: AppColors.onPrimaryContainer, size: 32),
                    const SizedBox(height: 8),
                    Text(error!, textAlign: TextAlign.center, style: AppText.bodySm.copyWith(color: Colors.white)),
                  ],
                )
              : const CircularProgressIndicator(color: Colors.white),
        ),
      );
    }
    return ValueListenableBuilder<VideoPlayerValue>(
      valueListenable: c,
      builder: (context, v, _) {
        final total = v.duration.inSeconds;
        final pos = v.position.inSeconds;
        final pct = total > 0 ? (pos * 100 / total).round() : 0;
        final speed = v.playbackSpeed;
        final speedLabel = speed == 1.0 ? '1x' : '${speed}x';
        final frame = Container(
            color: Colors.black,
            child: Stack(
              fit: StackFit.expand,
              children: [
                Center(child: AspectRatio(aspectRatio: v.aspectRatio, child: VideoPlayer(c))),
                // Gradient for legible overlays.
                const DecoratedBox(
                  decoration: BoxDecoration(
                    gradient: LinearGradient(
                      begin: Alignment.topCenter,
                      end: Alignment.bottomCenter,
                      colors: [Color(0x99000000), Color(0x00000000), Color(0x00000000), Color(0xB3000000)],
                      stops: [0, 0.3, 0.6, 1],
                    ),
                  ),
                ),
                Positioned(
                  left: 12,
                  top: 10,
                  child: Pill(
                    label: 'Secure HLS stream',
                    background: Colors.black.withValues(alpha: 0.4),
                    foreground: Colors.white,
                    dot: AppColors.secondaryFixed,
                  ),
                ),
                // Centre controls.
                Center(
                  child: Row(
                    mainAxisSize: MainAxisSize.min,
                    children: [
                      _RoundButton(icon: Icons.replay_10, onTap: onSeekBack),
                      const SizedBox(width: 24),
                      GestureDetector(
                        onTap: onTogglePlay,
                        child: Container(
                          width: 56,
                          height: 56,
                          decoration: const BoxDecoration(color: AppColors.primaryContainer, shape: BoxShape.circle),
                          child: Icon(v.isPlaying ? Icons.pause : Icons.play_arrow, color: Colors.white, size: 32),
                        ),
                      ),
                      const SizedBox(width: 24),
                      _RoundButton(icon: Icons.forward_10, onTap: onSeekForward),
                    ],
                  ),
                ),
                // Bottom bar: time, percent, speed and scrubber.
                Positioned(
                  left: 12,
                  right: 12,
                  bottom: 8,
                  child: Column(
                    mainAxisSize: MainAxisSize.min,
                    children: [
                      SizedBox(
                        height: 12,
                        child: VideoProgressIndicator(
                          c,
                          allowScrubbing: true,
                          padding: const EdgeInsets.symmetric(vertical: 4),
                          colors: VideoProgressColors(
                            playedColor: AppColors.primaryContainer,
                            bufferedColor: Colors.white.withValues(alpha: 0.35),
                            backgroundColor: Colors.white.withValues(alpha: 0.15),
                          ),
                        ),
                      ),
                      const SizedBox(height: 4),
                      Row(
                        children: [
                          Text('${clock(pos)} / ${clock(total)}',
                              style: AppText.labelSm.copyWith(color: Colors.white, letterSpacing: 0)),
                          const SizedBox(width: 8),
                          Container(
                            padding: const EdgeInsets.symmetric(horizontal: 6, vertical: 1),
                            decoration: BoxDecoration(
                                color: Colors.white.withValues(alpha: 0.2), borderRadius: BorderRadius.circular(4)),
                            child: Text('$pct%', style: AppText.caption.copyWith(color: Colors.white)),
                          ),
                          const Spacer(),
                          InkWell(
                            onTap: onSpeed,
                            child: Padding(
                              padding: const EdgeInsets.symmetric(horizontal: 6, vertical: 2),
                              child: Text(speedLabel, style: AppText.labelSm.copyWith(color: Colors.white)),
                            ),
                          ),
                          const SizedBox(width: 4),
                          InkWell(
                            onTap: onToggleFullscreen,
                            customBorder: const CircleBorder(),
                            child: Padding(
                              padding: const EdgeInsets.all(4),
                              child: Icon(
                                fullscreen ? Icons.fullscreen_exit : Icons.fullscreen,
                                color: Colors.white,
                                size: 24,
                                semanticLabel: fullscreen ? 'Exit full screen' : 'Full screen',
                              ),
                            ),
                          ),
                        ],
                      ),
                    ],
                  ),
                ),
              ],
            ),
          );
        return fullscreen ? frame : AspectRatio(aspectRatio: 16 / 9, child: frame);
      },
    );
  }
}

/// Full-screen playback of the lesson's existing controller (no reload). Landscape for wide
/// videos, portrait for tall ones; system bars hidden. Leaving restores portrait and the bars.
class _FullscreenPlayer extends StatefulWidget {
  const _FullscreenPlayer({
    required this.controller,
    required this.onTogglePlay,
    required this.onSeekBack,
    required this.onSeekForward,
    required this.onSpeed,
  });

  final VideoPlayerController controller;
  final VoidCallback onTogglePlay;
  final VoidCallback onSeekBack;
  final VoidCallback onSeekForward;
  final VoidCallback onSpeed;

  @override
  State<_FullscreenPlayer> createState() => _FullscreenPlayerState();
}

class _FullscreenPlayerState extends State<_FullscreenPlayer> {
  @override
  void initState() {
    super.initState();
    final wide = widget.controller.value.aspectRatio >= 1;
    SystemChrome.setPreferredOrientations(wide
        ? const [DeviceOrientation.landscapeLeft, DeviceOrientation.landscapeRight]
        : const [DeviceOrientation.portraitUp]);
    SystemChrome.setEnabledSystemUIMode(SystemUiMode.immersiveSticky);
  }

  @override
  void dispose() {
    // Empty list = back to the phone's own rotation setting.
    SystemChrome.setPreferredOrientations(const []);
    SystemChrome.setEnabledSystemUIMode(SystemUiMode.edgeToEdge);
    super.dispose();
  }

  @override
  Widget build(BuildContext context) => Scaffold(
        backgroundColor: Colors.black,
        body: _Player(
          controller: widget.controller,
          error: null,
          fullscreen: true,
          onTogglePlay: widget.onTogglePlay,
          onSeekBack: widget.onSeekBack,
          onSeekForward: widget.onSeekForward,
          onSpeed: widget.onSpeed,
          onToggleFullscreen: () => Navigator.of(context).maybePop(),
        ),
      );
}

class _RoundButton extends StatelessWidget {
  const _RoundButton({required this.icon, required this.onTap});

  final IconData icon;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) => InkWell(
        onTap: onTap,
        customBorder: const CircleBorder(),
        child: Container(
          width: 40,
          height: 40,
          decoration: BoxDecoration(color: Colors.black.withValues(alpha: 0.35), shape: BoxShape.circle),
          child: Icon(icon, color: Colors.white, size: 22),
        ),
      );
}

class _Tag extends StatelessWidget {
  const _Tag(this.label, this.bg, this.fg);

  final String label;
  final Color bg;
  final Color fg;

  @override
  Widget build(BuildContext context) => Container(
        padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 3),
        decoration: BoxDecoration(color: bg, borderRadius: BorderRadius.circular(6)),
        child: Text(label, style: AppText.labelSm.copyWith(color: fg, letterSpacing: 0.2)),
      );
}

class _InstructorCard extends StatelessWidget {
  const _InstructorCard({required this.names});

  final List<String> names;

  @override
  Widget build(BuildContext context) => AppCard(
        padding: const EdgeInsets.all(12),
        child: Row(
          children: [
            CircleAvatar(
              radius: 22,
              backgroundColor: AppColors.primaryFixed,
              child: Text(names.first.characters.first.toUpperCase(),
                  style: AppText.headlineSm.copyWith(color: AppColors.primary)),
            ),
            const SizedBox(width: 12),
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Row(
                    children: [
                      Flexible(
                        child: Text(names.join(', '),
                            maxLines: 1, overflow: TextOverflow.ellipsis, style: AppText.headlineSm),
                      ),
                      const SizedBox(width: 4),
                      const Icon(Icons.verified, size: 16, color: AppColors.primaryContainer),
                    ],
                  ),
                  Text('Course faculty', style: AppText.caption.copyWith(color: AppColors.onSurfaceVariant)),
                ],
              ),
            ),
          ],
        ),
      );
}

class _ActionTile extends StatelessWidget {
  const _ActionTile({required this.icon, required this.label, required this.onTap, this.active = false});

  final IconData icon;
  final String label;
  final VoidCallback? onTap;
  final bool active;

  @override
  Widget build(BuildContext context) => Expanded(
        child: AppCard(
          color: active ? AppColors.secondaryContainer.withValues(alpha: 0.5) : AppColors.surfaceLowest,
          radius: 12,
          padding: const EdgeInsets.symmetric(vertical: 12, horizontal: 4),
          onTap: onTap,
          child: Column(
            children: [
              Icon(icon, size: 22, color: active ? AppColors.onSecondaryContainer : AppColors.primaryContainer),
              const SizedBox(height: 6),
              Text(label,
                  textAlign: TextAlign.center,
                  maxLines: 2,
                  style: AppText.caption.copyWith(color: AppColors.onSurfaceVariant, letterSpacing: 0.1)),
            ],
          ),
        ),
      );
}

class _PlaylistRow extends StatelessWidget {
  const _PlaylistRow({required this.module, required this.current, required this.onTap});

  final ModuleItem module;
  final bool current;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    final trailing = current
        ? const Icon(Icons.graphic_eq, size: 20, color: AppColors.primaryContainer)
        : module.completed
            ? const Icon(Icons.check_circle, size: 18, color: AppColors.secondary)
            : module.playable
                ? const Icon(Icons.play_arrow, size: 18, color: AppColors.onSurfaceVariant)
                : Icon(module.locked ? Icons.lock_outline : Icons.hourglass_top, size: 16, color: AppColors.outline);
    return Padding(
      padding: const EdgeInsets.only(bottom: 6),
      child: Material(
        color: current ? AppColors.primaryFixed.withValues(alpha: 0.6) : AppColors.surfaceLowest,
        borderRadius: BorderRadius.circular(10),
        child: InkWell(
          borderRadius: BorderRadius.circular(10),
          onTap: module.playable && !current ? onTap : null,
          child: Padding(
            padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 10),
            child: Row(
              children: [
                Container(
                  padding: const EdgeInsets.symmetric(horizontal: 6, vertical: 2),
                  decoration: BoxDecoration(
                    color: current ? AppColors.primaryContainer : AppColors.primaryFixed,
                    borderRadius: BorderRadius.circular(4),
                  ),
                  child: Text(
                    module.durationSeconds != null ? clock(module.durationSeconds!) : '--:--',
                    style: AppText.labelSm.copyWith(
                        color: current ? Colors.white : AppColors.primary, fontFamily: 'monospace', letterSpacing: 0),
                  ),
                ),
                const SizedBox(width: 10),
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text('${module.moduleNumber}. ${module.title}',
                          maxLines: 1,
                          overflow: TextOverflow.ellipsis,
                          style: AppText.bodySm.copyWith(
                              color: current ? AppColors.primary : AppColors.onSurface,
                              fontWeight: current ? FontWeight.w600 : FontWeight.w400)),
                      if (current)
                        Text('●  NOW PLAYING',
                            style: AppText.caption.copyWith(color: AppColors.primaryContainer, fontWeight: FontWeight.w700)),
                    ],
                  ),
                ),
                trailing,
              ],
            ),
          ),
        ),
      ),
    );
  }
}

class _UpNext extends StatelessWidget {
  const _UpNext({required this.module, required this.onTap});

  final ModuleItem module;
  final VoidCallback? onTap;

  @override
  Widget build(BuildContext context) => AppCard(
        color: AppColors.primaryFixed.withValues(alpha: 0.45),
        shadow: const [],
        onTap: onTap,
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Row(
              children: [
                const Icon(Icons.skip_next, size: 16, color: AppColors.primary),
                const SizedBox(width: 4),
                Text('UP NEXT IN COURSE', style: AppText.labelSm.copyWith(color: AppColors.primary)),
              ],
            ),
            const SizedBox(height: 10),
            Row(
              children: [
                Container(
                  width: 64,
                  height: 44,
                  decoration: BoxDecoration(color: AppColors.inverseSurface, borderRadius: BorderRadius.circular(8)),
                  child: Icon(module.playable ? Icons.play_circle_outline : Icons.lock_outline,
                      color: Colors.white, size: 22),
                ),
                const SizedBox(width: 12),
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text('Lesson ${module.moduleNumber}: ${module.title}',
                          maxLines: 1, overflow: TextOverflow.ellipsis, style: AppText.headlineSm),
                      Text(
                        [
                          if (module.durationLabel.isNotEmpty) 'Duration: ${module.durationLabel}',
                          if (module.locked) 'Enrol to unlock' else if (!module.ready) 'Being processed',
                        ].join('  •  '),
                        style: AppText.caption.copyWith(color: AppColors.onSurfaceVariant, letterSpacing: 0.2),
                      ),
                    ],
                  ),
                ),
              ],
            ),
          ],
        ),
      );
}
