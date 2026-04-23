const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');
const path = require('path');
const fs = require('fs');
const os = require('os');
const multer = require('multer');
const { GoogleGenerativeAI } = require('@google/generative-ai');
require('dotenv').config();

let ngrok = null;
try {
    ngrok = require('@ngrok/ngrok');
} catch (e) {
    console.log('AVISO: El binario de ngrok no está disponible. Usando modo local.');
}

// ─── Constants & Configuration ──────────────────────────────────────────────
const NGROK_AUTHTOKEN = process.env.NGROK_AUTHTOKEN;
const GEMINI_API_KEY = process.env.GEMINI_API_KEY; 
const HOST_PASSWORD = process.env.HOST_PASSWORD || 'admin123'; // Clave para crear salas

const upload = multer({ storage: multer.memoryStorage() });
const app = express();
const server = http.createServer(app);
const io = new Server(server, { cors: { origin: '*' } });

app.use(cors());
app.use(express.static(path.join(__dirname, 'public')));
app.use(express.json());

// ─── Model Initialization ───────────────────────────────────────────────────
// Gemini 1.5 Flash for high-speed, low-cost translation
const genAI = GEMINI_API_KEY ? new GoogleGenerativeAI(GEMINI_API_KEY) : null;
const translationModel = genAI ? genAI.getGenerativeModel({ model: "gemini-1.5-flash" }) : null;

// Groq for Whisper (Transcription) - removed: transcription via Groq is deprecated in favor of browser STT

// ─── In-memory room storage ─────────────────────────────────────────────────
const rooms = {};

function generateRoomCode() {
  let code;
  do { code = Math.floor(1000 + Math.random() * 9000).toString(); } while (rooms[code]);
  return code;
}

const LANG_NAMES = {
  es: 'Español', en: 'English', fr: 'Français', de: 'Deutsch',
  ja: '日本語', zh: '中文', ar: 'العربية', it: 'Italiano', pt: 'Português',
};

let PUBLIC_URL = null;

