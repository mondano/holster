// We know that this account exists, but for some reason we cant login? / cant decrypt our data / something goes wrong in validation / signing / ?!

window.holster.wire.get({"#": "~@ruzgar"}, console.log)

window.holster.wire.get({"#": "~@ruzgar"}, console.log, {wait: 1000})

// curious if we find our pubkey, once we find it 

window.holster.wire.get({"#": pubkey}, console.log, {wait: 1000})
    
// Can Holster tell us why it's failing?

// It reports wrong username or password if no public keys are found or if the provided password doesnt decrypt the account. We know that the public key is there, so there's either a timing issue or it's the decrypt failing.

Once you have your auth data you could manually try these steps?

async msg => {
    if (msg.err) {
        done(error getting ${pub}: ${msg.err})
        return
    }

    const data + msg.put && msg.put[pub]
    if (!data || !data.auth) return next()

    const auth = JSON.parse(data.auth)
    const work = await SEA.work(password, auth.salt)
    const dec = await SEA.decrypt(auth.enc, work)
    if(!dec) return next()

    user.is = {
        username: username,
        pub: data.pub,
        epub: data.epub,
        priv: dec.priv,
        epriv: dec.epriv,
    }
}

// ie SEA.work and SEA.decrypyt
// Auth is always username and password


window.holster.wire.get({"#": pubkey}, console.log, {wait: 1000})

// should allow us to traverse and find data

window.holster.wire.get({"#": "public key", ".": "auth"}, console.log, {wait: 1000})

// is auth null or does it have an object with enc, salt etc.

// did our account node get signed incorrectly, so when we try to log in browser it refuses to store it in indexedDB because it couldn't verify it. 

// Lets try to debug node signing (but it might be too fragile), per property signatures solved other problems so were definitely the way forward.

// perhaps a signing and verification bug?

// we currently dont differentiate between network and auth errors

// FYI We removed per property verification of old data