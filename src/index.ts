import express from 'express';
import { createServer } from 'http';
import { Server } from 'socket.io';
import cors from 'cors';
import dotenv from 'dotenv';
import { WhatsAppClient } from './wa/client.js';
import { CampaignEngine } from './campaign/engine.js';

dotenv.config();

const app = express();
const httpServer = createServer(app);
const io = new Server(httpServer, {
    cors: {
        origin: process.env.FRONTEND_URL || '*', // Set this to your frontend URL in Railway
        methods: ['GET', 'POST']
    }
});

app.use(cors());
app.use(express.json());

const PORT = process.env.PORT || 4000;

const waClient = new WhatsAppClient(io);
const campaignEngine = new CampaignEngine(waClient, io);

// Socket.IO handlers
io.on('connection', (socket) => {
    console.log('Client connected:', socket.id);

    // Send current status immediately
    socket.emit('wa:status', { status: waClient.status });

    socket.on('wa:connect', () => {
        waClient.initialize();
    });

    socket.on('disconnect', () => {
        console.log('Client disconnected:', socket.id);
    });
});

// Routes
app.get('/health', (req, res) => {
    res.json({ status: 'ok', waStatus: waClient.status });
});

app.post('/whatsapp/logout', async (req, res) => {
    await waClient.logout();
    res.json({ success: true });
});

app.post('/campaign/start', async (req, res) => {
    const { numbers, message, delayMsMin, delayMsMax } = req.body;

    if (!numbers || !message) {
        return res.status(400).json({ error: 'Numbers and message are required' });
    }

    if (waClient.status !== 'CONNECTED') {
        return res.status(400).json({ error: 'WhatsApp is not connected' });
    }

    campaignEngine.startCampaign(numbers, message, delayMsMin || 2000, delayMsMax || 6000);
    res.json({ success: true });
});

app.post('/campaign/pause', (req, res) => {
    campaignEngine.pause();
    res.json({ success: true });
});

app.post('/campaign/resume', (req, res) => {
    campaignEngine.resume();
    res.json({ success: true });
});

app.post('/campaign/cancel', (req, res) => {
    campaignEngine.cancel();
    res.json({ success: true });
});

app.get('/campaign/status', (req, res) => {
    res.json(campaignEngine.getStatus());
});

httpServer.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
});
