/**
 * StreamShare - Core Application Logic
 * Supports:
 * - Persistent Peer IDs across app restarts
 * - Friend List saved in localStorage
 * - Automatic Bidirectional Voice Calling
 * - Screen Sharing with 720p, 1080p, 1440p, 4K & up to 144 FPS
 * - WebRTC SDP Bitrate Uncapping for crystal clear high-FPS streaming
 */

let peer = null;
let dataConn = null;
let screenCall = null;
let voiceCall = null;

let localScreenStream = null;
let localMicStream = null;
let isMicMuted = false;
let isDeafened = false;
let connectedPeerId = null;

// Storage Keys
const STORAGE_MY_ID = 'streamshare_my_id';
const STORAGE_FRIENDS = 'streamshare_friends';

// DOM Elements
const myPeerIdEl = document.getElementById('my-peer-id');
const copyIdBtn = document.getElementById('copy-id-btn');
const remoteIdInput = document.getElementById('remote-id-input');
const connectBtn = document.getElementById('connect-btn');
const disconnectBtn = document.getElementById('disconnect-btn');
const connectionStatus = document.getElementById('connection-status');

// Friends DOM
const showAddFriendBtn = document.getElementById('show-add-friend-btn');
const addFriendForm = document.getElementById('add-friend-form');
const friendNameInput = document.getElementById('friend-name-input');
const friendCodeInput = document.getElementById('friend-code-input');
const saveFriendBtn = document.getElementById('save-friend-btn');
const cancelFriendBtn = document.getElementById('cancel-friend-btn');
const friendsListEl = document.getElementById('friends-list');

// Stream & Quality DOM
const resSelect = document.getElementById('res-select');
const fpsSelect = document.getElementById('fps-select');
const startShareBtn = document.getElementById('start-share-btn');
const stopShareBtn = document.getElementById('stop-share-btn');
const toggleMicBtn = document.getElementById('toggle-mic-btn');
const toggleDeafenBtn = document.getElementById('toggle-deafen-btn');
const volumeRange = document.getElementById('volume-range');

// Video Player DOM
const remoteVideo = document.getElementById('remote-video');
const remoteAudio = document.getElementById('remote-audio');
const videoPlaceholder = document.getElementById('video-placeholder');
const statsOverlay = document.getElementById('stats-overlay');
const statType = document.getElementById('stat-type');
const statRes = document.getElementById('stat-res');
const statFps = document.getElementById('stat-fps');
const statBitrate = document.getElementById('stat-bitrate');
const fullscreenBtn = document.getElementById('fullscreen-btn');

// Source Modal DOM
const sourceModal = document.getElementById('source-modal');
const sourceList = document.getElementById('source-list');
const closeModalBtn = document.getElementById('close-modal-btn');
const closeModalX = document.getElementById('close-modal-x');

// Resolution Map
const RESOLUTION_MAP = {
  '720': { width: 1280, height: 720 },
  '1080': { width: 1920, height: 1080 },
  '1440': { width: 2560, height: 1440 },
  '2160': { width: 3840, height: 2160 },
  'source': { width: 3840, height: 2160 }
};

// Expanded ICE / STUN / TURN Configuration for Cross-Network Traversal
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

// SDP Tuning function to remove Discord-like bitrate caps (up to 30 Mbps for 4K / 120 FPS)
function boostWebRtcBitrate(peerConnection) {
  if (!peerConnection) return;
  const originalSetLocalDescription = peerConnection.setLocalDescription.bind(peerConnection);
  peerConnection.setLocalDescription = async function(description) {
    if (description && description.sdp) {
      let sdp = description.sdp;
      // Modify b=AS / b=TIAS if video is present
      if (sdp.includes('m=video')) {
        sdp = sdp.replace(/b=AS:\d+/g, 'b=AS:35000');
        sdp = sdp.replace(/b=TIAS:\d+/g, 'b=TIAS:35000000');
        description.sdp = sdp;
      }
    }
    return originalSetLocalDescription(description);
  };
}

