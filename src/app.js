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

// Expanded ICE / STUN / TURN Configuration for Cross-Network Internet Traversal
const ICE_SERVERS = [
  { urls: 'stun:stun.l.google.com:19302' },
  { urls: 'stun:stun1.l.google.com:19302' },
  { urls: 'stun:stun2.l.google.com:19302' },
  { urls: 'stun:stun3.l.google.com:19302' },
  { urls: 'stun:stun4.l.google.com:19302' },
  { urls: 'stun:global.stun.twilio.com:3478' },
  { urls: 'stun:stun.services.mozilla.com' },
  // OpenRelay Public TURN Servers (UDP and TCP)
  {
    urls: 'turn:openrelay.metered.ca:80',
    username: 'openrelayproject',
    credential: 'openrelayproject'
  },
  {
    urls: 'turn:openrelay.metered.ca:443',
    username: 'openrelayproject',
    credential: 'openrelayproject'
  },
  {
    urls: 'turn:openrelay.metered.ca:443?transport=tcp',
    username: 'openrelayproject',
    credential: 'openrelayproject'
  }
];

// Friends state management
let friends = [];

function loadSavedFriends() {
  try {
    const saved = localStorage.getItem('streamshare_friends');
    if (saved) {
      friends = JSON.parse(saved);
    }
  } catch (e) {
    console.error('Error loading friends:', e);
    friends = [];
  }
  renderFriendsList();
}

function saveFriends() {
  try {
    localStorage.setItem('streamshare_friends', JSON.stringify(friends));
  } catch (e) {
    console.error('Error saving friends:', e);
  }
}

function renderFriendsList() {
  const friendsListEl = document.getElementById('friends-list');
  if (!friendsListEl) return;

  if (friends.length === 0) {
    friendsListEl.innerHTML = '<p class="empty-list">Noch keine Freunde hinzugefügt.</p>';
    return;
  }

  friendsListEl.innerHTML = '';
  friends.forEach((friend, index) => {
    const item = document.createElement('div');
    item.className = 'friend-item';

    const infoDiv = document.createElement('div');
    infoDiv.className = 'friend-info';

    const nameSpan = document.createElement('span');
    nameSpan.className = 'friend-name';
    nameSpan.textContent = friend.name || friend.id;

    const idSpan = document.createElement('span');
    idSpan.className = 'friend-id';
    idSpan.textContent = friend.id;

    infoDiv.appendChild(nameSpan);
    infoDiv.appendChild(idSpan);

    const actionsDiv = document.createElement('div');
    actionsDiv.className = 'friend-actions';

    const callBtn = document.createElement('button');
    callBtn.className = 'btn primary-btn btn-sm call-friend-btn';
    callBtn.setAttribute('data-id', friend.id);
    callBtn.textContent = 'Anrufen';

    const removeBtn = document.createElement('button');
    removeBtn.className = 'btn danger-btn btn-sm remove-friend-btn';
    removeBtn.setAttribute('data-index', index.toString());
    removeBtn.textContent = '✕';

    actionsDiv.appendChild(callBtn);
    actionsDiv.appendChild(removeBtn);

    item.appendChild(infoDiv);
    item.appendChild(actionsDiv);

    friendsListEl.appendChild(item);
  });

  // Attach event listeners
  document.querySelectorAll('.call-friend-btn').forEach(btn => {
    btn.addEventListener('click', (e) => {
      const targetId = e.target.getAttribute('data-id');
      remoteIdInput.value = targetId;
      connectToPeer(targetId);
    });
  });

  document.querySelectorAll('.remove-friend-btn').forEach(btn => {
    btn.addEventListener('click', (e) => {
      const idx = parseInt(e.target.getAttribute('data-index'));
      friends.splice(idx, 1);
      saveFriends();
      renderFriendsList();
    });
  });
}

function addFriend(id, name) {
  if (!id) return;
  const existing = friends.find(f => f.id === id);
  if (existing) {
    alert('Dieser Freund existiert bereits in deiner Liste.');
    return;
  }
  friends.push({ id, name: name || id });
  saveFriends();
  renderFriendsList();
}

// Get or create persistent My Peer ID
function getMyPeerId() {
  let savedId = localStorage.getItem('streamshare_my_id');
  if (!savedId) {
    savedId = 'stream-' + Math.floor(100000 + Math.random() * 900000);
    localStorage.setItem('streamshare_my_id', savedId);
  }
  return savedId;
}

