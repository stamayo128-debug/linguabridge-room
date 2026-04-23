const socket = io();

// ─── State ───
let currentRoomCode = '';
let currentName = '';
let currentLang = 'es';
let isMicOn = false;
let isHostMuted = false;
let ttsEnabled = true;
let bestVoices = {};
let transcriptMessages = [];
let lastStreamingTime = 0;

// ─── DOM Elements ───
const joinScreen = document.getElementById('join-screen');
const roomContainer = document.getElementById('room-container');
const joinForm = document.getElementById('join-form');
const transcriptArea = document.getElementById('transcript-area');
const micBtn = document.getElementById('mic-btn');
const micStatus = document.getElementById('mic-status');
const langSelector = document.getElementById('lang-selector');
const roomCodeBadge = document.getElementById('room-code-badge');
const currentLangDisplay = document.getElementById('current-lang-display');

// ─── Swipe Navigation ───
const swipeWrapper = document.getElementById('swipe-wrapper');
const navPills = document.querySelectorAll('.nav-pill');
let currentPanel = 1;
let touchStartX = 0;
let touchEndX = 0;

function goToPanel(index) {
    currentPanel = Math.max(0, Math.min(index, 2));
    swipeWrapper.style.transform = `translateX(-${currentPanel * 33.333}%)`;
    navPills.forEach((pill, i) => pill.classList.toggle('active', i === currentPanel));
}

navPills.forEach((pill, i) => pill.addEventListener('click', () => goToPanel(i)));

swipeWrapper.addEventListener('touchstart', (e) => {
    touchStartX = e.touches[0].clientX;
}, { passive: true });

swipeWrapper.addEventListener('touchmove', (e) => {
    touchEndX = e.touches[0].clientX;
}, { passive: true });

swipeWrapper.addEventListener('touchend', () => {
    const diff = touchStartX - touchEndX;
    if (Math.abs(diff) > 50) {
        if (diff > 0 && currentPanel < 2) goToPanel(currentPanel + 1);
        else if (diff < 0 && currentPanel > 0) goToPanel(currentPanel - 1);
    }
    touchStartX = 0;
    touchEndX = 0;
});

// ─── Beautiful 3D Sphere ───
const sphere = document.getElementById('sphere');
const sphereContainer = document.querySelector('.sphere-container');
const visualizer = document.getElementById('visualizer');
const vizBars = visualizer.querySelectorAll('.viz-bar');
let particles = [];
let sphereRotation = 0;
let targetScale = 1;
let currentScale = 1;
let audioData = { avg: 0, peaks: [] };

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
    
    // Smooth scale transition
    currentScale += (targetScale - currentScale) * 0.1;
    
    const rotY = sphereRotation * 25;
    const rotX = Math.sin(sphereRotation * 0.5) * 10;
    sphere.style.transform = `rotateY(${rotY}deg) rotateX(${rotX}deg) scale(${currentScale})`;
    
    // Animate particles
    particles.forEach((p, i) => {
        const offset = Math.sin(sphereRotation * 1.5 + i * 0.3) * 8;
        const pulse = 0.3 + (audioData.avg / 250);
        p.style.opacity = Math.min(pulse + Math.abs(offset / 30), 1);
        p.style.transform = `translateY(${offset}px)`;
    });
    
    // Animate visualizer bars
    vizBars.forEach((bar, i) => {
        const baseHeight = 10 + (audioData.avg * (1 - i * 0.12));
        const randomOffset = Math.random() * 5;
        bar.style.height = `${Math.min(baseHeight + randomOffset, 50)}px`;
    });
    
    // Update sphere glow
    if (sphereContainer) {
        const glowIntensity = Math.min(audioData.avg / 100, 1);
        sphereContainer.style.filter = `drop-shadow(0 0 ${20 + glowIntensity * 30}px rgba(59, 130, 246, ${glowIntensity * 0.5}))`;
    }
    
    requestAnimationFrame(animateSphere);
}
animateSphere();

// ─── Speech Recognition (Fixed) ───
let recognition = null;
const SpeechRecognitionAPI = window.SpeechRecognition || window.webkitSpeechRecognition;

