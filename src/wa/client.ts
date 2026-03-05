import pkg from 'whatsapp-web.js';
const { Client, LocalAuth } = pkg;
import qrcode from 'qrcode-terminal';
import { Server } from 'socket.io';

export class WhatsAppClient {
  public client: any;
  private io: Server;
  public status: 'INITIALIZING' | 'DISCONNECTED' | 'QR_READY' | 'CONNECTING' | 'CONNECTED' | 'AUTH_FAILURE' = 'INITIALIZING';

  constructor(io: Server) {
    this.io = io;
    this.client = new Client({
      authStrategy: new LocalAuth(),
      puppeteer: {
        args: [
          '--no-sandbox',
          '--disable-setuid-sandbox',
          '--disable-dev-shm-usage',
          '--disable-accelerated-2d-canvas',
          '--no-first-run',
          '--no-zygote',
          '--single-process',
          '--disable-gpu'
        ],
      }
    });

    this.setupEventListeners();
  }

  private setupEventListeners() {
    this.client.on('qr', (qr: string) => {
      console.log('QR RECEIVED', qr);
      this.status = 'QR_READY';
      this.io.emit('wa:status', { status: this.status });
      this.io.emit('wa:qr', { qrString: qr });
      // Also log to terminal for convenience
      qrcode.generate(qr, { small: true });
    });

    this.client.on('ready', () => {
      console.log('CLIENT IS READY');
      this.status = 'CONNECTED';
      this.io.emit('wa:status', { status: this.status });
    });

    this.client.on('authenticated', () => {
      console.log('AUTHENTICATED');
    });

    this.client.on('auth_failure', (msg: string) => {
      console.error('AUTHENTICATION FAILURE', msg);
      this.status = 'AUTH_FAILURE';
      this.io.emit('wa:status', { status: this.status });
    });

    this.client.on('disconnected', (reason: string) => {
      console.log('CLIENT DISCONNECTED', reason);
      this.status = 'DISCONNECTED';
      this.io.emit('wa:status', { status: this.status });

      // Attempt to re-initialize if it was an unexpected disconnection
      // Re-initialize logic can be added here or triggered by the client
    });
  }

  public async initialize() {
    if (this.status === 'CONNECTED') return;
    this.status = 'CONNECTING';
    this.io.emit('wa:status', { status: this.status });
    try {
      await this.client.initialize();
    } catch (err) {
      console.error('Failed to initialize WA client', err);
      this.status = 'DISCONNECTED';
      this.io.emit('wa:status', { status: this.status });
    }
  }

  public async logout() {
    try {
      await this.client.logout();
      this.status = 'DISCONNECTED';
      this.io.emit('wa:status', { status: this.status });
    } catch (err) {
      console.error('Failed to logout WA client', err);
    }
  }
}
