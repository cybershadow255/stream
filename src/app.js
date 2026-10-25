let peer = null;
let dataConn = null;
let currentCall = null;
let localStream = null;
let micStream = null;
let isMicMuted = false;
let connectedPeerId = null;

// DOM Elements - Tabs
const tabFriendsBtn = document.getElementById('tab-friends-btn');
const tabRoomBtn = document.getElementById('tab-room-btn');
const tabSettingsBtn = document.getElementById('tab-settings-btn');

const tabFriends = document.getElementById('tab-friends');
const tabRoom = document.getElementById('tab-room');
const tabSettings = document.getElementById('tab-settings');

// DOM Elements - Profile & Friends
const myPeerIdEl = document.getElementById('my-peer-id');
const copyIdBtn = document.getElementById('copy-id-btn');
const addFriendForm = document.getElementById('add-friend-form');
const friendNameInput = document.getElementById('friend-name-input');
const friendIdInput = document.getElementById('friend-id-input');
const friendsListEl = document.getElementById('friends-list');

// DOM Elements - Room & Direct Connect
const groupRoomInput = document.getElementById('group-room-input');
const joinRoomBtn = document.getElementById('join-room-btn');
const remoteIdInput = document.getElementById('remote-id-input');
const connectBtn = document.getElementById('connect-btn');
const connectionStatus = document.getElementById('connection-status');

// DOM Elements - Controls & Stream
const resSelect = document.getElementById('res-select');
const fpsSelect = document.getElementById('fps-select');
const startShareBtn = document.getElementById('start-share-btn');
const stopShareBtn = document.getElementById('stop-share-btn');
const toggleMicBtn = document.getElementById('toggle-mic-btn');
const volumeRange = document.getElementById('volume-range');

// DOM Elements - Main Display
const remoteVideo = document.getElementById('remote-video');
const videoPlaceholder = document.getElementById('video-placeholder');
const statsOverlay = document.getElementById('stats-overlay');
const statRes = document.getElementById('stat-res');
const statFps = document.getElementById('stat-fps');
const fullscreenBtn = document.getElementById('fullscreen-btn');

// DOM Elements - Source Picker Modal
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

// --- Tab Navigation ---
function setupTabs() {
  const tabs = [
    { btn: tabFriendsBtn, content: tabFriends },
    { btn: tabRoomBtn, content: tabRoom },
    { btn: tabSettingsBtn, content: tabSettings }
  ];

  tabs.forEach(tab => {
    tab.btn.addEventListener('click', () => {
      tabs.forEach(t => {
        t.btn.classList.remove('active');
        t.content.classList.add('hidden');
      });
      tab.btn.classList.add('active');
      tab.content.classList.remove('hidden');
    });
  });
}

// --- LocalStorage Persistent Peer ID ---
function getOrCreatePeerId() {
  let savedId = localStorage.getItem('streamshare_my_id');
  if (!savedId) {
    savedId = 'stream-' + Math.floor(100000 + Math.random() * 900000);
    localStorage.setItem('streamshare_my_id', savedId);
  }
  return savedId;
}