// ============================
// FRIEND LIST MANAGEMENT
// ============================
function getSavedFriends() {
  try {
    const raw = localStorage.getItem(STORAGE_FRIENDS);
    return raw ? JSON.parse(raw) : [];
  } catch (e) {
    return [];
  }
}

function saveFriends(friends) {
  try {
    localStorage.setItem(STORAGE_FRIENDS, JSON.stringify(friends));
  } catch (e) {
    console.error('Failed to save friends:', e);
  }
  renderFriends();
}

function renderFriends() {
  const friends = getSavedFriends();
  friendsListEl.innerHTML = '';

  if (friends.length === 0) {
    friendsListEl.innerHTML = '<div class="empty-state">Noch keine Freunde gespeichert.<br>Klicke oben auf "+ Freund".</div>';
    return;
  }

  friends.forEach((friend, idx) => {
    const item = document.createElement('div');
    item.className = 'friend-item';

    const details = document.createElement('div');
    details.className = 'friend-details';

    const name = document.createElement('span');
    name.className = 'friend-name';
    name.textContent = friend.name;

    const id = document.createElement('span');
    id.className = 'friend-id';
    id.textContent = friend.code;

    details.appendChild(name);
    details.appendChild(id);

    const actions = document.createElement('div');
    actions.className = 'friend-actions';

    const callBtn = document.createElement('button');
    callBtn.className = 'btn-sm primary-btn';
    callBtn.title = 'Anrufen / Verbinden';
    callBtn.textContent = '📞 Call';
    callBtn.onclick = () => {
      remoteIdInput.value = friend.code;
      connectToPeer(friend.code);
    };

    const deleteBtn = document.createElement('button');
    deleteBtn.className = 'btn-sm secondary-btn';
    deleteBtn.title = 'Freund entfernen';
    deleteBtn.textContent = '✖';
    deleteBtn.onclick = () => {
      const current = getSavedFriends();
      current.splice(idx, 1);
      saveFriends(current);
    };

    actions.appendChild(callBtn);
    actions.appendChild(deleteBtn);

    item.appendChild(details);
    item.appendChild(actions);
    friendsListEl.appendChild(item);
  });
}

// Show/Hide Add Friend Form
showAddFriendBtn.addEventListener('click', () => {
  addFriendForm.classList.toggle('hidden');
  friendNameInput.focus();
});

cancelFriendBtn.addEventListener('click', () => {
  addFriendForm.classList.add('hidden');
  friendNameInput.value = '';
  friendCodeInput.value = '';
});

saveFriendBtn.addEventListener('click', () => {
  const name = friendNameInput.value.trim();
  const code = friendCodeInput.value.trim();

  if (!name || !code) {
    alert('Bitte Name und Code eingeben!');
    return;
  }

  const friends = getSavedFriends();
  friends.push({ name, code });
  saveFriends(friends);

  friendNameInput.value = '';
  friendCodeInput.value = '';
  addFriendForm.classList.add('hidden');
});

// ============================
// PEERJS & CONNECTION SETUP
// ============================
function getOrCreateMyId() {
  let myId = localStorage.getItem(STORAGE_MY_ID);
  if (!myId) {
    myId = 'user-' + Math.floor(1000 + Math.random() * 9000);
    localStorage.setItem(STORAGE_MY_ID, myId);
  }
  return myId;
}

async function ensureLocalMic() {
  if (!localMicStream) {
    try {
      localMicStream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true
        },
        video: false
      });
      // Apply initial mute state
      localMicStream.getAudioTracks().forEach(track => {
        track.enabled = !isMicMuted;
      });
    } catch (err) {
      console.warn('Mikrofon konnte nicht aktiviert werden:', err);
    }
  }
  return localMicStream;
}

