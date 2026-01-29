# mesh Protocol Specification

> A subscription-routed, XOR-navigated message fabric for distributed data synchronization

## Table of Contents

- [Core Architecture](#core-architecture)
- [Data Operations](#data-operations)
- [XOR-Guided Routing](#xor-guided-routing)
- [DAM Protocol](#dam-protocol)
- [Network Topology](#network-topology)
- [Subscription Mechanics](#subscription-mechanics)
- [Data Replication Model](#data-replication-model)
- [Conflict Resolution](#conflict-resolution)
- [Resource Constraints & Scalability](#resource-constraints--scalability)
- [Protocol Flow Examples](#protocol-flow-examples)
- [Comparison with Traditional DHT](#comparison-with-traditional-dht)

---

## Core Architecture

### Subscription-First Storage Model

**Key Principle:** *No peer is forced to store anything. Ever.*

```
Storage      = Opt-in via subscription
Routing      = XOR-based gradient navigation
Propagation  = Directed convergence with DAM deduplication
Persistence  = Subscriber-only
```

This is **NOT** a traditional DHT. Storage responsibility is never assigned by keyspace location.

### Network Roles

| Role | Responsibility | Storage |
|------|----------------|---------|
| **Subscribers** | Persist & serve data they subscribe to | Persistent |
| **Routers** | Forward messages using XOR distance | None |
| **Relays** | Bootstrap connections (WebSocket servers) | None |
| **Caches** | Optional temporary storage | Ephemeral |

### Key Distinctions

```javascript
// Traditional DHT (Kademlia, Chord, etc.)
storage_peers = find_k_closest(key)  // FORCED assignment
for peer in storage_peers:
  peer.MUST_STORE(data)  // No choice

// mesh (Subscription-Routed)
route_via_xor_to_subscribers(data)   // Directed navigation
IF peer.is_subscribed_to(data.soul):  // Voluntary
  peer.save(data)  // Only if interested
```

---

## XOR-Guided Routing

**Core Principle:** XOR creates a **shared monotonic gradient** along which subscriptions and publications converge, minimizing exploratory traffic and preventing network-wide fanout.

### The XOR Invariant

For any message with target `T` (derived from `soul`):

> **Every hop must reduce XOR distance to `T`.**

```javascript
distance(next_peer, T) < distance(current_peer, T)
```

This single rule provides:
- **No flooding**: Directed routing, not broadcast
- **No backtracking**: Monotonic progress only
- **No loops**: Each hop eliminates search space
- **No global knowledge**: Local routing decisions

### XOR Metric

```javascript
// Calculate XOR distance between peer and target
distance = XOR(my_peer_id, target_soul_id)

// Example:
peer_id  = 0b10110011
target   = 0b11010101
          ─────────────
distance = 0b01100110  (closer = smaller distance)
```

### Why XOR Reduces Hops

Think of XOR space as a **binary decision tree**.

Each hop:
- Fixes *at least one more leading bit*
- Removes half of the remaining search space

Progression:
- 1 hop → 50% eliminated
- 2 hops → 75% eliminated
- 10 hops → 99.9% eliminated

**Result:** Hops scale as **O(log N)** where N = network size

### Routing Behavior

```javascript
// Find next-hop candidates using XOR distance
next_hops = finger_table.find_k_closest(target, K=6)

// Forward to peers that are closer to target
FOR peer IN next_hops:
  IF distance(peer, target) < distance(this, target):
    peer.send(message)
```

**Critical Distinction:**

| Traditional DHT | mesh |
|-----------------|--------------|
| K-closest = **storage** nodes | K-closest = **routing** next-hops |
| MUST store if in K | ONLY store if subscribed |
| Storage responsibility | Navigation hint only |

### Subscription Gradient

The key insight: **Subscriptions and publications follow the same gradient**

```
Step 1: Alice subscribes to soul S
  → SUBSCRIBE message routes via XOR toward hash(S)
  → Intermediate peers learn: "subscriber in this direction"

Step 2: Bob publishes data for soul S  
  → PUT message routes via XOR toward hash(S)
  → Follows same gradient Alice's subscription created
  → Naturally converges on subscribers
```

This creates **directional discovery** without global state:

```javascript
// Peer receives subscription
HANDLE_SUBSCRIBE(sub_msg, from_peer):
  target = hash(sub_msg.soul)
  
  IF distance(this, target) < distance(from_peer, target):
    // I'm closer - record the subscription direction
    subscription_hints[target].add(from_peer)
    
    // Continue routing toward target
    next_hops = finger_table.find_k_closest(target)
    forward_to(next_hops, sub_msg)
```

Later, when data arrives:

```javascript
// Peer receives data publication
HANDLE_PUT(put_msg, from_peer):
  target = hash(put_msg.soul)
  
  // Check if I'm subscribed
  IF this.is_subscribed_to(put_msg.soul):
    this.store.put(put_msg.data)
    send_ack(put_msg.id)
  
  // Forward toward subscribers using learned hints
  IF subscription_hints[target]:
    forward_to(subscription_hints[target], put_msg)
  ELSE:
    // Continue XOR routing toward target
    next_hops = finger_table.find_k_closest(target)
    forward_to(next_hops, put_msg)
```

### Early Pruning (Bandwidth Saver #1)

Routers can drop messages early if no downstream interest exists:

```javascript
// Check subscription filter (e.g., Bloom filter)
IF NOT subscription_filter.might_contain(soul):
  DROP  // No one downstream cares about this
ELSE:
  // Forward toward potential subscribers
  next_hops = find_k_closest_with_interest(target)
  forward_to(next_hops, message)
```

### Monotonic Convergence (Bandwidth Saver #2)

XOR routing guarantees:
- Never revisit a region
- Never fan out unnecessarily  
- Every hop is progress toward subscribers

This avoids:
- Random walks
- Gossip retries
- Exponential fanout

---

## DAM Protocol

**DAM (Daisy-chain Ad-hoc Mesh-network)** provides deduplication and loop prevention for XOR-routed messages.

### The Role of DAM in XOR Routing

DAM is **NOT** a replacement for XOR routing - it's a **complementary optimization** that:

1. **Prevents duplicate processing** when multiple routes converge
2. **Stops routing loops** if network topology creates cycles  
3. **Handles message echoes** from bidirectional connections
4. **Contains broadcast storms** during network partitions/rejoins

Think of it as:
- **XOR routing**: Provides the *direction* (toward subscribers)
- **DAM deduplication**: Prevents *redundant work* along the way

### Message Deduplication

Each peer maintains an **LRU cache** of seen message IDs:

```javascript
// Dup.ts
class Dup {
  check(id): boolean {
    if (this.map.has(id)) {
      this.bump(id)  // Move to top (recently used)
      return true    // Duplicate detected - already processed
    }
    return false     // New message
  }

  track(id): void {
    this.map.set(id, Date.now())
    if (this.map.size > maxSize) {
      this.purge()  // Remove oldest entries
    }
  }
}
```

**Processing Flow:**

```javascript
RECEIVE_MESSAGE(msg, from_peer):
  IF dup.check(msg.id):
    // Already seen this message - drop it
    // This handles:
    // - Multiple XOR routes converging
    // - Bidirectional connection echoes
    // - Network partition recovery duplicates
    RETURN
  
  dup.track(msg.id)
  
  // Process message (store if subscribed, route if not)
  process_message(msg)
```

**Benefits:**
- Prevents infinite routing loops
- Handles XOR route convergence gracefully
- Crash recovery: neighbors contain rebroadcast storms
- Fixed memory: O(maxSize), not O(network messages)

### XOR + DAM Wave Propagation Model

Messages propagate like **water ripples with directional flow**:

```
1. Initial Drop
   │
   ● ─────> Peer sends message with target T
   │

2. XOR-Directed Ripple
   │        Next hops chosen by XOR distance
   ●───●───●
    ╲  │  ╱   Messages route toward T
     ╲ │ ╱    (not random broadcast)
      ●●●

3. DAM Deduplication at Convergence
   │
   ●───●───●
    ╲  │  ╱   Multiple routes may converge
     ╲ │ ╱    
      ●●●  ← Dup.check() prevents re-processing
      │
   Already seen - HALT

4. Subscriber Termination
   │
   ●───●───●
   │   │   │
   ●───●─[SUB]  Subscriber found
   │       │
   ●───●   └─> Stores data, sends ACK
              Routes may continue to other subscribers
```

### Peer List Optimization

**Problem:** Without optimization, XOR-routed messages may echo back through overlapping peer connections.

**Solution:** Include peer list in message to prevent immediate echo-backs.

```javascript
ROUTE_MESSAGE(message, source_peer):
  // Extract peer list from incoming message
  incoming_peers = message.peer_list || []

  // Calculate XOR-closest peers
  candidates = finger_table.find_k_closest(message.target)

  // Exclude peers that have already seen this message
  targets = candidates - incoming_peers - {source_peer}

  // Create outbound message with updated peer list
  outbound = clone(message)
  outbound.peer_list = my_connected_peers

  // Send only to unique next-hops
  FOR peer IN targets:
    peer.send(outbound)
```

**Trade-off:** Anonymity vs. efficiency
- With peer IDs: More efficient routing, topology visible
- Without peer IDs: More anonymous, some redundant hops
- Recommendation: Use peer IDs (efficiency > anonymity for most use cases)

### Response Hash Deduplication

When multiple subscribers have identical data, prevent duplicate responses:

```javascript
HANDLE_GET_REQUEST(get_request, from_peer):
  IF this.has_data(get_request.soul):
    local_hash = SHA1(this.data)

    IF get_request.response_hash == local_hash:
      // Someone already responded with identical data
      HALT
    ELSE:
      // Send our data
      send_ack(get_request.id, this.data)

  // Add our response hash and continue routing
  outbound = clone(get_request)
  outbound.response_hash = local_hash
  route_via_xor(outbound)
```

**Benefits:**
- Prevents duplicate responses with identical data
- Reduces bandwidth for popular content
- First responder wins (by XOR distance)

---

## Data Operations

### 1. Publish Data (PUT)

**Flow:**

1. Originating peer creates data with unique message ID
2. Data routes via XOR toward hash(soul)
3. **Only subscribers persist** the data
4. Subscribers send ACK responses
5. Non-subscribers route forward but DON'T persist
6. Originator retries if no ACK received

**Code:**

```javascript
// Publish data
mesh.get("photos/vacation").put({
  url: "https://...",
  date: "2024-01-15"
}, (ack) => {
  if (ack) console.log("Saved by at least one subscriber")
})
```

**Wire Protocol:**

```javascript
// Processing PUT message (wire.ts)
HANDLE_PUT(put_msg, from_peer):
  target = hash(put_msg.soul)
  
  // DAM deduplication first
  IF dup.check(put_msg.id):
    RETURN  // Already processed this message
  
  dup.track(put_msg.id)
  
  // Check if I'm a subscriber
  IF this.is_subscribed_to(put_msg.soul):
    // Subscriber: persist locally
    this.store.put(put_msg.data)
    send_ack(put_msg.id, {ok: true})
  
  // Route toward target via XOR (even if subscribed - other subscribers may exist)
  next_hops = finger_table.find_k_closest_subscribers(target)
  FOR peer IN next_hops:
    peer.send(put_msg)
```

### 2. Get/Subscribe to Data

**Flow:**

1. Peer issues GET request for specific soul/key
2. GET routes via XOR toward hash(soul)
3. **Creates implicit subscription** via `.on()` listener
4. Peers with the data respond with ACK
5. Responses stream back through XOR routes
6. Listener receives updates when data changes

**Code:**

```javascript
// Subscribe to data (implicit subscription)
mesh.get("photos/vacation").on((data) => {
  console.log("Photo data:", data)
  // Automatically persists locally
  // Peer becomes a subscriber
})
```

**Subscription Mechanics:**

```javascript
// mesh API (mesh.ts)
on(callback):
  soul = this.soul
  target = hash(soul)
  
  // Register listener
  listen[soul].push({cb: callback})

  // Announce subscription via XOR routing
  wire.subscribe(soul, (ack) => {
    // Subscription propagated toward target region
  })

  // Fetch current data via XOR routing
  wire.get(soul, (msg) => {
    if (msg.put) callback(msg.put[soul])
  })
```

**Wire Subscription Propagation:**

```javascript
HANDLE_SUBSCRIBE(sub_msg, from_peer):
  target = hash(sub_msg.soul)
  
  // Record subscription hint for future routing
  subscription_hints[target].add(from_peer)
  
  // If I'm subscribed, respond
  IF this.is_subscribed_to(sub_msg.soul) AND this.has_data(sub_msg.soul):
    send_subscription_ack(sub_msg.id, this.data)
  
  // Route subscription toward target
  next_hops = finger_table.find_k_closest(target)
  FOR peer IN next_hops:
    peer.send(sub_msg)
```

### 3. Replicate What You Subscribe To

**Storage Decision:**

```javascript
// Wire data filtering (wire.ts)
SHOULD_STORE(soul):
  IF listen[soul]:                  // Active listener registered
    return true                     // Accept and persist
  
  IF hasExistingSoul(soul):         // Already stored locally
    return true                     // Update existing
  
  IF pendingReferences.has(soul):   // Referenced by tracked data
    return true                     // Follow graph links
  
  // Without subscription/reference: routes through, doesn't persist
  return false
```

This provides **IPFS-like pinning** behavior:
- IPFS: Explicitly `ipfs pin add <hash>`
- mesh: Implicitly via `.on()` subscription
- Both: Voluntary, not forced by network

---

## Network Topology

### Initial Connection: WebSocket Relay

```javascript
// Browser or Node.js peer
const mesh = mesh({
  peers: ["wss://relay.example.com"],  // Bootstrap relay
  port: 8765                            // Local server (optional)
})
```

**Relay Role:**
- Acts as **router** using XOR distance
- Provides initial network entry point
- Maintains finger table of connected peers
- Routes messages toward XOR-closer peers
- Does NOT force storage (routes only)

**Hybrid Server+Client:**

```javascript
// Node.js can be BOTH server and client
if (isNode) {
  // Setup WebSocket server
  wss = new WebSocketServer({port: 8765})

  // If peers specified, ALSO connect as client
  if (options.peers.length > 0) {
    options.peers.forEach(connectToPeer)
  }
  
  // Build finger table from connections
  updateFingerTable()
}
```

This enables:
- Peer-to-peer mesh in Node.js
- Browser peers connecting to Node.js routers
- Router servers that also participate as peers

### Finger Table Maintenance

Each peer maintains a **finger table** of connections organized by XOR distance:

```javascript
class FingerTable {
  // Organize peers by XOR distance buckets
  buckets: Map<number, Set<Peer>> = new Map()
  
  add(peer: Peer): void {
    distance = XOR(this.peer_id, peer.peer_id)
    bucket = leading_zeros(distance)  // Which bit position differs
    buckets[bucket].add(peer)
  }
  
  find_k_closest(target: string, k: number): Peer[] {
    target_distance = XOR(this.peer_id, hash(target))
    
    // Return k peers with smallest XOR distance to target
    return all_peers
      .sort_by(peer => XOR(peer.peer_id, target))
      .take(k)
  }
}
```

**Benefits:**
- O(log N) routing decisions
- Maintains diversity across XOR space
- Automatically repairs when peers leave
- No global knowledge required

### WebRTC Peer-to-Peer Connections

For browser-to-browser connections without relays:

```javascript
// WebRTC signaling via relay
mesh.connect_webrtc(peer_id, (connection) => {
  // Direct P2P connection established
  // Add to finger table
  finger_table.add(connection)
  
  // Future messages route directly
})
```

**Self-Optimizing Topology:**

```
Initial: Browser → WebSocket Relay ← Browser

After WebRTC:  Browser ↔ WebRTC ↔ Browser
                          ↓
                  Direct XOR routing

If A ↔ B (WebRTC) and B ↔ C (WebRTC):
  → B can relay WebRTC signaling for A ↔ C
  → Network topology self-optimizes via XOR distance
  → Most traffic bypasses relays
```

---

## Subscription Mechanics

### Listener Registration

```javascript
// User code
mesh.get("photos/vacation").on((data) => {
  console.log("Photo:", data)
})
```

**Internal Flow:**

```javascript
// 1. Register listener (mesh.ts)
map.set(callback, internal_handler)
listen[soul] = [{".": field, cb: internal_handler}]

// 2. Announce subscription via XOR routing
wire.subscribe(soul, (ack) => {
  // Subscription routed toward hash(soul)
  // Intermediate peers learn about interest
})

// 3. Fetch current data via XOR routing
wire.get(soul, (msg) => {
  callback(msg.put[soul])
})
```

### Data Filtering

**The subscription-based storage filter:**

```javascript
// First pass: Extract references from subscribed data
for (soul, node) in incoming_message.put:
  hasListener = !!listen[soul]

  IF hasListener:
    // Extract references from this node
    for (key, value) in node:
      IF is_reference(value):
        pendingReferences.add(value.soul)

// Second pass: Filter based on subscription
for (soul, node) in incoming_message.put:
  shouldStore = false

  IF await hasSoul(soul):           // Already stored
    shouldStore = true
  IF pendingReferences.has(soul):   // Referenced
    shouldStore = true
  IF listen[soul]:                  // SUBSCRIBED ← KEY
    shouldStore = true

  IF shouldStore:
    filteredPut[soul] = node

// Only persist filtered data
IF filteredPut not empty:
  await put(filteredPut)
```

**Without subscription:** Data routes through via XOR but doesn't persist locally.

---

## Data Replication Model

```
┌─────────────────────────────────────────┐
│ "Replicate what you subscribe to"      │
└─────────────────────────────────────────┘

Subscription → XOR Routing → Local Persistence → Offline-First
```

### IPFS-like Pinning

| Operation | IPFS | mesh |
|-----------|------|---------|
| **Voluntary** | `ipfs pin add <hash>` | `mesh.get(soul).on(cb)` |
| **Storage** | Only pinned content | Only subscribed data |
| **Serving** | Serve pinned content | Serve subscribed data |
| **Discovery** | DHT lookup O(log N) | XOR routing O(log N) |
| **Offline** | Local copy available | Local copy available |

### Benefits

1. **Offline-First**: Subscribers have local copies
   ```javascript
   // Works offline if you're a subscriber
   mesh.get("docs/readme").on(data => {
     // Reads from local storage
   })
   ```

2. **Privacy**: Only store data you care about
   ```javascript
   // You never store random data
   // Only what you explicitly subscribe to
   ```

3. **Resource Control**: No forced storage quotas
   ```javascript
   // Your storage, your choice
   // No DHT-imposed responsibilities
   ```

4. **Natural Distribution**: Popular data = more replicas
   ```javascript
   // Popular content: many subscribers
   // Rare content: few subscribers
   // Organic load distribution
   ```

5. **Efficient Discovery**: XOR routing finds subscribers in O(log N) hops
   ```javascript
   // No flooding required
   // Directed routing toward interested peers
   ```

---

## Conflict Resolution

**HAM (Hypothetical Amnesia Machine)** provides deterministic conflict resolution.

### Algorithm

```javascript
HAM(incoming_state, current_state, incoming_value, current_value, signed):

  // 1. Timestamp comparison
  IF incoming_state > current_state:
    return {incoming: true}  // Newer wins

  IF incoming_state < current_state:
    return {historical: true}  // Older rejected

  // 2. Same timestamp
  IF incoming_state == current_state:
    IF signed AND incoming_value != current_value:
      return {historical: true}  // Reject conflicting signed data

    IF incoming_value == current_value:
      return {state: true}  // No change

    // 3. Deterministic tie-breaker using peer IDs
    // (Better than lexical comparison for numeric data)
    incoming_hash = hash(incoming_value + incoming_peer_id)
    current_hash = hash(current_value + current_peer_id)
    
    IF incoming_hash > current_hash:
      return {incoming: true}
    ELSE:
      return {current: true}
```

### Example

```javascript
// Concurrent writes from different peers
Peer A: put({count: 5}, timestamp: 1000)
Peer B: put({count: 7}, timestamp: 1000)

// Both peers eventually receive both updates
// Hash-based tie-breaker: deterministic but fair
// Both converge to same value

// Result: Eventual consistency
```

**Note:** The tie-breaker uses peer ID hashing instead of lexical comparison to avoid issues with numeric vs. string ordering.

---

## Resource Constraints & Scalability

### Complexity Analysis

| Topology | Hops | Messages | Description |
|----------|------|----------|-------------|
| **Naive Broadcast** | O(D) | O(N) | D = diameter, N = network size |
| **XOR Routing** | O(log N) | O(log N × fanout) | Directed routing |
| **XOR + DAM** | O(log N) | O(log N × fanout) | + deduplication |
| **XOR + Subscription Hints** | O(log N) | O(S × fanout) | S = subscribers (usually S << N) |

**Key Insight:** XOR routing provides O(log N) hops, DAM prevents duplicate processing, subscription hints reduce fanout.

### Scalability Characteristics

**Small Networks (< 100 peers):**
- XOR routing still efficient
- Finger tables small and easy to maintain
- Subscription hints optional

**Medium Networks (100 - 10,000 peers):**
- XOR routing critical for efficiency
- Finger tables provide O(log N) lookup
- Subscription hints significantly reduce traffic
- DAM deduplication prevents route convergence overhead

**Large Networks (> 10,000 peers):**
- Full DHT-style routing essential
- Bloom filters for subscription hints recommended
- Multi-hop subscription propagation
- Hierarchical relay topology

### Memory Management

```javascript
// Fixed-size deduplication (dup.ts)
class Dup {
  maxAge = 9000      // 9 seconds (message TTL)
  maxSize = 1000     // 1000 message IDs

  // LRU eviction prevents unbounded growth
  // TTL eviction handles long-lived peers
  // Both limits enforced independently
}
```

**Trade-offs:**
- Too small: Duplicate messages slip through
- Too large: Memory consumption
- Recommendation: 1000-10000 entries (scales with network size)

**Dual Eviction Strategy:**
- **LRU**: Evicts least recently seen messages first
- **TTL**: Evicts messages older than maxAge
- **Why both?** LRU for active networks, TTL for idle periods

### Connection Limits

```javascript
// Recommended: Max 6-20 peer connections
const MAX_PEERS = 12

// Benefits:
// - Maintains XOR space diversity
// - Prevents network amplification
// - Creates sparse but connected topology
// - Balances redundancy vs overhead
```

**Finger Table Strategy:**
- Maintain connections across XOR space
- Prefer peers in different distance buckets
- Accept new connections if they improve coverage
- Drop connections if redundant in XOR space

---

## Protocol Flow Examples

### Example 1: Photo Sharing with XOR Routing

```
Alice wants to share a vacation photo

┌─────────────────────────────────────────┐
│ Alice (Originator)                      │
└─────────────────────────────────────────┘
  │
  │ 1. mesh.get("photos/vacation").put({url: "..."})
  │    target = hash("photos/vacation")
  │
  ▼
┌─────────────────────────────────────────┐
│ XOR-Guided Routing                      │
└─────────────────────────────────────────┘
  │
  ├──> Router A (distance = 0x8F00...)
  │    └──> Forwards to closer peers
  │        └──> Router B (distance = 0x4F00...)
  │             └──> Even closer to target
  │
  └──> Carol (distance = 0x0100..., SUBSCRIBED)
       └──> Closest subscriber found!
       └──> Persists locally, sends ACK

┌─────────────────────────────────────────┐
│ Result                                  │
└─────────────────────────────────────────┘
  - Alice: Has original
  - Carol: Has replica (subscribed, XOR-closest)
  - Routers: No storage (forwarded only)
  - Hops: O(log N) to find Carol
```

### Example 2: Data Retrieval with Subscription Gradient

```
Dave wants to view the vacation photo

┌─────────────────────────────────────────┐
│ Dave (New peer)                         │
└─────────────────────────────────────────┘
  │
  │ 1. mesh.get("photos/vacation").on(callback)
  │    target = hash("photos/vacation")
  │
  ▼
┌─────────────────────────────────────────┐
│ GET Request via XOR Routing             │
└─────────────────────────────────────────┘
  │
  ├──> Router A
  │    └──> Checks subscription hints
  │         └──> "Carol is in this direction"
  │              └──> Routes toward Carol
  │
  └──> Carol (has photo, subscribed)
       └──> Sends ACK with photo data
       └──> Response hash = SHA1(photo)

┌─────────────────────────────────────────┐
│ Dave Receives Photo                     │
└─────────────────────────────────────────┘
  - Callback fires with photo data
  - Photo persists locally (Dave now subscriber)
  - Dave announces subscription via XOR
  - Future requests may route to Dave
  - Hops: O(log N) to find Carol
```

### Example 3: Multiple Subscribers

```
Network has 3 subscribers to "photos/vacation"
- Carol (distance = 0x0100...)
- Eve   (distance = 0x0200...)  
- Frank (distance = 0x0F00...)

Bob publishes new photo:

┌─────────────────────────────────────────┐
│ XOR Routing Tree                        │
└─────────────────────────────────────────┘

Bob (publishes)
  │
  ├──> Router A (routes toward target)
  │    │
  │    ├──> Carol (distance = 0x0100...) ✓
  │    │    └──> Stores, sends ACK
  │    │
  │    └──> Eve (distance = 0x0200...) ✓
  │         └──> Stores, sends ACK (different hash? no - dedup)
  │
  └──> Router B (routes toward target)
       │
       └──> Frank (distance = 0x0F00...) ✓
            └──> Stores, sends ACK

Result:
- All 3 subscribers found via XOR routing
- DAM prevents duplicate processing if routes converge
- Hash dedup prevents redundant responses
- Total hops: O(log N) per subscriber
```

---

## Comparison with Traditional DHT

### Architectural Differences

| Aspect | Traditional DHT | mesh |
|--------|-----------------|--------------|
| **Storage Assignment** | Keyspace-based (forced) | Subscription-based (voluntary) |
| **Routing** | XOR-based lookup (storage) | XOR-based navigation (discovery) |
| **Replication** | K closest peers (mandatory) | Natural popularity-based (optional) |
| **Discovery** | O(log N) hops to storage | O(log N) hops to subscribers |
| **Offline Access** | Must contact K peers | Local replica if subscribed |
| **Privacy** | Store arbitrary data | Only store what you want |
| **Resource Control** | Fixed by keyspace position | User-controlled subscriptions |
| **Consistency** | Varies by implementation | Eventually consistent (HAM) |
| **Deduplication** | Usually none | DAM protocol |

### Topology Comparison

```
Traditional DHT (Kademlia):
┌─────────────────────────────────────────┐
│ Key: 10110011                           │
│ MUST store at K closest peers:         │
│   - Peer 10110000 (distance: 00000011) │
│   - Peer 10110010 (distance: 00000001) │
│   - Peer 10110111 (distance: 00000100) │
│                                         │
│ No choice, forced by keyspace          │
│ Storage responsibility based on peer ID │
└─────────────────────────────────────────┘

mesh (Subscription-Routed):
┌─────────────────────────────────────────┐
│ Soul: "photos/vacation"                 │
│ Routes via XOR to ANY subscribers:      │
│   - Alice (distance: 0xF234..., subscribed)      │
│   - Carol (distance: 0x0123..., subscribed)      │
│   - Eve (distance: 0x89AB..., subscribed)        │
│                                         │
│ Voluntary, interest-based               │
│ XOR routing finds them in O(log N) hops │
│ No forced storage based on peer ID      │
└─────────────────────────────────────────┘
```

### Use Case Comparison

| Use Case | Traditional DHT | mesh |
|----------|-----------------|--------------|
| **Content Distribution** | Good (guaranteed replicas) | Good (subscriber-driven) |
| **Personal Data Sync** | Poor (public storage) | Excellent (private subscriptions) |
| **Small Networks** | Overkill | Efficient |
| **Large Networks** | Proven at scale | Scales via XOR routing |
| **Offline-First Apps** | Difficult | Natural fit |
| **Resource-Constrained** | Challenging | Flexible (opt-in storage) |

### Mental Model

**mesh is:**
> A subscription-routed, XOR-navigated message fabric where subscriptions and publications converge along shared gradients

**Think:**
- **XOR routing** for *discovery* (O(log N) hops to subscribers)
- **Voluntary storage** for *control* (no forced replication)
- **DAM deduplication** for *efficiency* (prevent redundant processing)
- **Subscription gradients** for *convergence* (natural routing paths)

**NOT:**
- A traditional DHT (no forced storage at XOR-closest peers)
- A pure broadcast protocol (uses directed XOR routing)
- A centralized system (fully P2P with distributed routing)

**Key Innovation:**
> XOR creates a shared gradient that both subscriptions and publications follow, enabling O(log N) discovery without forced storage responsibilities.

---

## Implementation Status

### ✅ Implemented

1. **XOR Routing**
   - Finger table maintenance
   - Distance-based next-hop selection
   - Subscription gradient propagation

2. **DAM Protocol**
   - Message deduplication (Dup.ts)
   - LRU + TTL cache management
   - Peer list optimization

3. **Wire Protocol**
   - Hybrid server+client support
   - Subscription-based filtering
   - Reference tracking

4. **Storage Layer**
   - Subscriber-only persistence
   - LEX filtering support
   - HAM conflict resolution

5. **API Layer**
   - `.get()` / `.put()` / `.on()` / `.off()`
   - User authentication
   - Graph reference handling

### 🚧 Future Enhancements

1. **WebRTC Support**
   - Direct peer-to-peer connections
   - Self-optimizing topology via XOR distance
   - Reduced relay dependency

2. **Subscription Bloom Filters**
   - Advertise interests to peers
   - Early message pruning
   - Reduce routing overhead

3. **Advanced Routing Optimizations**
   - Multi-path routing for reliability
   - Adaptive fanout based on network size
   - Subscription hint caching

4. **Response Hash Deduplication**
   - First responder wins
   - Hash propagation in GET requests
   - Bandwidth optimization for popular content

---

## Summary

mesh implements a unique hybrid architecture:

```
Storage     = Subscription-based (voluntary, like IPFS pinning)
Routing     = XOR-navigated (O(log N) hops, like DHTs)
Propagation = Directed convergence (not broadcast)
Deduplication = DAM protocol (prevent redundant work)
Consistency = Eventually consistent (HAM)
```

**Key Principles:**

1. **No forced storage** - Only persist what you subscribe to
2. **XOR for discovery** - Not for storage assignment
3. **Shared gradients** - Subscriptions and data follow same paths
4. **O(log N) routing** - Efficient discovery without flooding
5. **DAM deduplication** - Prevent redundant processing
6. **Offline-first** - Subscribers have local copies
7. **Resource-friendly** - Peers control their own storage

**The Core Innovation:**

> XOR routing is used not to locate storage, but to create a shared monotonic gradient along which subscriptions and publications converge, minimizing exploratory traffic and preventing network-wide fanout.

This is **"A subscription-routed, XOR-navigated message fabric"** - not a DHT, but a novel hybrid that combines the best of DHT routing with voluntary, interest-driven storage.

---

**See also:**
- [DAM Protocol Specification](src/dam.md) - Detailed DAM algorithm
- [Curation Notes](src/cur-update.md) - Subscriber vs DHT clarifications
- [Test Suite](test/integration/) - Integration tests with real relay