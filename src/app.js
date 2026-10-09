let peer = null;
let dataConn = null;
let currentCall = null;
let localStream = null;
let micStream = null;
let isMicMuted = false;
let isDeafened = false;
let connectedPeerId = null;

// DOM Elements
const myPeerIdEl = document.getElementById('my-peer-id');
const copyIdBtn = document.getElementById('copy-id-btn');
const customIdInput = document.getElementById('custom-id-input');
const setCustomIdBtn = document.getElementById('set-custom-id-btn');
const remoteIdInput = document.getElementById('remote-id-input');
const connectBtn = document.getElementById('connect-btn');
const addFriendBtn = document.getElementById('add-friend-btn');
const friendsListEl = document.getElementById('friends-list');
const connectionStatus = document.getElementById('connection-status');

const resSelect = document.getElementById('res-select');
const fpsSelect = document.getElementById('fps-select');
const startShareBtn = document.getElementById('start-share-btn');
const stopShareBtn = document.getElementById('stop-share-btn');
const toggleMicBtn = document.getElementById('toggle-mic-btn');
const toggleDeafenBtn = document.getElementById('toggle-deafen-btn');
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

// Friends Storage Logic
function getSavedFriends() {
  try {
    const data = localStorage.getItem('streamshare_friends');
    return data ? JSON.parse(data) : [];
  } catch (e) {
    return [];
  }
}

function saveFriends(friends) {
  try {
    localStorage.setItem('streamshare_friends', JSON.stringify(friends));
  } catch (e) {
    console.error('Failed to save friends:', e);
  }
}

function renderFriendsList() {
  const friends = getSavedFriends();
  friendsListEl.innerHTML = '';

  if (friends.length === 0) {
    friendsListEl.innerHTML = '<p class="empty-text">Noch keine Freunde gespeichert.</p>';
    return;
  }

  friends.forEach((friendId) => {
    const item = document.createElement('div');
    item.className = 'friend-item';

    const nameSpan = document.createElement('span');
    nameSpan.className = 'friend-name';
    nameSpan.textContent = friendId;
    nameSpan.title = friendId;

    const actionsDiv = document.createElement('div');
    actionsDiv.className = 'friend-actions';

    const connectFriendBtn = document.createElement('button');
    connectFriendBtn.className = 'btn primary-btn btn-sm';
    connectFriendBtn.textContent = 'Verbinden';
    connectFriendBtn.addEventListener('click', () => {
      remoteIdInput.value = friendId;
      connectToPeer(friendId);
    });

    const deleteFriendBtn = document.createElement('button');
    deleteFriendBtn.className = 'btn danger-btn btn-sm';
    deleteFriendBtn.textContent = '🗑️';
    deleteFriendBtn.title = 'Freund entfernen';
    deleteFriendBtn.addEventListener('click', () => {
      removeFriend(friendId);
    });

    actionsDiv.appendChild(connectFriendBtn);
    actionsDiv.appendChild(deleteFriendBtn);
    item.appendChild(nameSpan);
    item.appendChild(actionsDiv);
    friendsListEl.appendChild(item);
  });
}

function addFriend(friendId) {
  if (!friendId) return;
  const friends = getSavedFriends();
  if (!friends.includes(friendId)) {
    friends.push(friendId);
    saveFriends(friends);
    renderFriendsList();
  }
}

function removeFriend(friendId) {
  let friends = getSavedFriends();
  friends = friends.filter(id => id !== friendId);
  saveFriends(friends);
  renderFriendsList();
}

// Initialize PeerJS Connection
function initPeer(customId = null) {
  if (peer) {
    peer.destroy();
  }

  const savedCustomId = localStorage.getItem('streamshare_custom_id');
  const peerIdToUse = customId || savedCustomId || ('stream-' + Math.floor(100000 + Math.random() * 900000));

  peer = new Peer(peerIdToUse, {
    debug: 2,
    config: {
      iceServers: ICE_SERVERS,
      sdpSemantics: 'unified-plan'
    }
  });

  peer.on('open', (id) => {
    myPeerIdEl.textContent = id;
    if (customId) {
      localStorage.setItem('streamshare_custom_id', customId);
    }
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
    } else if (err.type === 'unavailable-id') {
      alert('Diese Eigene ID ist bereits vergeben. Bitte wähle einen anderen Namen.');
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

function connectToPeer(remoteId) {
  if (!remoteId) {
    alert('Bitte gib einen gültigen Code deines Freundes ein.');
    return;
  }

  updateStatus(true, 'Verbinde...');
  const conn = peer.connect(remoteId);
  setupDataConnection(conn);
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

setCustomIdBtn.addEventListener('click', () => {
  const customId = customIdInput.value.trim();
  if (customId) {
    initPeer(customId);
    customIdInput.value = '';
  } else {
    alert('Bitte gib eine gültige Raum-ID ein.');
  }
});

connectBtn.addEventListener('click', () => {
  const remoteId = remoteIdInput.value.trim();
  connectToPeer(remoteId);
});

addFriendBtn.addEventListener('click', () => {
  const friendId = remoteIdInput.value.trim();
  if (friendId) {
    addFriend(friendId);
    alert(`Freund "${friendId}" gespeichert!`);
  } else {
    alert('Bitte gib erst den Code deines Freundes ein.');
  }
});

function displayRemoteStream(stream, isLocal = false) {
  remoteVideo.srcObject = stream;
  remoteVideo.muted = isLocal || isDeafened;
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

toggleDeafenBtn.addEventListener('click', () => {
  isDeafened = !isDeafened;
  if (remoteVideo.srcObject) {
    remoteVideo.muted = isDeafened;
  }
  toggleDeafenBtn.textContent = isDeafened ? '🎧 Ton: Stumm' : '🎧 Ton: An';
  toggleDeafenBtn.className = isDeafened ? 'btn danger-btn' : 'btn secondary-btn';
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

// Initialize App
renderFriendsList();
initPeer();
