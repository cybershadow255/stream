let peer = null;
let currentCall = null;
let localStream = null;
let micStream = null;
let isMicMuted = false;

// DOM Elements
const myPeerIdEl = document.getElementById('my-peer-id');
const copyIdBtn = document.getElementById('copy-id-btn');
const remoteIdInput = document.getElementById('remote-id-input');
const connectBtn = document.getElementById('connect-btn');
const connectionStatus = document.getElementById('connection-status');

const resSelect = document.getElementById('res-select');
const fpsSelect = document.getElementById('fps-select');
const startShareBtn = document.getElementById('start-share-btn');
const stopShareBtn = document.getElementById('stop-share-btn');
const toggleMicBtn = document.getElementById('toggle-mic-btn');
const volumeRange = document.getElementById('volume-range');

const remoteVideo = document.getElementById('remote-video');
const videoPlaceholder = document.getElementById('video-placeholder');
const statsOverlay = document.getElementById('stats-overlay');
const statRes = document.getElementById('stat-res');
const statFps = document.getElementById('stat-fps');
const fullscreenBtn = document.getElementById('fullscreen-btn');

const sourceModal = document.getElementById('source-modal');
const sourceList = document.getElementById('source-list');
const closeModalBtn = document.getElementById('close-modal-btn');

// Resolution Map
const RESOLUTION_MAP = {
  '720': { width: 1280, height: 720 },
  '1080': { width: 1920, height: 1080 },
  '1440': { width: 2560, height: 1440 },
  '2160': { width: 3840, height: 2160 }
};

// Initialize PeerJS Connection
function initPeer() {
  const randomId = 'stream-' + Math.floor(100000 + Math.random() * 900000);
  peer = new Peer(randomId, {
    debug: 1,
    config: {
      iceServers: [
        { urls: 'stun:stun.l.google.com:19302' },
        { urls: 'stun:stun1.l.google.com:19302' },
        { urls: 'stun:stun2.l.google.com:19302' }
      ]
    }
  });

  peer.on('open', (id) => {
    myPeerIdEl.textContent = id;
  });

  peer.on('call', (call) => {
    currentCall = call;
    updateStatus(true, 'Partner verbunden');
    call.answer(localStream); // Answer call with local stream if available

    call.on('stream', (remoteStream) => {
      displayRemoteStream(remoteStream);
    });

    call.on('close', () => {
      resetVideoDisplay();
    });
  });

  peer.on('error', (err) => {
    console.error('PeerJS Error:', err);
    alert('Verbindungsfehler: ' + err.type);
  });
}

function updateStatus(connected, text) {
  connectionStatus.textContent = text;
  if (connected) {
    connectionStatus.className = 'status-badge connected';
  } else {
    connectionStatus.className = 'status-badge disconnected';
  }
}

// Copy Peer ID to Clipboard
copyIdBtn.addEventListener('click', () => {
  const idText = myPeerIdEl.textContent;
  if (idText && !idText.includes('Wird generiert')) {
    navigator.clipboard.writeText(idText);
    alert('Raum-Code in die Zwischenablage kopiert!');
  }
});

// Connect to Remote Peer
connectBtn.addEventListener('click', () => {
  const remoteId = remoteIdInput.value.trim();
  if (!remoteId) {
    alert('Bitte gib einen gültigen Code deines Freundes ein.');
    return;
  }

  updateStatus(true, 'Verbinde...');
  const call = peer.call(remoteId, localStream);
  currentCall = call;

  call.on('stream', (remoteStream) => {
    updateStatus(true, 'Verbunden');
    displayRemoteStream(remoteStream);
  });

  call.on('close', () => {
    resetVideoDisplay();
    updateStatus(false, 'Getrennt');
  });

  call.on('error', (err) => {
    alert('Fehler beim Verbinden: ' + err.message);
    updateStatus(false, 'Getrennt');
  });
});

// Display Remote Stream
function displayRemoteStream(stream) {
  remoteVideo.srcObject = stream;
  videoPlaceholder.classList.add('hidden');
  statsOverlay.classList.remove('hidden');

  statRes.textContent = `${resSelect.value}p`;
  statFps.textContent = `${fpsSelect.value} FPS`;
}

function resetVideoDisplay() {
  remoteVideo.srcObject = null;
  videoPlaceholder.classList.remove('hidden');
  statsOverlay.classList.add('hidden');
}