// Initialize PeerJS Connection
function initPeer() {
  const myId = getMyPeerId();
  peer = new Peer(myId, {
    debug: 2,
    config: {
      iceServers: ICE_SERVERS,
      sdpSemantics: 'unified-plan'
    }
  });

  peer.on('open', (id) => {
    myPeerIdEl.textContent = id;
    loadSavedFriends();
  });

  peer.on('connection', (conn) => {
    setupDataConnection(conn);
  });

  peer.on('call', async (call) => {
    currentCall = call;

    if (!micStream) {
      try {
        micStream = await navigator.mediaDevices.getUserMedia({ audio: true });
      } catch (err) {
        console.warn('Microphone unavailable:', err);
      }
    }

    call.answer(localStream || micStream || createEmptyStream());
    setupCallHandlers(call);
  });

  peer.on('error', (err) => {
    console.error('PeerJS Error:', err);
    if (err.type === 'peer-unavailable') {
      alert('Der eingegebene Code wurde nicht gefunden. Bitte überprüfe den Code deines Freundes.');
    }
    updateStatus(false, 'Fehler: ' + err.type);
  });
}

// Helper to transform SDP for maximum bitrate (30-50 Mbps)
function setHighBitrateSDP(sdp) {
  let lines = sdp.split('\r\n');
  let mVideoIndex = -1;

  for (let i = 0; i < lines.length; i++) {
    if (lines[i].indexOf('m=video') === 0) {
      mVideoIndex = i;
      break;
    }
  }

  if (mVideoIndex !== -1) {
    // Insert b=AS:40000 (40 Mbps) and b=TIAS:40000000 into SDP for video stream
    lines.splice(mVideoIndex + 1, 0, 'b=AS:40000', 'b=TIAS:40000000');
  }

  return lines.join('\r\n');
}

function setupCallHandlers(call) {
  call.on('stream', (remoteStream) => {
    if (remoteStream.getVideoTracks().length > 0) {
      displayRemoteStream(remoteStream, false);
    }
  });

  if (call.peerConnection) {
    // Optimize sender video encoding bitrates on connection
    call.peerConnection.oniceconnectionstatechange = async () => {
      const state = call.peerConnection.iceConnectionState;
      console.log('ICE Connection State:', state);
      if (state === 'connected' || state === 'completed') {
        updateStatus(true, 'Verbunden (Stream Aktiv)');

        // Upgrade RTCRtpSenders bitrates dynamically
        const senders = call.peerConnection.getSenders();
        senders.forEach(async (sender) => {
          if (sender.track && sender.track.kind === 'video') {
            try {
              const params = sender.getParameters();
              if (!params.encodings || params.encodings.length === 0) {
                params.encodings = [{}];
              }
              params.encodings[0].maxBitrate = 40000000; // 40 Mbps max bitrate
              params.encodings[0].maxFramerate = parseInt(fpsSelect.value);
              await sender.setParameters(params);
            } catch (err) {
              console.warn('Could not set sender parameters:', err);
            }
          }
        });
      } else if (state === 'failed' || state === 'disconnected') {
        updateStatus(false, 'Verbindung getrennt');
      }
    };
  }

  call.on('close', () => {
    resetVideoDisplay();
  });

  call.on('error', (err) => {
    console.error('Call Error:', err);
  });
}

