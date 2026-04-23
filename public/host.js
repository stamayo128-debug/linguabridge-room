const socket = io();

// ─── State ───
let currentRoomCode = '';
let currentHostName = '';
let currentHostLang = 'es';
let isMicOn = false;
let mutedUsers = new Set();
let bestVoices = {};
let isHostMode = true;

// ─── DOM Elements ───
const setupScreen = document.getElementById('setup-screen');
const dashboardContainer = document.getElementById('dashboard-container');
const setupForm = document.getElementById('setup-form');
const transcriptArea = document.getElementById('transcript-area');
const micBtn = document.getElementById('mic-btn');
const micStatus = document.getElementById('mic-status');
const participantsList = document.getElementById('participants-list');
const roomCodeBadge = document.getElementById('room-code-badge');
const participantCountBadge = document.getElementById('participant-count-badge');
const displayRoomCode = document.getElementById('display-room-code');
const hostNameDisplay = document.getElementById('host-name-display');
const setupError = document.getElementById('setup-error');

// ─── Swipe Navigation ───
const swipeWrapper = document.getElementById('swipe-wrapper');
const navPills = document.querySelectorAll('.nav-pill');
let currentPanel = 1;

function goToPanel(index) {
    currentPanel = Math.max(0, Math.min(index, 2));
    swipeWrapper.style.transform = `translateX(-${currentPanel * 33.333}%)`;
    navPills.forEach((pill, i) => pill.classList.toggle('active', i === currentPanel));
}

navPills.forEach((pill, i) => pill.addEventListener('click', () => goToPanel(i)));

// Touch handling
let touchStartX = 0;
swipeWrapper.addEventListener('touchstart', (e) => touchStartX = e.touches[0].clientX, { passive: true });
swipeWrapper.addEventListener('touchend', () => {
    const diff = touchStartX - touchEndX;
    if (Math.abs(diff) > 50) {
        if (diff > 0 && currentPanel < 2) goToPanel(currentPanel + 1);
        else if (diff < 0 && currentPanel > 0) goToPanel(currentPanel - 1);
    }
    touchStartX = 0;
});
let touchEndX = 0;
swipeWrapper.addEventListener('touchmove', (e) => touchEndX = e.touches[0].clientX, { passive: true });

// ─── 3D Sphere ───
const sphere = document.getElementById('sphere');
let particles = [];
const visualizer = document.getElementById('visualizer');
const vizBars = visualizer.querySelectorAll('.viz-bar');

function createParticles() {
    const container = document.getElementById('sphere-particles');
    for (let i = 0; i < 20; i++) {
        const particle = document.createElement('div');
        particle.className = 'particle';
        const angle = (i / 20) * Math.PI * 2;
        const radius = 45 + Math.random() * 10;
        particle.style.left = `${50 + Math.cos(angle) * radius}%`;
        particle.style.top = `${50 + Math.sin(angle) * radius}%`;
        container.appendChild(particle);
        particles.push(particle);
    }
}
createParticles();

let sphereRotation = 0;
let audioData = { avg: 0 };

function animateSphere() {
    sphereRotation += 0.002;
    const scale = 1 + (audioData.avg / 200);
    sphere.style.transform = `rotateY(${sphereRotation * 30}deg) rotateX(${sphereRotation * 15}deg) scale(${scale})`;
    
    particles.forEach((p, i) => {
        const offset = Math.sin(sphereRotation * 2 + i * 0.5) * 5;
        p.style.opacity = 0.3 + (audioData.avg / 300) + Math.abs(offset / 20);
    });
    
    vizBars.forEach((bar, i) => {
        const height = 10 + (audioData.avg * (1 - i * 0.15));
        bar.style.height = `${Math.min(height, 50)}px`;
    });
    
    requestAnimationFrame(animateSphere);
}
animateSphere();

// ─── Speech Recognition ───
let recognition;
const USE_BROWSER_STT = true;

function initBrowserSTT() {
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SpeechRecognition) {
        console.warn("Navegador no soporta reconocimiento de voz.");
        return;
    }

    recognition = new SpeechRecognition();
    recognition.continuous = true;
    recognition.interimResults = true;
    recognition.lang = currentHostLang;

    let interimSpan = null;

    recognition.onresult = (event) => {
        let interimTranscript = '';
        let finalTranscript = '';

        for (let i = event.resultIndex; i < event.results.length; ++i) {
            if (event.results[i].isFinal) finalTranscript += event.results[i][0].transcript;
            else interimTranscript += event.results[i][0].transcript;
        }

        if (finalTranscript) {
            if (interimSpan) interimSpan.remove();
            interimSpan = null;
            socket.emit('translate:text', {
                roomCode: currentRoomCode,
                text: finalTranscript.trim(),
                speakerName: currentHostName,
                speakerLang: currentHostLang
            });
        } else if (interimTranscript) {
            updateInterimUI(interimTranscript);
        }
    };

    recognition.onerror = (err) => {
        if (err.error !== 'no-speech') console.error("STT Error:", err.error);
    };

    recognition.onend = () => {
        if (isMicOn) {
            try { recognition.start(); } catch(e) {}
        }
    };
}

