const socket = io();

const setupScreen = document.getElementById('setup-screen');
const dashScreen = document.getElementById('dashboard-screen');
const apiKeyInput = document.getElementById('api-key');
const createBtn = document.getElementById('create-btn');
const setupError = document.getElementById('setup-error');
const displayRoomCode = document.getElementById('host-room-code');
const participantList = document.getElementById('participant-list');
const participantCount = document.getElementById('participant-count');

const modeConf = document.getElementById('mode-conf');
const modeMeet = document.getElementById('mode-meet');
const endBtn = document.getElementById('end-btn');

let currentRoomCode = null;
let publicNgrokUrl = null;
let currentHostName = '';
let currentHostLang = '';
let mutedUsers = new Set();

// ─── Browser Speech Recognition (Free & Fast) ──────────────────────────────
const USE_BROWSER_STT = true; // Set to false to use Groq/Whisper on server
let recognition;

function initBrowserSTT() {
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SpeechRecognition) {
        console.warn("Este navegador no soporta reconocimiento de voz nativo.");
        return;
    }

    recognition = new SpeechRecognition();
    recognition.continuous = true;
    recognition.interimResults = false;
    recognition.lang = currentHostLang;

    recognition.onresult = (event) => {
        const text = event.results[event.results.length - 1][0].transcript.trim();
        if (text) {
            console.log("Browser STT:", text);
            socket.emit('translate:text', {
                roomCode: currentRoomCode,
                text: text,
                speakerName: currentHostName,
                speakerLang: currentHostLang
            });
        }
    };

    recognition.onerror = (err) => {
        console.error("Speech Recognition Error:", err.error);
        if (err.error === 'network') alert("Error de red en reconocimiento de voz.");
    };
    
    recognition.onend = () => { 
        if (isMicOn && USE_BROWSER_STT) {
            try { recognition.start(); } catch(e) {}
        }
    };
}

// ─── Three.js Intelligence Visualizer (Same as App) ────────────────────────
let scene, camera, renderer, particles, analyser, dataArray;
function initThreeVisualizer() {
    const container = document.getElementById('visualizer-container');
    scene = new THREE.Scene();
    camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 1000);
    renderer = new THREE.WebGLRenderer({ alpha: true, antialias: true });
    renderer.setSize(window.innerWidth, window.innerHeight);
    container.appendChild(renderer.domElement);

    const geometry = new THREE.IcosahedronGeometry(2, 4);
    const material = new THREE.PointsMaterial({
        color: 0x10b981, // Host uses green/emerald theme
        size: 0.05,
        transparent: true,
        opacity: 0.8,
        blending: THREE.AdditiveBlending
    });

    particles = new THREE.Points(geometry, material);
    scene.add(particles);
    camera.position.z = 5;

    function animate() {
        requestAnimationFrame(animate);
        particles.rotation.y += 0.002;
        particles.rotation.x += 0.001;

        if (analyser && isMicOn) {
            analyser.getByteFrequencyData(dataArray);
            const avg = dataArray.reduce((a, b) => a + b) / dataArray.length;
            const scale = 1 + (avg / 150);
            particles.scale.set(scale, scale, scale);
            material.color.setHSL(0.3 + (avg / 500), 0.8, 0.5);
        } else {
            particles.scale.set(1, 1, 1);
            material.color.setHex(0x10b981);
        }
        renderer.render(scene, camera);
    }
    animate();
}

// ─── Voice Management (Web Speech API) ──────────────────────────────────────
let bestVoices = {};
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

const storedKey = localStorage.getItem('groq_api_key');
if (storedKey) apiKeyInput.value = storedKey;

createBtn.addEventListener('click', () => {
    const apiKey = apiKeyInput.value.trim();
    const password = document.getElementById('host-password').value.trim();
    currentHostName = document.getElementById('host-name').value.trim() || 'Presentador';
    currentHostLang = document.getElementById('host-lang-select').value;
    
    if (!password) return setupError.textContent = "Contraseña de seguridad requerida.";
    
    // Si el usuario pone una API Key en el input, la guardamos, si no usamos la del servidor
    if (apiKey) localStorage.setItem('groq_api_key', apiKey);
    
    setupError.textContent = "Iniciando sala...";
    
    socket.emit('host:create_room', { apiKey, password });
    initThreeVisualizer();
});