// Initialize PeerJS Connection
function initPeer() {
  const peerId = getOrCreatePeerId();

  peer = new Peer(peerId, {
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

// --- Friend Management ---
function getSavedFriends() {
  try {
    const raw = localStorage.getItem('streamshare_friends');
    return raw ? JSON.parse(raw) : [];
  } catch (e) {
    console.error('Failed to parse friends from localStorage:', e);
    return [];
  }
}

function saveFriends(friends) {
  localStorage.setItem('streamshare_friends', JSON.stringify(friends));
}

function renderFriends() {
  const friends = getSavedFriends();
  friendsListEl.innerHTML = '';

  if (friends.length === 0) {
    friendsListEl.innerHTML = '<div class="empty-friends">Noch keine Freunde hinzugefügt. Füge oben einen Freund hinzu!</div>';
    return;
  }

  friends.forEach(friend => {
    const item = document.createElement('div');
    item.className = 'friend-item';

    item.innerHTML = `
      <div class="friend-info">
        <span class="friend-name">${escapeHtml(friend.name)}</span>
        <span class="friend-id">${escapeHtml(friend.id)}</span>
      </div>
      <div class="friend-actions">
        <button class="btn primary-btn btn-small call-friend-btn" data-id="${escapeHtml(friend.id)}">📞 Anrufen</button>
        <button class="btn-danger-icon delete-friend-btn" data-id="${escapeHtml(friend.id)}" title="Löschen">🗑️</button>
      </div>
    `;

    item.querySelector('.call-friend-btn').addEventListener('click', () => {
      connectToPeer(friend.id);
    });

    item.querySelector('.delete-friend-btn').addEventListener('click', () => {
      deleteFriend(friend.id);
    });

    friendsListEl.appendChild(item);
  });
}

function addFriend(name, id) {
  const friends = getSavedFriends();
  const existing = friends.find(f => f.id === id);
  if (existing) {
    alert('Dieser Freund existiert bereits in deiner Liste.');
    return;
  }
  friends.push({ name, id });
  saveFriends(friends);
  renderFriends();
}

function deleteFriend(id) {
  let friends = getSavedFriends();
  friends = friends.filter(f => f.id !== id);
  saveFriends(friends);
  renderFriends();
}

function escapeHtml(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

// --- Group / Room & Direct Connections ---
function connectToPeer(targetId) {
  if (!targetId) return;
  updateStatus(true, 'Verbinde mit ' + targetId + '...');
  const conn = peer.connect(targetId);
  setupDataConnection(conn);
}

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

// Copy ID Button
copyIdBtn.addEventListener('click', () => {
  const idText = myPeerIdEl.textContent;
  if (idText && !idText.includes('Wird generiert')) {
    navigator.clipboard.writeText(idText);
    alert('Raum-Code in die Zwischenablage kopiert!');
  }
});

// Form Submissions & Click Handlers
addFriendForm.addEventListener('submit', (e) => {
  e.preventDefault();
  const name = friendNameInput.value.trim();
  const id = friendIdInput.value.trim();
  if (name && id) {
    addFriend(name, id);
    friendNameInput.value = '';
    friendIdInput.value = '';
  }
});

joinRoomBtn.addEventListener('click', () => {
  const roomName = groupRoomInput.value.trim();
  if (!roomName) {
    alert('Bitte gib einen Raumnamen oder Code ein.');
    return;
  }
  const formattedRoomId = roomName.startsWith('stream-') ? roomName : 'stream-room-' + roomName.toLowerCase().replace(/[^a-z0-9]/g, '-');
  connectToPeer(formattedRoomId);
});

connectBtn.addEventListener('click', () => {
  const remoteId = remoteIdInput.value.trim();
  if (!remoteId) {
    alert('Bitte gib einen gültigen Code deines Freundes ein.');
    return;
  }
  connectToPeer(remoteId);
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

// --- Screen Sharing Logic & High FPS / High Resolution Optimizations ---
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

// Robust getDisplayMedia capture with High Bitrate / Frame Rate Optimizations
async function startScreenShare() {
  const selectedRes = RESOLUTION_MAP[resSelect.value] || RESOLUTION_MAP['1080'];
  const targetFps = parseInt(fpsSelect.value) || 60;

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

    // Set video track contentHint for high frame-rate smoothness
    const videoTrack = desktopStream.getVideoTracks()[0];
    if (videoTrack && 'contentHint' in videoTrack) {
      videoTrack.contentHint = 'motion';
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

    // Apply high bitrate sender parameter optimizations for 60 / 120 FPS
    if (currentCall && currentCall.peerConnection) {
      currentCall.peerConnection.getSenders().forEach(sender => {
        if (sender.track && sender.track.kind === 'video') {
          const params = sender.getParameters();
          if (!params.encodings) {
            params.encodings = [{}];
          }
          params.encodings[0].maxBitrate = 25000000; // 25 Mbps max bitrate for 4K/60/120fps
          params.encodings[0].networkPriority = 'high';
          sender.setParameters(params).catch(e => console.warn('Set sender parameters warning:', e));
        }
      });
    }
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

// Initialization
setupTabs();
renderFriends();
initPeer();
