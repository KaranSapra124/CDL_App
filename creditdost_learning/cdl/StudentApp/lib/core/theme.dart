import 'package:flutter/material.dart';
import 'package:google_fonts/google_fonts.dart';

/// Colour tokens from the Stitch design system (credit_dost_learning/DESIGN.md), named as in the
/// Tailwind config of the exported screens (bg-surface-container-low, text-on-surface-variant, ...).
class AppColors {
  static const surface = Color(0xFFFAF8FF);
  static const surfaceLowest = Color(0xFFFFFFFF);
  static const surfaceLow = Color(0xFFF2F3FF);
  static const surfaceContainer = Color(0xFFEAEDFF);
  static const surfaceHigh = Color(0xFFE2E7FF);
  static const surfaceHighest = Color(0xFFDAE2FD);
  static const onSurface = Color(0xFF131B2E);
  static const onSurfaceVariant = Color(0xFF464555);
  static const outline = Color(0xFF777587);
  static const outlineVariant = Color(0xFFC7C4D8);
  static const inverseSurface = Color(0xFF283044);

  static const primary = Color(0xFF3525CD);
  static const primaryContainer = Color(0xFF4F46E5);
  static const onPrimaryContainer = Color(0xFFDAD7FF);
  static const primaryFixed = Color(0xFFE2DFFF);
  static const surfaceTint = Color(0xFF4D44E3);

  static const secondary = Color(0xFF006C49);
  static const secondaryContainer = Color(0xFF6CF8BB);
  static const onSecondaryContainer = Color(0xFF00714D);
  static const secondaryFixed = Color(0xFF6FFBBE);
  static const onSecondaryFixedVariant = Color(0xFF005236);

  static const tertiary = Color(0xFF684000);
  static const tertiaryContainer = Color(0xFF885500);
  static const tertiaryFixed = Color(0xFFFFDDB8);
  static const onTertiaryFixed = Color(0xFF2A1700);

  static const error = Color(0xFFBA1A1A);
  static const errorContainer = Color(0xFFFFDAD6);
  static const onErrorContainer = Color(0xFF93000A);
}

/// Type scale from DESIGN.md. Colour is inherited unless a screen sets one.
class AppText {
  static const displayMobile =
      TextStyle(fontSize: 26, height: 34 / 26, fontWeight: FontWeight.w700, letterSpacing: -0.4);
  static const headlineLg =
      TextStyle(fontSize: 24, height: 32 / 24, fontWeight: FontWeight.w600, letterSpacing: -0.36);
  static const headlineMd =
      TextStyle(fontSize: 20, height: 28 / 20, fontWeight: FontWeight.w600, letterSpacing: -0.2);
  static const headlineSm =
      TextStyle(fontSize: 16, height: 24 / 16, fontWeight: FontWeight.w600, letterSpacing: -0.08);
  static const bodyLg = TextStyle(fontSize: 15, height: 24 / 15, fontWeight: FontWeight.w400);
  static const bodyMd = TextStyle(fontSize: 14, height: 20 / 14, fontWeight: FontWeight.w400);
  static const bodySm = TextStyle(fontSize: 13, height: 18 / 13, fontWeight: FontWeight.w400);
  static const labelMd = TextStyle(fontSize: 12, height: 16 / 12, fontWeight: FontWeight.w500);
  static const labelSm =
      TextStyle(fontSize: 11, height: 14 / 11, fontWeight: FontWeight.w600, letterSpacing: 0.44);
  static const caption =
      TextStyle(fontSize: 10, height: 12 / 10, fontWeight: FontWeight.w500, letterSpacing: 0.6);
}

/// Elevation from DESIGN.md: hairline micro-elevation and a floating level.
class AppShadows {
  static const sm = [BoxShadow(color: Color(0x0D0F172A), blurRadius: 2, offset: Offset(0, 1))];
  static const md = [
    BoxShadow(color: Color(0x140F172A), blurRadius: 6, offset: Offset(0, 4), spreadRadius: -1),
    BoxShadow(color: Color(0x0A0F172A), blurRadius: 4, offset: Offset(0, 2), spreadRadius: -2),
  ];
  static const xl = [
    BoxShadow(color: Color(0x2E3525CD), blurRadius: 25, offset: Offset(0, 20), spreadRadius: -5),
  ];
}

ThemeData buildAppTheme() {
  final base = ThemeData(
    useMaterial3: true,
    colorScheme: ColorScheme.fromSeed(
      seedColor: AppColors.primaryContainer,
      primary: AppColors.primaryContainer,
      surface: AppColors.surface,
      error: AppColors.error,
    ),
    scaffoldBackgroundColor: AppColors.surface,
  );
  return base.copyWith(
    textTheme: GoogleFonts.interTextTheme(base.textTheme).apply(
      bodyColor: AppColors.onSurface,
      displayColor: AppColors.onSurface,
    ),
    appBarTheme: const AppBarTheme(
      backgroundColor: AppColors.surface,
      foregroundColor: AppColors.onSurface,
      elevation: 0,
      scrolledUnderElevation: 0,
      centerTitle: false,
    ),
    inputDecorationTheme: InputDecorationTheme(
      filled: true,
      fillColor: AppColors.surfaceLow,
      hintStyle: AppText.bodyMd.copyWith(color: AppColors.outlineVariant),
      contentPadding: const EdgeInsets.symmetric(horizontal: 14, vertical: 14),
      border: OutlineInputBorder(borderRadius: BorderRadius.circular(12), borderSide: BorderSide.none),
      enabledBorder: OutlineInputBorder(borderRadius: BorderRadius.circular(12), borderSide: BorderSide.none),
      focusedBorder: OutlineInputBorder(
        borderRadius: BorderRadius.circular(12),
        borderSide: const BorderSide(color: AppColors.primaryContainer, width: 1.5),
      ),
      errorBorder: OutlineInputBorder(
        borderRadius: BorderRadius.circular(12),
        borderSide: const BorderSide(color: AppColors.error),
      ),
      focusedErrorBorder: OutlineInputBorder(
        borderRadius: BorderRadius.circular(12),
        borderSide: const BorderSide(color: AppColors.error, width: 1.5),
      ),
    ),
    snackBarTheme: const SnackBarThemeData(
      behavior: SnackBarBehavior.floating,
      backgroundColor: AppColors.inverseSurface,
    ),
  );
}
