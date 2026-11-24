import 'package:flutter/material.dart';

import '../core/api_client.dart';
import '../core/models.dart';
import '../core/portal_repository.dart';
import '../core/theme.dart';
import 'forgot_password_screen.dart';
import 'widgets.dart';

/// Stitch "Login / Sign Up". Layout follows the design; the form is email + password because that
/// is what the backend supports (mobile OTP, WhatsApp and Google sign-in are not built).
class LoginScreen extends StatefulWidget {
  const LoginScreen({super.key, required this.repo, required this.onSignedIn});

  final PortalRepository repo;
  final ValueChanged<Profile> onSignedIn;

  @override
  State<LoginScreen> createState() => _LoginScreenState();
}

class _LoginScreenState extends State<LoginScreen> {
  final _formKey = GlobalKey<FormState>();
  final _name = TextEditingController();
  final _email = TextEditingController();
  final _password = TextEditingController();
  bool _newLearner = false;
  bool _busy = false;
  bool _obscure = true;
  String? _error;

  @override
  void dispose() {
    _name.dispose();
    _email.dispose();
    _password.dispose();
    super.dispose();
  }

  Future<void> _openForgotPassword() async {
    final email = await Navigator.of(context).push<String>(MaterialPageRoute(
      builder: (_) => ForgotPasswordScreen(repo: widget.repo, initialEmail: _email.text.trim()),
    ));
    if (email == null || !mounted) return;
    setState(() {
      _newLearner = false;
      _email.text = email;
      _password.clear();
      _error = null;
    });
    ScaffoldMessenger.of(context).showSnackBar(const SnackBar(
      content: Text('Password reset. Sign in with your new password.'),
    ));
  }

  /// The two tabs share one form, so clear it when switching to avoid carrying values across.
  void _switchMode(bool newLearner) {
    if (newLearner == _newLearner || _busy) return;
    _formKey.currentState?.reset();
    setState(() {
      _newLearner = newLearner;
      _name.clear();
      _email.clear();
      _password.clear();
      _error = null;
    });
  }

