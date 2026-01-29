Ok we want to implement @PROTOCOL.md  now we currenty have @src/wire.ts and @src/webrtc.ts  now it should be noted that 

we provide wire in @src/user.ts as the wire of our initial relay connection which will then according to our plan facilitate further webrtc connection, so I wonder, how do we reproduce all the functionality of @src/wire.ts in a transport.ts file, that has all the functionality while abstracting whehter it is websocket or wire, once we test that this is accurate, we would have one unified interface without duplication  

more over we also have files like @src/dup.ts which of course give us some of the dam logic etc. so i want you plan to comprehensively look at what in our codebase already supplies the functionality we are looking for to implement @PROTOCOL.md 

For example also check out @src/holster.ts and @src/store.ts we should already have mechanisms for saving what we subscribe to etc. 