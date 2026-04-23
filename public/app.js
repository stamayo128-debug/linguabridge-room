const socket = io();

// ─── State ───
let currentRoomCode = '';
let currentName = '';
let currentLang = 'es';
let isMicOn = false;
let isHostMuted = false;
let audioQueue = [];
let isPlaying = false;
let bestVoices = {};

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
let currentPanel = 1; // Start at center (sphere)
let touchStartX = 0;
let touchEndX = 0;

function goToPanel(index) {
    currentPanel = Math.max(0, Math.min(index, 2));
    swipeWrapper.style.transform = `translateX(-${currentPanel * 33.333}%)`;
    navPills.forEach((pill, i) => {
        pill.classList.toggle('active', i === currentPanel);
    });
}

navPills.forEach((pill, i) => {
    pill.addEventListener('click', () => goToPanel(i));
});

// Touch/Swipe handling
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

// Mouse wheel navigation
document.addEventListener('wheel', (e) => {
    if (!roomContainer.classList.contains('hidden')) {
        if (e.deltaY > 0 && currentPanel < 2) goToPanel(currentPanel + 1);
        else if (e.deltaY < 0 && currentPanel > 0) goToPanel(currentPanel - 1);
    }
});

// ─── 3D Sphere with Audio ───
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
    recognition.lang = currentLang;

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
                speakerName: currentName,
                speakerLang: currentLang
            });
        } else if (interimTranscript) {
            updateInterimUI(interimTranscript);
        }
    };

    recognition.onerror = (err) => {
        if (err.error !== 'no-speech') console.error("STT Error:", err.error);
    };

    recognition.onend = () => {
        if (isMicOn && !isHostMuted) {
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

// ─── Audio Context for Visualization ───
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
    
    const utterance = new SpeechSynthesisUtterance(" ");
    utterance.volume = 0;
    window.speechSynthesis.speak(utterance);

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
    
    updateLangSelector(currentLang);
    startMic();
});

function updateLangSelector(lang) {
    document.querySelectorAll('.lang-chip').forEach(chip => {
        chip.classList.toggle('active', chip.dataset.lang === lang);
    });
    currentLangDisplay.textContent = lang.toUpperCase();
    
    if (recognition) recognition.lang = lang;
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
function startMic() {
    isMicOn = true;
    try { recognition.start(); } catch(e) {}
    updateMicUI();
}

micBtn.addEventListener('click', () => {
    if (isHostMuted) return;
    isMicOn = !isMicOn;
    if (isMicOn) try { recognition.start(); } catch(e) {}
    else recognition.stop();
    updateMicUI();
});

function updateMicUI() {
    micBtn.classList.toggle('active', isMicOn);
    micStatus.textContent = isMicOn ? 'Escuchando...' : 'Micrófono apagado';
}

// ─── Receive Translations ───
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
        speakText(data.text, currentLang);
    }
});

// ─── Host Control ───
socket.on('host:force_mute', () => {
    isHostMuted = true;
    isMicOn = false;
    updateMicUI();
    if (recognition) try { recognition.stop(); } catch(e) {}
});

socket.on('host:allow_speak', () => {
    isHostMuted = false;
    updateMicUI();
});

socket.on('error', (msg) => {
    document.getElementById('join-error').textContent = msg;
});

socket.on('room:closed', () => {
    window.location.reload();
});

// ─── Scroll with Touch ───
let transcriptScrolling = false;
transcriptArea.addEventListener('touchstart', () => transcriptScrolling = true);
transcriptArea.addEventListener('touchend', () => {
    setTimeout(() => transcriptScrolling = false, 100);
});

swipeWrapper.addEventListener('touchstart', (e) => {
    if (transcriptScrolling || e.target.closest('.transcript-area')) {
        swipeWrapper.dataset.scrollable = 'true';
    }
}, { passive: true });

swipeWrapper.addEventListener('touchmove', (e) => {
    if (swipeWrapper.dataset.scrollable === 'true') {
        e.stopPropagation();
    }
}, { passive: true });