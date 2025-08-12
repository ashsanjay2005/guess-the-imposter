import { describe, it, expect, vi } from 'vitest';
import { Server } from 'socket.io';
import { createServer } from '../src/index';
import { io as Client } from 'socket.io-client';

describe('socket integration - single round happy path', () => {
  it('runs a round through to results', async () => {
    const { server } = createServer(0);
    const address = server.address();
    const port = typeof address === 'object' && address ? address.port : 0;

    const host = Client(`http://localhost:${port}`);

    const data: any = await new Promise((resolve) => {
      host.emit('room:create', { name: 'Host' }, (resp: any) => resolve(resp));
    });

    const code = data.code as string;

    const p2 = Client(`http://localhost:${port}`);
    const p3 = Client(`http://localhost:${port}`);
    const p4 = Client(`http://localhost:${port}`);
    await Promise.all([
      new Promise((res) => p2.emit('room:join', { code, name: 'P2' }, () => res(null))),
      new Promise((res) => p3.emit('room:join', { code, name: 'P3' }, () => res(null))),
      new Promise((res) => p4.emit('room:join', { code, name: 'P4' }, () => res(null))),
    ]);

    // shorten timers dramatically
    host.emit('host:updateSettings', { answerSeconds: 1, discussSeconds: 1, votingSeconds: 1 });

    host.emit('host:start');

    // wait for answering phase and capture private questions
    const questions: string[] = [];
    await new Promise<void>((resolve) => {
      let count = 0;
      const cb = (payload: any) => {
        if (payload.state === 'ANSWERING') {
          if (payload.yourQuestion) questions.push(payload.yourQuestion);
          count += 1;
          if (count >= 4) resolve();
        }
      };
      host.on('round:phase', cb);
      p2.on('round:phase', cb);
      p3.on('round:phase', cb);
      p4.on('round:phase', cb);
    });

    // Submit answers
    host.emit('round:answer', { text: '8 hours' });
    p2.emit('round:answer', { text: '7 hours' });
    p3.emit('round:answer', { text: '6 hours' });
    p4.emit('round:answer', { text: '4 hours' });

    // After discuss and voting phases, vote quickly
    await new Promise((resolve) => setTimeout(resolve, 5000));
    host.emit('round:vote', { targetId: 'non-existent' });
    p2.emit('round:vote', { targetId: 'non-existent' });
    p3.emit('round:vote', { targetId: 'non-existent' });
    p4.emit('round:vote', { targetId: 'non-existent' });

    // Wait for results
    const results = await new Promise<any>((resolve) => {
      host.on('round:results', (payload) => resolve(payload));
      p2.on('round:results', (payload) => resolve(payload));
    });

    expect(results).toHaveProperty('imposterId');
    expect(results).toHaveProperty('votes');

    host.close();
    p2.close();
    p3.close();
    p4.close();
    server.close();
  }, 30_000);
});