  Future<void> _submit() async {
    if (!(_formKey.currentState?.validate() ?? false)) return;
    setState(() {
      _busy = true;
      _error = null;
    });
    try {
      if (_newLearner) {
        // Sign-up only creates the account. The student then signs in from the Sign In tab.
        await widget.repo.register(
          name: _name.text.trim(),
          email: _email.text.trim(),
          password: _password.text,
        );
        if (!mounted) return;
        final email = _email.text.trim();
        setState(() {
          _newLearner = false;
          _name.clear();
          _password.clear();
          _email.text = email;
          _error = null;
        });
        ScaffoldMessenger.of(context).showSnackBar(const SnackBar(
          content: Text('Account created. Sign in with your email and password.'),
        ));
        return;
      }
      final profile = await widget.repo.login(email: _email.text.trim(), password: _password.text);
      if (mounted) widget.onSignedIn(profile);
    } on ApiException catch (e) {
      if (mounted) setState(() => _error = e.message);
    } catch (e) {
      // Anything unexpected must be visible, not leave the form stuck.
      if (mounted) setState(() => _error = 'Sign in failed: $e');
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      body: SafeArea(
        child: Center(
          child: SingleChildScrollView(
            padding: const EdgeInsets.fromLTRB(16, 24, 16, 32),
            child: ConstrainedBox(
              constraints: const BoxConstraints(maxWidth: 440),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.stretch,
                children: [
                  const _Hero(),
                  const SizedBox(height: 24),
                  _formCard(),
                  const SizedBox(height: 16),
                  const _TrustBadges(),
                  const SizedBox(height: 24),
                  Text.rich(
                    TextSpan(
                      style: AppText.caption.copyWith(color: AppColors.onSurfaceVariant, letterSpacing: 0.2, height: 1.5),
                      children: [
                        const TextSpan(text: 'By proceeding, you agree to our '),
                        TextSpan(
                          text: 'Terms of Service',
                          style: AppText.caption.copyWith(
                              color: AppColors.primary, fontWeight: FontWeight.w600, decoration: TextDecoration.underline),
                        ),
                        const TextSpan(text: ' & '),
                        TextSpan(
                          text: 'Privacy Policy',
                          style: AppText.caption.copyWith(
                              color: AppColors.primary, fontWeight: FontWeight.w600, decoration: TextDecoration.underline),
                        ),
                        const TextSpan(text: '.'),
                      ],
                    ),
                    textAlign: TextAlign.center,
                  ),
                ],
              ),
            ),
          ),
        ),
      ),
    );
  }

  Widget _formCard() {
    return Container(
      padding: const EdgeInsets.all(16),
      decoration: BoxDecoration(
        color: AppColors.surfaceLowest,
        borderRadius: BorderRadius.circular(16),
        boxShadow: AppShadows.md,
      ),
      child: Form(
        key: _formKey,
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            _ModeTabs(newLearner: _newLearner, onChanged: _switchMode),
            const SizedBox(height: 16),
            if (_newLearner) ...[
              const _FieldLabel('Full name'),
              TextFormField(
                controller: _name,
                textInputAction: TextInputAction.next,
                style: AppText.headlineSm.copyWith(fontWeight: FontWeight.w500),
                decoration: const InputDecoration(hintText: 'As it should appear on certificates'),
                validator: (v) => (v == null || v.trim().isEmpty) ? 'Enter your name' : null,
              ),
              const SizedBox(height: 12),
            ],
            const _FieldLabel('Email address'),
            TextFormField(
              controller: _email,
              keyboardType: TextInputType.emailAddress,
              autofillHints: const [AutofillHints.email],
              textInputAction: TextInputAction.next,
              style: AppText.headlineSm.copyWith(fontWeight: FontWeight.w500),
              decoration: const InputDecoration(
                hintText: 'you@example.com',
                prefixIcon: Icon(Icons.alternate_email, size: 20, color: AppColors.onSurfaceVariant),
              ),
              validator: (v) => (v == null || !v.contains('@')) ? 'Enter a valid email' : null,
            ),
            const SizedBox(height: 12),
            Row(
              children: [
                const Expanded(child: _FieldLabel('Password')),
                if (!_newLearner)
                  Padding(
                    padding: const EdgeInsets.only(bottom: 4),
                    child: InkWell(
                      onTap: _busy ? null : _openForgotPassword,
                      borderRadius: BorderRadius.circular(4),
                      child: Text('Forgot password?',
                          style: AppText.labelMd.copyWith(color: AppColors.primary, fontWeight: FontWeight.w600)),
                    ),
                  ),
              ],
            ),
            TextFormField(
              controller: _password,
              obscureText: _obscure,
              autofillHints: const [AutofillHints.password],
              onFieldSubmitted: (_) => _submit(),
              style: AppText.headlineSm.copyWith(fontWeight: FontWeight.w500),
              decoration: InputDecoration(
                hintText: _newLearner ? 'At least 12 characters' : 'Your password',
                prefixIcon: const Icon(Icons.lock_outline, size: 20, color: AppColors.onSurfaceVariant),
                suffixIcon: IconButton(
                  icon: Icon(_obscure ? Icons.visibility_off_outlined : Icons.visibility_outlined,
                      size: 20, color: AppColors.onSurfaceVariant),
                  onPressed: () => setState(() => _obscure = !_obscure),
                ),
              ),
              validator: (v) {
                if (v == null || v.isEmpty) return 'Enter your password';
                if (_newLearner && v.length < 12) return 'Use at least 12 characters';
                return null;
              },
            ),
            Padding(
              padding: const EdgeInsets.only(top: 6, left: 2),
              child: Text(
                _newLearner
                    ? 'Enrolled by our team already? Use the same email to set your password.'
                    : 'Signed in on 2 devices max. A third sign-in signs out the oldest.',
                style: AppText.caption.copyWith(color: AppColors.onSurfaceVariant, letterSpacing: 0.2),
              ),
            ),
            if (_error != null) ...[
              const SizedBox(height: 12),
              Container(
                padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 10),
                decoration: BoxDecoration(color: AppColors.errorContainer, borderRadius: BorderRadius.circular(10)),
                child: Row(
                  children: [
                    const Icon(Icons.error_outline, size: 18, color: AppColors.onErrorContainer),
                    const SizedBox(width: 8),
                    Expanded(
                      child: Text(_error!, style: AppText.bodySm.copyWith(color: AppColors.onErrorContainer)),
                    ),
                  ],
                ),
              ),
            ],
            const SizedBox(height: 16),
            PrimaryButton(
              label: _newLearner ? 'Create my account' : 'Sign in',
              icon: Icons.arrow_forward,
              busy: _busy,
              onPressed: _submit,
            ),
          ],
        ),
      ),
    );
  }
}

class _Hero extends StatelessWidget {
  const _Hero();