function updateInterimUI(text) {
    const welcome = transcriptArea.querySelector('.welcome-msg');
    if (welcome) welcome.remove();

    let interimSpan = transcriptArea.querySelector('.interim-text');
    if (!interimSpan) {
        interimSpan = document.createElement('div');
        interimSpan.className = 'message self interim-text';
        interimSpan.style.opacity = '0.5';
        transcriptArea.appendChild(interimSpan);
    }
    interimSpan.innerHTML = `<div class="text"><em>${text}</em></div>`;
    transcriptArea.scrollTop = transcriptArea.scrollHeight;
}

// ─── Audio Context ───
let audioContext, analyser, dataArray;

async function initAudio() {
    if (audioContext) return;

    try {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: { noiseSuppression: true, echoCancellation: true } });
        audioContext = new (window.AudioContext || window.webkitAudioContext)();
        analyser = audioContext.createAnalyser();
        analyser.fftSize = 256;
        dataArray = new Uint8Array(analyser.frequencyBinCount);
        const source = audioContext.createMediaStreamSource(stream);
        source.connect(analyser);

        function updateAudioData() {
            if (!analyser) return;
            analyser.getByteFrequencyData(dataArray);
            audioData.avg = dataArray.reduce((a, b) => a + b, 0) / dataArray.length;
            requestAnimationFrame(updateAudioData);
        }
        updateAudioData();

        initBrowserSTT();
    } catch (err) {
        console.error("Error audio:", err);
        micStatus.textContent = "Error: " + err.message;
    }
}

// ─── TTS ───
function loadVoices() {
    const voices = window.speechSynthesis.getVoices();
    const targets = ['es', 'en', 'fr', 'de', 'ja', 'zh', 'ar', 'it', 'pt'];
    targets.forEach(lang => {
        bestVoices[lang] = voices.find(v => v.lang.startsWith(lang) && (v.name.includes('Neural') || v.name.includes('Google')))
                           || voices.find(v => v.lang.startsWith(lang));
    });
}
window.speechSynthesis.onvoiceschanged = loadVoices;
loadVoices();

function speakText(text, lang) {
    const utterance = new SpeechSynthesisUtterance(text);
    if (bestVoices[lang]) utterance.voice = bestVoices[lang];
    utterance.lang = lang;
    utterance.rate = 1.1;
    window.speechSynthesis.speak(utterance);
}

// ─── Create Room ───
setupForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    
    const password = document.getElementById('host-password').value.trim();
    currentHostName = document.getElementById('host-name').value.trim() || 'Presentador';
    currentHostLang = document.getElementById('host-lang').value;
    
    if (!password) {
        setupError.textContent = 'Contraseña requerida';
        return;
    }

    setupError.textContent = 'Creando sala...';
    
    const utterance = new SpeechSynthesisUtterance(" ");
    utterance.volume = 0;
    window.speechSynthesis.speak(utterance);

    await initAudio();
    
    socket.emit('host:create_room', { password });
    
    setTimeout(() => {
        if (!dashboardContainer.classList.contains('hidden')) return;
        setupError.textContent = 'Tiempo agotado. ¿Servidor online?';
    }, 5000);
});

