let peer = null;
let dataConn = null;
let currentCall = null;
let localStream = null;
let micStream = null;
let isMicMuted = false;
let connectedPeerId = null;

// Local Storage Keys
const STORAGE_PEER_ID_KEY = 'streamshare_my_id';
const STORAGE_DISPLAY_NAME_KEY = 'streamshare_display_name';
const STORAGE_FRIENDS_KEY = 'streamshare_friends';

// DOM Elements
const displayNameInput = document.getElementById('display-name-input');
const myPeerIdEl = document.getElementById('my-peer-id');
const copyIdBtn = document.getElementById('copy-id-btn');

const tabFriendsBtn = document.getElementById('tab-friends-btn');
const tabSettingsBtn = document.getElementById('tab-settings-btn');
const tabFriendsContent = document.getElementById('tab-friends-content');
const tabSettingsContent = document.getElementById('tab-settings-content');

const friendNameInput = document.getElementById('friend-name-input');
const friendIdInput = document.getElementById('friend-id-input');
const addFriendBtn = document.getElementById('add-friend-btn');
const friendsListContainer = document.getElementById('friends-list');

const remoteIdInput = document.getElementById('remote-id-input');
const connectBtn = document.getElementById('connect-btn');
const connectionStatus = document.getElementById('connection-status');
const toggleMicBtn = document.getElementById('toggle-mic-btn');
const disconnectCallBtn = document.getElementById('disconnect-call-btn');

const resSelect = document.getElementById('res-select');
const fpsSelect = document.getElementById('fps-select');
const startShareBtn = document.getElementById('start-share-btn');
const stopShareBtn = document.getElementById('stop-share-btn');
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

// Expanded STUN/TURN ICE configuration
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

// Helper: Toast Notifications
function showToast(message) {
  if (!toastContainer) return;
  const toast = document.createElement('div');
  toast.className = 'toast';
  toast.textContent = message;
  toastContainer.appendChild(toast);
  setTimeout(() => {
    toast.remove();
  }, 3500);
}

// Tab Switching
tabFriendsBtn.addEventListener('click', () => {
  tabFriendsBtn.classList.add('active');
  tabSettingsBtn.classList.remove('active');
  tabFriendsContent.classList.remove('hidden');
  tabSettingsContent.classList.add('hidden');
});

tabSettingsBtn.addEventListener('click', () => {
  tabSettingsBtn.classList.add('active');
  tabFriendsBtn.classList.remove('active');
  tabSettingsContent.classList.remove('hidden');
  tabFriendsContent.classList.add('hidden');
});

// Load & Save Display Name
function initUserProfile() {
  const savedName = localStorage.getItem(STORAGE_DISPLAY_NAME_KEY);
  if (savedName) {
    displayNameInput.value = savedName;
  }
  displayNameInput.addEventListener('change', () => {
    const val = displayNameInput.value.trim() || 'User';
    localStorage.setItem(STORAGE_DISPLAY_NAME_KEY, val);
    showToast(`Name auf "${val}" aktualisiert.`);
  });
}

// Friends List Management
function getSavedFriends() {
  try {
    const data = localStorage.getItem(STORAGE_FRIENDS_KEY);
    return data ? JSON.parse(data) : [];
  } catch (e) {
    return [];
  }
}

function saveFriends(friends) {
  localStorage.setItem(STORAGE_FRIENDS_KEY, JSON.stringify(friends));
  renderFriendsList();
}

function addFriend(name, code) {
  if (!code) {
    showToast('Bitte gib einen gültigen Code ein.');
    return;
  }
  const friends = getSavedFriends();
  if (friends.some(f => f.code === code)) {
    showToast('Dieser Freund ist bereits in deiner Liste.');
    return;
  }
  friends.push({ name: name || 'Freund', code: code });
  saveFriends(friends);
  showToast(`Freund "${name || code}" hinzugefügt!`);
  friendNameInput.value = '';
  friendIdInput.value = '';
}

function removeFriend(code) {
  let friends = getSavedFriends();
  friends = friends.filter(f => f.code !== code);
  saveFriends(friends);
  showToast('Freund aus der Liste entfernt.');
}

function renderFriendsList() {
  const friends = getSavedFriends();
  friendsListContainer.innerHTML = '';

  if (friends.length === 0) {
    friendsListContainer.innerHTML = '<div class="empty-list-msg">Noch keine Freunde gespeichert.</div>';
    return;
  }

  friends.forEach(friend => {
    const item = document.createElement('div');
    item.className = 'friend-item';
    item.innerHTML = `
      <div class="friend-info">
        <span class="friend-name">${escapeHtml(friend.name)}</span>
        <span class="friend-id">${escapeHtml(friend.code)}</span>
      </div>
      <div class="friend-actions">
        <button class="friend-call-btn" title="Anrufen">📞 Verbinden</button>
        <button class="friend-remove-btn" title="Entfernen">✕</button>
      </div>
    `;

    item.querySelector('.friend-call-btn').addEventListener('click', () => {
      connectToPeer(friend.code);
    });

    item.querySelector('.friend-remove-btn').addEventListener('click', () => {
      removeFriend(friend.code);
    });

    friendsListContainer.appendChild(item);
  });
}

