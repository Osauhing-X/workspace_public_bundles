import { createServer } from 'node:http';

const port = Number(process.env.PORT ?? 3000);
createServer((request, response) => {
  if (request.url === '/health') { response.end('ok'); return; }
  response.writeHead(404); response.end('Not found');
}).listen(port);
