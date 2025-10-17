document.addEventListener('DOMContentLoaded', () => {
  const video = document.getElementById('camera');
  const canvas = document.getElementById('canvas');
  const startBtn = document.getElementById('start-btn');
  const stopBtn = document.getElementById('stop-btn');
  const statusEl = document.getElementById('status');
  const rtspUrlEl = document.getElementById('rtsp-url');
  
  let stream = null;
  let isStreaming = false;
  let frameInterval = null;
  
  // Conecta ao servidor via Socket.io
  const socket = io();
  
  // Exibe a URL RTSP
  const rtspUrl = `rtsp://${window.location.hostname}:8554/live`;
  rtspUrlEl.textContent = `URL RTSP: ${rtspUrl}`;
  
  // Função para iniciar a câmera
  async function startCamera() {
    try {
      // Solicita acesso à câmera frontal
      stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'user' },
        audio: false
      });
      
      // Define o stream no elemento de vídeo
      video.srcObject = stream;
      
      statusEl.textContent = 'Câmera iniciada. Clique em "Iniciar Streaming" para transmitir.';
      startBtn.disabled = false;
      
    } catch (error) {
      console.error('Erro ao acessar a câmera:', error);
      statusEl.textContent = `Erro ao acessar a câmera: ${error.message}`;
    }
  }
  
  // Função para iniciar o streaming
  function startStreaming() {
    if (!stream) return;
    
    // Configura o canvas para capturar frames
    const ctx = canvas.getContext('2d');
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    
    isStreaming = true;
    startBtn.disabled = true;
    stopBtn.disabled = false;
    statusEl.textContent = 'Streaming iniciado! O stream está disponível via RTSP.';
    
    // Captura frames a cada 33ms (aproximadamente 30fps)
    frameInterval = setInterval(() => {
      // Desenha o frame atual no canvas
      ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
      
      // Converte para JPEG e envia para o servidor
      const frameData = canvas.toDataURL('image/jpeg', 0.8);
      socket.emit('webcam-frame', frameData);
    }, 33);
  }
  
  // Função para parar o streaming
  function stopStreaming() {
    clearInterval(frameInterval);
    isStreaming = false;
    startBtn.disabled = false;
    stopBtn.disabled = true;
    statusEl.textContent = 'Streaming parado.';
  }
  
  // Manipuladores de eventos
  startBtn.addEventListener('click', startStreaming);
  stopBtn.addEventListener('click', stopStreaming);
  
  // Inicia a câmera ao carregar a página
  startCamera();
  
  // Limpa recursos ao fechar a página
  window.addEventListener('beforeunload', () => {
    if (isStreaming) {
      stopStreaming();
    }
    if (stream) {
      stream.getTracks().forEach(track => track.stop());
    }
  });
});
