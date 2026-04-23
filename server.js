const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');
const path = require('path');
const { GoogleGenerativeAI } = require('@google/generative-ai');
require('dotenv').config();

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
    cors: { origin: '*' }
});

app.use(cors());
app.use(express.static(path.join(__dirname, 'public')));
app.use(express.json());

const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
const HOST_PASSWORD = process.env.HOST_PASSWORD || 'admin123';
const genAI = GEMINI_API_KEY ? new GoogleGenerativeAI(GEMINI_API_KEY) : null;
const translationModel = genAI ? genAI.getGenerativeModel({ model: "gemini-1.5-flash" }) : null;

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

io.on('connection', (socket) => {
    console.log(`Client connected: ${socket.id}`);

    socket.on('host:create_room', ({ password }) => {
        if (password !== HOST_PASSWORD) {
            return socket.emit('error', 'Contraseña incorrecta');
        }

        const roomCode = generateRoomCode();
        rooms[roomCode] = {
            hostId: socket.id,
            participants: [],
            roomCode,
            transcript: [],
            hostLang: null,
            peerIds: []
        };
        
        socket.join(roomCode);
        socket.emit('host:room_created', { roomCode });
        console.log(`Room created: ${roomCode}`);
    });

    socket.on('host:join_webrtc', ({ roomCode }) => {
        const room = rooms[roomCode];
        if (!room || room.hostId !== socket.id) return;
        room.hostSocket = socket.id;
        socket.to(roomCode).emit('webrtc:host_ready');
    });

    socket.on('webrtc:participant_ready', ({ roomCode, participantId }) => {
        const room = rooms[roomCode];
        if (!room) return;
        io.to(room.hostId).emit('webrtc:new_participant', { participantId });
    });

    socket.on('webrtc:offer', ({ roomCode, participantId, offer }) => {
        const room = rooms[roomCode];
        if (!room) return;
        io.to(participantId).emit('webrtc:offer', { offer, hostId: room.hostId });
    });

    socket.on('webrtc:answer', ({ roomCode, hostId, answer }) => {
        io.to(hostId).emit('webrtc:answer', { answer, participantId: socket.id });
    });

    socket.on('webrtc:ice_candidate', ({ roomCode, targetId, candidate }) => {
        io.to(targetId).emit('webrtc:ice_candidate', { candidate, fromId: socket.id });
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

    socket.on('host:mute_user', ({ roomCode, targetId }) => {
        io.to(targetId).emit('host:force_mute');
    });

    socket.on('host:unmute_user', ({ roomCode, targetId }) => {
        io.to(targetId).emit('host:allow_speak');
    });

    socket.on('participant:join_room', ({ roomCode, name, lang }) => {
        const room = rooms[roomCode];
        if (!room) return socket.emit('error', 'Sala no encontrada');
        
        socket.join(roomCode);
        room.participants = room.participants.filter(p => p.id !== socket.id && p.name !== name);
        room.participants.push({ id: socket.id, name, lang, roomCode });
        
        io.to(roomCode).emit('room:roster_update', { participants: room.participants });
        socket.emit('participant:joined', { roomCode, name, lang });
        
        if (room.mode === 'conference') socket.emit('host:force_mute');
        
        io.to(room.hostId).emit('webrtc:participant_ready', { participantId: socket.id });
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

    socket.on('translate:text', async ({ roomCode, text, speakerName, speakerLang, streaming }) => {
        if (!rooms[roomCode] || !text) return;

        const room = rooms[roomCode];
        const activeLangs = new Set(room.participants.map(p => p.lang));
        if (room.hostLang) activeLangs.add(room.hostLang);
        activeLangs.delete(speakerLang);

        const translations = {};
        translations[speakerLang] = text;

        if (activeLangs.size > 0 && translationModel) {
            const langList = Array.from(activeLangs).map(l => `${l}: ${LANG_NAMES[l] || l}`).join(', ');
            let prompt;
            
            if (streaming) {
                prompt = `You are translating a LIVE speech fragment. Be FAST and CONCISE.
Translate to each language naturally as if someone is speaking right now.

Input: "${text}"
Languages: ${langList}
Return ONLY a valid JSON object. No markdown, no explanation. Example format: {"en": "translation", "fr": "traduction"}`;
            } else {
                prompt = `Translate this speech transcript accurately and naturally.

Input: "${text}"
Languages: ${langList}
Return ONLY a valid JSON object. No markdown, no explanation. Example format: {"en": "translation", "fr": "traduction", "ja": "翻訳"}`;
            }

            try {
                const result = await translationModel.generateContent(prompt);
                const responseText = result.response.text();
                const match = responseText.match(/\{[\s\S]*\}/);
                const jsonStr = match ? match[0] : responseText.replace(/```json|```/g, '').trim();
                const parsed = JSON.parse(jsonStr);
                Object.assign(translations, parsed);
                console.log('Translation successful:', Object.keys(translations));
            } catch (err) {
                console.error('Translation error:', err.message);
                activeLangs.forEach(l => translations[l] = text);
            }
        } else {
            activeLangs.forEach(l => translations[l] = text);
        }

        room.participants.forEach(p => {
            io.to(p.id).emit('transcript:broadcast', {
                senderName: speakerName,
                langOfSender: speakerLang,
                text: translations[p.lang] || text,
                isMe: p.id === socket.id,
                isInterim: streaming
            });
        });

        if (room.hostId) {
            io.to(room.hostId).emit('transcript:broadcast', {
                senderName: speakerName,
                langOfSender: speakerLang,
                text: translations[room.hostLang] || text,
                isMe: room.hostId === socket.id,
                isInterim: streaming
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

const PORT = process.env.PORT || 3000;
server.listen(PORT, '0.0.0.0', () => {
    console.log(`LinguaBridge running on port ${PORT}`);
});