function initBrowserSTT() {
    if (!SpeechRecognitionAPI) {
        console.warn("Navegador no soporta reconocimiento de voz.");
        micStatus.textContent = "STT no disponible";
        showSTTUnavailable();
        return false;
    }

    recognition = new SpeechRecognition();
    recognition.continuous = true;
    recognition.interimResults = true;
    recognition.lang = currentLang;
    recognition.maxAlternatives = 1;

    let lastFinalTranscript = '';

    recognition.onstart = () => {
        console.log('[STT] started');
        sphereContainer?.classList.add('listening');
        micStatus.textContent = 'Escuchando...';
        micStatus.classList.add('listening');
    };

    recognition.onresult = (event) => {
        let interimTranscript = '';
        let finalTranscript = '';

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
            console.log('[STT] finalTranscript', cleanedText);
            if (cleanedText !== lastFinalTranscript && cleanedText.length > 0) {
                lastFinalTranscript = cleanedText;
                console.log("Transcripción final:", cleanedText);
                
                // Remove interim
                const interim = transcriptArea.querySelector('.interim-text');
                if (interim) interim.remove();
                
                // Send to server for translation
                socket.emit('translate:text', {
                    roomCode: currentRoomCode,
                    text: cleanedText,
                    speakerName: currentName,
                    speakerLang: currentLang
                });
            }
        } else if (interimTranscript.trim()) {
            console.log('[STT] interimTranscript', interimTranscript);
            updateInterimUI(interimTranscript.trim());
            const now = Date.now();
            if (now - lastStreamingTime > 800) {
                lastStreamingTime = now;
                socket.emit('translate:text', {
                    roomCode: currentRoomCode,
                    text: interimTranscript,
                    speakerName: currentName,
                    speakerLang: currentLang,
                    streaming: true
                });
            }
        }
    };

    recognition.onerror = (event) => {
        console.error("STT Error:", event.error);
        if (event.error === 'no-speech') {
            // This is normal, just restart
            return;
        }
        if (event.error === 'not-allowed') {
            micStatus.textContent = "Micrófono denegado";
            showPermissionDenied();
        } else if (event.error === 'network') {
            micStatus.textContent = "Error de red - reintentando...";
        } else if (event.error === 'aborted') {
            // This happens when we intentionally stop, ignore
        } else {
            micStatus.textContent = "STT: " + event.error;
        }
    };

    recognition.onend = () => {
        if (isMicOn && !isHostMuted && recognition) {
            try {
                recognition.start();
            } catch(e) {
                console.log("Restarting recognition...");
            }
        }
    };

    return true;
}

function showSTTUnavailable() {
    const msg = document.createElement('div');
    msg.className = 'message system fade-in';
    msg.innerHTML = `
        <div class="msg-header">
            <span class="sender">Sistema</span>
        </div>
        <div class="text">
            Tu navegador no soporta transcripción de voz.<br>
            <strong>Usa Chrome o Edge</strong> para mejor experiencia.
        </div>
    `;
    transcriptArea.appendChild(msg);
}

function showPermissionDenied() {
    const msg = document.createElement('div');
    msg.className = 'message system fade-in';
    msg.innerHTML = `
        <div class="msg-header">
            <span class="sender">Sistema</span>
        </div>
        <div class="text">
            Acceso al micrófono denegado.<br>
            Permite el acceso en la barra del navegador.
        </div>
    `;
    transcriptArea.appendChild(msg);
}

function updateInterimUI(text) {
    const welcome = transcriptArea.querySelector('.welcome-msg');
    if (welcome) welcome.remove();

    let interimSpan = transcriptArea.querySelector('.interim-text');
    if (!interimSpan) {
        interimSpan = document.createElement('div');
        interimSpan.className = 'message interim-text';
        interimSpan.innerHTML = `
            <div class="msg-header">
                <span class="sender" style="color: var(--warning);">🎤 ${currentName}</span>
                <span class="time" style="color: var(--warning);">hablando...</span>
            </div>
            <div class="text" style="font-style: italic;">${text}...</div>
        `;
        transcriptArea.appendChild(interimSpan);
    } else {
        interimSpan.querySelector('.text').innerHTML = `${text}...`;
    }
    transcriptArea.scrollTop = transcriptArea.scrollHeight;
}

