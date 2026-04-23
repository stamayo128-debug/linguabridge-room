const socket = io();

// ─── State ───
let currentRoomCode = '';
let currentHostName = '';
let currentHostLang = 'es';
let isMicOn = false;
let mutedUsers = new Set();
let bestVoices = {};
let transcriptMessages = [];

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
let touchStartX = 0, touchEndX = 0;

function goToPanel(index) {
    currentPanel = Math.max(0, Math.min(index, 2));
    swipeWrapper.style.transform = `translateX(-${currentPanel * 33.333}%)`;
    navPills.forEach((pill, i) => pill.classList.toggle('active', i === currentPanel));
}

navPills.forEach((pill, i) => pill.addEventListener('click', () => goToPanel(i)));

swipeWrapper.addEventListener('touchstart', (e) => touchStartX = e.touches[0].clientX, { passive: true });
swipeWrapper.addEventListener('touchmove', (e) => touchEndX = e.touches[0].clientX, { passive: true });
swipeWrapper.addEventListener('touchend', () => {
    const diff = touchStartX - touchEndX;
    if (Math.abs(diff) > 50) {
        if (diff > 0 && currentPanel < 2) goToPanel(currentPanel + 1);
        else if (diff < 0 && currentPanel > 0) goToPanel(currentPanel - 1);
    }
    touchStartX = 0;
    touchEndX = 0;
});

// ─── 3D Sphere ───
const sphere = document.getElementById('sphere');
const sphereContainer = document.querySelector('.sphere-container');
const visualizer = document.getElementById('visualizer');
const vizBars = visualizer.querySelectorAll('.viz-bar');
let particles = [];
let sphereRotation = 0;
let targetScale = 1;
let currentScale = 1;
let audioData = { avg: 0 };

function createParticles() {
    const container = document.getElementById('sphere-particles');
    for (let i = 0; i < 30; i++) {
        const particle = document.createElement('div');
        particle.className = 'particle';
        const angle = (i / 30) * Math.PI * 2;
        const radius = 40 + Math.random() * 15;
        particle.style.left = `${50 + Math.cos(angle) * radius}%`;
        particle.style.top = `${50 + Math.sin(angle) * radius}%`;
        particle.style.animationDelay = `${Math.random() * 2}s`;
        container.appendChild(particle);
        particles.push(particle);
    }
}
createParticles();

function animateSphere() {
    sphereRotation += 0.003;
    currentScale += (targetScale - currentScale) * 0.1;
    
    const rotY = sphereRotation * 25;
    const rotX = Math.sin(sphereRotation * 0.5) * 10;
    sphere.style.transform = `rotateY(${rotY}deg) rotateX(${rotX}deg) scale(${currentScale})`;
    
    particles.forEach((p, i) => {
        const offset = Math.sin(sphereRotation * 1.5 + i * 0.3) * 8;
        const pulse = 0.3 + (audioData.avg / 250);
        p.style.opacity = Math.min(pulse + Math.abs(offset / 30), 1);
        p.style.transform = `translateY(${offset}px)`;
    });
    
    vizBars.forEach((bar, i) => {
        const baseHeight = 10 + (audioData.avg * (1 - i * 0.12));
        bar.style.height = `${Math.min(baseHeight + Math.random() * 5, 50)}px`;
    });
    
    if (sphereContainer) {
        const glowIntensity = Math.min(audioData.avg / 100, 1);
        sphereContainer.style.filter = `drop-shadow(0 0 ${20 + glowIntensity * 30}px rgba(16, 185, 129, ${glowIntensity * 0.5}))`;
    }
    
    requestAnimationFrame(animateSphere);
}
animateSphere();

// ─── Speech Recognition ───
let recognition = null;
const SpeechRecognitionAPI = window.SpeechRecognition || window.webkitSpeechRecognition;

