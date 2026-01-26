# DAM Protocol Formal Specification

Keep in mind we already have Dup.ts, which can inform schema creation

## 1. Overview

**DAM (Daisy-chain Ad-hoc Mesh-network)** is a transport layer abstraction and peer-to-peer networking algorithm that serves as default messaging protocol. It optimizes decentralized message propagation by reducing redundant broadcasts while maintaining mesh network connectivity.

## 2. Core Objectives

- Minimize redundant message broadcasts in a mesh network topology
- Provide transport-agnostic abstraction layer
- Enable emergent network efficiency through local peer optimizations
- Support anonymous peer operation while allowing optional identity-based optimizations

## 3. Message Structure

### 3.1 Base Message Format

Every message transmitted via DAM contains:

- **Message ID** (`msg.id`): Unique identifier for deduplication
- **Payload**: Operation-specific data (GET, PUT, etc.)
- **Optional Fields**:
  - `peer_list`: Array of peer identifiers currently connected to the sending peer
  - `hash`: Fast hash of response data (for response deduplication)
  - `ack`: Reference to original message ID (for acknowledgment messages)

### 3.2 Message Types

#### GET Request
- Requests data for a specific `#soul.key` or full node `#soul`
- Propagates through network using daisy-chaining
- May contain response hash from intermediate peers

#### PUT Operation
- Transmits data changes (deltas) through network
- Uses same propagation mechanism as GET
- Triggers ACK responses from peers that successfully process the operation

#### ACK Response
- New message with unique ID
- Contains `reply-to` field referencing original message ID
- Indicates successful processing/storage of original message

## 4. Core Algorithm

### 4.1 Message Deduplication System

Each peer maintains a **fixed-size in-memory list** of seen message IDs with the following properties:

- **Structure**: LRU (Least Recently Used) cache
- **Operations**:
  - **Check**: Determine if message ID exists in list
  - **Add**: Insert new message ID
  - **Bump**: Move existing ID to top of list (maintains "liveness")
  - **Purge**: Automatic removal of oldest entries when size limit reached

### 4.2 Message Reception Algorithm

When a peer receives an inbound message:

```
RECEIVE(message, from_peer):
  1. Extract message.id
  
  2. IF message.id EXISTS in deduplication_list:
       a. BUMP message.id to top of list
       b. HALT (do not rebroadcast or reprocess)
       c. RETURN
  
  3. ELSE:
       a. ADD message.id to deduplication_list
       b. PROCESS message (execute operation-specific logic)
       c. REBROADCAST message to connected peers (see 4.3)
```

### 4.3 Message Rebroadcast Algorithm

**Base (Brute Force) Method:**
```
REBROADCAST_BASE(message):
  FOR EACH peer IN connected_peers:
    SEND message TO peer
```

**DAM Enhancement:**
```
REBROADCAST_DAM(message, source_peer):
  1. Extract peer_list from message (if present)
  
  2. Calculate broadcast_targets:
     broadcast_targets = connected_peers - peer_list - {source_peer}
  
  3. Create outbound_message:
     a. Copy message payload
     b. REPLACE peer_list with current peer's connected_peers identifiers
     c. IF this peer has response data AND can calculate fast hash:
          ADD hash to outbound_message
  
  4. FOR EACH peer IN broadcast_targets:
       SEND outbound_message TO peer
```

### 4.4 Daisy-Chaining Mechanism

The daisy-chain process for GET requests:

```
DAISY_CHAIN_GET(get_request, from_peer):
  1. Check if local peer has requested data
  
  2. IF data available AND cached:
       a. Calculate fast_hash of response data
       b. ADD fast_hash to get_request
  
  3. REBROADCAST_DAM(get_request, from_peer)
  
  4. IF local peer has data to respond:
       a. IF get_request.hash == hash(local_data):
            HALT (duplicate response suppression)
       b. ELSE:
            SEND_ACK(get_request.id, local_data, from_peer)
```

### 4.5 Response Routing

**Base Method:** ACK messages broadcast to all peers

**DAM Optimization:** Direct routing to daisy-chain predecessor

```
SEND_ACK(original_msg_id, response_data, predecessor_peer):
  1. Create ack_message:
     - id = NEW_UNIQUE_ID()
     - ack = original_msg_id
     - payload = response_data
  
  2. SEND ack_message TO predecessor_peer ONLY
  
  3. ADD ack_message.id to deduplication_list
```

## 5. Deduplication Layers

DAM implements three levels of deduplication:

1. **Message ID Deduplication**: Prevents reprocessing same message
2. **Peer List Exclusion**: Prevents echo to overlapping peers
3. **Response Hash Deduplication**: Prevents duplicate responses with identical data