socket.on('host:room_created', (data) => {
    currentRoomCode = data.roomCode;
    publicNgrokUrl = data.publicUrl || window.location.origin;

    setupScreen.classList.add('hidden');
    dashScreen.classList.remove('hidden');
    displayRoomCode.textContent = currentRoomCode;

    const joinUrl = `${publicNgrokUrl}/?room=${currentRoomCode}`;
    const qrContainer = document.getElementById('qrcode');
    qrContainer.innerHTML = ''; 
    new QRCode(qrContainer, {
        text: joinUrl, width: 220, height: 220,
        colorDark : "#0f172a", colorLight : "#ffffff"
    });

    const shareBtn = document.getElementById('share-btn');
    if (shareBtn) {
        shareBtn.addEventListener('click', async () => {
            if (navigator.share) {
                navigator.share({ title: 'LinguaBridge', text: `Únete: ${currentRoomCode}`, url: joinUrl });
            } else {
                navigator.clipboard.writeText(joinUrl);
                alert("Enlace copiado.");
            }
        });
    }
    
    document.getElementById('host-lang-select').addEventListener('change', (e) => {
        currentHostLang = e.target.value;
        socket.emit('host:change_lang', { roomCode: currentRoomCode, lang: currentHostLang });
    });

    document.getElementById('dl-transcript').onclick = () => window.open(`/transcript/${currentRoomCode}/${currentHostLang}`, '_blank');
    initHostAudio();
});

socket.on('room:roster_update', (data) => {
    const participants = data.participants;
    participantCount.textContent = participants.length;
    participantList.innerHTML = participants.length === 0 ? '<li class="empty-state">Nadie conectado aún.</li>' : '';

    participants.forEach(p => {
        const li = document.createElement('li');
        const flag = { es:'🇪🇸', en:'🇬🇧', fr:'🇫🇷', de:'🇩🇪', ja:'🇯🇵', zh:'🇨🇳', ar:'🇸🇦', it:'🇮🇹', pt:'🇵🇹' }[p.lang] || '🌐';
        li.innerHTML = `
            <div><strong>${p.name}</strong> <span class="lang-badge">${flag} ${p.lang.toUpperCase()}</span></div>
            <button class="btn small action-btn" style="background:var(--glass-bg); color:var(${mutedUsers.has(p.id) ? '--text-main' : '--danger'});">
                ${mutedUsers.has(p.id) ? 'Desmutear' : 'Mutear'}
            </button>
        `;
        li.querySelector('button').onclick = () => {
            const isMuted = mutedUsers.has(p.id);
            socket.emit(isMuted ? 'host:unmute_user' : 'host:mute_user', { targetId: p.id });
            if (isMuted) mutedUsers.delete(p.id); else mutedUsers.add(p.id);
        };
        participantList.appendChild(li);
    });
});

modeConf.onclick = () => { socket.emit('host:set_mode', { roomCode: currentRoomCode, mode: 'conference' }); modeConf.classList.add('active'); modeMeet.classList.remove('active'); };
modeMeet.onclick = () => { socket.emit('host:set_mode', { roomCode: currentRoomCode, mode: 'meeting' }); modeMeet.classList.add('active'); modeConf.classList.remove('active'); };
endBtn.onclick = () => { if (confirm("¿Cerrar sesión?")) { socket.emit('host:end_room', { roomCode: currentRoomCode }); window.location.reload(); } };

// ─── Host Audio & VAD ───────────────────────────────────────────────────────
const micBtn = document.getElementById('mic-btn');
const micStatusText = document.getElementById('mic-status-text');
const sensitivitySlider = document.getElementById('sensitivity-slider');
let mediaRecorder, audioChunks = [], isMicOn = false, isSpeaking = false;
let silenceStart = Date.now(), speechStart = Date.now();
let audioQueue = [], isPlayingTTS = false;

