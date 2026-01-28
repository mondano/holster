# Browser Implementation: Package Recommendations

Let me break down every component of DAM-SRA and recommend battle-tested browser packages.

---

## 1. **WebRTC Connection Management**

### **simple-peer** (Recommended)
```bash
npm install simple-peer
```

```javascript
// Simple, reliable WebRTC wrapper
import SimplePeer from 'simple-peer'

const peer = new SimplePeer({
  initiator: true,
  trickle: false,
  config: {
    iceServers: [
      { urls: 'stun:stun.l.google.com:19302' },
      { urls: 'stun:global.stun.twilio.com:3478' }
    ]
  }
})

peer.on('signal', data => {
  // Send signaling data to other peer via relay
  relay.send({ type: 'signal', data })
})

peer.on('data', data => {
  // Receive messages
  handleMessage(JSON.parse(data))
})

peer.signal(remoteSignalData) // Complete handshake
peer.send(JSON.stringify(message)) // Send data
```

**Pros:** 
- Simple API, widely used
- Works in all browsers
- ~40KB minified

**Alternatives:**
- `peerjs` - Higher level, includes signaling server
- `trystero` - Serverless WebRTC (torrent tracker based)

---

## 2. **DHT / Routing Table**

### **k-bucket** (Kademlia Implementation)
```bash
npm install k-bucket
```

```javascript
// Standard Kademlia k-bucket implementation
import KBucket from 'k-bucket'

const kbucket = new KBucket({
  localNodeId: Buffer.from(yourPeerId, 'hex'),
  numberOfNodesPerKBucket: 6, // K value
  numberOfNodesToPing: 3
})

// Add peer to routing table
kbucket.add({
  id: Buffer.from(peerId, 'hex'),
  // Custom metadata
  peer: peerConnection,
  latency: 45
})

// Find closest peers to target
const closest = kbucket.closest(
  Buffer.from(targetId, 'hex'),
  6 // Return 6 closest
)

// Get specific bucket
const bucket = kbucket.get(Buffer.from(peerId, 'hex'))
```

**Pros:**
- Industry standard (used by BitTorrent, IPFS)
- Handles all k-bucket logic
- Automatic LRU management

**Alternatives:**
- `kademlia-dht` - Full Kademlia implementation
- DIY - Build custom routing table (more control)

---

## 3. **XOR Distance & Big Numbers**

### **bn.js** (BigNumber library)
```bash
npm install bn.js
```

```javascript
import BN from 'bn.js'

// 160-bit peer IDs
const peerId = new BN('a1b2c3...', 16) // hex string
const targetId = new BN('d4e5f6...', 16)

// XOR distance
const distance = peerId.xor(targetId)

// Compare distances
if (distance1.lt(distance2)) {
  // distance1 is smaller
}

// Modulo for ring topology
const position = peerId.mod(new BN(2).pow(new BN(160)))
```

**Pros:**
- Fast, battle-tested
- Used by Ethereum, Bitcoin libraries
- ~25KB minified

**Alternatives:**
- `bigi` - Simpler API
- `big-integer` - Pure JS, no dependencies
- Native BigInt (limited browser support for old browsers)

---

## 4. **Hashing (SHA-1, SHA-256)**

### **js-sha1** or **crypto-browserify**
```bash
npm install js-sha1
# or
npm install crypto-browserify
```

```javascript
// Option 1: js-sha1 (lightweight)
import sha1 from 'js-sha1'

const hash = sha1('users/alice') // Returns hex string
const peerId = new BN(hash, 16) // Convert to BigNumber

// Option 2: crypto-browserify (polyfill for Node crypto)
import crypto from 'crypto-browserify'

const hash = crypto.createHash('sha1')
  .update('users/alice')
  .digest('hex')

// Option 3: Native Web Crypto (modern browsers)
async function sha1(data) {
  const buffer = new TextEncoder().encode(data)
  const hashBuffer = await crypto.subtle.digest('SHA-1', buffer)
  return Array.from(new Uint8Array(hashBuffer))
    .map(b => b.toString(16).padStart(2, '0'))
    .join('')
}
```

**Recommendation:** Use native Web Crypto API when possible, fall back to js-sha1.

---

## 5. **LRU Cache (Deduplication List)**

### **lru-cache** or **quick-lru**
```bash
npm install lru-cache
# or (smaller)
npm install quick-lru
```