## 6. Network Resilience

### 6.1 Peer Crash Recovery

**Scenario: Peer crashes and restarts during message propagation**

- Peer loses in-memory deduplication list
- Upon restart, may receive already-seen messages
- Will rebroadcast to neighbors
- Neighbors' deduplication lists prevent further propagation
- Result: Wave interference pattern contains rebroadcast storms

### 6.2 Self-Connection Detection

**Special Case:** Peer connects to itself

```
SELF_CONNECTION_DETECTION:
  1. When peer sends message with dam='?', id='hi'
  2. DELETE this message.id from deduplication_list
  3. Allow message to pass through deduplication
  4. Peer detects receipt of own 'hi' message
  5. Disconnect from self
```

### 6.3 Retry Responsibility

**Principle:** The originating peer is solely responsible for retries

- Originating peer MUST persist un-ACKed data
- Recommended: Use localStorage or equivalent persistent storage
- Retry same message if ACK not received within timeout
- Other peers NEVER retry messages
- Retry messages follow same algorithm (will be deduplicated by peers that already processed)

## 7. Subscription Model

### 7.1 Outbound Subscriptions

When peer Alice issues GET request:
- Alice subscribes to all inbound messages containing `ack == original_get_id`
- May receive multiple ACK responses (streaming model)
- Each ACK represents response from different peer

### 7.2 Inbound Data Updates

When peer receives PUT operation:
- Peer processes update ONLY if subscribed to that data
- If saved successfully, sends ACK
- If not subscribed, still rebroadcasts but does not persist

## 8. Peer Connection Management

### 8.1 Adding Peers

```javascript
// Request format
{
  dam: 'opt',
  opt: {
    peers: '<peer_url>'
  }
}
```

**Connection Limits:**
- Requested peer MAY honor connection request
- Recommended limit: 6 additional peers (first-come, first-served)
- May drop offline peers after several minutes
- Stops retry attempts until explicitly requested again

### 8.2 Removing Peers

```
DISCONNECT(peer_id):
  1. Call mesh.bye(peer_id)
  2. Remove peer from connected_peers list
  3. Stop sending messages to peer
```

## 9. Neighbor Messaging API

### 9.1 Message Sending

**Broadcast to all neighbors:**
```javascript
mesh.say({
  dam: 'module_name',
  // custom payload
})
```

**Unicast to specific peer:**
```javascript
mesh.say({
  dam: 'module_name',
  // custom payload
}, specific_peer)
```

### 9.2 Message Reception

```javascript
dam.hear.module_name = function(msg, peer) {
  // Handle dammed message
  // Message will NOT be rebroadcast beyond neighbors
}
```

**Critical Property:** Messages with custom `dam` field are restricted to direct neighbors only (not propagated further).

## 10. Optimization Opportunities

### 10.1 Identity-Based Optimization

When peer identity is exposed:
- Include peer IDs in message.peer_list
- Enables echo exclusion (prevents sending message back to source)
- Reduces redundant transmissions

**Trade-off:** Anonymity vs. efficiency

### 10.2 Connection Limiting

- Limit rebroadcast to N peers (e.g., 6) even if connected to more
- Limit total connections per peer to N
- Creates sparse network topology
- Reduces message amplification

### 10.3 Binary Transport Negotiation

Peers may negotiate upgraded transport:
```
UPGRADE_TRANSPORT(peer):
  1. Send capability announcement via mesh.say({dam: 'transport_upgrade', ...}, peer)
  2. Peer responds with supported transports
  3. Both peers create shared state machine
  4. Dynamically upgrade/downgrade transport protocol
```

## 11. Complexity Analysis

### 11.1 Theoretical Bounds

**Base Mesh Topology:**
- Complexity: O(C × 2) + 1, where C = connections between peers
- Each message potentially traverses each connection twice (forward + echo)

**Optimized Mesh (with DAM constraints):**
- Complexity: O(P), where P = peers in network
- Comparable to centralized star topology
- Achieved through deduplication and echo suppression

**Sharded Routing (future optimization via AXE):**
- Complexity: O(S), where S = subscriptions to data record
- Independent of peer count
- Requires opt-in incentivization layer

## 12. Transport Abstraction

DAM provides transport-agnostic interface similar to RAD's storage abstraction:

**Supported Transports:**
- WebSocket
- WebRTC
- HTTP
- Custom implementations

**Interface Requirements:**
- Ability to send messages to connected peers
- Ability to receive messages from peers
- Peer connection/disconnection events

## 13. Wave Propagation Model

### 13.1 Physical Analogy

