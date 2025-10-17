const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const path = require('path');
const fs = require('fs');
const { spawn } = require('child_process');
const Stream = require('node-rtsp-stream');

const app = express();
const server = http.createServer(app);
const io = socketIo(server);

// Configuração de porta
const PORT = process.env.PORT || 3000;
const RTSP_PORT = 8554;

// Pasta pública para arquivos estáticos
app.use(express.static(path.join(__dirname, 'public')));

// Diretório para armazenar temporariamente os frames
const TEMP_DIR = path.join(__dirname, 'temp');
if (!fs.existsSync(TEMP_DIR)) {
  fs.mkdirSync(TEMP_DIR);
}

// Caminhos dos arquivos temporários
const videoPath = path.join(TEMP_DIR, 'stream.mp4');
const streamUrl = `rtsp://localhost:${RTSP_PORT}/live`;
let ffmpegProcess = null;
let rtspStream = null;

// Inicia o processo FFmpeg para criar um stream de vídeo a partir dos frames
function startFFmpeg() {
  // Certifica-se de que o processo anterior foi encerrado
  if (ffmpegProcess) {
    ffmpegProcess.kill('SIGINT');
  }

  // Cria um arquivo de pipe para o FFmpeg ler os frames
  const inputPath = path.join(TEMP_DIR, 'pipe.jpeg');
  if (!fs.existsSync(inputPath)) {
    try {
      spawn('mkfifo', [inputPath]);
    } catch (err) {
      console.log('Erro ao criar pipe, usando arquivo normal:', err);
      // Em sistemas que não suportam mkfifo, usamos um arquivo normal
      fs.writeFileSync(inputPath, '');
    }
  }

  // Inicia o FFmpeg para converter frames JPEG em MP4
  ffmpegProcess = spawn('ffmpeg', [
    '-y',
    '-f', 'image2pipe',
    '-framerate', '30',
    '-i', inputPath,
    '-c:v', 'libx264',
    '-preset', 'ultrafast',
    '-tune', 'zerolatency',
    '-f', 'rtsp',
    '-rtsp_transport', 'tcp',
    streamUrl
  ]);

  // Lidar com saída do processo FFmpeg
  ffmpegProcess.stderr.on('data', (data) => {
    // FFmpeg envia informações para stderr, não é necessariamente um erro
    console.log('FFmpeg:', data.toString());
  });

  ffmpegProcess.on('close', (code) => {
    console.log(`FFmpeg encerrado com código: ${code}`);
  });

  return inputPath;
}

// Socket.io para comunicação em tempo real
let frameWritePath = '';
io.on('connection', (socket) => {
  console.log('Cliente conectado');

  // Inicia o streaming RTSP se ainda não estiver iniciado
  if (!frameWritePath) {
    frameWritePath = startFFmpeg();
    
    // Inicia o servidor RTSP
    if (!rtspStream) {
      rtspStream = new Stream({
        name: 'live',
        streamUrl: streamUrl,
        wsPort: 9999,
        ffmpegOptions: { // opções para o cliente rtsp-stream
          '-stats': '',
          '-r': 30
        }
      });
    }
  }

  // Recebe frames da webcam do cliente
  socket.on('webcam-frame', (frameData) => {
    try {
      // Remove o prefixo do Base64
      const base64Data = frameData.replace(/^data:image\/jpeg;base64,/, '');
      
      // Salva a imagem temporariamente (sobrescrevendo o arquivo anterior)
      fs.writeFileSync(frameWritePath, Buffer.from(base64Data, 'base64'));
    } catch (err) {
      console.error('Erro ao salvar frame:', err);
    }
  });

  socket.on('disconnect', () => {
    console.log('Cliente desconectado');
  });
});

// Inicia o servidor HTTP
server.listen(PORT, () => {
  console.log(`Servidor HTTP rodando em http://localhost:${PORT}`);
  console.log(`Stream RTSP disponível em: ${streamUrl}`);
});

// Manipulação de encerramento limpo
process.on('SIGINT', () => {
  console.log('Encerrando servidores...');
  
  if (ffmpegProcess) {
    ffmpegProcess.kill('SIGINT');
  }
  
  if (rtspStream) {
    rtspStream.stop();
  }
  
  server.close();
  process.exit();
});
