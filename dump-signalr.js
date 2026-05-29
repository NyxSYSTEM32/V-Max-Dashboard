import { WebSocket } from 'ws';
import zlib from 'zlib';
import fs from 'fs';

const URL = 'livetiming.formula1.com/signalr';
const HUB = 'Streaming';
const TOPICS = ["CarData.z", "Position.z", "TimingData", "SessionInfo", "DriverList", "TimingAppData"];

async function run() {
  const hubParam = JSON.stringify([{ name: HUB }]);
  const negotiateUrl = `https://${URL}/negotiate?clientProtocol=1.5&connectionData=${encodeURIComponent(hubParam)}`;
  const res = await fetch(negotiateUrl);
  const cookie = res.headers.get('set-cookie').split(';')[0];
  const data = await res.json();
  const token = data.ConnectionToken;

  const connectUrl = `wss://${URL}/connect?clientProtocol=1.5&transport=webSockets&connectionToken=${encodeURIComponent(token)}&connectionData=${encodeURIComponent(hubParam)}`;
  
  const ws = new WebSocket(connectUrl, {
    headers: { 'User-Agent': 'BestHTTP', 'Cookie': cookie }
  });

  ws.on('open', () => {
    ws.send(JSON.stringify({ H: HUB, M: 'Subscribe', A: [TOPICS], I: "1" }));
  });

  const dumped = {};

  ws.on('message', (msg) => {
    const str = msg.toString();
    if (str === '{}') return;
    try {
      const parsed = JSON.parse(str);
      if (parsed.M) {
        parsed.M.forEach(u => {
          let topic = u.A[0];
          let payload = u.A[1];
          if (topic.endsWith('.z')) {
            const buf = Buffer.from(payload, 'base64');
            payload = JSON.parse(zlib.inflateRawSync(buf).toString('utf-8'));
            topic = topic.replace('.z', '');
          }
          if (!dumped[topic]) {
            dumped[topic] = true;
            fs.writeFileSync(`dump_${topic}.json`, JSON.stringify(payload, null, 2));
            console.log('Dumped', topic);
            
            if (Object.keys(dumped).length >= 6) {
              console.log('All dumped, exiting');
              process.exit(0);
            }
          }
        });
      }
    } catch(e) {}
  });
}

run();
