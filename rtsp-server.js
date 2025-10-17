const { createServer } = require('node-rtsp-server');
const fs = require('fs');
const path = require('path');
const ffmpeg = require('fluent-ffmpeg');

let rtspServer;
let streamProcess;
let currentFramePath;

// Função para iniciar o servidor RTSP
function start(port) {
  rtspServer = createServer({
    serverPort: port,
    rtspPort: port,
    serverName: 'Camera-RTSP-Server'
  });

  // Configura o servidor RTSP
  rtspServer.addRoute('/live/camera', (req, res) => {
    // Configura a resposta RTSP
    res.writeHead(200, {
      'Content-Type': 'application/sdp',
      'Content-Length': Buffer.byteLength(generateSDP())
    });
    
    res.end(generateSDP());
    
    // Inicia o processo de streaming
    startStreaming(res);
  });

  rtspServer.start();
}

// Gera um SDP (Session Description Protocol) para o stream
function generateSDP() {
  return `v=0
o=- 1 1 IN IP4 127.0.0.1
s=Camera Stream
c=IN IP4 0.0.0.0
t=0 0
m=video 0 RTP/AVP 96
a=rtpmap:96 H264/90000
a=fmtp:96 profile-level-id=42e01f
a=control:track1`;
}

// Inicia o processo de streaming
function startStreaming(rtspResponse) {
  if (streamProcess) {
    streamProcess.kill();
  }
  
  // Usa FFmpeg para converter os frames JPEG em um stream H264
  streamProcess = ffmpeg()
    .input(path.join(__dirname, 'temp', 'current-frame.jpg'))
    .inputFPS(30)
    .outputFormat('h264')
    .videoCodec('libx264')
    .videoBitrate('1000k')
    .size('640x480')
    .outputOptions([
      '-preset ultrafast',
      '-tune zerolatency',
      '-f rtp',
      '-sdp_file stream.sdp'
    ])
    .output('rtp://127.0.0.1:' + rtspServer.rtspPort + '?pkt_size=1316')
    .on('error', (err) => {
      console.error('Erro no FFmpeg:', err);
    });
  
  streamProcess.run();
}

// Atualiza o frame atual
function updateFrame(filePath) {
  currentFramePath = filePath;
  
  // Se o processo de streaming já estiver em execução, o FFmpeg
  // automaticamente lerá o arquivo atualizado na próxima iteração
}

// Para o servidor RTSP
function stop() {
  if (rtspServer) {
    rtspServer.stop();
  }
  
  if (streamProcess) {
    streamProcess.kill();
  }
}

module.exports = {
  start,
  stop,
  updateFrame
};
