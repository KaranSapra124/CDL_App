import 'package:dio/browser.dart';
import 'package:dio/dio.dart';

/// Web: the page (:5050) and API (:8080) are cross-origin, so the browser only stores and sends
/// the session cookie when credentials are included. The API allows credentials for this origin.
void configureWebCredentials(Dio dio) {
  dio.httpClientAdapter = BrowserHttpClientAdapter(withCredentials: true);
}