function initPeer() {
  const myId = getOrCreateMyId();

  peer = new Peer(myId, {
    debug: 1,
    config: {
      iceServers: ICE_SERVERS,
      sdpSemantics: 'unified-plan'
    }
  });

  peer.on('open', (id) => {
    myPeerIdEl.textContent = id;
    updateStatus(false, 'Bereit • Eigener Code: ' + id);
  });

  // Handle incoming data connection
  peer.on('connection', (conn) => {
    setupDataConnection(conn);
  });

  // Handle incoming media call (voice or screen)
  peer.on('call', async (call) => {
    const isScreen = call.metadata && call.metadata.type === 'screen';

    if (isScreen) {
      screenCall = call;
      call.answer(); // Receiving remote screen share
      setupScreenCallHandlers(call);
    } else {
      // Voice Call
      voiceCall = call;
      await ensureLocalMic();
      call.answer(localMicStream || createEmptyAudioStream());
      setupVoiceCallHandlers(call);
    }
  });

  peer.on('error', (err) => {
    console.error('PeerJS Error:', err);
    if (err.type === 'peer-unavailable') {
      alert('Code nicht gefunden! Stelle sicher, dass dein Freund die App geöffnet hat.');
    } else if (err.type === 'unavailable-id') {
      // Regenerate ID if conflict occurs
      const newId = 'user-' + Math.floor(1000 + Math.random() * 9000);
      localStorage.setItem(STORAGE_MY_ID, newId);
      location.reload();
    }
    updateStatus(false, 'Fehler: ' + err.type);
  });
}

function setupDataConnection(conn) {
  dataConn = conn;
  connectedPeerId = conn.peer;

  conn.on('open', async () => {
    updateStatus(true, 'Verbunden mit ' + conn.peer);
    disconnectBtn.classList.remove('hidden');
    connectBtn.classList.add('hidden');

    // Automatically establish voice call on connection
    startVoiceCall(conn.peer);
  });

  conn.on('data', (data) => {
    if (data.type === 'START_SHARE') {
      statType.textContent = 'Partner';
      statRes.textContent = `${data.res}p`;
      statFps.textContent = `${data.fps} FPS`;
      statBitrate.textContent = 'High-Bitrate P2P';
    } else if (data.type === 'STOP_SHARE') {
      resetVideoDisplay();
    }
  });

  conn.on('close', () => {
    handleDisconnect();
  });

  conn.on('error', (err) => {
    console.error('Data Connection Error:', err);
    handleDisconnect();
  });
}

async function startVoiceCall(targetPeerId) {
  if (voiceCall) return; // Already in voice call

  await ensureLocalMic();
  const streamToSend = localMicStream || createEmptyAudioStream();
  voiceCall = peer.call(targetPeerId, streamToSend, {
    metadata: { type: 'voice' }
  });
  if (voiceCall) {
    setupVoiceCallHandlers(voiceCall);
  }
}

function setupVoiceCallHandlers(call) {
  if (call.peerConnection) {
    boostWebRtcBitrate(call.peerConnection);
  }

  call.on('stream', (remoteStream) => {
    remoteAudio.srcObject = remoteStream;
    remoteAudio.muted = isDeafened;
    remoteAudio.play().catch(e => console.warn('Audio Autoplay handled:', e));
  });

  call.on('close', () => {
    remoteAudio.srcObject = null;
    voiceCall = null;
  });

  call.on('error', (err) => {
    console.error('Voice Call Error:', err);
  });
}

function setupScreenCallHandlers(call) {
  if (call.peerConnection) {
    boostWebRtcBitrate(call.peerConnection);

    call.peerConnection.oniceconnectionstatechange = () => {
      const state = call.peerConnection.iceConnectionState;
      console.log('Screen ICE state:', state);
      if (state === 'connected' || state === 'completed') {
        updateStatus(true, 'Verbunden (Stream Aktiv)');
      }
    };
  }

  call.on('stream', (remoteStream) => {
    displayRemoteStream(remoteStream, false);
  });

  call.on('close', () => {
    resetVideoDisplay();
    screenCall = null;
  });

  call.on('error', (err) => {
    console.error('Screen Call Error:', err);
  });
}

