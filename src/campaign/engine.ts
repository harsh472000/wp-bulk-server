import { WhatsAppClient } from '../wa/client.js';
import { Server } from 'socket.io';

interface CampaignStats {
    total: number;
    sent: number;
    failed: number;
    pending: number;
}

interface CampaignTask {
    number: string;
    message: string;
}

export class CampaignEngine {
    private wa: WhatsAppClient;
    private io: Server;
    private queue: CampaignTask[] = [];
    private stats: CampaignStats = { total: 0, sent: 0, failed: 0, pending: 0 };
    private isPaused: boolean = false;
    private isCancelled: boolean = false;
    private isRunning: boolean = false;

    constructor(wa: WhatsAppClient, io: Server) {
        this.wa = wa;
        this.io = io;
    }

    public async startCampaign(numbers: string[], message: string, delayMin: number, delayMax: number) {
        if (this.isRunning) return;

        this.queue = numbers.map(num => ({ number: num, message }));
        this.stats = { total: numbers.length, sent: 0, failed: 0, pending: numbers.length };
        this.isPaused = false;
        this.isCancelled = false;
        this.isRunning = true;

        this.io.emit('campaign:stats', this.stats);
        this.processQueue(delayMin, delayMax);
    }

    private async processQueue(delayMin: number, delayMax: number) {
        while (this.queue.length > 0 && !this.isCancelled) {
            if (this.isPaused) {
                await new Promise(resolve => setTimeout(resolve, 1000));
                continue;
            }

            const task = this.queue.shift();
            if (!task) break;

            try {
                // Validation: check if number is on WhatsApp
                const chatId = task.number.includes('@c.us') ? task.number : `${task.number}@c.us`;

                // Actually sending
                await this.wa.client.sendMessage(chatId, task.message);

                this.stats.sent++;
                this.stats.pending--;
                this.io.emit('campaign:progress', {
                    normalizedNumber: task.number,
                    status: 'sent',
                    timestamp: new Date().toISOString()
                });
            } catch (err: any) {
                console.error(`Failed to send to ${task.number}`, err);
                this.stats.failed++;
                this.stats.pending--;
                this.io.emit('campaign:progress', {
                    normalizedNumber: task.number,
                    status: 'failed',
                    error: err.message || 'Unknown error',
                    timestamp: new Date().toISOString()
                });
            }

            this.io.emit('campaign:stats', this.stats);

            if (this.queue.length > 0 && !this.isCancelled) {
                const delay = Math.floor(Math.random() * (delayMax - delayMin + 1)) + delayMin;
                await new Promise(resolve => setTimeout(resolve, delay));
            }
        }

        this.isRunning = false;
        if (this.isCancelled) {
            // Mark remaining as skipped
            while (this.queue.length > 0) {
                const task = this.queue.shift();
                if (task) {
                    this.io.emit('campaign:progress', {
                        normalizedNumber: task.number,
                        status: 'skipped',
                        error: 'Campaign cancelled',
                        timestamp: new Date().toISOString()
                    });
                }
            }
        }
    }

    public pause() { this.isPaused = true; }
    public resume() { this.isPaused = false; }
    public cancel() { this.isCancelled = true; }

    public getStatus() {
        return {
            isRunning: this.isRunning,
            isPaused: this.isPaused,
            stats: this.stats
        };
    }
}
