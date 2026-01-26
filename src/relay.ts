/**
 * Simple Bun server with Holster relay for WebRTC signaling
 */

import path from "path"
import { fileURLToPath } from "url"
import Holster from "./holster"

const __dirname = path.dirname(fileURLToPath(import.meta.url))

// Start Bun HTTP server
const server = Bun.serve({
  port: 3000,

  async fetch(req) {
    const url = new URL(req.url)

    // Root route - serve HTML page
    if (url.pathname === "/") {
      return new Response(`
    <!DOCTYPE html>
    <html>
    <head>
      <title>Holster WebRTC Test</title>
    </head>
    <body>
      <h1>Holster WebRTC P2P Test Server</h1>
      <p>WebSocket relay running on <code>ws://localhost:8765</code></p>
      <p>HTTP server running on <code>http://localhost:3000</code></p>
      
      <h2>Quick Test</h2>
      <p>Open browser console and run:</p>
      <pre><code>
// Load Holster (adjust path as needed)
import('/dist/src/holster.js').then(m => {
  window.Holster = m.default
  window.db = Holster({ peers: ['ws://localhost:8765'] })
  console.log('Holster loaded!', window.db)
})
      </code></pre>
    </body>
    </html>
  `, {
        headers: {
          "Content-Type": "text/html",
        },
      })
    }

    // Serve static files from parent directory (for examples, etc.)
    const staticPath = path.join(__dirname, "../..", url.pathname)
    const file = Bun.file(staticPath)

    if (await file.exists()) {
      return new Response(file)
    }

    return new Response("Not Found", { status: 404 })
  },
})

console.log(`✅ HTTP server running on ${server.url}`)

// Start Holster WebSocket relay
Holster()
console.log("✅ WebSocket relay running on ws://localhost:8765")
console.log("Ready for WebRTC signaling!")
