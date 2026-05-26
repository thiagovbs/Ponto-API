import 'dart:convert';
import 'package:flutter/foundation.dart';
import 'package:flutter/material.dart';
import 'package:camera/camera.dart';
import 'package:geolocator/geolocator.dart';
import 'services/api_service.dart';

late List<CameraDescription> _cameras;

Future<void> main() async {
  WidgetsFlutterBinding.ensureInitialized();
  // Inicializa as câmeras disponíveis no dispositivo (pula se for Web pura sem suporte)
  try {
    _cameras = await availableCameras();
  } catch (e) {
    _cameras = [];
  }
  runApp(const MyApp());
}

class MyApp extends StatelessWidget {
  const MyApp({super.key});

  @override
  Widget build(BuildContext context) {
    return MaterialApp(
      title: 'Totem Ponto',
      debugShowCheckedModeBanner: false,
      theme: ThemeData(primarySwatch: Colors.blue, useMaterial3: true),
      home: const RegistrarPontoScreen(),
    );
  }
}

class RegistrarPontoScreen extends StatefulWidget {
  const RegistrarPontoScreen({super.key});

  @override
  State<RegistrarPontoScreen> createState() => _RegistrarPontoScreenState();
}

class _RegistrarPontoScreenState extends State<RegistrarPontoScreen> {
  final TextEditingController _pesquisaController = TextEditingController();
  List<dynamic> _funcionarios = [];
  List<dynamic> _funcionariosFiltrados = [];
  
  Map<String, dynamic>? _funcionarioSelecionado;
  bool _carregando = false;
  bool _focoInput = false;

  // Variáveis de Câmera
  CameraController? _cameraController;
  bool _mostrarCamera = false;
  String? _fotoBase64;

  @override
  void initState() {
    super.initState();
    _buscarFuncionarios();
    _pedirPermissoesGps();
  }

  // 1. Busca os usuários no seu Backend Node.js
  Future<void> _buscarFuncionarios() async {
    try {
      final response = await ApiService.dio.get('/usuarios');
      setState(() {
        _funcionarios = response.data;
      });
    } catch (e) {
      debugPrint("Erro ao buscar funcionários: $e");
    }
  }

  Future<void> _pedirPermissoesGps() async {
    if (!kIsWeb) {
      LocationPermission permission = await Geolocator.checkPermission();
      if (permission == LocationPermission.denied) {
        await Geolocator.requestPermission();
      }
    }
  }

  // 2. Filtro de pesquisa digitada
  void _aoDigitarNome(String texto) {
    setState(() {
      _funcionarioSelecionado = null;
      if (texto.trim().isEmpty) {
        _funcionariosFiltrados = [];
      } else {
        _funcionariosFiltrados = _funcionarios.where((f) {
          final nome = f['nome'].toString().toLowerCase();
          return nome.contains(texto.toLowerCase());
        }).toList();
      }
    });
  }

