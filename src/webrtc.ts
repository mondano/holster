/**
 * WebRTC - Peer-to-peer connections using WebRTC DataChannels
 * Implements MDN's Perfect Negotiation Pattern for robust peer connections
 * @see https://developer.mozilla.org/en-US/docs/Web/API/WebRTC_API/Perfect_negotiation
 */

import type { UserIdentity } from "./schemas.js"

export interface WebRTCPeerConnection {
    id: string // SEA public key
    connection: RTCPeerConnection
    dataChannel: RTCDataChannel | null
    state: "connecting" | "connected" | "failed" | "closed"
    polite: boolean // Polite peer yields on collision
    makingOffer: boolean // Currently creating an offer
    ignoreOffer: boolean // Ignore incoming offer (impolite peer during collision)
    isSettingRemoteAnswerPending: boolean // Async state tracking
}

export interface SignalingMessage {
    type: "offer" | "answer" | "ice" | "peer_list"
    from: string // SEA public key
    to?: string // SEA public key (optional for broadcast)
    offer?: RTCSessionDescriptionInit
    answer?: RTCSessionDescriptionInit
    candidate?: RTCIceCandidateInit
    peers?: string[] // For peer discovery
}

export interface WebRTCOptions {
    iceServers?: RTCIceServer[]
    onMessage?: (data: string, peerId: string) => void
    onPeerConnected?: (peerId: string) => void
    onPeerDisconnected?: (peerId: string) => void
    onOffer?: (signal: SignalingMessage) => void
    onAnswer?: (signal: SignalingMessage) => void
    onIceCandidate?: (signal: SignalingMessage) => void
}

const DEFAULT_ICE_SERVERS: RTCIceServer[] = [
    { urls: "stun:stun.l.google.com:19302" },
    { urls: "stun:stun1.l.google.com:19302" },
]

export interface WebRTCAPI {
    connect: (remotePeerId: string, polite?: boolean) => Promise<void>
    handleDescription: (description: RTCSessionDescriptionInit, remotePeerId: string) => Promise<void>
    handleIceCandidate: (candidate: RTCIceCandidateInit, remotePeerId: string) => Promise<void>
    send: (data: string, peerId?: string) => boolean
    getConnectedPeerIds: () => string[]
    disconnect: (peerId: string) => void
    peers: Map<string, WebRTCPeerConnection>
}

