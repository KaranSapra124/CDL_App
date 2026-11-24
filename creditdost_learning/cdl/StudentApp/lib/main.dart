import 'package:flutter/material.dart';

import 'core/api_client.dart';
import 'core/models.dart';
import 'core/portal_repository.dart';
import 'core/theme.dart';
import 'screens/home_shell.dart';
import 'screens/login_screen.dart';

Future<void> main() async {
  WidgetsFlutterBinding.ensureInitialized();
  final api = await ApiClient.create();
  runApp(StudentApp(repo: PortalRepository(api)));
}

class StudentApp extends StatelessWidget {
  const StudentApp({super.key, required this.repo});

  final PortalRepository repo;

  @override
  Widget build(BuildContext context) => MaterialApp(
        title: 'Credit Dost Learning',
        debugShowCheckedModeBanner: false,
        theme: buildAppTheme(),
        home: SessionGate(repo: repo),
      );
}

/// Decides between login and the app by asking the server who the cookie belongs to.
class SessionGate extends StatefulWidget {
  const SessionGate({super.key, required this.repo});

  final PortalRepository repo;

  @override
  State<SessionGate> createState() => _SessionGateState();
}

class _SessionGateState extends State<SessionGate> {
  bool _checking = true;
  Profile? _profile;

  @override
  void initState() {
    super.initState();
    _restore();
  }

  Future<void> _restore() async {
    Profile? profile;
    try {
      profile = await widget.repo.me();
    } on ApiException {
      profile = null;
    }
    if (mounted) setState(() => _setState(profile));
  }

  void _setState(Profile? profile) {
    _profile = profile;
    _checking = false;
  }

  /// Called by the login screen after a successful sign-in, and by logout with null.
  void _setSession(Profile? profile) => setState(() => _setState(profile));

  @override
  Widget build(BuildContext context) {
    if (_checking) {
      return const Scaffold(body: Center(child: CircularProgressIndicator()));
    }
    final profile = _profile;
    if (profile == null) {
      return LoginScreen(repo: widget.repo, onSignedIn: _setSession);
    }
    return HomeShell(
      repo: widget.repo,
      profile: profile,
      onSignedOut: () => _setSession(null),
      onProfileChanged: _setSession,
    );
  }
}
