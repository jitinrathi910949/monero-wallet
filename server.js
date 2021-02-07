const WebSocket = require('ws');
const {
  Worker,
} = require('worker_threads');
const writeLogs = require('./writeLogs');
const stringify = require('json-stringify-safe');

const RESPONSE = {
  ERROR: 'error',
  SUCCESS: 'success',
  requestMethods: 'requestMethods',
}
const path = require('path')
const workerPath = path.join(__dirname, 'serverworker.js');


function errorMsg(msg) {
  return {
    responseType: RESPONSE.ERROR,
    message: msg,
  }
}

const validRequests = [
  'importWallets',
  'exportWallets',
  'sendPayment',
  'getWalletDetails',
  'getTransactions',
  'createNewWallet',
];

// Main Thread
console.clear();
process.env.NEW_WALLETS = [];

// Standard Websocket setup
const clients = {};
const PORT = process.argv[2] || 8080;

function sendToClient(clientKey, query, data) {
  const client = clients[clientKey];
  if (client.readyState !== WebSocket.OPEN) return;

  // To avoid circular Json Stringify, added new library for safe stringify 
  client.send(stringify({
    data,
    query
  }));
}

const server = new WebSocket.Server({
  port: PORT,
  perMessageDeflate: false
});

// end Standard Websocket setup




server.on('connection', (ws, req) => {
  // Register clients connected
  const id = req.headers['sec-websocket-key'];
  clients[id] = ws;
  const worker = new Worker(workerPath);
  writeLogs('server conected');

  worker.on('message', response => {
    if (!response) return;
    const {
      data,
      query,
      clientId
    } = response;
    console.log('WORKER RESPONSE: ');
    // process.env.NEW_WALLETS;
    writeLogs('query: ' + query)
    console.log('query: ' + query);
    sendToClient(clientId, query, data)
  });
  worker.on('error', (err) => console.error(err));
  worker.on('exit', (code) => {
    if (code !== 0)
      return (new Error(`Worker stopped with exit code ${code}`));
    console.log('Request Done')
  });

  ws.on('message', async (data) => {
    // Request parser
    const request = JSON.parse(data);
    const query = request.query;
    const clientId = req.headers['sec-websocket-key'];
    if (!request.query) {
      ws.send(errorMsg('Required param: query  is missing'));
      return;
    }
    // end Request parser

    if (validRequests.includes(query)) {
      const params = typeof request.params === 'string' ? JSON.parse(request.params) : request.params;
      console.log('request.query' + request.query);
      worker.postMessage({
        query,
        params,
        clientId,
      });
    } else {
      ws.send(errorMsg('Query not found'));
    }
  });
});

if (PORT === 8080)
  console.log(`Server running at port ${PORT}. Add another parameter to specify Port`);
else
  console.log(`Server running at port ${PORT}.`)