function setupDataConnection(conn) {
  if (dataConn && dataConn !== conn) {
    try { dataConn.close(); } catch (e) {}
  }
  dataConn = conn;
  connectedPeerId = conn.peer;

  conn.on('open', () => {
    updateStatus(true, 'Verbunden mit ' + conn.peer);
    // If we are currently sharing screen when connection opens, notify partner and call them
    if (localStream) {
      conn.send({
        type: 'START_SHARE',
        res: resSelect.value,
        fps: fpsSelect.value
      });
      if (peer && connectedPeerId) {
        currentCall = peer.call(connectedPeerId, localStream);
        setupCallHandlers(currentCall);
      }
    }
  });

  conn.on('data', (data) => {
    if (data.type === 'START_SHARE') {
      statRes.textContent = `${data.res}p`;
      statFps.textContent = `${data.fps} FPS`;
    } else if (data.type === 'STOP_SHARE') {
      resetVideoDisplay();
    } else if (data.type === 'PING') {
      conn.send({ type: 'PONG' });
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
    updateStatus(false, 'Verbindungsfehler');
  });
}

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

copyIdBtn.addEventListener('click', () => {
  const idText = myPeerIdEl.textContent;
  if (idText && !idText.includes('Wird generiert')) {
    navigator.clipboard.writeText(idText);
    alert('Raum-Code in die Zwischenablage kopiert!');
  }
});

function connectToPeer(targetId) {
  if (!targetId) return;
  updateStatus(true, 'Verbinde...');
  const conn = peer.connect(targetId);
  setupDataConnection(conn);
}

connectBtn.addEventListener('click', () => {
  const remoteId = remoteIdInput.value.trim();
  if (!remoteId) {
    alert('Bitte gib einen gültigen Code deines Freundes ein.');
    return;
  }
  connectToPeer(remoteId);
});

const addFriendBtn = document.getElementById('add-friend-btn');
const friendIdInput = document.getElementById('friend-id-input');
const friendNameInput = document.getElementById('friend-name-input');

if (addFriendBtn) {
  addFriendBtn.addEventListener('click', () => {
    const fId = friendIdInput.value.trim();
    const fName = friendNameInput.value.trim();
    if (!fId) {
      alert('Bitte gib eine gültige Freund-ID ein.');
      return;
    }
    addFriend(fId, fName);
    friendIdInput.value = '';
    friendNameInput.value = '';
  });
}

function displayRemoteStream(stream, isLocal = false) {
  remoteVideo.srcObject = stream;
  remoteVideo.muted = isLocal;
  videoPlaceholder.classList.add('hidden');
  statsOverlay.classList.remove('hidden');

  if (isLocal) {
    statRes.textContent = `${resSelect.value}p`;
    statFps.textContent = `${fpsSelect.value} FPS`;
  }

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

// Handle Screen Share Trigger
startShareBtn.addEventListener('click', async () => {
  if (window.electronAPI) {
    try {
      const sources = await window.electronAPI.getSources();
      sourceList.innerHTML = '';

      sources.forEach(source => {
        const item = document.createElement('div');
        item.className = 'source-item';
        item.innerHTML = `
          <img src="${source.thumbnail}" alt="${source.name}">
          <span>${source.name}</span>
        `;
        item.addEventListener('click', async () => {
          await window.electronAPI.setSelectedSource(source.id);
          sourceModal.classList.add('hidden');
          startScreenShare();
        });
        sourceList.appendChild(item);
      });

      sourceModal.classList.remove('hidden');
    } catch (e) {
      console.warn('Electron source picker fallback:', e);
      startScreenShare();
    }
  } else {
    startScreenShare();
  }
});

closeModalBtn.addEventListener('click', () => {
  sourceModal.classList.add('hidden');
});

// Robust getDisplayMedia capture with audio capture fallback
async function startScreenShare() {
  const selectedRes = RESOLUTION_MAP[resSelect.value];
  const targetFps = parseInt(fpsSelect.value);

  const constraintsWithAudio = {
    video: {
      width: { ideal: selectedRes.width, max: selectedRes.width },
      height: { ideal: selectedRes.height, max: selectedRes.height },
      frameRate: { ideal: targetFps, max: targetFps }
    },
    audio: true
  };

  const constraintsWithoutAudio = {
    video: {
      width: { ideal: selectedRes.width, max: selectedRes.width },
      height: { ideal: selectedRes.height, max: selectedRes.height },
      frameRate: { ideal: targetFps, max: targetFps }
    },
    audio: false
  };

  try {
    let desktopStream;
    try {
      desktopStream = await navigator.mediaDevices.getDisplayMedia(constraintsWithAudio);
    } catch (audioErr) {
      console.warn('System audio capture failed/denied, falling back to video-only capture:', audioErr);
      desktopStream = await navigator.mediaDevices.getDisplayMedia(constraintsWithoutAudio);
    }

    try {
      if (!micStream) {
        micStream = await navigator.mediaDevices.getUserMedia({ audio: true });
      }
      micStream.getAudioTracks().forEach(track => {
        desktopStream.addTrack(track);
      });
    } catch (micErr) {
      console.warn('Mikrofon nicht verfügbar:', micErr);
    }

    handleStreamCaptured(desktopStream);
  } catch (err) {
    console.error('Fehler beim Starten des Screenshares:', err);
    if (err.name !== 'NotAllowedError') {
      alert('Bildschirmübertragung konnte nicht gestartet werden: ' + err.message);
    }
  }
}

function handleStreamCaptured(stream) {
  localStream = stream;
  displayRemoteStream(stream, true);

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
    setupCallHandlers(currentCall);
  }

  stream.getVideoTracks()[0].onended = () => {
    stopScreenShare();
  };
}

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

volumeRange.addEventListener('input', (e) => {
  remoteVideo.volume = e.target.value / 100;
});

fullscreenBtn.addEventListener('click', () => {
  const container = document.querySelector('.main-content');
  if (!document.fullscreenElement) {
    if (container.requestFullscreen) {
      container.requestFullscreen();
    } else if (remoteVideo.requestFullscreen) {
      remoteVideo.requestFullscreen();
    }
  } else {
    document.exitFullscreen();
  }
});

initPeer();
