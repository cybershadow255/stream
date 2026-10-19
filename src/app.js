let peer = null;
let dataConn = null;
let currentCall = null;
let localStream = null;
let micStream = null;
let isMicMuted = false;
let isInVoiceCall = false;
let connectedPeerId = null;

// LocalStorage Keys
const STORAGE_MY_ID = 'streamshare_my_id';
const STORAGE_FRIENDS = 'streamshare_friends';

// DOM Elements
const customIdInput = document.getElementById('custom-id-input');
const saveIdBtn = document.getElementById('save-id-btn');
const myPeerIdEl = document.getElementById('my-peer-id');
const copyIdBtn = document.getElementById('copy-id-btn');

const toggleAddFriendBtn = document.getElementById('toggle-add-friend-btn');
const addFriendForm = document.getElementById('add-friend-form');
const friendNameInput = document.getElementById('friend-name-input');
const friendIdInput = document.getElementById('friend-id-input');
const saveFriendBtn = document.getElementById('save-friend-btn');
const friendsListEl = document.getElementById('friends-list');

const remoteIdInput = document.getElementById('remote-id-input');
const connectBtn = document.getElementById('connect-btn');
const connectionStatus = document.getElementById('connection-status');

const resSelect = document.getElementById('res-select');
const fpsSelect = document.getElementById('fps-select');
const startShareBtn = document.getElementById('start-share-btn');
const stopShareBtn = document.getElementById('stop-share-btn');
const toggleMicBtn = document.getElementById('toggle-mic-btn');
const toggleCallBtn = document.getElementById('toggle-call-btn');
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
const toastContainer = document.getElementById('toast-container');

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

// --- Toast Notifications ---
function showToast(message, type = 'info') {
  const toast = document.createElement('div');
  toast.className = `toast ${type}`;
  toast.textContent = message;
  toastContainer.appendChild(toast);
  setTimeout(() => {
    toast.remove();
  }, 4000);
}

// --- ID & Local Storage Setup ---
function getSavedMyId() {
  let savedId = localStorage.getItem(STORAGE_MY_ID);
  if (!savedId) {
    savedId = 'stream-' + Math.floor(100000 + Math.random() * 900000);
    localStorage.setItem(STORAGE_MY_ID, savedId);
  }
  return savedId;
}

function initPeer(peerId) {
  if (peer) {
    peer.destroy();
  }

  const currentId = peerId || getSavedMyId();
  customIdInput.value = currentId;

  peer = new Peer(currentId, {
    debug: 1,
    config: {
      iceServers: ICE_SERVERS,
      sdpSemantics: 'unified-plan'
    }
  });

  peer.on('open', (id) => {
    myPeerIdEl.textContent = id;
    showToast(`Deine ID aktiv: ${id}`, 'success');
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
    showToast(`Anruf empfangen von ${call.peer}`, 'info');
  });

  peer.on('error', (err) => {
    console.error('PeerJS Error:', err);
    if (err.type === 'peer-unavailable') {
      showToast('Der eingegebene Code wurde nicht gefunden. Ist dein Freund online?', 'error');
    } else if (err.type === 'unavailable-id') {
      showToast('Diese ID ist bereits vergeben. Bitte wähle eine andere.', 'error');
    } else {
      showToast('Verbindungsfehler: ' + err.type, 'error');
    }
    updateStatus(false, 'Getrennt');
  });
}

saveIdBtn.addEventListener('click', () => {
  const newId = customIdInput.value.trim().toLowerCase().replace(/[^a-z0-9_-]/g, '');
  if (!newId) {
    showToast('Bitte gib eine gültige ID ein.', 'error');
    return;
  }
  localStorage.setItem(STORAGE_MY_ID, newId);
  initPeer(newId);
});

copyIdBtn.addEventListener('click', () => {
  const idText = myPeerIdEl.textContent;
  if (idText && !idText.includes('Wird geladen')) {
    navigator.clipboard.writeText(idText);
    showToast('Raum-Code in Zwischenablage kopiert!', 'success');
  }
});

// --- Friends List Management ---
function getSavedFriends() {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_FRIENDS)) || [];
  } catch (e) {
    return [];
  }
}

function saveFriends(friends) {
  localStorage.setItem(STORAGE_FRIENDS, JSON.stringify(friends));
}

function renderFriendsList() {
  const friends = getSavedFriends();
  friendsListEl.innerHTML = '';

  if (friends.length === 0) {
    friendsListEl.innerHTML = '<div class="empty-friends">Noch keine Freunde gespeichert.</div>';
    return;
  }

  friends.forEach((friend, index) => {
    const item = document.createElement('div');
    item.className = 'friend-item';
    item.innerHTML = `
      <div class="friend-info">
        <span class="friend-name">${friend.name}</span>
        <span class="friend-id">${friend.id}</span>
      </div>
      <div class="friend-actions">
        <button class="btn primary-btn friend-btn connect-friend-btn" data-id="${friend.id}" title="Verbinden / Anrufen">📞</button>
        <button class="btn danger-btn friend-btn delete-friend-btn" data-index="${index}" title="Entfernen">✕</button>
      </div>
    `;
    friendsListEl.appendChild(item);
  });

  // Attach event listeners to friend buttons
  document.querySelectorAll('.connect-friend-btn').forEach(btn => {
    btn.addEventListener('click', (e) => {
      const targetId = e.currentTarget.getAttribute('data-id');
      remoteIdInput.value = targetId;
      connectToPeer(targetId);
    });
  });

  document.querySelectorAll('.delete-friend-btn').forEach(btn => {
    btn.addEventListener('click', (e) => {
      const idx = parseInt(e.currentTarget.getAttribute('data-index'));
      const friendsList = getSavedFriends();
      friendsList.splice(idx, 1);
      saveFriends(friendsList);
      renderFriendsList();
      showToast('Freund entfernt', 'info');
    });
  });
}

