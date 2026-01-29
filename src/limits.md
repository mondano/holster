Great question — this is *exactly* the kind of thing you want to think about if you’re building serious browser-based P2P / local-first / WebRTC systems.

Short answer: **there is no single “capability API”**, but you *can* infer device capacity pretty reliably by combining **static signals + active probing + adaptive runtime measurement**.

Below is a practical, browser-only toolbox, from “cheap signals” → “hard limits”.

---

## 1. Static / low-cost capability signals (no probing)

These don’t give limits, but they help you **classify the device**.

### CPU & memory hints

```js
navigator.hardwareConcurrency   // number of logical cores
navigator.deviceMemory          // approx RAM in GB (Chrome only)
```

Typical heuristics:

* `<= 4 cores` → mobile / low-end
* `8+ cores` → desktop / laptop
* `deviceMemory <= 4` → be conservative with peers & storage

⚠️ These are **hints**, not guarantees.

---

### Platform & environment

```js
navigator.userAgentData?.platform
navigator.userAgent
```

Useful to bucket:

* iOS Safari → very aggressive limits
* Android Chrome → medium
* Desktop Chrome / Firefox → best case

---

## 2. IndexedDB storage capacity & behavior

### A. Estimate available quota

```js
const { quota, usage } = await navigator.storage.estimate();

console.log({
  quotaMB: quota / 1024 / 1024,
  usageMB: usage / 1024 / 1024
});
```

Typical ranges:

* iOS Safari: **~50–250MB**
* Mobile Chrome: **~5–10% of disk**
* Desktop Chrome: **up to several GB**

---

### B. Check persistence (critical)

```js
const persisted = await navigator.storage.persisted();
if (!persisted) {
  await navigator.storage.persist();
}
```

If not persisted:

* browser may **evict your IndexedDB silently**
* background tabs get wiped first

---

### C. Practical write-speed probe

Write a blob and time it:

```js
const start = performance.now();
// write 10–50MB blob to IDB
const elapsed = performance.now() - start;
```

This tells you:

* slow flash storage
* iOS background throttling
* whether chunking is needed

---

## 3. WebRTC connection capacity (this is the hard one)

There is **no API** like `maxPeerConnections`.

You must **probe**.

---

### A. Incremental peer-connection probing

Create RTCPeerConnections gradually until failure or degradation.

```js
const pcs = [];
try {
  for (let i = 0; i < 50; i++) {
    const pc = new RTCPeerConnection();
    pc.createDataChannel("test");
    pcs.push(pc);
    await pc.createOffer();
  }
} catch (e) {
  console.log("Limit reached at", pcs.length);
}
```

What you learn:

* hard browser limits
* ICE / memory exhaustion
* OS socket limits

Typical ballparks:

* iOS Safari: **3–6**
* Mobile Chrome: **8–16**
* Desktop Chrome: **20–60+** (but unstable above ~30)

---

### B. Measure *quality degradation*, not just failure

More important than “how many”:

* event loop delay
* RTT
* packet loss
* memory growth

Use:

```js
pc.getStats()
```

Watch:

* `currentRoundTripTime`
* `packetsLost`
* `bytesSent / bytesReceived`

When these spike → you’re past the *safe* limit.

---

## 4. Bandwidth estimation (realistic)

### A. WebRTC-based bandwidth probing (best)

Send data between two peers and measure throughput.

```js
dataChannel.send(largeArrayBuffer);
```

Then compute:

* send time
* receive time
* bytes / second

This gives **real usable P2P bandwidth**, not theoretical.

---

### B. Network Information API (weak but cheap)

```js
navigator.connection?.effectiveType  // "4g", "3g", etc
navigator.connection?.downlink       // Mbps (rough)
navigator.connection?.rtt            // ms
```

Use this only to:

* pick initial presets
* decide whether to probe aggressively

---

## 5. Event loop & performance budget (underrated but crucial)

Even if WebRTC *connects*, JS may choke.

### A. Event loop lag probe

```js
let last = performance.now();
setInterval(() => {
  const now = performance.now();
  const lag = now - last - 1000;
  last = now;
  console.log("Lag:", lag);
}, 1000);
```

If lag > ~50–100ms consistently:

* too many peers
* too much crypto
* too much serialization

---

### B. Memory pressure detection

There’s no direct API, but signals:

* increasing GC pauses
* sudden WebRTC failures
* IndexedDB transactions aborting

---

## 6. Adaptive capability model (recommended pattern)

**Don’t decide once. Continuously adapt.**

Example internal model:

```js
capability = {
  maxPeers: dynamic,
  safePeers: observed,
  storageMB: estimated,
  bandwidthUp: measured,
  bandwidthDown: measured,
  cpuClass: inferred
}
```

Algorithm:

1. Start conservative
2. Probe slowly upward
3. Watch degradation
4. Back off automatically

This is how:

* libp2p
* WebTorrent
* modern mesh systems survive in browsers

---

## 7. What you *cannot* know in browser (hard limits)

Just so you don’t chase ghosts:

* true RAM size
* kernel socket limits
* background tab throttling rules
* thermal throttling
* battery constraints

You can only **infer from behavior**.

---

## 8. Practical presets I’d recommend

| Device class   | WebRTC peers | Storage usage | Notes               |
| -------------- | ------------ | ------------- | ------------------- |
| iOS Safari     | 3–4          | ≤100MB        | aggressive eviction |
| Android mobile | 6–10         | ≤500MB        | background kills    |
| Laptop         | 10–25        | 1–5GB         | safe zone           |
| Desktop        | 20–40        | 5GB+          | watch CPU           |

---

## Big picture (important)

In the browser, **capability is emergent**, not declared.

The winning strategy is:

> *probe → observe → adapt → back off*

If you want, next we can:

* design a **capability probing module**
* define **safe peer selection heuristics**
* map this directly onto **WebRTC + Hypercore / IPFS-style meshes**

This is fun territory 😄