function initBrowserSTT() {
    if (!SpeechRecognitionAPI) {
        console.warn("Navegador no soporta reconocimiento de voz.");
        micStatus.textContent = "STT no disponible";
        return false;
    }

    recognition = new SpeechRecognition();
    recognition.continuous = true;
    recognition.interimResults = true;
    recognition.lang = currentHostLang;
    recognition.maxAlternatives = 1;

    let lastFinalTranscript = '';

    recognition.onresult = (event) => {
        let finalTranscript = '';
        let interimTranscript = '';

        for (let i = event.resultIndex; i < event.results.length; ++i) {
            const result = event.results[i];
            if (result.isFinal) {
                finalTranscript += result[0].transcript;
            } else {
                interimTranscript += result[0].transcript;
            }
        }

        if (finalTranscript.trim()) {
            const cleanedText = finalTranscript.trim();
            if (cleanedText !== lastFinalTranscript && cleanedText.length > 0) {
                lastFinalTranscript = cleanedText;
                console.log("🎤 Host transcription:", cleanedText);
                
                const interim = transcriptArea.querySelector('.interim-text');
                if (interim) interim.remove();
                
                socket.emit('translate:text', {
                    roomCode: currentRoomCode,
                    text: cleanedText,
                    speakerName: currentHostName,
                    speakerLang: currentHostLang
                });
            }
        } else if (interimTranscript.trim()) {
            updateInterimUI(interimTranscript.trim());
        }
    };

    recognition.onerror = (event) => {
        if (event.error !== 'no-speech') console.error("STT Error:", event.error);
    };

    recognition.onend = () => {
        if (isMicOn && recognition) {
            try { recognition.start(); } catch(e) {}
        }
    };

    return true;
}

function updateInterimUI(text) {
    const welcome = transcriptArea.querySelector('.welcome-msg');
    if (welcome) welcome.remove();

    let interimSpan = transcriptArea.querySelector('.interim-text');
    if (!interimSpan) {
        interimSpan = document.createElement('div');
        interimSpan.className = 'message interim-text';
        transcriptArea.appendChild(interimSpan);
    }
    interimSpan.innerHTML = `<div class="text" style="opacity: 0.6; font-style: italic;">${text}...</div>`;
    transcriptArea.scrollTop = transcriptArea.scrollHeight;
}

// ─── Audio Context ───
let audioContext, analyser, dataArray, micStream;

async function initAudio() {
    if (audioContext) return;

    try {
        micStream = await navigator.mediaDevices.getUserMedia({ 
            audio: { 
                noiseSuppression: true, 
                echoCancellation: true,
                autoGainControl: true
            } 
        });
        
        audioContext = new (window.AudioContext || window.webkitAudioContext)();
        analyser = audioContext.createAnalyser();
        analyser.fftSize = 512;
        analyser.smoothingTimeConstant = 0.8;
        dataArray = new Uint8Array(analyser.frequencyBinCount);
        
        const source = audioContext.createMediaStreamSource(micStream);
        source.connect(analyser);

        function updateAudioData() {
            if (!analyser) return;
            analyser.getByteFrequencyData(dataArray);
            audioData.avg = dataArray.reduce((a, b) => a + b, 0) / dataArray.length;
            targetScale = 1 + (audioData.avg / 150);
            requestAnimationFrame(updateAudioData);
        }
        updateAudioData();

        return initBrowserSTT();
    } catch (err) {
        console.error("Error audio:", err);
        micStatus.textContent = "Error: " + err.message;
        return false;
    }
}

// ─── TTS ───
function loadVoices() {
    const voices = window.speechSynthesis.getVoices();
    const targets = ['es', 'en', 'fr', 'de', 'ja', 'zh', 'ar', 'it', 'pt'];
    targets.forEach(lang => {
        bestVoices[lang] = voices.find(v => v.lang.startsWith(lang) && v.name.includes('Neural'))
                           || voices.find(v => v.lang.startsWith(lang) && v.name.includes('Google'))
                           || voices.find(v => v.lang.startsWith(lang));
    });
}
window.speechSynthesis.onvoiceschanged = loadVoices;
loadVoices();