socket.on('host:room_created', (data) => {
    currentRoomCode = data.roomCode;
    
    setupScreen.classList.add('hidden');
    dashboardContainer.classList.remove('hidden');
    
    roomCodeBadge.textContent = `Sala ${currentRoomCode}`;
    displayRoomCode.textContent = currentRoomCode;
    hostNameDisplay.textContent = currentHostName;
    
    // QR Code
    const joinUrl = `${data.publicUrl || window.location.origin}/?room=${currentRoomCode}`;
    new QRCode(document.getElementById('qrcode'), {
        text: joinUrl,
        width: 160,
        height: 160,
        colorDark: "#0f172a",
        colorLight: "#ffffff"
    });
    
    // Share button
    document.getElementById('share-btn').addEventListener('click', () => {
        navigator.clipboard.writeText(joinUrl);
        document.getElementById('share-btn').textContent = '✓ Copiado';
        setTimeout(() => document.getElementById('share-btn').textContent = 'Copiar Enlace', 2000);
    });
    
    // Lang change
    document.getElementById('host-lang').addEventListener('change', (e) => {
        currentHostLang = e.target.value;
        socket.emit('host:change_lang', { roomCode: currentRoomCode, lang: currentHostLang });
        if (recognition) recognition.lang = currentHostLang;
    });
    
    // Mode buttons
    document.getElementById('mode-conf').addEventListener('click', () => {
        socket.emit('host:toggle_mode', { roomCode: currentRoomCode, mode: 'conference' });
        document.getElementById('mode-conf').style.background = 'var(--primary)';
        document.getElementById('mode-meet').style.background = '';
        document.getElementById('mode-conf').style.color = 'white';
        document.getElementById('mode-meet').style.color = 'var(--text-normal)';
    });
    
    document.getElementById('mode-meet').addEventListener('click', () => {
        socket.emit('host:toggle_mode', { roomCode: currentRoomCode, mode: 'meeting' });
        document.getElementById('mode-meet').style.background = 'var(--primary)';
        document.getElementById('mode-conf').style.background = '';
        document.getElementById('mode-meet').style.color = 'white';
        document.getElementById('mode-conf').style.color = 'var(--text-normal)';
    });
    
    // End session
    document.getElementById('end-btn').addEventListener('click', () => {
        if (confirm('¿Terminar sesión?')) {
            socket.emit('host:end_room', { roomCode: currentRoomCode });
            window.location.reload();
        }
    });
    
    // Start mic
    isMicOn = true;
    try { recognition.start(); } catch(e) {}
    updateMicUI();
});

// ─── Mic Control ───
micBtn.addEventListener('click', () => {
    isMicOn = !isMicOn;
    if (isMicOn) try { recognition.start(); } catch(e) {}
    else recognition.stop();
    updateMicUI();
});

function updateMicUI() {
    micBtn.classList.toggle('active', isMicOn);
    micStatus.textContent = isMicOn ? 'Escuchando...' : 'Micrófono apagado';
}

// ─── Participants List ───
socket.on('room:roster_update', (data) => {
    const participants = data.participants;
    participantCountBadge.textContent = `${participants.length} conectados`;
    
    if (participants.length === 0) {
        participantsList.innerHTML = '<div class="welcome-msg">Nadie conectado aún</div>';
        return;
    }
    
    participantsList.innerHTML = '';
    
    const flags = { es:'🇪🇸', en:'🇬🇧', fr:'🇫🇷', de:'🇩🇪', ja:'🇯🇵', zh:'🇨🇳', ar:'🇸🇦', it:'🇮🇹', pt:'🇵🇹' };
    
    participants.forEach(p => {
        const isMuted = mutedUsers.has(p.id);
        const card = document.createElement('div');
        card.className = 'participant-card';
        card.innerHTML = `
            <div class="participant-info">
                <div class="avatar">${p.name.charAt(0).toUpperCase()}</div>
                <div>
                    <div class="participant-name">${p.name}</div>
                    <div class="participant-lang">${flags[p.lang] || '🌐'} ${p.lang.toUpperCase()}</div>
                </div>
            </div>
            <button class="mute-toggle ${isMuted ? 'muted' : 'speaking'}" data-id="${p.id}">
                ${isMuted ? '🔇 Silenciar' : '🎤 Dar voz'}
            </button>
        `;
        
        card.querySelector('.mute-toggle').addEventListener('click', () => {
            const currentlyMuted = mutedUsers.has(p.id);
            if (currentlyMuted) {
                mutedUsers.delete(p.id);
                socket.emit('host:unmute_user', { targetId: p.id });
                card.querySelector('.mute-toggle').className = 'mute-toggle speaking';
                card.querySelector('.mute-toggle').textContent = '🔇 Silenciar';
            } else {
                mutedUsers.add(p.id);
                socket.emit('host:mute_user', { targetId: p.id });
                card.querySelector('.mute-toggle').className = 'mute-toggle muted';
                card.querySelector('.mute-toggle').textContent = '🎤 Dar voz';
            }
        });
        
        participantsList.appendChild(card);
    });
});

// ─── Transcript ───
socket.on('transcript:broadcast', (data) => {
    if (!data.text) return;

    const welcome = transcriptArea.querySelector('.welcome-msg');
    if (welcome) welcome.remove();

    const msgDiv = document.createElement('div');
    msgDiv.className = `message ${data.isMe ? 'self' : ''}`;
    msgDiv.innerHTML = `
        <div class="sender">${data.senderName}</div>
        <div class="text">${data.text}</div>
    `;
    transcriptArea.appendChild(msgDiv);
    transcriptArea.scrollTop = transcriptArea.scrollHeight;

    // TTS for others' messages
    if (!data.isMe) {
        speakText(data.text, currentHostLang);
    }
});

// ─── Error Handling ───
socket.on('error', (msg) => {
    setupError.textContent = msg;
});

socket.on('room:closed', () => {
    window.location.reload();
});