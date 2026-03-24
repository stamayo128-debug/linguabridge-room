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
const ttsToggle = document.getElementById('tts-toggle');

const displayRoomCode = document.getElementById('display-room-code');
const displayName = document.getElementById('display-name');
const displayLang = document.getElementById('display-lang');

// State
let mediaRecorder;
let audioChunks = [];
let isMicOn = false;
let isHostMuted = false;
let isTTSOn = true;

// TTS Queue Control
const ttsQueue = [];
let isPlayingTTS = false;

const langLabels = {
    es: 'ESPAÑOL', en: 'ENGLISH', fr: 'FRANÇAIS', de: 'DEUTSCH',
    ja: '日本語', zh: '中文', ar: 'العربية', it: 'ITALIANO', pt: 'PORTUGUÊS'
};

const urlParams = new URLSearchParams(window.location.search);
if (urlParams.has('room')) roomCodeInput.value = urlParams.get('room');

joinBtn.addEventListener('click', () => {
    const roomCode = roomCodeInput.value.trim();
    const name = nameInput.value.trim();
    const lang = langSelect.value;
    if (!roomCode || !name) { joinError.textContent = "Please enter room code and your name."; return; }
    joinError.textContent = "Connecting...";
    socket.emit('participant:join_room', { roomCode, name, lang });
});

socket.on('participant:joined', (data) => {
    joinScreen.classList.add('hidden');
    roomScreen.classList.remove('hidden');
    displayRoomCode.textContent = data.roomCode;
    displayName.textContent = data.name;
    displayLang.textContent = langLabels[data.lang] || data.lang.toUpperCase();
    
    // Resume audio context for Text-to-Speech immediately upon entering
    if ('speechSynthesis' in window) { window.speechSynthesis.cancel(); }
    
    initAudio();
});

socket.on('error', (msg) => { joinError.textContent = msg; });

// Audio Logic with VAD
let audioContext, analyser, microphone, scriptProcessor;
let isSpeaking = false;
let silenceStart = Date.now();
const SILENCE_THRESHOLD_MS = 1500; 
const VOX_THRESHOLD = 5; 

async function initAudio() {
    try {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: { noiseSuppression: true, echoCancellation: true } });
        let options = { mimeType: 'audio/webm' };
        if (!MediaRecorder.isTypeSupported('audio/webm')) options = { mimeType: 'audio/ogg' };
        
        mediaRecorder = new MediaRecorder(stream, options);

        mediaRecorder.ondataavailable = (e) => {
            if (e.data.size > 0) audioChunks.push(e.data);
        };

        mediaRecorder.onstop = () => {
            if (audioChunks.length === 0) return;
            const audioBlob = new Blob(audioChunks, { type: mediaRecorder.mimeType });
            audioChunks = [];
            socket.emit('audio:stream_chunk', { audio: audioBlob });
            
            if (isMicOn && !isHostMuted) mediaRecorder.start();
        };

        isMicOn = true;
        micBtn.classList.add('active');
        micBtn.innerHTML = '<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="9" width="6" height="6"></rect></svg> Tap to Mute';
        micStatusText.textContent = "Mic ON - Auto Listening";
        micStatusText.style.color = "var(--text-main)";
        
        audioContext = new (window.AudioContext || window.webkitAudioContext)();
        analyser = audioContext.createAnalyser();
        microphone = audioContext.createMediaStreamSource(stream);
        scriptProcessor = audioContext.createScriptProcessor(2048, 1, 1);

        analyser.smoothingTimeConstant = 0.8;
        analyser.fftSize = 1024;
        microphone.connect(analyser);
        analyser.connect(scriptProcessor);
        scriptProcessor.connect(audioContext.destination);

        scriptProcessor.onaudioprocess = () => {
            if (!isMicOn || isHostMuted) return;

            const array = new Uint8Array(analyser.frequencyBinCount);
            analyser.getByteFrequencyData(array);
            let values = 0, length = array.length;
            for (let i = 0; i < length; i++) values += array[i];
            const average = values / length;

            if (average > VOX_THRESHOLD) {
                if (!isSpeaking) {
                    isSpeaking = true;
                    if (mediaRecorder.state === 'inactive') mediaRecorder.start();
                    micStatusText.textContent = "Listening...";
                    micStatusText.style.color = "#10b981";
                }
                silenceStart = Date.now();
            } else {
                if (isSpeaking && (Date.now() - silenceStart > SILENCE_THRESHOLD_MS)) {
                    isSpeaking = false;
                    micStatusText.textContent = "Processing...";
                    micStatusText.style.color = "var(--text-muted)";
                    if (mediaRecorder.state === 'recording') mediaRecorder.stop();
                }
            }
        };

        micBtn.addEventListener('click', toggleMic);

    } catch (err) {
        console.error('Mic error:', err);
        joinError.textContent = "Microphone access is required.";
    }
}