```javascript
// Option 1: lru-cache (full-featured)
import { LRUCache } from 'lru-cache'

const dedupList = new LRUCache({
  max: 10000, // Max items
  ttl: 1000 * 60 * 10, // 10 min TTL (optional)
})

dedupList.set(msg.id, true)
if (dedupList.has(msg.id)) {
  // Already seen
  return
}

// Option 2: quick-lru (lightweight)
import QuickLRU from 'quick-lru'

const dedupList = new QuickLRU({ maxSize: 10000 })
dedupList.set(msg.id, true)
```

**Recommendation:** `quick-lru` for simplicity (1KB), `lru-cache` for features.

---

## 6. **Bloom Filters (Subscription Hints)**

### **bloomfilter.js**
```bash
npm install bloomfilter
```

```javascript
import { BloomFilter } from 'bloomfilter'

// Create filter
const filter = new BloomFilter(
  1024 * 8, // 1KB = 8192 bits
  3         // 3 hash functions
)

// Add subscriptions
filter.add('users/')
filter.add('posts/')

// Check membership
if (filter.test('users/alice')) {
  // Might be subscribed (false positives possible)
}

// Serialize for transmission
const serialized = Array.from(filter.buckets)
```

**Pros:** Tiny (2KB), fast

**Alternatives:**
- `bloom-filters` - More hash functions
- DIY - Simple bit array

---

## 7. **Message Serialization**

### **msgpack-lite** or **JSON**
```bash
npm install msgpack-lite
```

```javascript
// Option 1: MessagePack (binary, smaller)
import msgpack from 'msgpack-lite'

const encoded = msgpack.encode({
  dam: 'get',
  id: messageId,
  get: {'#': 'users/alice'}
})

peer.send(encoded) // Send as Buffer

const decoded = msgpack.decode(received)

// Option 2: JSON (simpler, larger)
const encoded = JSON.stringify(message)
peer.send(encoded)
const decoded = JSON.parse(received)
```

**Recommendation:** Start with JSON, optimize to MessagePack later.

---

## 8. **Event Emitter (State Management)**

### **eventemitter3** (Browser-optimized)
```bash
npm install eventemitter3
```

```javascript
import EventEmitter from 'eventemitter3'

class DamPeer extends EventEmitter {
  constructor() {
    super()
  }
  
  handleMessage(msg) {
    this.emit('message', msg)
    this.emit(`message:${msg.dam}`, msg)
  }
}

const peer = new DamPeer()
peer.on('message:get', (msg) => {
  // Handle GET messages
})
```

**Pros:** Lightweight (2KB), fast

---

## 9. **WebSocket Client (Relay Connection)**

### **Native WebSocket** (Built-in)
```javascript
// No package needed!
const relay = new WebSocket('wss://relay.example.com')

relay.onopen = () => {
  relay.send(JSON.stringify({
    type: 'announce',
    peer_id: this.id
  }))
}

relay.onmessage = (event) => {
  const msg = JSON.parse(event.data)
  handleRelayMessage(msg)
}

relay.onerror = (error) => {
  console.error('Relay error:', error)
}
```

**Recommendation:** Use native WebSocket, it's perfect.

---

## 10. **Storage (Persistent Bootstrap Peers)**

### **localforage** (IndexedDB wrapper)
```bash
npm install localforage
```

```javascript
import localforage from 'localforage'

// Save bootstrap peers
await localforage.setItem('bootstrap_peers', [
  { id: 'abc123', address: 'wss://...' },
  { id: 'def456', address: 'wss://...' }
])

// Load bootstrap peers
const peers = await localforage.getItem('bootstrap_peers')

// Save routing table
await localforage.setItem('routing_table', 
  this.kbucket.toArray()
)
```

