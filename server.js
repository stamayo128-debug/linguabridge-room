const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');
const path = require('path');
const fs = require('fs');
const os = require('os');
const Groq = require('groq-sdk');

const app = express();
const server = http.createServer(app);
const io = new Server(server, { cors: { origin: "*" } });

app.use(cors());
app.use(express.static(path.join(__dirname, 'public')));
app.use(express.json());

const rooms = {};

function generateRoomCode() {
  let code;
  do { code = Math.floor(1000 + Math.random() * 9000).toString(); } while (rooms[code]);
  return code;
}

io.on('connection', (socket) => {
  socket.on('host:create_room', (data) => {
    const { apiKey } = data;
    if (!apiKey) return socket.emit('error', 'API Key is required.');
    
    const groq = new Groq({ apiKey });
    const roomCode = generateRoomCode();
    rooms[roomCode] = {
      hostId: socket.id,
      groqClient: groq,
      participants: [],
      mode: 'conference' // default mode
    };

    socket.join(roomCode);
    socket.emit('host:room_created', { roomCode });
  });

  socket.on('host:set_mode', (data) => {
    const { roomCode, mode } = data;
    const room = rooms[roomCode];
    if (!room || room.hostId !== socket.id) return;
    
    room.mode = mode;
    // Broadcast mute/unmute to everyone except host
    if (mode === 'conference') {
      socket.to(roomCode).emit('host:force_mute');
    } else {
      socket.to(roomCode).emit('host:allow_speak');
    }
  });

  socket.on('host:mute_user', (data) => {
    // Only allow if this is the host. For simplicity in MVP, we trust the caller.
    io.to(data.targetId).emit('host:force_mute_individual');
  });

  socket.on('host:unmute_user', (data) => {
    io.to(data.targetId).emit('host:allow_speak_individual');
  });

  socket.on('participant:join_room', (data) => {
    const { roomCode, name, lang } = data;
    const room = rooms[roomCode];
    if (!room) return socket.emit('error', 'Sala no encontrada / Room not found.');

    socket.join(roomCode);
    room.participants = room.participants.filter(p => !(p.name === name || p.id === socket.id));
    room.participants.push({ id: socket.id, name, lang, roomCode });
    
    io.to(roomCode).emit('room:roster_update', { participants: room.participants });
    socket.emit('participant:joined', { roomCode, name, lang });
    
    // Sync initial mode
    if (room.mode === 'conference') {
      socket.emit('host:force_mute');
    }
  });

  socket.on('audio:stream_chunk', async (data) => {
    let myRoomCode = null, myInfo = null;
    for (const [code, room] of Object.entries(rooms)) {
      const p = room.participants.find(part => part.id === socket.id);
      if (p) { myRoomCode = code; myInfo = p; break; }
    }

    if (!myRoomCode) return;
    const room = rooms[myRoomCode];
    // Security check: Don't process audio from participants if mode is conference
    if (room.mode === 'conference' && room.hostId !== socket.id) {
       return; // Host muted everyone, discard rogue packets
    }

    const groq = room.groqClient;
    if (!data.audio || data.audio.byteLength === 0) return;

    try {
      const tempId = Date.now().toString() + '_' + Math.floor(Math.random() * 1000);
      const tempPath = path.join(os.tmpdir(), `audio_${tempId}.webm`);
      fs.writeFileSync(tempPath, data.audio);

      const transcription = await groq.audio.transcriptions.create({
        file: fs.createReadStream(tempPath),
        model: "whisper-large-v3-turbo",
        prompt: "Translate and transcribe audio into text clearly.", 
        response_format: "json",
        language: myInfo.lang 
      });
      fs.unlinkSync(tempPath);

      const originalText = transcription.text;
      if (!originalText || originalText.trim() === '') return;

      const targetLangs = [...new Set(room.participants.filter(p => p.lang !== myInfo.lang).map(p => p.lang))];
      const translations = {};
      
      if (targetLangs.length > 0) {
        const translatePromises = targetLangs.map(async (targetLang) => {
          const completion = await groq.chat.completions.create({
            messages: [
              { role: "system", content: `You are a real-time translator. Translate the following text from ${myInfo.lang} to ${targetLang}. Reply ONLY with the exact translation, no extra text.` },
              { role: "user", content: originalText }
            ],
            model: "llama-3.3-70b-versatile",
            temperature: 0.1,
          });
          translations[targetLang] = completion.choices[0].message.content.trim();
        });
        await Promise.all(translatePromises);
      }

      io.to(myRoomCode).emit('transcript:broadcast', {
        senderName: myInfo.name,
        langOfSender: myInfo.lang,
        original: originalText,
        translations: translations
      });
    } catch (err) { console.error('Groq processing error:', err.message); }
  });

  socket.on('disconnect', () => {
    for (const [code, room] of Object.entries(rooms)) {
      if (room.hostId === socket.id) {
        io.to(code).emit('room:closed');
        delete rooms[code];
      } else {
        const index = room.participants.findIndex(p => p.id === socket.id);
        if (index !== -1) {
          room.participants.splice(index, 1);
          io.to(code).emit('room:roster_update', { participants: room.participants });
        }
      }
    }
  });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => { console.log(`LinguaBridge Server running on port ${PORT}...`); });
