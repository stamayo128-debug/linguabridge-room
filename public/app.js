const socket = io();

// UI Elements
const joinScreen = document.getElementById('join-screen');
const roomScreen = document.getElementById('room-screen');
const joinBtn = document.getElementById('join-btn');
const roomCodeInput = document.getElementById('room-code');
const nameInput = document.getElementById('participant-name');
const langSelect = document.getElementById('participant-lang');
const joinError = document.getElementById('join-error');
const transcriptArea = document.getElementById('transcript-area');
const micBtn = document.getElementById('mic-btn');
const micStatusText = document.getElementById('mic-status-text');
const sensitivitySlider = document.getElementById('sensitivity-slider');
const displayRoomCode = document.getElementById('display-room-code');
const displayName = document.getElementById('display-name');

// ─── Three.js Intelligence Visualizer ───────────────────────────────────────
let scene, camera, renderer, particles, analyser, dataArray;

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
    recognition.interimResults = true; // STREAMING MODE
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

    function updateInterimUI(text) {
        const welcome = transcriptArea.querySelector('.welcome-msg');
        if (welcome) welcome.remove();
        
        if (!interimSpan) {
            interimSpan = document.createElement('div');
            interimSpan.className = 'message self interim-text';
            transcriptArea.appendChild(interimSpan);
        }
        interimSpan.textContent = text;
        transcriptArea.scrollTop = transcriptArea.scrollHeight;
    }

    recognition.onerror = (err) => console.error("Speech Recognition Error:", err.error);
    recognition.onend = () => { 
        if (isMicOn && USE_BROWSER_STT && !isHostMuted) {
            try { recognition.start(); } catch(e) {}
        }
    };
}

function initThreeVisualizer() {
    const container = document.getElementById('visualizer-container');
    scene = new THREE.Scene();
    camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 1000);
    renderer = new THREE.WebGLRenderer({ alpha: true, antialias: true });
    renderer.setSize(window.innerWidth, window.innerHeight);
    container.appendChild(renderer.domElement);

    const geometry = new THREE.IcosahedronGeometry(2, 4); // High density points
    const material = new THREE.PointsMaterial({
        color: 0x3b82f6,
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
            material.color.setHSL(0.6 + (avg / 500), 0.8, 0.5);
        } else {
            particles.scale.set(1, 1, 1);
            material.color.setHex(0x3b82f6);
        }
        renderer.render(scene, camera);
    }
    animate();
}

window.addEventListener('resize', () => {
    if (!camera || !renderer) return;
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
});

// ─── Voice Management (Web Speech API) ──────────────────────────────────────
let bestVoices = {};
function loadVoices() {
    const voices = window.speechSynthesis.getVoices();
    const targets = ['es', 'en', 'fr', 'de', 'ja', 'zh', 'ar', 'it', 'pt'];
    targets.forEach(lang => {
        // Prioritize Neural or Google voices
        bestVoices[lang] = voices.find(v => v.lang.startsWith(lang) && (v.name.includes('Neural') || v.name.includes('Google'))) 
                           || voices.find(v => v.lang.startsWith(lang));
    });
}
window.speechSynthesis.onvoiceschanged = loadVoices;
loadVoices();

// ─── State & Initialization ───────────────────────────────────────────────
let mediaRecorder;
let audioChunks = [];
let isMicOn = false;
let isHostMuted = false;
let currentRoomCode = '';
let currentName = '';
let currentLang = '';
let audioQueue = [];
let isPlaying = false;

const headerLangSelect = document.getElementById('header-lang-select');
headerLangSelect.addEventListener('change', () => {
    currentLang = headerLangSelect.value;
    socket.emit('participant:change_lang', { roomCode: currentRoomCode, lang: currentLang });
});

joinBtn.addEventListener('click', () => {
    currentRoomCode = roomCodeInput.value.trim();
    currentName = nameInput.value.trim();
    currentLang = document.getElementById('participant-lang').value;
    headerLangSelect.value = currentLang;

    if (!currentRoomCode || !currentName) { joinError.textContent = "Se requiere código y nombre."; return; }
    joinError.textContent = "Conectando...";
    
    // Warm up TTS for mobile
    const utt = new SpeechSynthesisUtterance(" ");
    utt.volume = 0;
    window.speechSynthesis.speak(utt);

    initAudio();
    initThreeVisualizer();
    socket.emit('participant:join_room', { roomCode: currentRoomCode, name: currentName, lang: currentLang });
});