function speakText(text, lang) {
    window.speechSynthesis.cancel();
    const utterance = new SpeechSynthesisUtterance(text);
    if (bestVoices[lang]) utterance.voice = bestVoices[lang];
    utterance.lang = lang;
    utterance.rate = 1;
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
    
    const utt = new SpeechSynthesisUtterance(" ");
    utt.volume = 0;
    window.speechSynthesis.speak(utt);

    await initAudio();
    
    socket.emit('host:create_room', { password });
    
    setTimeout(() => {
        if (!dashboardContainer.classList.contains('hidden')) return;
        setupError.textContent = 'Tiempo agotado. ¿Servidor online?';
    }, 5000);
});

socket.on('host:room_created', async (data) => {
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
        const btn = document.getElementById('share-btn');
        btn.textContent = '✓ Copiado';
        setTimeout(() => btn.textContent = 'Copiar Enlace', 2000);
    });
    
    // Lang change
    document.getElementById('host-lang').addEventListener('change', (e) => {
        currentHostLang = e.target.value;
        socket.emit('host:change_lang', { roomCode: currentRoomCode, lang: currentHostLang });
        if (recognition) recognition.lang = currentHostLang;
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
    if (recognition) {
        try { recognition.start(); } catch(e) { console.log("Start error:", e); }
    }
    updateMicUI();
    
    addMessageToTranscript('Sistema', 'Sala creada. ¡Bienvenido!', true);
});

// ─── Mic Control ───
micBtn.addEventListener('click', () => {
    isMicOn = !isMicOn;
    
    if (isMicOn) {
        if (recognition) {
            try { recognition.start(); } catch(e) {}
        }
        targetScale = 1.1;
    } else {
        if (recognition) {
            try { recognition.stop(); } catch(e) {}
        }
        targetScale = 1;
    }
    
    updateMicUI();
});

function updateMicUI() {
    micBtn.classList.toggle('active', isMicOn);
    micStatus.textContent = isMicOn ? '🎤 Escuchando...' : '⏸️ Micrófono apagado';
    micBtn.style.boxShadow = isMicOn 
        ? '0 0 30px rgba(16, 185, 129, 0.6), 0 8px 30px rgba(16, 185, 129, 0.4)' 
        : '0 8px 30px rgba(0, 0, 0, 0.3)';
}

// ─── Transcript ───
function addMessageToTranscript(sender, text, isSystem = false) {
    const welcome = transcriptArea.querySelector('.welcome-msg');
    if (welcome) welcome.remove();
    
    const msgDiv = document.createElement('div');
    msgDiv.className = `message ${isSystem ? 'system' : ''} fade-in`;
    
    const time = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    
    msgDiv.innerHTML = `
        <div class="msg-header">
            <span class="sender">${sender}</span>
            <span class="time">${time}</span>
        </div>
        <div class="text">${text}</div>
    `;
    
    transcriptArea.appendChild(msgDiv);
    transcriptArea.scrollTop = transcriptArea.scrollHeight;
    
    transcriptMessages.push({ sender, text, time });
    
    if (transcriptMessages.length > 50) {
        transcriptMessages.shift();
        if (transcriptArea.children.length > 50) {
            transcriptArea.children[0].remove();
        }
    }
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
                <div class="avatar" style="background: linear-gradient(135deg, #10b981, #059669);">${p.name.charAt(0).toUpperCase()}</div>
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

// ─── Receive Transcript ───
socket.on('transcript:broadcast', (data) => {
    if (!data.text) return;
    
    addMessageToTranscript(data.senderName, data.text, false);

    if (!data.isMe) {
        setTimeout(() => speakText(data.text, currentHostLang), 500);
    }
});

// ─── Error ───
socket.on('error', (msg) => {
    setupError.textContent = msg;
});

socket.on('room:closed', () => {
    addMessageToTranscript('Sistema', 'La sala ha sido cerrada', true);
    setTimeout(() => window.location.reload(), 2000);
});