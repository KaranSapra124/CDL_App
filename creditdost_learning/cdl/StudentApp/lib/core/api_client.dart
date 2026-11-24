import 'dart:io' show Platform;

import 'package:cookie_jar/cookie_jar.dart';
import 'package:flutter/foundation.dart' show kIsWeb;

import 'package:dio/dio.dart';
import 'package:dio_cookie_manager/dio_cookie_manager.dart';
import 'package:path_provider/path_provider.dart';

import 'web_credentials_stub.dart' if (dart.library.js_interop) 'web_credentials_web.dart';

/// Base URL of the Go API. Override per build with --dart-define=API_BASE_URL=...
/// 10.0.2.2 is the Android emulator's alias for the host machine (port 8080 from API_ADDR).
const apiBaseUrl = String.fromEnvironment(
  'API_BASE_URL',
  defaultValue: 'http://10.0.2.2:8080',
);

class ApiException implements Exception {
  ApiException(this.message, {this.statusCode});

  final String message;
  final int? statusCode;

  bool get isUnauthorized => statusCode == 401;

  @override
  String toString() => message;
}

/// Thin wrapper over Dio. The student session is an HTTP-only cookie (`cdl_student`), so the
/// cookie jar is persisted to disk and replayed on every request, including media requests.
class ApiClient {
  ApiClient._(this._dio, this._jar);

  final Dio _dio;
  final CookieJar _jar;

  static Future<ApiClient> create({String baseUrl = apiBaseUrl}) async {
    // path_provider has no web implementation, and the browser keeps its own cookies,
    // so the web build uses an in-memory jar and skips the cookie interceptor.
    final jar = kIsWeb
        ? CookieJar()
        : PersistCookieJar(
            storage: FileStorage(
              '${(await getApplicationSupportDirectory()).path}${Platform.pathSeparator}cookies',
            ),
          );
    final dio = Dio(
      BaseOptions(
        baseUrl: baseUrl,
        connectTimeout: const Duration(seconds: 15),
        receiveTimeout: const Duration(seconds: 30),
        headers: {'Accept': 'application/json'},
      ),
    );
    if (kIsWeb) {
      configureWebCredentials(dio);
    } else {
      dio.interceptors.add(CookieManager(jar));
    }
    return ApiClient._(dio, jar);
  }

  /// Sends a request and returns the decoded JSON body. Throws [ApiException] with the server's
  /// `{"error": "..."}` message when the status is not 2xx.
  Future<dynamic> send(String method, String path, {Object? body}) async {
    try {
      final res = await _dio.request<dynamic>(
        path,
        data: body,
        options: Options(
          method: method,
          contentType: 'application/json',
          validateStatus: (_) => true,
        ),
      );
      final status = res.statusCode ?? 0;
      final data = res.data;
      if (status >= 200 && status < 300) return data;
      final message = data is Map && data['error'] is String
          ? data['error'] as String
          : 'Something went wrong. Please try again.';
      throw ApiException(message, statusCode: status);
    } on DioException {
      throw ApiException('Cannot reach the server. Check your connection and try again.');
    }
  }

  /// Uploads one file as multipart form data and returns the decoded JSON body.
  Future<dynamic> sendFile(String path,
      {required String field, required List<int> bytes, required String filename}) async {
    try {
      final res = await _dio.post<dynamic>(
        path,
        data: FormData.fromMap({field: MultipartFile.fromBytes(bytes, filename: filename)}),
        options: Options(validateStatus: (_) => true),
      );
      final status = res.statusCode ?? 0;
      final data = res.data;
      if (status >= 200 && status < 300) return data;
      final message = data is Map && data['error'] is String
          ? data['error'] as String
          : 'Upload failed. Please try again.';
      throw ApiException(message, statusCode: status);
    } on DioException {
      throw ApiException('Cannot reach the server. Check your connection and try again.');
    }
  }

  /// Downloads raw bytes (e.g. the profile photo). Returns null on 404.
  Future<List<int>?> getBytes(String path) async {
    try {
      final res = await _dio.get<List<int>>(
        path,
        options: Options(responseType: ResponseType.bytes, validateStatus: (_) => true),
      );
      final status = res.statusCode ?? 0;
      if (status == 404) return null;
      if (status >= 200 && status < 300) return res.data;
      throw ApiException('Could not load the image.', statusCode: status);
    } on DioException {
      throw ApiException('Cannot reach the server. Check your connection and try again.');
    }
  }

  /// Cookie header for media URLs (the video player does not share Dio's cookie jar).
  Future<String> cookieHeaderFor(Uri uri) async {
    final cookies = await _jar.loadForRequest(uri);
    return cookies.map((c) => '${c.name}=${c.value}').join('; ');
  }

  Uri resolve(String path) => Uri.parse(_dio.options.baseUrl).resolve(path);
}