function createEmptyAudioStream() {
  try {
    const ctx = new (window.AudioContext || window.webkitAudioContext)();
    const osc = ctx.createOscillator();
    const dst = osc.connect(ctx.createMediaStreamDestination());
    osc.start();
    const track = dst.stream.getAudioTracks()[0];
    track.enabled = false;
    return new MediaStream([track]);
  } catch (e) {
    return new MediaStream();
  }
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
    alert('Bitte gib den Code deines Freundes ein.');
    return;
  }
  if (remoteId === peer.id) {
    alert('Du kannst dich nicht mit deinem eigenen Code verbinden!');
    return;
  }

  updateStatus(true, 'Verbinde mit ' + remoteId + '...');
  const conn = peer.connect(remoteId);
  setupDataConnection(conn);
}

connectBtn.addEventListener('click', () => {
  const remoteId = remoteIdInput.value.trim();
  connectToPeer(remoteId);
});

disconnectBtn.addEventListener('click', () => {
  handleDisconnect(true);
});

function handleDisconnect(initiatedLocally = false) {
  if (screenCall) {
    screenCall.close();
    screenCall = null;
  }
  if (voiceCall) {
    voiceCall.close();
    voiceCall = null;
  }
  if (dataConn) {
    if (initiatedLocally) dataConn.close();
    dataConn = null;
  }

  connectedPeerId = null;
  resetVideoDisplay();
  remoteAudio.srcObject = null;

  connectBtn.classList.remove('hidden');
  disconnectBtn.classList.add('hidden');
  updateStatus(false, 'Getrennt');
}

copyIdBtn.addEventListener('click', () => {
  const idText = myPeerIdEl.textContent;
  if (idText && !idText.includes('Wird geladen')) {
    navigator.clipboard.writeText(idText);
    copyIdBtn.textContent = '✅';
    setTimeout(() => { copyIdBtn.textContent = '📋'; }, 2000);
  }
});

// ============================
// DISPLAY & SCREEN SHARE LOGIC
// ============================
function displayRemoteStream(stream, isLocal = false) {
  remoteVideo.srcObject = stream;
  remoteVideo.muted = isLocal; // Mute locally to avoid feedback
  videoPlaceholder.classList.add('hidden');
  statsOverlay.classList.remove('hidden');

  statType.textContent = isLocal ? 'Du überträgst' : 'Partner Stream';
  statRes.textContent = `${resSelect.value === 'source' ? 'Native' : resSelect.value + 'p'}`;
  statFps.textContent = `${fpsSelect.value} FPS`;
  statBitrate.textContent = '60/120 FPS P2P';

  remoteVideo.play().catch(err => {
    console.warn('Autoplay fallback to muted:', err);
    remoteVideo.muted = true;
    remoteVideo.play().catch(e => console.error('Play error:', e));
  });
}

function resetVideoDisplay() {
  remoteVideo.srcObject = null;
  videoPlaceholder.classList.remove('hidden');
  statsOverlay.classList.add('hidden');
}

// Open window/screen picker modal
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

closeModalX.addEventListener('click', () => {
  sourceModal.classList.add('hidden');
});