Message propagation behaves like water ripple:

1. **Initial Drop:** Originating peer sends message
2. **Outward Ripple:** Message propagates to increasingly distant peers
3. **Self-Interference:** Echo messages interfere with forward propagation
4. **Containment:** Deduplication creates destructive interference at wavefront
5. **Decay:** Message storm dies when all reachable peers have seen message

### 13.2 Neighbor-Walled Storms

Rebroadcast storms are contained by neighbor deduplication:
- Even if multiple peers crash simultaneously
- Storm cannot propagate beyond peers that have seen message
- Creates localized containment zones

## 14. State Machine Protocol

### 14.1 Peer Handshake

Default implementation uses DAM for peer identification:

```
HANDSHAKE:
  1. Peer sends initial DAM message with temporary ID
  2. Peer receives acknowledgment with assigned/confirmed ID
  3. Subsequent communications use established peer ID
  4. Enables DAM optimizations (peer list exclusion)
```

### 14.2 Custom State Machines

DAM supports building custom protocols between neighbors:
- Short-lived messages for protocol negotiation
- Handshakes that modify subsequent communication processing
- Transport capability discovery
- Quality-of-service negotiation

## 15. Implementation Considerations

### 15.1 Memory Management

- Fixed-size deduplication list prevents unbounded growth
- LRU eviction ensures recent messages prioritized
- Bump mechanism maintains liveness of active message storms

### 15.2 Browser Peer Limitations

**Current Limitation:** Browser peer IDs not stable
- Reduces effectiveness of peer list optimization
- Optimization primarily benefits gateway/server peers
- Future improvement: stable browser peer identification

### 15.3 Minimum Persistence Requirement

**Critical for Data Originators:**
- MUST persist un-ACKed data
- Minimum: localStorage (5MB limit)
- Prioritize un-ACKed data over other storage
- Maintain data until ACK received OR storage exhausted

## 16. Formal Properties

### 16.1 Eventual Consistency

Given:
- Message has unique ID
- Network is eventually connected
- At least one peer retries on missing ACK

Then:
- Message eventually reaches all connected peers
- All peers process message exactly once

### 16.2 Finite Message Amplification

Given:
- Each peer maintains deduplication list
- Bump mechanism maintains recent message IDs

Then:
- Message rebroadcast count ≤ 2C + P, where C = connections, P = peers
- Storm terminates in finite time
- Crashed peers cause at most one additional rebroadcast per neighbor

### 16.3 ACK Delivery Guarantee

Given:
- Originating peer maintains subscription to ACKs
- Responding peer successfully sends ACK
- Network path exists between peers

Then:
- ACK reaches originating peer through direct routing (DAM) or broadcast (base)
- Originating peer receives ACK exactly once (deduplication)

---

## Appendix A: Pseudocode Summary

```
// Core DAM Peer Implementation

CLASS DamPeer:
  PROPERTIES:
    connected_peers: Set<Peer>
    dedup_list: LRUCache<MessageID>
    pending_acks: Map<MessageID, Subscription>
    
  METHOD receive(message, from_peer):
    IF message.id IN dedup_list:
      dedup_list.bump(message.id)
      RETURN
    
    dedup_list.add(message.id)
    this.process(message)
    this.rebroadcast_dam(message, from_peer)
  
  METHOD rebroadcast_dam(message, source):
    targets = connected_peers - message.peer_list - {source}
    
    outbound = message.clone()
    outbound.peer_list = connected_peers.get_ids()
    
    IF this.has_data_for(message) AND message.is_get():
      outbound.hash = this.fast_hash(this.get_data())
    
    FOR peer IN targets:
      peer.send(outbound)
  
  METHOD process(message):
    IF message.is_get():
      IF this.has_data() AND message.hash != this.data_hash():
        this.send_ack(message.id, this.data)
    
    ELSE IF message.is_put():
      IF this.is_subscribed_to(message.data):
        success = this.save(message.data)
        IF success:
          this.send_ack(message.id, {ok: true})
    
    ELSE IF message.is_ack():
      IF message.ack IN pending_acks:
        pending_acks[message.ack].notify(message)
  
  METHOD send_ack(original_id, data):
    ack = {
      id: new_unique_id(),
      ack: original_id,
      payload: data
    }
    dedup_list.add(ack.id)
    
    // DAM: direct route to predecessor only
    // Base: broadcast to all peers
    predecessor.send(ack)
```

---

**End of Formal Specification**

This specification preserves all key insights from the original document including the wave propagation model, deduplication mechanisms, retry responsibilities, and optimization strategies while presenting them in a structured, implementation-ready format.