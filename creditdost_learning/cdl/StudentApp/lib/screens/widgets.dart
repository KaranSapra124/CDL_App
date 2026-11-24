import 'package:flutter/material.dart';

import '../core/theme.dart';

/// Top bar used on every tab: "CD" badge, CREDIT DOST caption, screen title, bell and avatar.
class CdHeader extends StatelessWidget implements PreferredSizeWidget {
  const CdHeader({super.key, required this.title, this.onBell, this.onAvatar, this.trailing});

  final String title;
  final VoidCallback? onBell;
  final VoidCallback? onAvatar;
  final Widget? trailing;

  @override
  Size get preferredSize => const Size.fromHeight(56);

  @override
  Widget build(BuildContext context) {
    return Container(
      decoration: const BoxDecoration(
        color: AppColors.surface,
        boxShadow: [BoxShadow(color: Color(0x0A000000), blurRadius: 8, offset: Offset(0, 1))],
      ),
      child: SafeArea(
        bottom: false,
        child: SizedBox(
          height: 56,
          child: Padding(
            padding: const EdgeInsets.symmetric(horizontal: 16),
            child: Row(
              children: [
                Container(
                  width: 36,
                  height: 36,
                  alignment: Alignment.center,
                  decoration: BoxDecoration(
                    color: AppColors.primaryContainer,
                    borderRadius: BorderRadius.circular(8),
                    boxShadow: const [BoxShadow(color: Color(0x4D4F46E5), blurRadius: 4, offset: Offset(0, 1))],
                  ),
                  child: Text('CD', style: AppText.headlineSm.copyWith(color: Colors.white)),
                ),
                const SizedBox(width: 12),
                Expanded(
                  child: Column(
                    mainAxisAlignment: MainAxisAlignment.center,
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text('CREDIT DOST', style: AppText.caption.copyWith(color: AppColors.outline)),
                      Text(title, style: AppText.headlineSm, maxLines: 1, overflow: TextOverflow.ellipsis),
                    ],
                  ),
                ),
                if (trailing != null) trailing!,
                IconButton(
                  onPressed: onBell,
                  icon: const Icon(Icons.notifications_outlined, size: 22, color: AppColors.onSurfaceVariant),
                ),
                const SizedBox(width: 4),
                InkWell(
                  onTap: onAvatar,
                  customBorder: const CircleBorder(),
                  child: const CircleAvatar(
                    radius: 16,
                    backgroundColor: AppColors.primary,
                    child: Icon(Icons.person, size: 18, color: Colors.white),
                  ),
                ),
              ],
            ),
          ),
        ),
      ),
    );
  }
}

/// Simple back-arrow top bar for pushed screens (Lesson Video Player, Settings in the designs).
class CdBackHeader extends StatelessWidget implements PreferredSizeWidget {
  const CdBackHeader({super.key, required this.title});

  final String title;

  @override
  Size get preferredSize => const Size.fromHeight(56);

  @override
  Widget build(BuildContext context) => Container(
        color: AppColors.surface,
        child: SafeArea(
          bottom: false,
          child: SizedBox(
            height: 56,
            child: Row(
              children: [
                const SizedBox(width: 4),
                IconButton(
                  icon: const Icon(Icons.arrow_back, color: AppColors.onSurface),
                  onPressed: () => Navigator.of(context).maybePop(),
                ),
                const SizedBox(width: 4),
                Expanded(
                  child: Text(title, style: AppText.headlineSm.copyWith(fontSize: 18),
                      maxLines: 1, overflow: TextOverflow.ellipsis),
                ),
              ],
            ),
          ),
        ),
      );
}

/// White rounded-2xl card with micro elevation (rounded-2xl bg-surface-container-lowest shadow-sm).
class AppCard extends StatelessWidget {
  const AppCard({
    super.key,
    required this.child,
    this.padding = const EdgeInsets.all(16),
    this.color = AppColors.surfaceLowest,
    this.radius = 16,
    this.onTap,
    this.shadow = AppShadows.sm,
    this.border,
  });