const WebRTC = (user: UserIdentity, options: WebRTCOptions = {}): WebRTCAPI => {
    const peers = new Map<string, WebRTCPeerConnection>()
    const iceServers = options.iceServers || DEFAULT_ICE_SERVERS

    // Create RTCPeerConnection with Perfect Negotiation
    const createPeerConnection = (remotePeerId: string, polite: boolean): WebRTCPeerConnection => {
        const pc = new RTCPeerConnection({ iceServers })

        const peerState: WebRTCPeerConnection = {
            id: remotePeerId,
            connection: pc,
            dataChannel: null,
            state: "connecting",
            polite,
            makingOffer: false,
            ignoreOffer: false,
            isSettingRemoteAnswerPending: false,
        }

        peers.set(remotePeerId, peerState)

        // Perfect Negotiation: onnegotiationneeded
        pc.onnegotiationneeded = async () => {
            try {
                peerState.makingOffer = true
                await pc.setLocalDescription()

                if (options.onOffer && pc.localDescription) {
                    options.onOffer({
                        type: "offer",
                        from: user.pub,
                        to: remotePeerId,
                        offer: pc.localDescription.toJSON(),
                    })
                }
            } catch (err) {
                console.error(`Negotiation error with ${remotePeerId}:`, err)
            } finally {
                peerState.makingOffer = false
            }
        }

        // ICE candidate handling
        pc.onicecandidate = (event) => {
            if (event.candidate && options.onIceCandidate) {
                options.onIceCandidate({
                    type: "ice",
                    from: user.pub,
                    to: remotePeerId,
                    candidate: event.candidate.toJSON(),
                })
            }
        }

        // Connection state changes
        pc.onconnectionstatechange = () => {
            console.log(`WebRTC ${remotePeerId}: ${pc.connectionState}`)

            if (pc.connectionState === "connected") {
                peerState.state = "connected"
                options.onPeerConnected?.(remotePeerId)
            } else if (pc.connectionState === "failed" || pc.connectionState === "closed") {
                peerState.state = pc.connectionState
                options.onPeerDisconnected?.(remotePeerId)
                peers.delete(remotePeerId)
            }
        }

        // Handle incoming data channel
        pc.ondatachannel = (event) => {
            setupDataChannel(event.channel, remotePeerId)
            peerState.dataChannel = event.channel
        }

        return peerState
    }

    // Setup data channel handlers
    const setupDataChannel = (dc: RTCDataChannel, remotePeerId: string) => {
        dc.onopen = () => {
            console.log(`DataChannel open: ${remotePeerId}`)
            const peer = peers.get(remotePeerId)
            if (peer) peer.state = "connected"
        }

        dc.onmessage = (event) => {
            options.onMessage?.(event.data, remotePeerId)
        }

        dc.onerror = (error) => {
            console.error(`DataChannel error ${remotePeerId}:`, error)
        }

        dc.onclose = () => {
            console.log(`DataChannel closed: ${remotePeerId}`)
        }
    }

    // Initiate connection (creates offer via negotiationneeded)
    const connect = async (remotePeerId: string, polite = false): Promise<void> => {
        if (peers.has(remotePeerId)) return

        console.log(`Connecting to ${remotePeerId} (polite: ${polite})`)

        const peerState = createPeerConnection(remotePeerId, polite)
        const dc = peerState.connection.createDataChannel("holster-dam", {
            ordered: true,
            maxRetransmits: 3,
        })

        setupDataChannel(dc, remotePeerId)
        peerState.dataChannel = dc

        // negotiationneeded will fire automatically
    }

    // Handle incoming description (Perfect Negotiation)
    const handleDescription = async (
        description: RTCSessionDescriptionInit,
        remotePeerId: string
    ): Promise<void> => {
        let peer = peers.get(remotePeerId)

        // Create connection if receiving first offer
        if (!peer) {
            console.log(`Receiving ${description.type} from ${remotePeerId}`)
            peer = createPeerConnection(remotePeerId, true) // Polite by default
        }

        const pc = peer.connection

        // Perfect Negotiation: Collision detection
        const readyForOffer =
            !peer.makingOffer &&
            (pc.signalingState === "stable" || peer.isSettingRemoteAnswerPending)

        const offerCollision = description.type === "offer" && !readyForOffer

        peer.ignoreOffer = !peer.polite && offerCollision

        if (peer.ignoreOffer) {
            console.log(`Ignoring colliding offer from ${remotePeerId}`)
            return
        }

        try {
            peer.isSettingRemoteAnswerPending = description.type === "answer"
            await pc.setRemoteDescription(description)
            peer.isSettingRemoteAnswerPending = false

            // Send answer if we received an offer
            if (description.type === "offer") {
                await pc.setLocalDescription()

                if (options.onAnswer && pc.localDescription) {
                    options.onAnswer({
                        type: "answer",
                        from: user.pub,
                        to: remotePeerId,
                        answer: pc.localDescription.toJSON(),
                    })
                }
            }
        } catch (err) {
            console.error(`Error handling ${description.type} from ${remotePeerId}:`, err)
        }
    }

    // Handle incoming ICE candidate
    const handleIceCandidate = async (
        candidate: RTCIceCandidateInit,
        remotePeerId: string
    ): Promise<void> => {
        const peer = peers.get(remotePeerId)
        if (!peer) return

        try {
            await peer.connection.addIceCandidate(new RTCIceCandidate(candidate))
        } catch (err) {
            if (!peer.ignoreOffer) {
                console.error(`ICE error ${remotePeerId}:`, err)
            }
        }
    }

    // Send data to peer(s)
    const send = (data: string, peerId?: string): boolean => {
        if (peerId) {
            const peer = peers.get(peerId)
            if (peer?.dataChannel?.readyState === "open") {
                peer.dataChannel.send(data)
                return true
            }
            return false
        }

        let sentToAny = false
        peers.forEach((peer) => {
            if (peer.dataChannel?.readyState === "open") {
                peer.dataChannel.send(data)
                sentToAny = true
            }
        })
        return sentToAny
    }

    // Get connected peer IDs
    const getConnectedPeerIds = (): string[] => {
        return Array.from(peers.values())
            .filter((p) => p.state === "connected")
            .map((p) => p.id)
    }

    // Disconnect from peer
    const disconnect = (peerId: string): void => {
        const peer = peers.get(peerId)
        if (!peer) return

        peer.dataChannel?.close()
        peer.connection.close()
        peers.delete(peerId)
    }

    return {
        connect,
        handleDescription,
        handleIceCandidate,
        send,
        getConnectedPeerIds,
        disconnect,
        peers,
    }
}

export default WebRTC