async function startScreenShare() {
  const chosenRes = resSelect.value;
  const targetFps = parseInt(fpsSelect.value) || 60;

  const videoConstraints = {
    frameRate: { ideal: targetFps, max: targetFps }
  };

  if (chosenRes !== 'source' && RESOLUTION_MAP[chosenRes]) {
    videoConstraints.width = { ideal: RESOLUTION_MAP[chosenRes].width, max: RESOLUTION_MAP[chosenRes].width };
    videoConstraints.height = { ideal: RESOLUTION_MAP[chosenRes].height, max: RESOLUTION_MAP[chosenRes].height };
  }

  try {
    let desktopStream;
    try {
      // Attempt screen share with system audio
      desktopStream = await navigator.mediaDevices.getDisplayMedia({
        video: videoConstraints,
        audio: true
      });
    } catch (audioErr) {
      console.warn('Audio capture unavailable, falling back to video-only:', audioErr);
      desktopStream = await navigator.mediaDevices.getDisplayMedia({
        video: videoConstraints,
        audio: false
      });
    }

    // Hint browser to optimize for motion and text sharpness
    const videoTrack = desktopStream.getVideoTracks()[0];
    if (videoTrack && 'contentHint' in videoTrack) {
      videoTrack.contentHint = 'detail';
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
  localScreenStream = stream;
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

    screenCall = peer.call(targetPeer, stream, {
      metadata: { type: 'screen' }
    });
    setupScreenCallHandlers(screenCall);
  }

  stream.getVideoTracks()[0].onended = () => {
    stopScreenShare();
  };
}

stopShareBtn.addEventListener('click', stopScreenShare);

function stopScreenShare() {
  if (localScreenStream) {
    localScreenStream.getTracks().forEach(track => track.stop());
    localScreenStream = null;
  }

  if (screenCall) {
    screenCall.close();
    screenCall = null;
  }

  if (dataConn && dataConn.open) {
    dataConn.send({ type: 'STOP_SHARE' });
  }

  resetVideoDisplay();
  startShareBtn.classList.remove('hidden');
  stopShareBtn.classList.add('hidden');
}

// ============================
// AUDIO & VOICE CONTROLS
// ============================
toggleMicBtn.addEventListener('click', async () => {
  await ensureLocalMic();
  if (localMicStream) {
    isMicMuted = !isMicMuted;
    localMicStream.getAudioTracks().forEach(track => {
      track.enabled = !isMicMuted;
    });

    const iconSpan = toggleMicBtn.querySelector('.icon');
    const textSpan = toggleMicBtn.querySelector('.btn-text');

    if (isMicMuted) {
      iconSpan.textContent = '🔇';
      textSpan.textContent = 'Mikro: Stumm';
      toggleMicBtn.classList.add('active-off');
    } else {
      iconSpan.textContent = '🎙️';
      textSpan.textContent = 'Mikro: An';
      toggleMicBtn.classList.remove('active-off');
    }
  }
});

toggleDeafenBtn.addEventListener('click', () => {
  isDeafened = !isDeafened;
  remoteAudio.muted = isDeafened;
  remoteVideo.muted = isDeafened;

  const iconSpan = toggleDeafenBtn.querySelector('.icon');
  const textSpan = toggleDeafenBtn.querySelector('.btn-text');

  if (isDeafened) {
    iconSpan.textContent = '🔇';
    textSpan.textContent = 'Audio: Stumm';
    toggleDeafenBtn.classList.add('active-off');
  } else {
    iconSpan.textContent = '🔊';
    textSpan.textContent = 'Audio: An';
    toggleDeafenBtn.classList.remove('active-off');
  }
});

volumeRange.addEventListener('input', (e) => {
  const vol = e.target.value / 100;
  remoteAudio.volume = vol;
  remoteVideo.volume = vol;
});

// Fullscreen
fullscreenBtn.addEventListener('click', toggleFullscreen);

document.addEventListener('keydown', (e) => {
  if (e.key === 'f' || e.key === 'F') {
    // Only if not in an input field
    if (document.activeElement.tagName !== 'INPUT') {
      toggleFullscreen();
    }
  }
});

function toggleFullscreen() {
  const container = document.getElementById('video-wrapper');
  if (!document.fullscreenElement) {
    if (container.requestFullscreen) {
      container.requestFullscreen();
    }
  } else {
    document.exitFullscreen();
  }
}

// Initialise App
renderFriends();
initPeer();