  final Widget child;
  final EdgeInsetsGeometry padding;
  final Color color;
  final double radius;
  final VoidCallback? onTap;
  final List<BoxShadow> shadow;
  final BoxBorder? border;

  @override
  Widget build(BuildContext context) {
    final r = BorderRadius.circular(radius);
    return Container(
      decoration: BoxDecoration(color: color, borderRadius: r, boxShadow: shadow, border: border),
      child: Material(
        type: MaterialType.transparency,
        child: InkWell(
          borderRadius: r,
          onTap: onTap,
          child: Padding(padding: padding, child: child),
        ),
      ),
    );
  }
}

/// Rounded-full status pill (badges like "CONTINUE WATCHING", "In Progress", "85% Complete").
class Pill extends StatelessWidget {
  const Pill({
    super.key,
    required this.label,
    required this.background,
    required this.foreground,
    this.icon,
    this.dot,
    this.style,
  });

  final String label;
  final Color background;
  final Color foreground;
  final IconData? icon;
  final Color? dot;
  final TextStyle? style;

  @override
  Widget build(BuildContext context) => Container(
        padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 3),
        decoration: BoxDecoration(color: background, borderRadius: BorderRadius.circular(999)),
        child: Row(
          mainAxisSize: MainAxisSize.min,
          children: [
            if (dot != null) ...[
              Container(width: 6, height: 6, decoration: BoxDecoration(color: dot, shape: BoxShape.circle)),
              const SizedBox(width: 6),
            ],
            if (icon != null) ...[
              Icon(icon, size: 13, color: foreground),
              const SizedBox(width: 4),
            ],
            Flexible(
              child: Text(label,
                  maxLines: 1,
                  overflow: TextOverflow.ellipsis,
                  style: (style ?? AppText.labelSm).copyWith(color: foreground)),
            ),
          ],
        ),
      );
}

/// Square tinted icon tile (w-9 h-9 rounded-lg bg-primary-fixed text-primary).
class IconBox extends StatelessWidget {
  const IconBox({
    super.key,
    required this.icon,
    this.size = 36,
    this.iconSize = 20,
    this.radius = 8,
    this.background = AppColors.primaryFixed,
    this.foreground = AppColors.primary,
  });

  final IconData icon;
  final double size;
  final double iconSize;
  final double radius;
  final Color background;
  final Color foreground;

  @override
  Widget build(BuildContext context) => Container(
        width: size,
        height: size,
        decoration: BoxDecoration(color: background, borderRadius: BorderRadius.circular(radius)),
        child: Icon(icon, size: iconSize, color: foreground),
      );
}

/// Section heading with optional uppercase caption and a right-side link.
class SectionTitle extends StatelessWidget {
  const SectionTitle({super.key, required this.title, this.caption, this.action, this.onAction});

  final String title;
  final String? caption;
  final String? action;
  final VoidCallback? onAction;

  @override
  Widget build(BuildContext context) => Row(
        crossAxisAlignment: CrossAxisAlignment.end,
        children: [
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(title, style: AppText.headlineSm),
                if (caption != null)
                  Text(caption!.toUpperCase(), style: AppText.caption.copyWith(color: AppColors.outline)),
              ],
            ),
          ),
          if (action != null)
            InkWell(
              onTap: onAction,
              borderRadius: BorderRadius.circular(6),
              child: Padding(
                padding: const EdgeInsets.all(4),
                child: Text(action!, style: AppText.labelSm.copyWith(color: AppColors.primary)),
              ),
            ),
        ],
      );
}

/// Rounded progress track (h-1.5 rounded-full bg-surface-container).
class ProgressTrack extends StatelessWidget {
  const ProgressTrack({
    super.key,
    required this.value,
    this.height = 6,
    this.track = AppColors.surfaceContainer,
    this.fill = AppColors.primaryContainer,
  });