// ─── Audio Context ───
let audioContext, analyser, micStream;

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
            const sum = dataArray.reduce((a, b) => a + b, 0);
            audioData.avg = sum / dataArray.length;
            
            // Update scale based on audio
            targetScale = 1 + (audioData.avg / 150);
            
            requestAnimationFrame(updateAudioData);
        }
        updateAudioData();

        // Init speech recognition
        const sttReady = initBrowserSTT();
        if (!sttReady) {
            micStatus.textContent = "Reconocimiento de voz no disponible";
        }
        
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
        bestVoices[lang] = voices.find(v => v.lang.startsWith(lang) && v.name.includes('Neural'))
                           || voices.find(v => v.lang.startsWith(lang) && v.name.includes('Google'))
                           || voices.find(v => v.lang.startsWith(lang));
    });
}
window.speechSynthesis.onvoiceschanged = loadVoices;
loadVoices();

function speakText(text, lang) {
    if (!ttsEnabled) return;
    window.speechSynthesis.cancel();
    const utterance = new SpeechSynthesisUtterance(text);
    if (bestVoices[lang]) utterance.voice = bestVoices[lang];
    utterance.lang = lang;
    utterance.rate = 1;
    utterance.pitch = 1;
    window.speechSynthesis.speak(utterance);
}

// ─── TTS Toggle ───
document.addEventListener('DOMContentLoaded', () => {
    const ttsToggle = document.getElementById('tts-toggle');
    if (ttsToggle) {
        ttsToggle.addEventListener('click', () => {
            ttsEnabled = !ttsEnabled;
            ttsToggle.textContent = ttsEnabled ? '🔊' : '🔇';
            ttsToggle.classList.toggle('muted', !ttsEnabled);
            if (ttsEnabled) {
                window.speechSynthesis.cancel();
            }
        });
    }
});

// ─── Join Room ───
joinForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    
    currentRoomCode = document.getElementById('room-code').value.trim();
    currentName = document.getElementById('participant-name').value.trim();
    currentLang = document.getElementById('lang-select').value;
    
    if (!currentRoomCode || !currentName) {
        document.getElementById('join-error').textContent = 'Completa todos los campos';
        return;
    }

    document.getElementById('join-error').textContent = 'Conectando...';
    
    // Warm up TTS
    const utt = new SpeechSynthesisUtterance(" ");
    utt.volume = 0;
    window.speechSynthesis.speak(utt);

    await initAudio();
    
    socket.emit('participant:join_room', { 
        roomCode: currentRoomCode, 
        name: currentName, 
        lang: currentLang 
    });
});

socket.on('participant:joined', (data) => {
    joinScreen.classList.add('hidden');
    roomContainer.classList.remove('hidden');
    roomCodeBadge.textContent = `Sala ${data.roomCode}`;
    currentLangDisplay.textContent = currentLang.toUpperCase();
    
    // Update info panel
    document.getElementById('info-room-code').textContent = data.roomCode;
    document.getElementById('info-name').textContent = currentName;
    
    updateLangSelector(currentLang);
    updateConnectionStatus('connected');
    
    // Start mic and STT (browser) if enabled
    if (typeof USE_BROWSER_STT !== 'undefined' && USE_BROWSER_STT) {
        if (!recognition) initBrowserSTT();
    }
    // Start mic
    isMicOn = true;
    if (recognition) {
        try { recognition.start(); } catch(e) { console.log("Start error:", e); }
    }
    updateMicUI();
    
    // Show welcome in transcript
    addMessageToTranscript('Sistema', '¡Bienvenido! Presiona el micrófono y habla.', true);
});

function updateConnectionStatus(status) {
    const statusEl = document.getElementById('connection-status');
    const pulseDot = document.querySelector('#panel-transcript .pulse-dot');
    
    if (!statusEl) return;
    
    if (status === 'connected') {
        statusEl.style.background = 'rgba(34, 197, 94, 0.15)';
        statusEl.style.borderColor = 'rgba(34, 197, 94, 0.3)';
        statusEl.style.color = 'var(--accent)';
        statusEl.innerHTML = '<span style="width: 6px; height: 6px; background: var(--accent); border-radius: 50%; display: inline-block;"></span> Conectado';
        if (pulseDot) pulseDot.classList.remove('error', 'warning');
    } else if (status === 'connecting') {
        statusEl.style.background = 'rgba(245, 158, 11, 0.15)';
        statusEl.style.borderColor = 'rgba(245, 158, 11, 0.3)';
        statusEl.innerHTML = '<span style="width: 6px; height: 6px; background: var(--warning); border-radius: 50%; display: inline-block;"></span> Conectando...';
        if (pulseDot) pulseDot.classList.add('warning');
    } else if (status === 'disconnected') {
        statusEl.style.background = 'rgba(239, 68, 68, 0.15)';
        statusEl.style.borderColor = 'rgba(239, 68, 68, 0.3)';
        statusEl.innerHTML = '<span style="width: 6px; height: 6px; background: var(--danger); border-radius: 50%; display: inline-block;"></span> Desconectado';
        if (pulseDot) pulseDot.classList.add('error');
    }
}