  // 3. Inicializa a Câmera Frontal
  Future<void> _abrirCamera() async {
    if (_cameras.isEmpty) {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('Nenhuma câmera encontrada.')),
      );
      return;
    }

    // Filtra para tentar achar a câmera frontal
    final frontal = _cameras.firstWhere(
      (c) => c.lensDirection == CameraLensDirection.front,
      orElse: () => _cameras.first,
    );

    _cameraController = CameraController(frontal, ResolutionPreset.medium, enableAudio: false);
    await _cameraController!.initialize();
    
    setState(() {
      _mostrarCamera = true;
    });
  }

  // 4. Tira a foto e converte em Base64
  Future<void> _tirarFoto() async {
    if (_cameraController == null || !_cameraController!.value.isInitialized) return;

    try {
      setState(() => _carregando = true);
      final XFile foto = await _cameraController!.takePicture();
      final bytes = await foto.readAsBytes();
      
      setState(() {
        _fotoBase64 = 'data:image/jpeg;base64,${base64Encode(bytes)}';
        _mostrarCamera = false;
      });
    } catch (e) {
      _mostrarSnackbar('Erro ao capturar foto: $e');
    } finally {
      setState(() => _carregando = false);
    }
  }

  // 5. Captura GPS e envia para o backend público
  Future<void> _enviarPonto() async {
    if (_funcionarioSelecionado == null || _fotoBase64 == null) return;

    setState(() => _carregando = true);

    try {
      double latitude = 0;
      double longitude = 0;

      // Coleta geolocalização de forma nativa e unificada
      Position posicao = await Geolocator.getCurrentPosition(
        desiredAccuracy: LocationAccuracy.high,
      );
      latitude = posicao.latitude;
      longitude = posicao.longitude;

      final payload = {
        'usuarioId': _funcionarioSelecionado!['id'],
        'latitude': latitude,
        'longitude': longitude,
        'fotoBase64': _fotoBase64
      };

      await ApiService.dio.post('/batidas', data: payload);

      _mostrarDialogSucesso('Ponto registrado para ${_funcionarioSelecionado!['nome']}!');
      
      // Reseta o estado do Totem
      setState(() {
        _fotoBase64 = null;
        _funcionarioSelecionado = null;
        _pesquisaController.clear();
      });

    } catch (e) {
      _mostrarSnackbar('Erro ao salvar ponto no servidor.');
    } finally {
      setState(() => _carregando = false);
    }
  }

  void _mostrarSnackbar(String msg) {
    ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(msg)));
  }

  void _mostrarDialogSucesso(String msg) {
    showDialog(
      context: context,
      builder: (ctx) => AlertDialog(
        title: const Text('Sucesso! 📍'),
        content: Text(msg),
        actions: [
          TextButton(onPressed: () => Navigator.pop(ctx), child: const Text('OK'))
        ],
      ),
    );
  }

  @override
  void dispose() {
    _cameraController?.dispose();
    _pesquisaController.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    if (_mostrarCamera && _cameraController != null) {
      return Scaffold(
        backgroundColor: Colors.black,
        body: SafeArea(
          child: Column(
            children: [
              Expanded(child: CameraPreview(_cameraController!)),
              Container(
                padding: const EdgeInsets.all(24),
                child: IconButton(
                  icon: const Icon(Icons.camera_alt, size: 48, color: Colors.white),
                  onPressed: _carregando ? null : _tirarFoto,
                ),
              )
            ],
          ),
        ),
      );
    }

    return Scaffold(
      backgroundColor: const Color(0xFFF1F5F9),
      body: Center(
        child: SingleChildScrollView(
          padding: const EdgeInsets.all(24),
          child: Container(
            constraints: const BoxConstraints(maxWidth: 500),
            padding: const EdgeInsets.all(24),
            decoration: BoxDecoration(
              color: Colors.white,
              borderRadius: BorderRadius.circular(16),
              boxShadow: [BoxShadow(color: Colors.black.withOpacity(0.05), blurRadius: 10)],
            ),
            child: Column(
              mainAxisSize: MainAxisSize.min,
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                const Center(
                  child: Text('⏱️ Registro de Ponto - Totem',
                      style: TextStyle(fontSize: 22, fontWeight: FontWeight.bold, color: Color(0xFF1E3A8A))),
                ),
                const SizedBox(height: 24),
                const Text('Quem está registrando o ponto?',
                    style: TextStyle(fontSize: 15, fontWeight: FontWeight.w600, color: Color(0xFF334155))),
                const SizedBox(height: 8),
                
                // INPUT DE PESQUISA
                TextField(
                  controller: _pesquisaController,
                  onChanged: _aoDigitarNome,
                  onTap: () => setState(() => _focoInput = true),
                  decoration: InputDecoration(
                    hintText: 'Digite seu nome para buscar...',
                    filled: true,
                    fillColor: const Color(0xFFF8FAFC),
                    border: OutlineInputBorder(borderRadius: BorderRadius.circular(8)),
                  ),
                ),

                // DROPBOX PESQUISÁVEL (LISTA SUSPENSA)
                if (_focoInput && _funcionariosFiltrados.isNotEmpty)
                  Container(
                    margin: const EdgeInsets.only(top: 4),
                    decoration: BoxDecoration(
                      border: Border.all(color: Colors.grey.shade300),
                      borderRadius: BorderRadius.circular(8),
                    ),
                    constraints: const BoxConstraints(maxHeight: 150),
                    child: ListView.builder(
                      shrinkWrap: true,
                      itemCount: _funcionariosFiltrados.length,
                      itemBuilder: (context, index) {
                        final func = _funcionariosFiltrados[index];
                        return ListTile(
                          title: Text(func['nome']),
                          onTap: () {
                            setState(() {
                              _funcionarioSelecionado = func;
                              _pesquisaController.text = func['nome'];
                              _funcionariosFiltrados = [];
                              _focoInput = false;
                            });
                          },
                        );
                      },
                    ),
                  ),

                // ÁREA DE AÇÃO APÓS SELECIONAR FUNCIONÁRIO
                if (_funcionarioSelecionado != null) ...[
                  const SizedBox(height: 24),
                  if (_fotoBase64 != null) ...[
                    Center(
                      child: ClipRRect(
                        borderRadius: BorderRadius.circular(12),
                        child: Image.memory(
                          base64Decode(_fotoBase64!.split(',')[1]),
                          width: 160,
                          height: 210,
                          fit: BoxFit.cover,
                        ),
                      ),
                    ),
                    const SizedBox(height: 12),
                    TextButton.icon(
                      onPressed: _abrirCamera,
                      icon: const Icon(Icons.refresh),
                      label: const Text('Tirar Outra Foto'),
                    ),
                    const SizedBox(height: 12),
                    SizedBox(
                      width: double.infinity,
                      height: 50,
                      child: ElevatedButton(
                        style: ElevatedButton.styleFrom(backgroundColor: Colors.green),
                        onPressed: _carregando ? null : _enviarPonto,
                        child: _carregando 
                          ? const CircularProgressIndicator(color: Colors.white)
                          : const Text('Confirmar Batida 📍', style: TextStyle(color: Colors.white, fontSize: 16, fontWeight: FontWeight.bold)),
                      ),
                    )
                  ] else ...[
                    Text('Olá, ${_funcionarioSelecionado!['nome']}! Tire uma foto para confirmar sua identidade.',
                        textAlign: TextAlign.center, style: const TextStyle(color: Color(0xFF64748B))),
                    const SizedBox(height: 16),
                    SizedBox(
                      width: double.infinity,
                      height: 50,
                      child: ElevatedButton.icon(
                        style: ElevatedButton.styleFrom(backgroundColor: Colors.blue),
                        onPressed: _abrirCamera,
                        icon: const Icon(Icons.camera_alt, color: Colors.white),
                        label: const Text('Abrir Câmera', style: TextStyle(color: Colors.white, fontSize: 16)),
                      ),
                    )
                  ]
                ]
              ],
            ),
          ),
        ),
      ),
    );
  }
}