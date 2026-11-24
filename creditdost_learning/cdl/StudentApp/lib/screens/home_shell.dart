import 'package:flutter/material.dart';

import '../core/models.dart';
import '../core/portal_repository.dart';
import 'classes_screen.dart';
import 'plans_screen.dart';
import 'profile_screen.dart';
import 'support_screen.dart';
import 'updates_screen.dart';
import 'widgets.dart';

/// Tab indexes, in the order of the Stitch bottom nav.
class Tabs {
  static const classes = 0;
  static const plans = 1;
  static const updates = 2;
  static const support = 3;
  static const profile = 4;
}

class HomeShell extends StatefulWidget {
  const HomeShell({
    super.key,
    required this.repo,
    required this.profile,
    required this.onSignedOut,
    required this.onProfileChanged,
  });

  final PortalRepository repo;
  final Profile profile;
  final VoidCallback onSignedOut;

  /// Called after the student edits their profile, so every tab shows the new details.
  final ValueChanged<Profile> onProfileChanged;

  @override
  State<HomeShell> createState() => _HomeShellState();
}

class _HomeShellState extends State<HomeShell> {
  int _index = Tabs.classes;

  void _go(int i) => setState(() => _index = i);

  @override
  Widget build(BuildContext context) {
    final pages = [
      ClassesScreen(repo: widget.repo, profile: widget.profile, onTab: _go),
      PlansScreen(repo: widget.repo, onTab: _go),
      UpdatesScreen(repo: widget.repo, onTab: _go),
      SupportScreen(repo: widget.repo, profile: widget.profile, onTab: _go),
      ProfileScreen(
        repo: widget.repo,
        profile: widget.profile,
        onSignedOut: widget.onSignedOut,
        onTab: _go,
        onProfileChanged: widget.onProfileChanged,
      ),
    ];
    return Scaffold(
      body: IndexedStack(index: _index, children: pages),
      bottomNavigationBar: CdBottomNav(index: _index, onSelect: _go),
    );
  }
}