function updateLangSelector(lang) {
    document.querySelectorAll('.lang-chip').forEach(chip => {
        chip.classList.toggle('active', chip.dataset.lang === lang);
    });
    currentLangDisplay.textContent = lang.toUpperCase();
    
    if (recognition) {
        recognition.lang = lang;
    }
}

// ─── Language Selector ───
langSelector.addEventListener('click', (e) => {
    const chip = e.target.closest('.lang-chip');
    if (!chip) return;
    
    currentLang = chip.dataset.lang;
    updateLangSelector(currentLang);
    socket.emit('participant:change_lang', { roomCode: currentRoomCode, lang: currentLang });
});

// ─── Mic Control ───
micBtn.addEventListener('click', () => {
    if (isHostMuted) return;
    
    isMicOn = !isMicOn;
    
    if (isMicOn) {
        if (recognition) {
            try { recognition.start(); } catch(e) { console.log("Start error:", e); }
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
    micStatus.textContent = isMicOn ? 'Escuchando...' : 'Micrófono apagado';
    micStatus.classList.toggle('listening', isMicOn);
    micBtn.style.boxShadow = isMicOn 
        ? '0 0 30px rgba(34, 197, 94, 0.5), 0 8px 30px rgba(34, 197, 94, 0.3)' 
        : '0 8px 30px rgba(0, 0, 0, 0.3)';
    
    if (sphereContainer) {
        sphereContainer.classList.toggle('listening', isMicOn);
    }
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
    
    // Keep only last 50 messages
    if (transcriptMessages.length > 50) {
        transcriptMessages.shift();
        if (transcriptArea.children.length > 50) {
            transcriptArea.children[0].remove();
        }
    }
}

// ─── Receive Translations ───
socket.on('transcript:broadcast', (data) => {
    if (!data.text) return;

    addMessageToTranscript(data.senderName, data.text, false);

    // Auto-switch to transcript panel for visibility
    try {
        if (typeof goToPanel === 'function' && currentPanel !== 0) {
            goToPanel(0);
        }
    } catch (e) {
        // ignore navigation errors
    }

    // TTS for others
    if (!data.isMe) {
        setTimeout(() => speakText(data.text, currentLang), 500);
    }
});

// ─── Host Control ───
socket.on('host:force_mute', () => {
    isHostMuted = true;
    isMicOn = false;
    updateMicUI();
    if (recognition) {
        try { recognition.stop(); } catch(e) {}
    }
    addMessageToTranscript('Sistema', 'El host te ha silenciado', true);
});

socket.on('host:allow_speak', () => {
    isHostMuted = false;
    updateMicUI();
    addMessageToTranscript('Sistema', 'El host te ha dado permiso para hablar', true);
});

socket.on('error', (msg) => {
    document.getElementById('join-error').textContent = msg;
});

socket.on('room:closed', () => {
    addMessageToTranscript('Sistema', 'La sala ha sido cerrada', true);
    setTimeout(() => window.location.reload(), 2000);
});

// ─── Scroll fix ───
let transcriptScrolling = false;
transcriptArea.addEventListener('touchstart', () => transcriptScrolling = true);
transcriptArea.addEventListener('touchend', () => setTimeout(() => transcriptScrolling = false, 100));

swipeWrapper.addEventListener('touchmove', (e) => {
    if (swipeWrapper.dataset.scrollable === 'true') {
        e.stopPropagation();
    }
}, { passive: true });

// ─── Socket connection handling ───
socket.on('connect', () => {
    console.log('[Socket] Connected');
    updateConnectionStatus('connecting');
});

socket.on('disconnect', () => {
    console.log('[Socket] Disconnected');
    updateConnectionStatus('disconnected');
    addMessageToTranscript('Sistema', 'Conexión perdida. Reconectando...', true);
});

socket.on('connect_error', () => {
    updateConnectionStatus('disconnected');
});