socket.on('participant:joined', (data) => {
    joinScreen.classList.add('hidden');
    roomScreen.classList.remove('hidden');
    displayRoomCode.textContent = data.roomCode;
    displayName.textContent = data.name;
});

// ─── Audio & VAD ────────────────────────────────────────────────────────────
let audioContext, microphone, scriptProcessor;
let isSpeaking = false;
let silenceStart = Date.now();
let speechStart = Date.now();
const SILENCE_THRESHOLD_MS = 300; 

async function initAudio() {
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

        scriptProcessor.onaudioprocess = (e) => {
            if (!isMicOn || isHostMuted) return;
            const data = e.inputBuffer.getChannelData(0);
            
            if (USE_BROWSER_STT) return; // Visualizer already handled by analyser

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
                    mediaRecorder.onstop = enviarAudio;
                    mediaRecorder.start();
                    micStatusText.textContent = "Escuchando...";
                }
                silenceStart = Date.now();
            } else {
                if (isSpeaking && (Date.now() - silenceStart > SILENCE_THRESHOLD_MS)) {
                    isSpeaking = false;
                    micStatusText.textContent = "Procesando...";
                    if (mediaRecorder && mediaRecorder.state !== 'inactive') mediaRecorder.stop();
                }
            }
        };

        if (USE_BROWSER_STT) {
            initBrowserSTT();
            isMicOn = true;
            try { recognition.start(); } catch(e) {}
            updateMicUI();
        }

        micBtn.addEventListener('click', () => {
            if (isHostMuted) return;
            if (audioContext.state === 'suspended') audioContext.resume();
            isMicOn = !isMicOn;
            if (USE_BROWSER_STT) {
                if (isMicOn) try { recognition.start(); } catch(e) {}
                else recognition.stop();
            }
            updateMicUI();
        });
    } catch (err) { joinError.textContent = "Error al iniciar micrófono."; }
}

function updateMicUI() {
    micBtn.classList.toggle('active', isMicOn);
    micBtn.innerHTML = isMicOn ? 'Mic. encendido (Toca para apagar)' : 'Mic. apagado (Toca para encender)';
    micStatusText.textContent = isMicOn ? "Listo para hablar" : "Micrófono apagado";
}

async function enviarAudio() {
    if (audioChunks.length === 0) return;
    if (Date.now() - speechStart < 500) { audioChunks = []; return; }

    const blob = new Blob(audioChunks, { type: "audio/webm" });
    audioChunks = [];
    
    const formData = new FormData();
    formData.append("audio", blob, "audio.webm");
    formData.append("roomCode", currentRoomCode);
    formData.append("speakerName", currentName);
    formData.append("speakerLang", currentLang);

    try { fetch('/transcribir', { method: 'POST', body: formData }); } 
    catch (err) { console.error("Error enviando:", err); }
}

// ─── Events & Transcription ────────────────────────────────────────────────
socket.on('transcript:broadcast', (data) => {
    if (!data.text) return;
    const w = transcriptArea.querySelector('.welcome-msg');
    if (w) w.remove();

    const msgDiv = document.createElement('div');
    msgDiv.className = `message ${data.isMe ? 'self' : ''}`;
    msgDiv.innerHTML = `
        <div class="msg-header"><span>${data.senderName}</span></div>
        <div class="msg-content">${data.text}</div>
    `;
    transcriptArea.appendChild(msgDiv);
    transcriptArea.scrollTop = transcriptArea.scrollHeight; 

    if (!data.isMe) {
        audioQueue.push({ text: data.text, lang: currentLang });
        if (!isPlaying) playNextAudioNative();
    }
});

function playNextAudioNative() {
    if (audioQueue.length === 0) { isPlaying = false; return; }
    isPlaying = true;
    const { text, lang } = audioQueue.shift();
    const utterance = new SpeechSynthesisUtterance(text);
    
    // Use best voice if available
    if (bestVoices[lang]) utterance.voice = bestVoices[lang];
    utterance.lang = lang;
    
    utterance.onend = playNextAudioNative;
    utterance.onerror = playNextAudioNative;
    window.speechSynthesis.speak(utterance);
}

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

socket.on('room:closed', () => { window.location.reload(); });
