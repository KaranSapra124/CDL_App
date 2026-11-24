import 'package:flutter/material.dart';

import '../core/api_client.dart';
import '../core/portal_repository.dart';
import '../core/theme.dart';
import 'widgets.dart';

/// Forgot-password form: email, new password, confirm. Form only for now: no email is sent,
/// so this does not yet prove the student owns the address.
class ForgotPasswordScreen extends StatefulWidget {
  const ForgotPasswordScreen({super.key, required this.repo, this.initialEmail = ''});

  final PortalRepository repo;
  final String initialEmail;

  @override
  State<ForgotPasswordScreen> createState() => _ForgotPasswordScreenState();
}

class _ForgotPasswordScreenState extends State<ForgotPasswordScreen> {
  final _formKey = GlobalKey<FormState>();
  late final _email = TextEditingController(text: widget.initialEmail);
  final _password = TextEditingController();
  final _confirm = TextEditingController();
  bool _busy = false;
  bool _obscure = true;
  String? _error;

  @override
  void dispose() {
    _email.dispose();
    _password.dispose();
    _confirm.dispose();
    super.dispose();
  }

  Future<void> _submit() async {
    if (!(_formKey.currentState?.validate() ?? false)) return;
    setState(() {
      _busy = true;
      _error = null;
    });
    try {
      await widget.repo.resetPassword(email: _email.text.trim(), password: _password.text);
      if (!mounted) return;
      // Back to sign in with the email filled in; the login screen shows the confirmation.
      Navigator.of(context).pop(_email.text.trim());
    } on ApiException catch (e) {
      if (mounted) setState(() => _error = e.message);
    } catch (e) {
      if (mounted) setState(() => _error = 'Could not reset password: $e');
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  InputDecoration _decoration(String hint, IconData icon, {bool toggle = false}) => InputDecoration(
        hintText: hint,
        prefixIcon: Icon(icon, size: 20, color: AppColors.onSurfaceVariant),
        suffixIcon: toggle
            ? IconButton(
                icon: Icon(_obscure ? Icons.visibility_off_outlined : Icons.visibility_outlined,
                    size: 20, color: AppColors.onSurfaceVariant),
                onPressed: () => setState(() => _obscure = !_obscure),
              )
            : null,
      );

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: const CdBackHeader(title: 'Reset Password'),
      body: SafeArea(
        child: Center(
          child: SingleChildScrollView(
            padding: const EdgeInsets.fromLTRB(16, 16, 16, 32),
            child: ConstrainedBox(
              constraints: const BoxConstraints(maxWidth: 440),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.stretch,
                children: [
                  const Center(child: IconBox(icon: Icons.lock_reset, size: 56, iconSize: 30, radius: 16)),
                  const SizedBox(height: 14),
                  const Text('Set a new password', textAlign: TextAlign.center, style: AppText.headlineLg),
                  const SizedBox(height: 4),
                  Text(
                    'Enter your account email and choose a new password. You will be signed out on other devices.',
                    textAlign: TextAlign.center,
                    style: AppText.bodyMd.copyWith(color: AppColors.onSurfaceVariant),
                  ),
                  const SizedBox(height: 20),
                  Container(
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
                          const _Label('Email address'),
                          TextFormField(
                            controller: _email,
                            keyboardType: TextInputType.emailAddress,
                            style: AppText.headlineSm.copyWith(fontWeight: FontWeight.w500),
                            decoration: _decoration('you@example.com', Icons.alternate_email),
                            validator: (v) => (v == null || !v.contains('@')) ? 'Enter a valid email' : null,
                          ),
                          const SizedBox(height: 12),
                          const _Label('New password'),
                          TextFormField(
                            controller: _password,
                            obscureText: _obscure,
                            style: AppText.headlineSm.copyWith(fontWeight: FontWeight.w500),
                            decoration: _decoration('At least 12 characters', Icons.lock_outline, toggle: true),
                            validator: (v) => (v == null || v.length < 12) ? 'Use at least 12 characters' : null,
                          ),
                          const SizedBox(height: 12),
                          const _Label('Confirm new password'),
                          TextFormField(
                            controller: _confirm,
                            obscureText: _obscure,
                            onFieldSubmitted: (_) => _submit(),
                            style: AppText.headlineSm.copyWith(fontWeight: FontWeight.w500),
                            decoration: _decoration('Repeat the new password', Icons.lock_outline),
                            validator: (v) => v != _password.text ? 'Passwords do not match' : null,
                          ),
                          if (_error != null) ...[
                            const SizedBox(height: 12),
                            Container(
                              padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 10),
                              decoration: BoxDecoration(
                                  color: AppColors.errorContainer, borderRadius: BorderRadius.circular(10)),
                              child: Text(_error!, style: AppText.bodySm.copyWith(color: AppColors.onErrorContainer)),
                            ),
                          ],
                          const SizedBox(height: 16),
                          PrimaryButton(label: 'Reset password', icon: Icons.arrow_forward, busy: _busy, onPressed: _submit),
                        ],
                      ),
                    ),
                  ),
                ],
              ),
            ),
          ),
        ),
      ),
    );
  }
}

class _Label extends StatelessWidget {
  const _Label(this.text);

  final String text;

  @override
  Widget build(BuildContext context) => Padding(
        padding: const EdgeInsets.only(bottom: 4),
        child: Text(text, style: AppText.labelMd.copyWith(color: AppColors.onSurface)),
      );
}