  @override
  Widget build(BuildContext context) => Column(
        children: [
          // Emblem with soft glow and trust check badge.
          SizedBox(
            width: 64,
            height: 64,
            child: Stack(
              clipBehavior: Clip.none,
              alignment: Alignment.center,
              children: [
                Container(
                  decoration: BoxDecoration(
                    color: AppColors.surfaceHigh,
                    borderRadius: BorderRadius.circular(16),
                    boxShadow: [
                      BoxShadow(color: AppColors.primary.withValues(alpha: 0.15), blurRadius: 10, spreadRadius: 2),
                    ],
                  ),
                ),
                Container(
                  width: 48,
                  height: 48,
                  decoration: BoxDecoration(
                    color: AppColors.primaryContainer,
                    borderRadius: BorderRadius.circular(12),
                    boxShadow: AppShadows.sm,
                  ),
                  child: const Icon(Icons.account_balance, color: Colors.white, size: 26),
                ),
                Positioned(
                  right: -4,
                  bottom: -4,
                  child: Container(
                    width: 20,
                    height: 20,
                    decoration: const BoxDecoration(color: AppColors.secondaryContainer, shape: BoxShape.circle),
                    child: const Icon(Icons.verified, size: 13, color: AppColors.onSecondaryContainer),
                  ),
                ),
              ],
            ),
          ),
          const SizedBox(height: 14),
          const Pill(
            label: 'CREDIT DOST LEARNING',
            background: AppColors.surfaceContainer,
            foreground: AppColors.onSurfaceVariant,
            dot: AppColors.secondary,
          ),
          const SizedBox(height: 10),
          const Text('Master Your Credit Score & Financial Freedom',
              textAlign: TextAlign.center, style: AppText.displayMobile),
          const SizedBox(height: 6),
          ConstrainedBox(
            constraints: const BoxConstraints(maxWidth: 320),
            child: Text(
              'Learn CIBIL, loan underwriting and credit card optimisation from working bankers.',
              textAlign: TextAlign.center,
              style: AppText.bodyMd.copyWith(color: AppColors.onSurfaceVariant),
            ),
          ),
        ],
      );
}

/// Pill tabs (bg-surface-container track, white selected tab with primary text).
class _ModeTabs extends StatelessWidget {
  const _ModeTabs({required this.newLearner, required this.onChanged});

  final bool newLearner;
  final ValueChanged<bool> onChanged;

  @override
  Widget build(BuildContext context) => Container(
        padding: const EdgeInsets.all(2),
        decoration: BoxDecoration(color: AppColors.surfaceContainer, borderRadius: BorderRadius.circular(10)),
        child: Row(
          children: [
            _tab('Sign In', !newLearner, () => onChanged(false)),
            _tab('New Learner', newLearner, () => onChanged(true)),
          ],
        ),
      );

  Widget _tab(String label, bool selected, VoidCallback onTap) => Expanded(
        child: GestureDetector(
          onTap: onTap,
          child: AnimatedContainer(
            duration: const Duration(milliseconds: 200),
            padding: const EdgeInsets.symmetric(vertical: 8),
            decoration: BoxDecoration(
              color: selected ? AppColors.surfaceLowest : Colors.transparent,
              borderRadius: BorderRadius.circular(8),
              boxShadow: selected ? AppShadows.sm : const [],
            ),
            child: Text(
              label,
              textAlign: TextAlign.center,
              style: selected
                  ? AppText.headlineSm.copyWith(color: AppColors.primary)
                  : AppText.bodyMd.copyWith(color: AppColors.onSurfaceVariant, fontWeight: FontWeight.w500),
            ),
          ),
        ),
      );
}

class _FieldLabel extends StatelessWidget {
  const _FieldLabel(this.text);

  final String text;

  @override
  Widget build(BuildContext context) => Padding(
        padding: const EdgeInsets.only(bottom: 4),
        child: Text(text, style: AppText.labelMd.copyWith(color: AppColors.onSurface)),
      );
}

/// Three feature tiles under the form (RBI frameworks, Indic audio, lifetime access).
class _TrustBadges extends StatelessWidget {
  const _TrustBadges();

  @override
  Widget build(BuildContext context) => const Row(
        children: [
          _Badge(icon: Icons.gavel, color: AppColors.primary, title: 'RBI Ombudsman', caption: 'Frameworks'),
          SizedBox(width: 6),
          _Badge(icon: Icons.translate, color: AppColors.secondary, title: 'Indic Audio', caption: 'Languages'),
          SizedBox(width: 6),
          _Badge(icon: Icons.all_inclusive, color: AppColors.tertiaryContainer, title: 'Lifetime', caption: 'Course access'),
        ],
      );
}

class _Badge extends StatelessWidget {
  const _Badge({required this.icon, required this.color, required this.title, required this.caption});

  final IconData icon;
  final Color color;
  final String title;
  final String caption;

  @override
  Widget build(BuildContext context) => Expanded(
        child: Container(
          padding: const EdgeInsets.symmetric(vertical: 10, horizontal: 6),
          decoration: BoxDecoration(
            color: AppColors.surfaceContainer,
            borderRadius: BorderRadius.circular(16),
            boxShadow: AppShadows.sm,
          ),
          child: Column(
            children: [
              Icon(icon, size: 20, color: color),
              const SizedBox(height: 4),
              Text(title, textAlign: TextAlign.center, style: AppText.labelSm.copyWith(color: AppColors.onSurface)),
              Text(caption,
                  textAlign: TextAlign.center,
                  style: AppText.caption.copyWith(color: AppColors.onSurfaceVariant, letterSpacing: 0.2)),
            ],
          ),
        ),
      );
}