addFriendBtn.addEventListener('click', () => {
  addFriend(friendNameInput.value.trim(), friendIdInput.value.trim());
});

function escapeHtml(str) {
  return String(str).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

// PeerJS Initialization with Local Storage ID Persistence
function initPeer() {
  let myId = localStorage.getItem(STORAGE_PEER_ID_KEY);
  if (!myId) {
    myId = 'stream-' + Math.floor(100000 + Math.random() * 900000);
    localStorage.setItem(STORAGE_PEER_ID_KEY, myId);
  }

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
    currentCall = call;

    if (!micStream) {
      try {
        micStream = await navigator.mediaDevices.getUserMedia({ audio: true });
      } catch (err) {
        console.warn('Microphone unavailable:', err);
      }
    }

    call.answer(localStream || micStream || createEmptyAudioStream());
    setupCallHandlers(call);
  });

  peer.on('error', (err) => {
    console.error('PeerJS Error:', err);
    if (err.type === 'peer-unavailable') {
      showToast('Der eingegebene Code wurde nicht gefunden.');
    } else {
      showToast('Verbindungsfehler: ' + err.type);
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

function setupDataConnection(conn) {
  dataConn = conn;
  connectedPeerId = conn.peer;

  conn.on('open', () => {
    updateStatus(true, 'Verbunden');
    showToast('Verbunden mit ' + conn.peer);
  });

  conn.on('data', (data) => {
    if (data.type === 'START_SHARE') {
      statRes.textContent = `${data.res}p`;
      statFps.textContent = `${data.fps} FPS`;
      showToast(`Bildschirmübertragung gestartet (${data.res}p @ ${data.fps} FPS)`);
    } else if (data.type === 'STOP_SHARE') {
      resetVideoDisplay();
      showToast('Bildschirmübertragung beendet.');
    }
  });

  conn.on('close', () => {
    updateStatus(false, 'Getrennt');
    showToast('Verbindung getrennt.');
    connectedPeerId = null;
    dataConn = null;
    resetVideoDisplay();
  });

  conn.on('error', (err) => {
    console.error('Data Connection Error:', err);
    updateStatus(false, 'Getrennt');
  });
}

function createEmptyAudioStream() {
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

function connectToPeer(remoteId) {
  if (!remoteId) {
    showToast('Bitte gib einen gültigen Code ein.');
    return;
  }
  updateStatus(true, 'Verbinde...');
  showToast('Verbindung wird aufgebaut...');
  const conn = peer.connect(remoteId);
  setupDataConnection(conn);
}

connectBtn.addEventListener('click', () => {
  connectToPeer(remoteIdInput.value.trim());
});

copyIdBtn.addEventListener('click', () => {
  const idText = myPeerIdEl.textContent;
  if (idText && !idText.includes('Wird generiert')) {
    navigator.clipboard.writeText(idText);
    showToast('Raum-Code in Zwischenablage kopiert!');
  }
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

// Handle Screen Sharing Source Picker & Capture
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
      console.warn('System audio capture fallback:', audioErr);
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
      showToast('Bildschirmübertragung abgebrochen oder fehlgeschlagen.');
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
  showToast('Bildschirmübertragung gestoppt.');
}

// Call Control: Mute Microphone & Disconnect Call
toggleMicBtn.addEventListener('click', () => {
  if (micStream) {
    isMicMuted = !isMicMuted;
    micStream.getAudioTracks().forEach(track => {
      track.enabled = !isMicMuted;
    });
    toggleMicBtn.textContent = isMicMuted ? '🔇' : '🎤';
    if (isMicMuted) {
      toggleMicBtn.classList.add('muted');
      showToast('Mikrofon stummgeschaltet.');
    } else {
      toggleMicBtn.classList.remove('muted');
      showToast('Mikrofon aktiviert.');
    }
  } else {
    showToast('Kein Mikrofon aktiv.');
  }
});

disconnectCallBtn.addEventListener('click', () => {
  if (currentCall) {
    currentCall.close();
    currentCall = null;
  }
  if (dataConn) {
    dataConn.close();
    dataConn = null;
  }
  stopScreenShare();
  updateStatus(false, 'Getrennt');
  showToast('Verbindung getrennt.');
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

// App Initialization
initUserProfile();
renderFriendsList();
initPeer();