// Open Screen Picker Modal
startShareBtn.addEventListener('click', async () => {
  if (window.electronAPI) {
    const sources = await window.electronAPI.getSources();
    sourceList.innerHTML = '';

    sources.forEach(source => {
      const item = document.createElement('div');
      item.className = 'source-item';
      item.innerHTML = `
        <img src="${source.thumbnail}" alt="${source.name}">
        <span>${source.name}</span>
      `;
      item.addEventListener('click', () => {
        startScreenShare(source.id);
        sourceModal.classList.add('hidden');
      });
      sourceList.appendChild(item);
    });

    sourceModal.classList.remove('hidden');
  } else {
    // Fallback for browser WebRTC screen capture testing
    try {
      const stream = await navigator.mediaDevices.getDisplayMedia({
        video: { frameRate: parseInt(fpsSelect.value) },
        audio: true
      });
      handleStreamCaptured(stream);
    } catch (e) {
      console.error(e);
    }
  }
});

closeModalBtn.addEventListener('click', () => {
  sourceModal.classList.add('hidden');
});

// Start Screen Capture with specified Resolution & FPS
async function startScreenShare(sourceId) {
  const selectedRes = RESOLUTION_MAP[resSelect.value];
  const targetFps = parseInt(fpsSelect.value);

  try {
    const desktopStream = await navigator.mediaDevices.getUserMedia({
      audio: {
        mandatory: {
          chromeMediaSource: 'desktop'
        }
      },
      video: {
        mandatory: {
          chromeMediaSource: 'desktop',
          chromeMediaSourceId: sourceId,
          minWidth: selectedRes.width,
          maxWidth: selectedRes.width,
          minHeight: selectedRes.height,
          maxHeight: selectedRes.height,
          minFrameRate: targetFps,
          maxFrameRate: targetFps
        }
      }
    });

    // Capture Microphone Stream if active
    try {
      micStream = await navigator.mediaDevices.getUserMedia({ audio: true });
      micStream.getAudioTracks().forEach(track => {
        desktopStream.addTrack(track);
      });
    } catch (micErr) {
      console.warn('Mikrofon nicht gefunden oder Zugriff verweigert:', micErr);
    }

    handleStreamCaptured(desktopStream);
  } catch (err) {
    console.error('Fehler beim Starten des Screenshares:', err);
    alert('Bildschirmübertragung konnte nicht gestartet werden.');
  }
}

function handleStreamCaptured(stream) {
  localStream = stream;
  displayRemoteStream(stream);

  startShareBtn.classList.add('hidden');
  stopShareBtn.classList.remove('hidden');

  if (currentCall) {
    // Replace current stream in active call
    const peerConnection = currentCall.peerConnection;
    const senders = peerConnection.getSenders();

    stream.getTracks().forEach(track => {
      const sender = senders.find(s => s.track && s.track.kind === track.kind);
      if (sender) {
        sender.replaceTrack(track);
      } else {
        peerConnection.addTrack(track, stream);
      }
    });
  }

  stream.getVideoTracks()[0].onended = () => {
    stopScreenShare();
  };
}

// Stop Screen Share
stopShareBtn.addEventListener('click', stopScreenShare);

function stopScreenShare() {
  if (localStream) {
    localStream.getTracks().forEach(track => track.stop());
    localStream = null;
  }
  if (micStream) {
    micStream.getTracks().forEach(track => track.stop());
    micStream = null;
  }

  resetVideoDisplay();
  startShareBtn.classList.remove('hidden');
  stopShareBtn.classList.add('hidden');
}

// Toggle Microphone Mute
toggleMicBtn.addEventListener('click', () => {
  if (!localStream) return;
  const audioTracks = localStream.getAudioTracks();
  if (audioTracks.length > 0) {
    isMicMuted = !isMicMuted;
    audioTracks.forEach(track => {
      track.enabled = !isMicMuted;
    });
    toggleMicBtn.textContent = isMicMuted ? '🎤 Mikro: Stumm' : '🎤 Mikro: An';
    toggleMicBtn.className = isMicMuted ? 'btn danger-btn' : 'btn secondary-btn';
  }
});

// Control Stream Volume
volumeRange.addEventListener('input', (e) => {
  remoteVideo.volume = e.target.value / 100;
});

// Fullscreen Control
fullscreenBtn.addEventListener('click', () => {
  if (!document.fullscreenElement) {
    remoteVideo.requestFullscreen().catch(err => {
      alert(`Vollbild-Fehler: ${err.message}`);
    });
  } else {
    document.exitFullscreen();
  }
});

// Initialize on page load
initPeer();