// ─── Socket.IO ─────────────────────────────────────────────────────────
io.on('connection', (socket) => {

  socket.on('host:create_room', ({ apiKey, password }) => {
    // Validar contraseña del host
    if (password !== HOST_PASSWORD) {
        console.log(`Intento de creación de sala fallido: Contraseña incorrecta.`);
        return socket.emit('error', 'Contraseña de Host incorrecta. Acceso denegado.');
    }

    // No API key required on server side anymore; rely on browser STT and Gemini streaming
    const roomCode = generateRoomCode();
    rooms[roomCode] = {
      hostId: socket.id,
      participants: [],
      roomCode,
      transcript: [],
      hostLang: null,
      groqClient: null
    };
    
    socket.join(roomCode);
    socket.emit('host:room_created', { roomCode, publicUrl: PUBLIC_URL });
    console.log(`Room created: ${roomCode}`);
  });

  socket.on('host:toggle_mode', ({ roomCode, mode }) => {
    const room = rooms[roomCode];
    if (room && room.hostId === socket.id) {
        room.mode = mode;
        socket.to(roomCode).emit(mode === 'conference' ? 'host:force_mute' : 'host:allow_speak');
    }
  });

  socket.on('room:roster_request', ({ roomCode }) => {
    const room = rooms[roomCode];
    if (room && room.hostId === socket.id) {
      io.to(room.hostId).emit('room:roster_update', { participants: room.participants });
    }
  });

  socket.on('host:mute_user', ({ targetId }) => {
    // Individual mute
    io.to(targetId).emit('host:force_mute');
  });

  socket.on('host:unmute_user', ({ targetId }) => {
    // Individual unmute
    io.to(targetId).emit('host:allow_speak');
  });

  socket.on('participant:join_room', ({ roomCode, name, lang }) => {
    const room = rooms[roomCode];
    if (!room) return socket.emit('error', 'Sala no encontrada.');
    socket.join(roomCode);
    room.participants = room.participants.filter(p => p.id !== socket.id && p.name !== name);
    room.participants.push({ id: socket.id, name, lang, roomCode });
    io.to(roomCode).emit('room:roster_update', { participants: room.participants });
    socket.emit('participant:joined', { roomCode, name, lang });
    if (room.mode === 'conference') socket.emit('host:force_mute');
  });

  socket.on('participant:change_lang', ({ roomCode, lang }) => {
    const room = rooms[roomCode];
    if (!room) return;
    const p = room.participants.find(x => x.id === socket.id);
    if (p) {
      p.lang = lang;
      io.to(roomCode).emit('room:roster_update', { participants: room.participants });
    }
  });

  socket.on('host:change_lang', ({ roomCode, lang }) => {
    const room = rooms[roomCode];
    if (room && room.hostId === socket.id) room.hostLang = lang;
  });

  socket.on('host:end_room', ({ roomCode }) => {
    const room = rooms[roomCode];
    if (!room) return;
    io.to(roomCode).emit('room:closed', { transcript: room.transcript });
    delete rooms[roomCode];
  });

  // ─── Direct Text Translation (For Browser STT) ────────────────────────
  socket.on('translate:text', async ({ roomCode, text, speakerName, speakerLang, streaming }) => {
    if (!rooms[roomCode] || !text) return;

    const room = rooms[roomCode];
    const activeLangs = new Set(room.participants.map(p => p.lang));
    if (room.hostLang) activeLangs.add(room.hostLang);
    activeLangs.delete(speakerLang);

    const translations = {};
    translations[speakerLang] = text;

    // Streaming translation: translate interim text on-the-fly and broadcast without waiting for final
    const shouldStream = streaming === true;
    if (shouldStream && activeLangs.size > 0 && translationModel) {
        const langList = Array.from(activeLangs).map(l => `${l}: ${LANG_NAMES[l] || l}`).join(', ');
        const prompt = `Translate this text to multiple languages. \nInput text: "${text}"\nTarget languages: ${langList}\nReturn ONLY a raw JSON object where keys are the language ISO codes and values are the translation.`;
        try {
            const result = await translationModel.generateContent(prompt);
            const responseText = result.response.text();
            const jsonStr = responseText.replace(/```json|```/g, '').trim();
            const geminiTranslations = JSON.parse(jsonStr);
            Object.assign(translations, geminiTranslations);
        } catch (err) {
            console.error('Streaming translation error:', err.message);
            activeLangs.forEach(l => translations[l] = text);
        }
        // Broadcast streaming translations to all participants
        room.participants.forEach(p => {
          io.to(p.id).emit('transcript:broadcast', {
            senderName: speakerName,
            langOfSender: speakerLang,
            text: translations[p.lang] || text,
            isMe: p.id === socket.id
          });
        });
        // Also to host
        if (room.hostId) {
          io.to(room.hostId).emit('transcript:broadcast', {
            senderName: speakerName,
            langOfSender: speakerLang,
            text: translations[room.hostLang] || text,
            isMe: room.hostId === socket.id
          });
        }
        return;
    }

    if (activeLangs.size > 0 && translationModel) {
        const langList = Array.from(activeLangs).map(l => `${l}: ${LANG_NAMES[l] || l}`).join(', ');
        const prompt = `Translate this text to multiple languages. 
Input text: "${text}"
Target languages: ${langList}
Return ONLY a raw JSON object where keys are the language ISO codes and values are the translation.`;

        try {
            const result = await translationModel.generateContent(prompt);
            const responseText = result.response.text();
            const jsonStr = responseText.replace(/```json|```/g, '').trim();
            const geminiTranslations = JSON.parse(jsonStr);
            Object.assign(translations, geminiTranslations);
        } catch (err) {
            console.error('Batch Text Translation Error:', err.message);
            activeLangs.forEach(l => translations[l] = text);
        }
    } else {
        activeLangs.forEach(l => translations[l] = text);
    }

    // Broadcast to everyone (including interim streaming handled above)
    room.participants.forEach(p => {
        io.to(p.id).emit('transcript:broadcast', {
            senderName: speakerName,
            langOfSender: speakerLang,
            text: translations[p.lang] || text,
            isMe: p.id === socket.id
        });
    });

    // Send to host
    if (room.hostId) {
        io.to(room.hostId).emit('transcript:broadcast', {
            senderName: speakerName,
            langOfSender: speakerLang,
            text: translations[room.hostLang] || text,
            isMe: room.hostId === socket.id
        });
    }
  });

  socket.on('disconnect', () => {
    for (const [code, room] of Object.entries(rooms)) {
      if (room.hostId === socket.id) {
        io.to(code).emit('room:closed', { transcript: room.transcript });
        delete rooms[code];
      } else {
        const idx = room.participants.findIndex(p => p.id === socket.id);
        if (idx !== -1) {
          room.participants.splice(idx, 1);
          io.to(code).emit('room:roster_update', { participants: room.participants });
        }
      }
    }
  });
});