toggleAddFriendBtn.addEventListener('click', () => {
  addFriendForm.classList.toggle('hidden');
});

saveFriendBtn.addEventListener('click', () => {
  const name = friendNameInput.value.trim();
  const id = friendIdInput.value.trim().toLowerCase();

  if (!name || !id) {
    showToast('Bitte Name und ID eingeben', 'error');
    return;
  }

  const friends = getSavedFriends();
  friends.push({ name, id });
  saveFriends(friends);
  renderFriendsList();

  friendNameInput.value = '';
  friendIdInput.value = '';
  addFriendForm.classList.add('hidden');
  showToast(`${name} als Freund hinzugefügt!`, 'success');
});

// --- Connection & Calls Logic ---
function connectToPeer(remoteId) {
  if (!remoteId) {
    showToast('Bitte einen Raum-Code eingeben', 'error');
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

function setupDataConnection(conn) {
  dataConn = conn;
  connectedPeerId = conn.peer;

  conn.on('open', () => {
    updateStatus(true, 'Verbunden mit ' + conn.peer);
    showToast(`Erfolgreich verbunden mit ${conn.peer}`, 'success');
  });

  conn.on('data', (data) => {
    if (data.type === 'START_SHARE') {
      statRes.textContent = `${data.res}p`;
      statFps.textContent = `${data.fps} FPS`;
      showToast(`Stream gestartet (${data.res}p @ ${data.fps} FPS)`, 'info');
    } else if (data.type === 'STOP_SHARE') {
      resetVideoDisplay();
      showToast('Stream beendet', 'info');
    }
  });

  conn.on('close', () => {
    updateStatus(false, 'Getrennt');
    connectedPeerId = null;
    dataConn = null;
    resetVideoDisplay();
    showToast('Verbindung getrennt', 'info');
  });

  conn.on('error', (err) => {
    console.error('Data Connection Error:', err);
    updateStatus(false, 'Getrennt');
  });
}

function setupCallHandlers(call) {
  call.on('stream', (remoteStream) => {
    if (remoteStream.getVideoTracks().length > 0) {
      displayRemoteStream(remoteStream, false);
    } else {
      // Audio-only call stream handling
      displayRemoteStream(remoteStream, false);
    }
  });

  if (call.peerConnection) {
    call.peerConnection.oniceconnectionstatechange = () => {
      const state = call.peerConnection.iceConnectionState;
      console.log('ICE Connection State:', state);
      if (state === 'connected' || state === 'completed') {
        updateStatus(true, 'Verbunden (Aktiv)');
      } else if (state === 'failed' || state === 'disconnected') {
        updateStatus(false, 'Getrennt');
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

// --- Voice Call Toggle ---
toggleCallBtn.addEventListener('click', async () => {
  const targetPeer = connectedPeerId || remoteIdInput.value.trim();
  if (!targetPeer) {
    showToast('Bitte verbinde dich zuerst mit einem Freund oder gib einen Code ein.', 'error');
    return;
  }

  if (!isInVoiceCall) {
    try {
      if (!micStream) {
        micStream = await navigator.mediaDevices.getUserMedia({ audio: true });
      }
      currentCall = peer.call(targetPeer, micStream);
      setupCallHandlers(currentCall);
      isInVoiceCall = true;
      toggleCallBtn.textContent = '📞 Auflegen';
      toggleCallBtn.className = 'btn danger-btn';
      showToast('Sprachcall gestartet', 'success');
    } catch (err) {
      showToast('Mikrofon konnte nicht gestartet werden: ' + err.message, 'error');
    }
  } else {
    if (currentCall) {
      currentCall.close();
      currentCall = null;
    }
    isInVoiceCall = false;
    toggleCallBtn.textContent = '📞 Sprachcall';
    toggleCallBtn.className = 'btn secondary-btn';
    showToast('Sprachcall beendet', 'info');
  }
});

// --- Handle Screen Share Trigger ---
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

// Robust getDisplayMedia capture with system audio and voice mixing
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
      showToast('Bildschirmübertragung konnte nicht gestartet werden: ' + err.message, 'error');
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
  showToast('Bildschirmübertragung beendet', 'info');
}

toggleMicBtn.addEventListener('click', async () => {
  if (!micStream) {
    try {
      micStream = await navigator.mediaDevices.getUserMedia({ audio: true });
    } catch (err) {
      showToast('Mikrofon-Zugriff verweigert', 'error');
      return;
    }
  }

  isMicMuted = !isMicMuted;
  micStream.getAudioTracks().forEach(track => {
    track.enabled = !isMicMuted;
  });
  toggleMicBtn.textContent = isMicMuted ? '🎤 Mikro: Stumm' : '🎤 Mikro: An';
  toggleMicBtn.className = isMicMuted ? 'btn danger-btn' : 'btn secondary-btn';
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

// Initialization
renderFriendsList();
initPeer();
