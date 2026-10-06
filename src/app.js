let peer = null;
let dataConn = null;
let currentCall = null;
let localStream = null;
let micStream = null;
let isMicMuted = false;
let connectedPeerId = null;

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

// ICE / TURN / STUN Configuration
const ICE_SERVERS = [
  { urls: 'stun:stun.l.google.com:19302' },
  { urls: 'stun:stun1.l.google.com:19302' },
  { urls: 'stun:stun2.l.google.com:19302' },
  { urls: 'stun:global.stun.twilio.com:3478' }
];

// Initialize PeerJS Connection
function initPeer() {
  const randomId = 'stream-' + Math.floor(100000 + Math.random() * 900000);
  peer = new Peer(randomId, {
    debug: 1,
    config: {
      iceServers: ICE_SERVERS
    }
  });

  peer.on('open', (id) => {
    myPeerIdEl.textContent = id;
  });

  // Handle incoming Data Connection (Room Pairing)
  peer.on('connection', (conn) => {
    setupDataConnection(conn);
  });

  // Handle incoming Media Call (Screen Share / Voice)
  peer.on('call', async (call) => {
    currentCall = call;

    // Answer with micStream if active
    if (!micStream) {
      try {
        micStream = await navigator.mediaDevices.getUserMedia({ audio: true });
      } catch (err) {
        console.warn('Microphone unavailable:', err);
      }
    }

    call.answer(micStream || createEmptyStream());

    call.on('stream', (remoteStream) => {
      displayRemoteStream(remoteStream);
    });

    call.on('close', () => {
      resetVideoDisplay();
    });

    call.on('error', (err) => {
      console.error('Call Error:', err);
    });
  });

  peer.on('error', (err) => {
    console.error('PeerJS Error:', err);
    updateStatus(false, 'Fehler: ' + err.type);
  });
}

// Setup Data Connection for status and signaling
function setupDataConnection(conn) {
  dataConn = conn;
  connectedPeerId = conn.peer;

  conn.on('open', () => {
    updateStatus(true, 'Verbunden mit ' + conn.peer);
  });

  conn.on('data', (data) => {
    if (data.type === 'START_SHARE') {
      statRes.textContent = `${data.res}p`;
      statFps.textContent = `${data.fps} FPS`;
    } else if (data.type === 'STOP_SHARE') {
      resetVideoDisplay();
    }
  });

  conn.on('close', () => {
    updateStatus(false, 'Getrennt');
    connectedPeerId = null;
    dataConn = null;
    resetVideoDisplay();
  });

  conn.on('error', (err) => {
    console.error('Data Connection Error:', err);
    updateStatus(false, 'Getrennt');
  });
}

// Create empty audio stream if answering without mic
function createEmptyStream() {
  const ctx = new (window.AudioContext || window.webkitAudioContext)();
  const osc = ctx.createOscillator();
  const dst = osc.connect(ctx.createMediaStreamDestination());
  osc.start();
  const track = dst.stream.getAudioTracks()[0];
  track.enabled = false;
  return new MediaStream([track]);
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
  const conn = peer.connect(remoteId);
  setupDataConnection(conn);
});

// Display Remote Stream in Video Element (Muted if local stream)
function displayRemoteStream(stream, isLocal = false) {
  remoteVideo.srcObject = stream;
  remoteVideo.muted = isLocal; // Mute local preview to prevent audio feedback loop
  videoPlaceholder.classList.add('hidden');
  statsOverlay.classList.remove('hidden');

  statRes.textContent = `${resSelect.value}p`;
  statFps.textContent = `${fpsSelect.value} FPS`;

  remoteVideo.play().catch((err) => {
    console.warn('Autoplay handled:', err);
    remoteVideo.muted = true;
    remoteVideo.play().catch((e) => console.error('Play error:', e));
  });
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
    // Fallback for standard browser getDisplayMedia
    try {
      const stream = await navigator.mediaDevices.getDisplayMedia({
        video: { frameRate: parseInt(fpsSelect.value) },
        audio: true
      });
      handleStreamCaptured(stream);
    } catch (e) {
      console.error(e);
      alert('Bildschirmübertragung abgebrochen oder nicht unterstützt.');
    }
  }
});

closeModalBtn.addEventListener('click', () => {
  sourceModal.classList.add('hidden');
});

// Start Screen Capture
async function startScreenShare(sourceId) {
  const selectedRes = RESOLUTION_MAP[resSelect.value];
  const targetFps = parseInt(fpsSelect.value);

  try {
    let desktopStream;
    try {
      desktopStream = await navigator.mediaDevices.getUserMedia({
        audio: {
          mandatory: {
            chromeMediaSource: 'desktop'
          }
        },
        video: {
          mandatory: {
            chromeMediaSource: 'desktop',
            chromeMediaSourceId: sourceId,
            maxWidth: selectedRes.width,
            maxHeight: selectedRes.height,
            maxFrameRate: targetFps
          }
        }
      });
    } catch (audioErr) {
      desktopStream = await navigator.mediaDevices.getUserMedia({
        audio: false,
        video: {
          mandatory: {
            chromeMediaSource: 'desktop',
            chromeMediaSourceId: sourceId,
            maxWidth: selectedRes.width,
            maxHeight: selectedRes.height,
            maxFrameRate: targetFps
          }
        }
      });
    }

    // Capture Microphone Stream if active
    try {
      if (!micStream) {
        micStream = await navigator.mediaDevices.getUserMedia({ audio: true });
      }
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
  displayRemoteStream(stream, true); // Local preview is muted to prevent feedback loop

  startShareBtn.classList.add('hidden');
  stopShareBtn.classList.remove('hidden');

  const targetPeer = connectedPeerId || remoteIdInput.value.trim();

  if (targetPeer) {
    if (dataConn && dataConn.open) {
      dataConn.send({
        type: 'START_SHARE',
        res: resSelect.value,
        fps: fpsSelect.value
      });
    }

    currentCall = peer.call(targetPeer, stream);
    currentCall.on('stream', (remoteStream) => {
      displayRemoteStream(remoteStream, false);
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

  if (dataConn && dataConn.open) {
    dataConn.send({ type: 'STOP_SHARE' });
  }

  resetVideoDisplay();
  startShareBtn.classList.remove('hidden');
  stopShareBtn.classList.add('hidden');
}

// Toggle Microphone Mute
toggleMicBtn.addEventListener('click', () => {
  if (micStream) {
    isMicMuted = !isMicMuted;
    micStream.getAudioTracks().forEach(track => {
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