**Pros:** 
- Works in all browsers
- Async API (doesn't block)
- IndexedDB (large storage)

**Alternatives:**
- `localStorage` - Simpler, 5MB limit, synchronous
- `idb-keyval` - Minimal IndexedDB wrapper

---

## 11. **UUID Generation (Message IDs)**

### **uuid** or **nanoid**
```bash
npm install uuid
# or (smaller)
npm install nanoid
```

```javascript
// Option 1: uuid (standard)
import { v4 as uuidv4 } from 'uuid'
const messageId = uuidv4() // '110ec58a-a0f2-4ac4-8393-c866d813b8d1'

// Option 2: nanoid (smaller, URL-safe)
import { nanoid } from 'nanoid'
const messageId = nanoid() // 'V1StGXR8_Z5jdHi6B-myT'

// Option 3: Simple random (good enough for DAM)
function generateId() {
  return Date.now().toString(36) + Math.random().toString(36).substr(2)
}
```

**Recommendation:** `nanoid` (tiny, fast)

---

## 12. **Full Package.json**

```json
{
  "name": "dam-sra-browser",
  "version": "1.0.0",
  "dependencies": {
    "simple-peer": "^9.11.1",
    "k-bucket": "^5.1.0",
    "bn.js": "^5.2.1",
    "js-sha1": "^0.6.0",
    "quick-lru": "^6.1.1",
    "bloomfilter": "^0.0.20",
    "eventemitter3": "^5.0.0",
    "localforage": "^1.10.0",
    "nanoid": "^4.0.0"
  },
  "devDependencies": {
    "vite": "^4.0.0"
  }
}
```

**Total bundle size:** ~150KB minified + gzipped

---

## 13. **Complete Implementation Skeleton**

```javascript
import SimplePeer from 'simple-peer'
import KBucket from 'k-bucket'
import BN from 'bn.js'
import sha1 from 'js-sha1'
import QuickLRU from 'quick-lru'
import EventEmitter from 'eventemitter3'
import localforage from 'localforage'
import { nanoid } from 'nanoid'

class DamSraPeer extends EventEmitter {
  constructor(config = {}) {
    super()
    
    // Identity
    this.id = config.peerId || this.generatePeerId()
    
    // Routing
    this.kbucket = new KBucket({
      localNodeId: Buffer.from(this.id, 'hex'),
      numberOfNodesPerKBucket: 6
    })
    
    // Deduplication
    this.dedupList = new QuickLRU({ maxSize: 10000 })
    
    // Connections
    this.peers = new Map() // peer_id -> SimplePeer instance
    this.relay = null
    
    // Config
    this.maxConnections = config.maxConnections || 6
    this.relayUrl = config.relayUrl || 'wss://relay.gun.eco'
  }
  
  generatePeerId() {
    // Generate 160-bit peer ID
    const random = crypto.getRandomValues(new Uint8Array(20))
    return Array.from(random)
      .map(b => b.toString(16).padStart(2, '0'))
      .join('')
  }
  
  async start() {
    // Load cached routing table
    const cached = await localforage.getItem('routing_table')
    if (cached) {
      cached.forEach(entry => this.kbucket.add(entry))
    }
    
    // Connect to relay
    await this.connectToRelay()
    
    // Start peer discovery
    this.startPeerDiscovery()
  }
  
  connectToRelay() {
    return new Promise((resolve, reject) => {
      this.relay = new WebSocket(this.relayUrl)
      
      this.relay.onopen = () => {
        // Announce to relay
        this.relay.send(JSON.stringify({
          type: 'announce',
          peer_id: this.id,
          max_connections: this.maxConnections
        }))
        resolve()
      }
      
      this.relay.onmessage = (event) => {
        const msg = JSON.parse(event.data)
        this.handleRelayMessage(msg)
      }
      
      this.relay.onerror = reject
    })
  }
  
  handleRelayMessage(msg) {
    switch(msg.type) {
      case 'connection_targets':
        // Relay assigned us peers to connect to
        msg.targets.forEach(target => this.connectToPeer(target))
        break
        
      case 'webrtc_offer':
        // Another peer wants to connect
        this.handleOffer(msg)
        break
        
      case 'webrtc_answer':
        // Response to our offer
        this.handleAnswer(msg)
        break
    }
  }
  
  connectToPeer(target) {
    const peer = new SimplePeer({
      initiator: true,
      trickle: false
    })
    
    peer.on('signal', data => {
      // Send offer to relay
      this.relay.send(JSON.stringify({
        type: 'webrtc_offer',
        from: this.id,
        to: target.peer_id,
        sdp: data
      }))
    })
    
    peer.on('connect', () => {
      console.log('Connected to peer:', target.peer_id)
      this.peers.set(target.peer_id, peer)
      
      // Add to routing table
      this.kbucket.add({
        id: Buffer.from(target.peer_id, 'hex'),
        peer: peer
      })
    })
    
    peer.on('data', data => {
      this.handleMessage(JSON.parse(data.toString()), target.peer_id)
    })
    
    peer.on('close', () => {
      this.peers.delete(target.peer_id)
      this.kbucket.remove(Buffer.from(target.peer_id, 'hex'))
    })
  }
  
  handleMessage(msg, fromPeer) {
    // DAM deduplication
    if (this.dedupList.has(msg.id)) {
      return
    }
    this.dedupList.set(msg.id, true)
    
    // Route based on message type
    switch(msg.dam) {
      case 'get':
        this.handleGet(msg, fromPeer)
        break
      case 'put':
        this.handlePut(msg, fromPeer)
        break
      case 'find_peer':
        this.handleFindPeer(msg, fromPeer)
        break
    }
  }
  
  handleGet(msg, fromPeer) {
    const target = new BN(sha1(msg.get['#']), 16)
    
    // Check if we're responsible
    const closest = this.findKClosest(target, 6)
    const myDistance = this.xorDistance(new BN(this.id, 16), target)
    
    const isResponsible = closest.length < 6 || 
      closest.some(c => this.xorDistance(
        new BN(c.id.toString('hex'), 16), target
      ).gt(myDistance))
    
    if (isResponsible) {
      // We're one of K closest
      this.emit('get', msg.get['#'])
    } else {
      // Route to closer peer
      const nextHop = closest[0]
      this.sendToPeer(nextHop.id.toString('hex'), msg)
    }
  }
  
  findKClosest(target, k) {
    return this.kbucket.closest(
      Buffer.from(target.toString(16, 40), 'hex'),
      k
    )
  }
  
  xorDistance(a, b) {
    return a.xor(b)
  }
  
  sendToPeer(peerId, msg) {
    const peer = this.peers.get(peerId)
    if (peer && peer.connected) {
      peer.send(JSON.stringify(msg))
    }
  }
  
  broadcast(msg) {
    for (const [peerId, peer] of this.peers) {
      if (peer.connected) {
        peer.send(JSON.stringify(msg))
      }
    }
  }
  
  get(soul) {
    const msg = {
      dam: 'get',
      id: nanoid(),
      get: {'#': soul}
    }
    
    this.handleGet(msg, null)
  }
  
  put(soul, data) {
    const msg = {
      dam: 'put',
      id: nanoid(),
      put: { [soul]: data }
    }
    
    this.broadcast(msg)
  }
  
  startPeerDiscovery() {
    setInterval(() => {
      // Find gaps in routing table
      for (let i = 0; i < 160; i += 27) {
        const targetPos = new BN(2).pow(new BN(i))
        const target = new BN(this.id, 16).add(targetPos)
        
        this.broadcast({
          dam: 'find_peer',
          id: nanoid(),
          target: target.toString(16),
          ttl: 3
        })
      }
    }, 60000) // Every 60 seconds
  }
}

// Usage
const peer = new DamSraPeer({
  relayUrl: 'wss://relay.gun.eco'
})

await peer.start()

peer.on('get', (soul) => {
  // Someone requested data we're responsible for
  const data = localDatabase.get(soul)
  if (data) {
    peer.put(soul, data)
  }
})

peer.get('users/alice')
```

---

## 14. **Build Setup (Vite)**

```javascript
// vite.config.js
import { defineConfig } from 'vite'

export default defineConfig({
  build: {
    target: 'es2020',
    rollupOptions: {
      output: {
        manualChunks: {
          'webrtc': ['simple-peer'],
          'dht': ['k-bucket', 'bn.js'],
          'utils': ['quick-lru', 'js-sha1', 'nanoid']
        }
      }
    }
  },
  optimizeDeps: {
    include: ['simple-peer', 'k-bucket', 'bn.js']
  }
})
```

---

## 15. **Alternative: All-In-One Packages**

If you want less assembly required:

### **libp2p-js** (IPFS stack)
```bash
npm install libp2p
```

**Pros:** 
- Complete P2P stack (DHT, WebRTC, etc.)
- Battle-tested by IPFS

**Cons:**
- Very heavy (~2MB)
- Overkill for DAM
- Learning curve

### **Bugout** (WebTorrent-based)
```bash
npm install bugout
```

```javascript
import Bugout from 'bugout'

const bugout = new Bugout('my-app-namespace')

bugout.on('message', (address, msg) => {
  console.log('Got message:', msg)
})

bugout.send({ type: 'hello' })
```

**Pros:**
- Simple API
- Uses WebTorrent DHT

**Cons:**
- Less control
- Torrent trackers (centralization)

---

## My Recommendation

**Start with this stack:**

```json
{
  "dependencies": {
    "simple-peer": "^9.11.1",      // WebRTC
    "k-bucket": "^5.1.0",          // DHT routing table
    "bn.js": "^5.2.1",             // XOR math
    "js-sha1": "^0.6.0",           // Hashing
    "quick-lru": "^6.1.1",         // Deduplication
    "nanoid": "^4.0.0"             // Message IDs
  }
}
```

**Total size:** ~80KB minified + gzipped

**Why these?**
- ✅ Proven in production (BitTorrent, IPFS use k-bucket)
- ✅ Small bundle size
- ✅ Simple APIs
- ✅ Pure JavaScript (no WASM, no native deps)
- ✅ Works in all browsers

Want me to create a complete working demo or dive deeper into any specific package?