async function initHostAudio() {
    if (USE_BROWSER_STT) {
        if (!recognition) initBrowserSTT();
        isMicOn = true;
        try { recognition.start(); } catch(e) {}
        updateHostMicUI();
        
        // Remove old listener if exists to avoid doubles
        const newMicBtn = micBtn.cloneNode(true);
        micBtn.parentNode.replaceChild(newMicBtn, micBtn);
        
        newMicBtn.addEventListener('click', () => {
            isMicOn = !isMicOn;
            if (isMicOn) try { recognition.start(); } catch(e) {}
            else recognition.stop();
            updateHostMicUI();
        });
        return;
    }

    if (typeof audioContext !== 'undefined' && audioContext) return;
    try {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: { noiseSuppression: true, echoCancellation: true } });
        audioContext = new (window.AudioContext || window.webkitAudioContext)({ sampleRate: 16000 });
        analyser = audioContext.createAnalyser();
        analyser.fftSize = 256;
        dataArray = new Uint8Array(analyser.frequencyBinCount);
        microphone = audioContext.createMediaStreamSource(stream);
        scriptProcessor = audioContext.createScriptProcessor(1024, 1, 1);
        
        microphone.connect(analyser);
        microphone.connect(scriptProcessor);
        scriptProcessor.connect(audioContext.destination);

        isMicOn = true;
        updateHostMicUI();

        scriptProcessor.onaudioprocess = (e) => {
            if (!isMicOn) return;
            const data = e.inputBuffer.getChannelData(0);
            const rms = Math.sqrt(data.reduce((s, v) => s + v * v, 0) / data.length);
            const umbral = parseFloat(sensitivitySlider.value);
            const hayVoz = rms > umbral;

            if (hayVoz) {
                if (!isSpeaking) {
                    isSpeaking = true;
                    speechStart = Date.now();
                    audioChunks = [];
                    mediaRecorder = new MediaRecorder(stream, { mimeType: MediaRecorder.isTypeSupported('audio/webm') ? 'audio/webm' : 'audio/ogg' });
                    mediaRecorder.ondataavailable = ev => { if (ev.data.size > 0) audioChunks.push(ev.data); };
                    mediaRecorder.onstop = enviarHostAudio;
                    mediaRecorder.start(); 
                    micStatusText.textContent = "Escuchando...";
                }
                silenceStart = Date.now();
            } else {
                if (isSpeaking && (Date.now() - silenceStart > 300)) {
                    isSpeaking = false;
                    micStatusText.textContent = "Procesando...";
                    if (mediaRecorder && mediaRecorder.state !== 'inactive') mediaRecorder.stop();
                }
            }
        };

        micBtn.addEventListener('click', () => {
            if (audioContext.state === 'suspended') audioContext.resume();
            isMicOn = !isMicOn;
            updateHostMicUI();
        });
    } catch (err) { micStatusText.textContent = "Error Mic: " + err.message; }
}

function updateHostMicUI() {
    micBtn.classList.toggle('active', isMicOn);
    micBtn.innerHTML = isMicOn ? 'Mic. encendido (Toca para apagar)' : 'Mic. apagado (Toca para encender)';
    micStatusText.textContent = isMicOn ? "Micrófono Host Activo" : "Silenciado";
}

async function enviarHostAudio() {
    if (audioChunks.length === 0) return;
    if (Date.now() - speechStart < 500) { audioChunks = []; return; }
    const blob = new Blob(audioChunks, { type: "audio/webm" });
    audioChunks = [];
    const formData = new FormData();
    formData.append("audio", blob, "audio.webm");
    formData.append("roomCode", currentRoomCode);
    formData.append("speakerName", currentHostName);
    formData.append("speakerLang", currentHostLang);
    formData.append("isHost", "true");
    fetch('/transcribir', { method: 'POST', body: formData });
}

socket.on('transcript:broadcast', (data) => {
    if (!data.text) return;
    const w = transcriptArea.querySelector('.welcome-msg');
    if (w) w.remove();
    const msgDiv = document.createElement('div');
    msgDiv.className = `message ${data.isMe ? 'self' : ''}`;
    msgDiv.innerHTML = `<div class="msg-header"><span>${data.senderName}</span></div><div class="msg-content">${data.text}</div>`;
    transcriptArea.appendChild(msgDiv);
    transcriptArea.scrollTop = transcriptArea.scrollHeight; 

    if (!data.isMe) {
        audioQueue.push({ text: data.text, lang: currentHostLang });
        if (!isPlayingTTS) playNextHostAudioNative();
    }
});

function playNextHostAudioNative() {
    if (audioQueue.length === 0) { isPlayingTTS = false; return; }
    isPlayingTTS = true;
    const { text, lang } = audioQueue.shift();
    const utterance = new SpeechSynthesisUtterance(text);
    if (bestVoices[lang]) utterance.voice = bestVoices[lang];
    utterance.lang = lang;
    utterance.onend = playNextHostAudioNative;
    utterance.onerror = playNextHostAudioNative;
    window.speechSynthesis.speak(utterance);
}
socket.on('error', (msg) => {
    if (setupError) setupError.textContent = msg;
    else alert(msg);
});

socket.on('room:closed', () => { window.location.reload(); });
