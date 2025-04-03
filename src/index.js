import { createLibp2p } from 'libp2p';
import { identify } from '@libp2p/identify';
import { noise } from '@chainsafe/libp2p-noise';
import { yamux } from '@chainsafe/libp2p-yamux';
import { multiaddr } from '@multiformats/multiaddr';
import { webSockets } from '@libp2p/websockets';
import { webTransport } from '@libp2p/webtransport';
import { webRTC, webRTCDirect } from '@libp2p/webrtc';
import { circuitRelayTransport, circuitRelayServer } from '@libp2p/circuit-relay-v2';
import { enable, disable } from '@libp2p/logger';
import { update, getPeerTypes, getAddresses, getPeerDetails } from './utils';
import { bootstrap } from '@libp2p/bootstrap';
import { byteStream } from 'it-byte-stream';
import { toString, fromString } from 'uint8arrays';

import * as filters from '@libp2p/websockets/filters';

import { generatePeerId } from './key-manglage.js';

const RELAY_ID = 200;
const RELAY_HOST = '/dns4/troll.fudco.com';

const App = async () => {
  const peerIdList = []; // id -> peerID
  const idMap = new Map(); // peerID -> id
  peerIdList[0] = null;
  for (let i = 1; i < 256; ++i) {
    const peerId =  await generatePeerId(i);
    peerIdList[i] = peerId
    idMap.set(peerId.toString(), i);
  }

  const activeChannels = new Map(); // peerID -> channel info
  const queryParams = new URLSearchParams(location.search);
  let localId = Number.parseInt(queryParams.get('id')) || 0;
  if (localId < 1 || 255 < localId) {
    localId = 0;
  }
  const showEvents = queryParams.get('events');
  const showPeerTypes = queryParams.get('peertypes');
  const showAddresses = queryParams.get('addresses');
  const peerId = peerIdList[localId];
  console.log(`I am id:${localId} peerId:${peerId}`);

  const relayPeerId = peerIdList[RELAY_ID];
  const relayAddr = `${RELAY_HOST}/tcp/9001/ws/p2p/${relayPeerId}`;

  const libp2p = await createLibp2p({
    peerId,
    addresses: {
      listen: [
        // 👇 Listen for webRTC connection
        '/webrtc',
      ],
    },
    transports: [
      webSockets({
        // Allow all WebSocket connections inclusing without TLS
        filter: filters.all,
      }),
      webTransport(),
      webRTC(),
      // 👇 Required to create circuit relay reservations in order to hole punch browser-to-browser WebRTC connections
      circuitRelayTransport({
        discoverRelays: 1,
      }),
    ],
    connectionEncryption: [noise()],
    streamMuxers: [yamux()],
    connectionGater: {
      // Allow private addresses for local testing
      denyDialMultiaddr: async () => false,
    },
    peerDiscovery: [
      bootstrap({
        list: [relayAddr],
      }),
    ],
    services: {
      identify: identify(),
    },
  });

  globalThis.libp2p = libp2p;

  const DOM = {
    nodePeerId: () => document.getElementById('output-node-peer-id'),
    nodeStatus: () => document.getElementById('output-node-status'),
    nodePeerCount: () => document.getElementById('output-peer-count'),
    nodePeerTypes: () => document.getElementById('output-peer-types'),
    nodeAddressCount: () => document.getElementById('output-address-count'),
    nodeAddresses: () => document.getElementById('output-addresses'),
    nodePeerDetails: () => document.getElementById('output-peer-details'),

    inputMultiaddr: () => document.getElementById('input-multiaddr'),
    inputTarget: () => document.getElementById('input-target'),
    inputMessage: () => document.getElementById('input-message'),
    connectButton: () => document.getElementById('button-connect'),
    sendButton: () => document.getElementById('button-send'),
    outputMessages: () => document.getElementById('output-messages'),
  };

  outputLine(`I am id:${localId} peerId:${peerId}`);

  update(DOM.nodePeerId(), libp2p.peerId.toString());
  update(DOM.nodeStatus(), 'Online');

  function outputLine(text) {
    const line = document.createElement('div');
    line.setAttribute('class', 'text-sm break-all');
    line.appendChild(document.createTextNode(text));
    DOM.outputMessages().append(line);
  }

  function outputEvent(desc) {
    if (showEvents) {
      outputLine(`#### ${desc}`);
    }
  }

  function outputMsg(id, msg) {
    outputLine(`${id}:: '${msg}'`);
  }

  function outputError(id, task, problem) {
    if (problem) {
      outputLine(`${id}:: error ${task}: ${problem}`);
    } else {
      outputLine(`${id}:: error ${task}`);
    }
  }

  function logEvent(type, event) {
    switch (type) {
      case 'certificate:provision':
      case 'certificate:renew':
        const cert = event.detail;
        outputEvent(`${type}: cert=${cert.cert} key=${cert.key}`);
        break;
      case 'connection:close':
      case 'connection:open':
        const conn = event.detail;
        outputEvent(`${type}: id=${conn.id} dir=${conn.direction} remote=${conn.remotePeer} addr=${conn.remoteAddr} status=${conn.status}`);
        break;
      case 'connection:prune':
        const conns = event.detail;
        outputEvent(`${type}: ids=[${conns.map((c) => c.id).join(',')}]`);
        break;
      case 'peer:connect':
      case 'peer:disconnect':
      case 'peer:reconnect-failure':
        outputEvent(`${type}: ${event.detail}`);
        break;
      case 'peer:discovery':
        const peerInfo = event.detail;
        outputEvent(`${type}: ${peerInfo.id} [${peerInfo.multiaddrs.join(',')}]`);
        break;
      case 'peer:identify':
        const ir = event.detail;
        outputEvent(`${type}: conn=${ir.connection.id} peer=${ir.peerId}`);
        break;
      case 'peer:update':
      case 'self:peer:update':
        const pu = event.detail;
        outputEvent(`${type}: peer=${pu.peer.id} previous=${pu.previous?.id}`);
        break;
      case 'start':
      case 'stop':
      case 'transport:close':
      case 'transport:listening':
        outputEvent(`${type}`);
        break;
      default:
        outputEvent(`${type}: unknown event ${JSON.stringify(event.detail)}`);
        break;
    }
  }

  const eventTypes = [
    'certificate:provision',
    'certificate:renew',
    'connection:close',
    'connection:open',
    'connection:prune',
    'peer:connect',
    'peer:disconnect',
    'peer:discovery',
    'peer:identify',
    'peer:reconnect-failure',
    'peer:update',
    'self:peer:update',
    'start',
    'stop',
    'transport:close',
    'transport:listening',
  ];
  if (showEvents) {
    for (const et of eventTypes) {
      libp2p.addEventListener(et, (event) => logEvent(et, event));
    }
  }

  setInterval(() => {
    update(DOM.nodePeerCount(), libp2p.getConnections().length)
    if (showPeerTypes) {
      update(DOM.nodePeerTypes(), getPeerTypes(libp2p))
    }
    update(DOM.nodeAddressCount(), libp2p.getMultiaddrs().length)
    if (showAddresses) {
      update(DOM.nodeAddresses(), getAddresses(libp2p))
    }
    update(DOM.nodePeerDetails(), getPeerDetails(libp2p))
  }, 1000);

  DOM.connectButton().onclick = async (e) => {
    e.preventDefault();
    let maddr = multiaddr(DOM.inputMultiaddr().value);

    outputLine(`connect to ${maddr}`);
    try {
      await libp2p.dial(maddr);
    } catch (problem) {
      outputLine(`error connecting to ${maddr}: ${problem}`);
    }
  }

  DOM.sendButton().onclick = async (e) => {
    e.preventDefault();
    const target = DOM.inputTarget().value;
    const message = DOM.inputMessage().value;
    console.log(`send to ${target}: '${message}'`);
    sendMsg(Number(target), message);
  }

  function receiveMsg(id, msg) {
    outputMsg(id, msg);
  }

  async function sendMsg(id, msg) {
    let channel = activeChannels.get(id);
    if (!channel) {
      try {
        channel = await openChannel(id);
      } catch (problem) {
        outputError(id, 'opening connection', problem);
        return;
      }
      readChannel(channel).catch(() => {});
    }
    try {
      await channel.msgStream.write(fromString(msg));
    } catch (problem) {
      outputError(id, 'sending message', problem);
    }
  }

  const SCTP_USER_INITIATED_ABORT = 12; // see RFC 4960

  async function readChannel(channel) {
    for (;;) {
      let buf;
      try {
        buf = await channel.msgStream.read();
      } catch (problem) {
        if (problem.errorDetail === 'sctp-failure' && problem?.sctpCauseCode === SCTP_USER_INITIATED_ABORT) {
          outputLine(`${channel.id}:: remote disconnected`);
        } else {
          outputError(channel.id, 'reading message', problem);
        }
        return;
      }
      receiveMsg(channel.id, toString(buf.subarray()));
    }
  }

  async function openChannel(id) {
    const peerId = peerIdList[id];
    outputLine(`connecting to id:${id} peerId:${peerId}`);
    const signal = AbortSignal.timeout(5000);;
    const connectToAddr = multiaddr(`${relayAddr}/p2p-circuit/webrtc/p2p/${peerId}`);

    let stream;
    try {
      stream = await libp2p.dialProtocol(connectToAddr, 'whatever', { signal });
    } catch (problem) {
      if (signal.aborted) {
        outputError(id, `timed out opening channel to ${peerId}`);
      } else {
        outputError(id, `opening channel to ${peerId}`, problem);
      }
      return null;
    }
    const msgStream = byteStream(stream);
    const channel = { msgStream, id };
    activeChannels.set(peerId, channel);
    return channel;
  }

  libp2p.handle('whatever', async ({ connection, stream }) => {
    const msgStream = byteStream(stream);
    const peerId = connection.remotePeer;
    const id = idMap.get(peerId.toString()) ?? -1;
    outputLine(`inbound connection from id:${id} peerId:${peerId}`);
    const channel = { msgStream, id };
    activeChannels.set(peerId, channel);
    await readChannel(channel);
  });
}

App().catch((err) => {
  console.error(err); // eslint-disable-line no-console
});