function toggleMic() {
    if (isHostMuted) { alert("The host has muted your microphone."); return; }
    
    isMicOn = !isMicOn;
    if (isMicOn) {
        micBtn.classList.add('active');
        micBtn.innerHTML = '<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="9" width="6" height="6"></rect></svg> Tap to Mute';
        micStatusText.textContent = "Mic ON - Waiting for speech";
        micStatusText.style.color = "var(--text-main)";
        audioContext.resume();
    } else {
        micBtn.classList.remove('active');
        micBtn.innerHTML = '<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 2a3 3 0 0 0-3 3v7a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3Z"></path><path d="M19 10v2a7 7 0 0 1-14 0v-2"></path><line x1="12" y1="19" x2="12" y2="22"></line></svg> Tap to Unmute';
        micStatusText.textContent = "Microphone is OFF";
        micStatusText.style.color = "var(--text-muted)";
        isSpeaking = false;
        if (mediaRecorder && mediaRecorder.state === 'recording') mediaRecorder.stop();
    }
}

// Ensure TTS Queue clears without overlapping
function playNextTTS() {
    if (isPlayingTTS || ttsQueue.length === 0 || !isTTSOn || !('speechSynthesis' in window)) return;
    
    isPlayingTTS = true;
    const { text, lang } = ttsQueue.shift();
    
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.lang = lang;
    
    utterance.onend = () => {
        isPlayingTTS = false;
        playNextTTS();
    };
    
    utterance.onerror = () => {
        isPlayingTTS = false;
        playNextTTS();
    };

    window.speechSynthesis.speak(utterance);
}

ttsToggle.addEventListener('click', () => {
    isTTSOn = !isTTSOn;
    if (isTTSOn) {
        ttsToggle.innerHTML = "🔊 Audio ON";
        ttsToggle.style.background = "var(--primary)";
        if (ttsQueue.length > 0) playNextTTS();
    } else {
        ttsToggle.innerHTML = "🔇 Audio OFF";
        ttsToggle.style.background = "var(--glass-bg)";
        window.speechSynthesis.cancel();
        isPlayingTTS = false;
    }
});

// Host controls targeted overrides
socket.on('host:force_mute', () => { applyHostMute(true, "Conference Mode Active"); });
socket.on('host:allow_speak', () => { applyHostMute(false, "Meeting Mode: You can speak"); });
socket.on('host:force_mute_individual', () => { applyHostMute(true, "Host explicitly muted you."); });
socket.on('host:allow_speak_individual', () => { applyHostMute(false, "Host unmuted you."); });

function applyHostMute(mute, msg) {
    isHostMuted = mute;
    if (mute) {
        isMicOn = false;
        isSpeaking = false;
        micBtn.classList.remove('active');
        micBtn.innerHTML = '<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M11 5L6 9H2v6h4l5 4V5z"></path></svg> Host Muted You';
        micStatusText.textContent = msg;
        if (mediaRecorder && mediaRecorder.state === 'recording') mediaRecorder.stop();
    } else {
        micBtn.innerHTML = '<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 2a3 3 0 0 0-3 3v7a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3Z"></path></svg> Tap to Unmute';
        micStatusText.textContent = msg;
    }
}

// Receive Transcripts
socket.on('transcript:broadcast', (data) => {
    const myLang = langSelect.value;
    let displayMsg = (data.translations && data.translations[myLang]) ? data.translations[myLang] : data.original;
    if (!displayMsg) return;

    const isMe = data.senderName === nameInput.value.trim();
    const welcome = transcriptArea.querySelector('.welcome-msg');
    if (welcome) welcome.remove();

    const msgDiv = document.createElement('div');
    msgDiv.className = `message ${isMe ? 'self' : ''}`;
    msgDiv.innerHTML = `
        <div class="msg-header"><span>${data.senderName}</span></div>
        <div class="msg-content">${displayMsg}</div>
    `;
    transcriptArea.appendChild(msgDiv);
    transcriptArea.scrollTop = transcriptArea.scrollHeight; 
    
    // Add to TTS queue if it's someone else speaking
    if (!isMe && isTTSOn) {
        ttsQueue.push({ text: displayMsg, lang: myLang });
        playNextTTS();
    }
});

socket.on('room:closed', () => {
    alert("The host has ended the session.");
    window.location.reload();
});
