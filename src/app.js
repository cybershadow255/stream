let peer = null;
let dataConn = null;
let currentCall = null;
let localStream = null;
let micStream = null;
let isMicMuted = false;
let connectedPeerId = null;
let friendsList = [];

// DOM Elements
const myPeerIdEl = document.getElementById('my-peer-id');
const copyIdBtn = document.getElementById('copy-id-btn');
const remoteIdInput = document.getElementById('remote-id-input');
const connectBtn = document.getElementById('connect-btn');
const connectionStatus = document.getElementById('connection-status');

const friendsListEl = document.getElementById('friends-list');
const addFriendBtn = document.getElementById('add-friend-btn');
const addFriendModal = document.getElementById('add-friend-modal');
const friendNameInput = document.getElementById('friend-name-input');
const friendIdInput = document.getElementById('friend-id-input');
const saveFriendBtn = document.getElementById('save-friend-btn');
const closeFriendModalBtn = document.getElementById('close-friend-modal-btn');

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

// ICE / STUN / TURN Configuration
const ICE_SERVERS = [
  { urls: 'stun:stun.l.google.com:19302' },
  { urls: 'stun:stun1.l.google.com:19302' },
  { urls: 'stun:stun2.l.google.com:19302' },
  { urls: 'stun:stun3.l.google.com:19302' },
  { urls: 'stun:stun4.l.google.com:19302' },
  { urls: 'stun:global.stun.twilio.com:3478' },
  { urls: 'stun:stun.services.mozilla.com' },
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

// Persistent ID & Friends Helper
function getSavedPeerId() {
  let id = localStorage.getItem('streamshare_my_id');
  if (!id) {
    id = 'stream-' + Math.floor(100000 + Math.random() * 900000);
    localStorage.setItem('streamshare_my_id', id);
  }
  return id;
}

function loadFriends() {
  try {
    const saved = localStorage.getItem('streamshare_friends');
    friendsList = saved ? JSON.parse(saved) : [];
  } catch (e) {
    friendsList = [];
  }
  renderFriendsList();
}

function saveFriends() {
  localStorage.setItem('streamshare_friends', JSON.stringify(friendsList));
  renderFriendsList();
}

function renderFriendsList() {
  if (!friendsListEl) return;
  friendsListEl.innerHTML = '';

  if (friendsList.length === 0) {
    friendsListEl.innerHTML = '<div class="empty-list-msg">Noch keine Freunde hinzugefügt.</div>';
    return;
  }

  friendsList.forEach((friend, index) => {
    const friendItem = document.createElement('div');
    friendItem.className = 'friend-item';

    const isConnected = connectedPeerId === friend.id;

    friendItem.innerHTML = `
      <div class="friend-info">
        <span class="friend-name">${escapeHtml(friend.name)}</span>
        <span class="friend-id">${escapeHtml(friend.id)}</span>
      </div>
      <div class="friend-actions">
        <button class="btn-connect ${isConnected ? 'active' : ''}" title="${isConnected ? 'Verbunden' : 'Anrufen / Verbinden'}">
          ${isConnected ? '🟢' : '📞'}
        </button>
        <button class="btn-delete" title="Entfernen">🗑️</button>
      </div>
    `;

    friendItem.querySelector('.btn-connect').addEventListener('click', () => {
      connectToPeer(friend.id);
    });

    friendItem.querySelector('.btn-delete').addEventListener('click', (e) => {
      e.stopPropagation();
      friendsList.splice(index, 1);
      saveFriends();
    });

    friendsListEl.appendChild(friendItem);
  });
}

function escapeHtml(str) {
  return str.replace(/[&<>'"]/g,
    tag => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' }[tag] || tag)
  );
}

// Initialize PeerJS Connection
function initPeer() {
  const myId = getSavedPeerId();

  peer = new Peer(myId, {
    debug: 2,
    config: {
      iceServers: ICE_SERVERS,
      sdpSemantics: 'unified-plan'
    }
  });

  peer.on('open', (id) => {
    myPeerIdEl.textContent = id;
    loadFriends();
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

function connectToPeer(remoteId) {
  if (!remoteId) {
    alert('Bitte gib einen gültigen Code deines Freundes ein.');
    return;
  }

  updateStatus(true, 'Verbinde...');
  const conn = peer.connect(remoteId);
  setupDataConnection(conn);
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
    resetVideoDisplay();
  });

  call.on('error', (err) => {
    console.error('Call Error:', err);
  });
}

function setupDataConnection(conn) {
  dataConn = conn;
  connectedPeerId = conn.peer;
  renderFriendsList();

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
    renderFriendsList();
    resetVideoDisplay();
  });

  conn.on('error', (err) => {
    console.error('Data Connection Error:', err);
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

connectBtn.addEventListener('click', () => {
  const remoteId = remoteIdInput.value.trim();
  connectToPeer(remoteId);
});

// Friends Modal Event Listeners
addFriendBtn.addEventListener('click', () => {
  addFriendModal.classList.remove('hidden');
});

closeFriendModalBtn.addEventListener('click', () => {
  addFriendModal.classList.add('hidden');
});

saveFriendBtn.addEventListener('click', () => {
  const name = friendNameInput.value.trim();
  const id = friendIdInput.value.trim();

  if (!name || !id) {
    alert('Bitte gib sowohl Name als auch Raum-Code ein.');
    return;
  }

  friendsList.push({ name, id });
  saveFriends();

  friendNameInput.value = '';
  friendIdInput.value = '';
  addFriendModal.classList.add('hidden');
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
          <img src="${source.thumbnail}" alt="${escapeHtml(source.name)}">
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