  final double value;
  final double height;
  final Color track;
  final Color fill;

  @override
  Widget build(BuildContext context) => ClipRRect(
        borderRadius: BorderRadius.circular(999),
        child: LinearProgressIndicator(
          value: value.clamp(0, 1).toDouble(),
          minHeight: height,
          backgroundColor: track,
          color: fill,
        ),
      );
}

/// Green round check followed by text (plan "What's inside" list).
class CheckBullet extends StatelessWidget {
  const CheckBullet(this.text, {super.key});

  final String text;

  @override
  Widget build(BuildContext context) => Padding(
        padding: const EdgeInsets.only(bottom: 10),
        child: Row(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Container(
              width: 20,
              height: 20,
              margin: const EdgeInsets.only(top: 1),
              decoration: const BoxDecoration(color: AppColors.secondaryContainer, shape: BoxShape.circle),
              child: const Icon(Icons.check, size: 14, color: AppColors.onSecondaryContainer),
            ),
            const SizedBox(width: 10),
            Expanded(child: Text(text, style: AppText.bodySm.copyWith(color: AppColors.onSurface))),
          ],
        ),
      );
}

/// Collapsible FAQ row in a white card.
class FaqTile extends StatelessWidget {
  const FaqTile({super.key, required this.question, required this.answer});

  final String question;
  final String answer;

  @override
  Widget build(BuildContext context) => Padding(
        padding: const EdgeInsets.only(bottom: 8),
        child: Container(
          decoration: BoxDecoration(
            color: AppColors.surfaceLowest,
            borderRadius: BorderRadius.circular(12),
            boxShadow: AppShadows.sm,
          ),
          child: Theme(
            data: Theme.of(context).copyWith(dividerColor: Colors.transparent),
            child: ExpansionTile(
              shape: const RoundedRectangleBorder(),
              collapsedShape: const RoundedRectangleBorder(),
              tilePadding: const EdgeInsets.symmetric(horizontal: 14),
              childrenPadding: const EdgeInsets.fromLTRB(14, 0, 14, 14),
              iconColor: AppColors.onSurfaceVariant,
              collapsedIconColor: AppColors.onSurfaceVariant,
              title: Text(question, style: AppText.bodyMd.copyWith(fontWeight: FontWeight.w500)),
              children: [
                Align(
                  alignment: Alignment.centerLeft,
                  child: Text(answer, style: AppText.bodySm.copyWith(color: AppColors.onSurfaceVariant)),
                ),
              ],
            ),
          ),
        ),
      );
}

/// Primary CTA (bg-primary-container rounded-lg, white label, optional trailing icon).
class PrimaryButton extends StatelessWidget {
  const PrimaryButton({super.key, required this.label, this.onPressed, this.icon, this.leading, this.busy = false});

  final String label;
  final VoidCallback? onPressed;
  final IconData? icon;
  final IconData? leading;
  final bool busy;

  @override
  Widget build(BuildContext context) => FilledButton(
        onPressed: busy ? null : onPressed,
        style: FilledButton.styleFrom(
          backgroundColor: AppColors.primaryContainer,
          foregroundColor: Colors.white,
          disabledBackgroundColor: AppColors.primaryContainer.withValues(alpha: 0.5),
          disabledForegroundColor: Colors.white,
          minimumSize: const Size.fromHeight(48),
          shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(12)),
          textStyle: AppText.headlineSm.copyWith(fontWeight: FontWeight.w500),
        ),
        child: busy
            ? const SizedBox(width: 20, height: 20, child: CircularProgressIndicator(strokeWidth: 2, color: Colors.white))
            : Row(
                mainAxisSize: MainAxisSize.min,
                children: [
                  if (leading != null) ...[Icon(leading, size: 20), const SizedBox(width: 8)],
                  Flexible(child: Text(label, overflow: TextOverflow.ellipsis)),
                  if (icon != null) ...[const SizedBox(width: 8), Icon(icon, size: 20)],
                ],
              ),
      );
}