// ─── Audio endpoint ────────────────────────────────────────────────────────
app.post('/transcribir', upload.single('audio'), async (req, res) => {
  const { roomCode, speakerName, speakerLang } = req.body;
  const isHost = req.body.isHost === 'true';
  const room = rooms[roomCode];
  
  if (!req.file || !roomCode) return res.status(400).json({ ok: false, error: 'Missing data' });
  if (!room) return res.status(404).json({ ok: false, error: 'Room not found' });

  const tempPath = path.join(os.tmpdir(), `audio_${Date.now()}.webm`);
  
  try {
    // If browser-based transcription is used, this endpoint should not be called.
    if (!room || !room.groqClient) {
      return res.status(400).json({ ok: false, error: 'Transcripción no disponible en este modo' });
    }
    // 1. Save audio to disk
    fs.writeFileSync(tempPath, req.file.buffer);

    // 2. Transcription (via Groq/Whisper)
    const transcription = await room.groqClient.audio.transcriptions.create({
      file: fs.createReadStream(tempPath),
      model: 'whisper-large-v3-turbo',
      response_format: 'json',
      language: speakerLang,
    });

    const originalText = transcription.text?.trim();
    if (!originalText) return res.json({ ok: true, texto: '' });

    // 3. Collect required languages
    const activeLangs = new Set(room.participants.map(p => p.lang));
    if (room.hostLang) activeLangs.add(room.hostLang);
    activeLangs.delete(speakerLang); // Don't translate to speaker's own lang

    // 4. Translation Logic (Gemini 1.5 Flash Recommended)
    const translations = {};
    translations[speakerLang] = originalText;

    if (activeLangs.size > 0) {
        if (translationModel) {
            // BATCH TRANSLATION: One request for all active languages
            const langList = Array.from(activeLangs).map(l => `${l}: ${LANG_NAMES[l] || l}`).join(', ');
            const prompt = `Translate this text to multiple languages. 
Input text: "${originalText}"
Target languages: ${langList}
Return ONLY a raw JSON object where keys are the language ISO codes (e.g. "en", "fr") and values are the translation. No markdown.`;

            try {
                const result = await translationModel.generateContent(prompt);
                const responseText = result.response.text();
                // Clean JSON if Gemini wraps it
                const jsonStr = responseText.replace(/```json|```/g, '').trim();
                const geminiTranslations = JSON.parse(jsonStr);
                Object.assign(translations, geminiTranslations);
            } catch (err) {
                console.error('Batch Translation Error:', err.message);
                // Fallback attempt per language
                activeLangs.forEach(l => { if (!translations[l]) translations[l] = originalText; });
            }
        } else {
            // Fallback (e.g. if no model initialized)
            activeLangs.forEach(l => translations[l] = originalText);
        }
    }

    // 5. Save & Broadcast
    const entry = { time: new Date().toISOString(), name: speakerName, lang: speakerLang, original: originalText, translations };
    room.transcript.push(entry);

    room.participants.forEach(p => {
      io.to(p.id).emit('transcript:broadcast', {
        senderName: speakerName, langOfSender: speakerLang,
        text: translations[p.lang] || originalText,
        isMe: p.name === speakerName
      });
    });

    io.to(room.hostId).emit('transcript:broadcast', {
      senderName: speakerName, langOfSender: speakerLang,
      text: (room.hostLang ? translations[room.hostLang] : originalText) || originalText,
      isMe: isHost
    });

    return res.json({ ok: true, texto: originalText });

  } catch (e) {
    console.error('Processing error:', e.message);
    return res.status(500).json({ ok: false, error: e.message });
  } finally {
    if (fs.existsSync(tempPath)) fs.unlinkSync(tempPath);
  }
});

// ─── Transcript download ──────────────────────────────────────────────────────
app.get('/transcript/:roomCode/:lang', (req, res) => {
  const { roomCode, lang } = req.params;
  const room = rooms[roomCode];
  if (!room) return res.status(404).send('Room not found');
  
  const lines = (room.transcript || []).map(e => {
    const ts = new Date(e.time).toLocaleTimeString();
    const text = e.translations?.[lang] || e.original;
    return `[${ts}] ${e.name}: ${text}`;
  }).join('\n');
  
  res.setHeader('Content-Disposition', `attachment; filename="transcript_${lang}_${roomCode}.txt"`);
  res.setHeader('Content-Type', 'text/plain; charset=utf-8');
  res.send(lines || 'No hay transcripciones disponibles.');
});

// ─── Start ─────────────────────────────────────────────────────────────────
const PORT = process.env.PORT || 3000;
server.listen(PORT, '0.0.0.0', async () => {
  console.log(`LinguaBridge running on port ${PORT}...`);

  // Start ngrok only in local dev (not on Render)
  if (!process.env.RENDER) {
    try {
      if (ngrok) {
        const listener = await ngrok.forward({
          addr: PORT,
          authtoken: NGROK_AUTHTOKEN,
        });
        PUBLIC_URL = listener.url();
        console.log(`\n🌐 Public HTTPS URL: ${PUBLIC_URL}`);
        console.log(`   Host panel:        ${PUBLIC_URL}/host.html\n`);
      } else {
        console.log('ngrok no disponible, usando localhost');
        PUBLIC_URL = `http://localhost:${PORT}`;
      }
    } catch (e) {
      console.error('ngrok error:', e.message);
      PUBLIC_URL = `http://localhost:${PORT}`;
    }
  } else {
    PUBLIC_URL = `https://${process.env.RENDER_EXTERNAL_HOSTNAME}`;
  }
});
