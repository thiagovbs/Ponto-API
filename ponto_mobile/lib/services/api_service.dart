import 'package:dio/dio.dart';

class ApiService {
  // Altere para o IP da sua máquina se for testar no celular físico
  static const String _baseUrl = 'http://192.168.40.128:3003/api';

  static final Dio dio = Dio(
    BaseOptions(
      baseUrl: _baseUrl,
      connectTimeout: const Duration(seconds: 10),
      receiveTimeout: const Duration(seconds: 10),
      headers: {
        'Content-Type': 'application/json',
      },
    ),
  );
}