/// Bottom navigation from the Stitch screens: 5 icons with captions, active in primary-container.
class CdBottomNav extends StatelessWidget {
  const CdBottomNav({super.key, required this.index, required this.onSelect});

  final int index;
  final ValueChanged<int> onSelect;

  static const _items = [
    (Icons.school_outlined, Icons.school, 'Classes'),
    (Icons.explore_outlined, Icons.explore, 'Plans'),
    (Icons.campaign_outlined, Icons.campaign, 'Updates'),
    (Icons.support_agent_outlined, Icons.support_agent, 'Support'),
    (Icons.account_circle_outlined, Icons.account_circle, 'Profile'),
  ];

  @override
  Widget build(BuildContext context) => Container(
        decoration: const BoxDecoration(
          color: AppColors.surface,
          boxShadow: [BoxShadow(color: Color(0x0D000000), blurRadius: 12, offset: Offset(0, -1))],
        ),
        child: SafeArea(
          top: false,
          child: SizedBox(
            height: 64,
            child: Row(
              children: [
                for (var i = 0; i < _items.length; i++)
                  Expanded(
                    child: InkWell(
                      onTap: () => onSelect(i),
                      child: Column(
                        mainAxisAlignment: MainAxisAlignment.center,
                        children: [
                          Icon(
                            i == index ? _items[i].$2 : _items[i].$1,
                            size: 22,
                            color: i == index ? AppColors.primaryContainer : AppColors.onSurfaceVariant,
                          ),
                          const SizedBox(height: 4),
                          Text(
                            _items[i].$3,
                            style: AppText.caption.copyWith(
                              letterSpacing: 0.2,
                              color: i == index ? AppColors.primaryContainer : AppColors.onSurfaceVariant,
                              fontWeight: i == index ? FontWeight.w600 : FontWeight.w500,
                            ),
                          ),
                        ],
                      ),
                    ),
                  ),
              ],
            ),
          ),
        ),
      );
}

class EmptyState extends StatelessWidget {
  const EmptyState({super.key, required this.icon, required this.title, required this.body});

  final IconData icon;
  final String title;
  final String body;

  @override
  Widget build(BuildContext context) => Padding(
        padding: const EdgeInsets.symmetric(vertical: 28),
        child: Column(
          children: [
            IconBox(icon: icon, size: 48, iconSize: 26, radius: 14),
            const SizedBox(height: 12),
            Text(title, style: AppText.headlineSm),
            const SizedBox(height: 4),
            Text(body, textAlign: TextAlign.center, style: AppText.bodySm.copyWith(color: AppColors.onSurfaceVariant)),
          ],
        ),
      );
}

/// Scrollable so pull-to-refresh still works when a load fails.
class ErrorState extends StatelessWidget {
  const ErrorState({super.key, required this.message, required this.onRetry});

  final String message;
  final Future<void> Function() onRetry;

  @override
  Widget build(BuildContext context) => ListView(
        physics: const AlwaysScrollableScrollPhysics(),
        padding: const EdgeInsets.all(24),
        children: [
          const SizedBox(height: 40),
          const Center(
            child: IconBox(
              icon: Icons.cloud_off_outlined,
              size: 48,
              iconSize: 26,
              radius: 14,
              background: AppColors.errorContainer,
              foreground: AppColors.error,
            ),
          ),
          const SizedBox(height: 12),
          Text(message, textAlign: TextAlign.center, style: AppText.bodyMd.copyWith(color: AppColors.onSurfaceVariant)),
          const SizedBox(height: 16),
          Center(
            child: OutlinedButton(onPressed: () => onRetry(), child: const Text('Try again')),
          ),
        ],
      );
}

/// "mm:ss" for a number of seconds.
String clock(int seconds) {
  final m = seconds ~/ 60;
  final s = seconds % 60;
  return '${m.toString().padLeft(2, '0')}:${s.toString().padLeft(2, '0')}';
}
