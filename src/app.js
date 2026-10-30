let peer = null;
let activeDataConns = new Map(); // peerId -> DataConnection
let activeCalls = new Map();     // peerId -> MediaConnection
let localStream = null;
let micStream = null;
let isMicMuted = false;
let friends = [];

// DOM Elements
const myPeerIdEl = document.getElementById('my-peer-id');
const copyIdBtn = document.getElementById('copy-id-btn');
const remoteIdInput = document.getElementById('remote-id-input');
const connectBtn = document.getElementById('connect-btn');
const connectionStatus = document.getElementById('connection-status');

const addFriendNameInput = document.getElementById('add-friend-name-input');
const addFriendIdInput = document.getElementById('add-friend-id-input');
const addFriendBtn = document.getElementById('add-friend-btn');
const friendsListEl = document.getElementById('friends-list');

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

// Initialize Saved Peer ID or generate new
function getMyPeerId() {
  let id = localStorage.getItem('streamshare_my_id');
  if (!id) {
    id = 'stream-' + Math.floor(100000 + Math.random() * 900000);
    localStorage.setItem('streamshare_my_id', id);
  }
  return id;
}

// Friends List Storage & Rendering
function loadFriends() {
  try {
    const saved = localStorage.getItem('streamshare_friends');
    friends = saved ? JSON.parse(saved) : [];
  } catch (e) {
    friends = [];
  }
  renderFriends();
}

function saveFriends() {
  localStorage.setItem('streamshare_friends', JSON.stringify(friends));
  renderFriends();
}

function renderFriends() {
  friendsListEl.innerHTML = '';
  if (friends.length === 0) {
    friendsListEl.innerHTML = '<div class="empty-friends">Noch keine Freunde hinzugefügt.</div>';
    return;
  }

  friends.forEach((friend, index) => {
    const item = document.createElement('div');
    item.className = 'friend-item';
    item.innerHTML = `
      <div class="friend-info">
        <span class="friend-name">${escapeHtml(friend.name)}</span>
        <span class="friend-id">${escapeHtml(friend.id)}</span>
      </div>
      <div class="friend-actions">
        <button class="btn primary-btn btn-sm call-friend-btn" title="Anrufen / Verbinden">📞</button>
        <button class="btn danger-btn btn-sm remove-friend-btn" title="Entfernen">✖</button>
      </div>
    `;

    item.querySelector('.call-friend-btn').addEventListener('click', () => {
      remoteIdInput.value = friend.id;
      connectToPeer(friend.id);
    });

    item.querySelector('.remove-friend-btn').addEventListener('click', () => {
      friends.splice(index, 1);
      saveFriends();
    });

    friendsListEl.appendChild(item);
  });
}

function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
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
  });

  peer.on('connection', (conn) => {
    setupDataConnection(conn);
  });

  peer.on('call', async (call) => {
    activeCalls.set(call.peer, call);

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

function setupCallHandlers(call) {
  call.on('stream', (remoteStream) => {
    if (remoteStream.getVideoTracks().length > 0) {
      displayRemoteStream(remoteStream, false);
    }
  });

  if (call.peerConnection) {
    call.peerConnection.oniceconnectionstatechange = () => {
      const state = call.peerConnection.iceConnectionState;
      console.log('ICE Connection State:', state);
      if (state === 'connected' || state === 'completed') {
        updateStatus(true, 'Verbunden (Stream Aktiv)');
      } else if (state === 'failed' || state === 'disconnected') {
        updateStatus(false, 'Verbindung getrennt');
      }
    };
  }

  call.on('close', () => {
    activeCalls.delete(call.peer);
    if (activeCalls.size === 0) {
      resetVideoDisplay();
    }
  });

  call.on('error', (err) => {
    console.error('Call Error:', err);
  });
}

function setupDataConnection(conn) {
  activeDataConns.set(conn.peer, conn);

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
    activeDataConns.delete(conn.peer);
    if (activeDataConns.size === 0) {
      updateStatus(false, 'Getrennt');
    }
    resetVideoDisplay();
  });

  conn.on('error', (err) => {
    console.error('Data Connection Error:', err);
    activeDataConns.delete(conn.peer);
    updateStatus(false, 'Getrennt');
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

function connectToPeer(remoteId) {
  if (!remoteId) {
    alert('Bitte gib einen gültigen Code ein.');
    return;
  }

  updateStatus(true, 'Verbinde...');
  const conn = peer.connect(remoteId);
  setupDataConnection(conn);
}

connectBtn.addEventListener('click', () => {
  const remoteId = remoteIdInput.value.trim();
  connectToPeer(remoteId);
});

addFriendBtn.addEventListener('click', () => {
  const name = addFriendNameInput.value.trim();
  const id = addFriendIdInput.value.trim();

  if (!name || !id) {
    alert('Bitte gib sowohl Name als auch Code für den Freund ein.');
    return;
  }

  friends.push({ name, id });
  saveFriends();

  addFriendNameInput.value = '';
  addFriendIdInput.value = '';
});

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
          <span>${escapeHtml(source.name)}</span>
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

  // Broadcast stream to connected peer or entered peer ID
  const targetPeers = new Set(activeDataConns.keys());
  const manualInput = remoteIdInput.value.trim();
  if (manualInput) {
    targetPeers.add(manualInput);
  }

  targetPeers.forEach(targetPeer => {
    const dataConn = activeDataConns.get(targetPeer);
    if (dataConn && dataConn.open) {
      dataConn.send({
        type: 'START_SHARE',
        res: resSelect.value,
        fps: fpsSelect.value
      });
    }

    const call = peer.call(targetPeer, stream);
    if (call) {
      activeCalls.set(targetPeer, call);
      setupCallHandlers(call);
    }
  });

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

  activeDataConns.forEach(dataConn => {
    if (dataConn.open) {
      dataConn.send({ type: 'STOP_SHARE' });
    }
  });

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

loadFriends();
initPeer();
