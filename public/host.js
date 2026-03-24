const socket = io();

// UI Elements
const setupScreen = document.getElementById('setup-screen');
const dashScreen = document.getElementById('dashboard-screen');
const apiKeyInput = document.getElementById('api-key');
const createBtn = document.getElementById('create-btn');
const endBtn = document.getElementById('end-btn');
const setupError = document.getElementById('setup-error');
const displayRoomCode = document.getElementById('host-room-code');
const participantList = document.getElementById('participant-list');
const participantCount = document.getElementById('participant-count');

const modeConf = document.getElementById('mode-conf');
const modeMeet = document.getElementById('mode-meet');

const storedKey = localStorage.getItem('groq_api_key');
if (storedKey) apiKeyInput.value = storedKey;

let currentRoomCode = null;

createBtn.addEventListener('click', () => {
    const apiKey = apiKeyInput.value.trim();
    if (!apiKey) { setupError.textContent = "API Key is required."; return; }
    localStorage.setItem('groq_api_key', apiKey);
    setupError.textContent = "Starting room...";
    socket.emit('host:create_room', { apiKey });
});

socket.on('host:room_created', (data) => {
    currentRoomCode = data.roomCode;
    setupScreen.classList.add('hidden');
    dashScreen.classList.remove('hidden');
    displayRoomCode.textContent = currentRoomCode;

    const joinUrl = `${window.location.origin}/?room=${currentRoomCode}`;
    const qrContainer = document.getElementById('qrcode');
    qrContainer.innerHTML = ''; 
    new QRCode(qrContainer, {
        text: joinUrl, width: 200, height: 200,
        colorDark : "#0f172a", colorLight : "#ffffff", correctLevel : QRCode.CorrectLevel.H
    });

    // Share Button Logic
    const shareBtn = document.getElementById('share-btn');
    if (shareBtn) {
        shareBtn.addEventListener('click', async () => {
            if (navigator.share) {
                try {
                    await navigator.share({
                        title: 'LinguaBridge Room',
                        text: `Join my real-time translation room. Code: ${currentRoomCode}`,
                        url: joinUrl
                    });
                } catch (err) {
                    console.error('Error sharing', err);
                }
            } else {
                // Fallback for desktop/unsupported browsers
                await navigator.clipboard.writeText(joinUrl);
                alert("Link copied to clipboard!");
            }
        });
    }
});

socket.on('error', (msg) => { setupError.textContent = msg; });

socket.on('room:roster_update', (data) => {
    const participants = data.participants;
    participantCount.textContent = participants.length;
    participantList.innerHTML = '';
    
    // Check current broad mode to know the default state
    const isConfMode = modeConf.classList.contains('active');
    
    if (participants.length === 0) {
        participantList.innerHTML = '<li class="empty-state">No one has joined yet.</li>';
        return;
    }
    
    participants.forEach(p => {
        const li = document.createElement('li');
        li.style.display = "flex";
        li.style.justifyContent = "space-between";
        li.style.alignItems = "center";
        
        const muteBtnTxt = isConfMode ? "Unmute" : "Mute";
        const muteState = isConfMode ? "muted" : "speaking";
        
        li.innerHTML = `
            <div style="display:flex; align-items:center; gap:0.5rem;">
                <strong>${p.name}</strong>
                <span class="lang-badge">${p.lang.toUpperCase()}</span>
            </div>
            <button class="btn small action-btn" data-id="${p.id}" data-state="${muteState}" style="background:var(--glass-bg); color:var(--text-main); border:1px solid var(--glass-border);">
                ${muteBtnTxt}
            </button>
        `;
        
        const btn = li.querySelector('.action-btn');
        btn.addEventListener('click', () => {
            const currentState = btn.getAttribute('data-state');
            if (currentState === "muted") {
                socket.emit('host:unmute_user', { targetId: p.id });
                btn.textContent = "Mute";
                btn.setAttribute('data-state', "speaking");
                btn.style.color = "var(--danger)";
            } else {
                socket.emit('host:mute_user', { targetId: p.id });
                btn.textContent = "Unmute";
                btn.setAttribute('data-state', "muted");
                btn.style.color = "var(--text-main)";
            }
        });
        
        participantList.appendChild(li);
    });
});

// Mode controls
modeConf.addEventListener('click', () => {
    modeConf.classList.add('active');
    modeConf.style.background = 'var(--primary)';
    modeMeet.classList.remove('active');
    modeMeet.style.background = 'var(--glass-bg)';
    socket.emit('host:set_mode', { roomCode: currentRoomCode, mode: 'conference' });
});

modeMeet.addEventListener('click', () => {
    modeMeet.classList.add('active');
    modeMeet.style.background = 'var(--primary)';
    modeConf.classList.remove('active');
    modeConf.style.background = 'var(--glass-bg)';
    socket.emit('host:set_mode', { roomCode: currentRoomCode, mode: 'meeting' });
});

endBtn.addEventListener('click', () => {
    if (confirm("Are you sure you want to end this session?")) window.location.reload(); 
});
