import Turn from 'node-turn'
import fs, { existsSync } from 'fs'
import { createProgram, updateProgram, getSpinoffs, getProgram } from './ka_utils.js'
import fetch from 'node-fetch'
import wrtc from 'wrtc'
import Peer from 'simple-peer'
import dotenv from 'dotenv'
import globalCommands from "./games/_global.js"


dotenv.config()
function editConfig(key, value) {
  let config = JSON.parse(fs.readFileSync('config.json'))
  config[key] = value
  fs.writeFileSync('config.json', JSON.stringify(config, null, 2))
}
function getConfig(key) {
  let config = JSON.parse(fs.readFileSync('config.json'))
  return config[key]
}

function atob(str) {
  return Buffer.from(str, 'base64').toString('binary')
}
function btoa(str) {
  return Buffer.from(str, 'binary').toString('base64')
}
function getRandom16DigitId() {
  let num = Math.floor(Math.random() * 1000000000000000)
  return "b" + num.toString().padStart(15, '0')
}

if (!existsSync('ipdb.json')) {
  fs.writeFileSync('ipdb.json', JSON.stringify([], null, 2))
}



let peers = [
  // schema name: peerContext
  // {
  //   ipInfo: {...}, // Includes ip address, geolocation, etc
  //   connectionStep: 0, // (0=not connected, 1=connecting, 2=answered, 3=fully connected)
  //   offerLineNumber: offerLineNumber, // Line number of the offer answer
  //   peer: Peer,
  //   offer: {...}, // Signal offer from client
  //   answer: {...}, // Signal answer from server
  //   game: {
  //     GAME_NAME: "amongUs",
  //     ... // Optionally use this space for player specific data
  //   },
  //
  //
  //   /* Temporary */
  //   _packetsFingerprint: "cf9a", // Fingerprint of the packets received
  //   _packets: [ // Array of offer packets received
  //     {
  //       index: 3, // Index of the offer packet (0-15, not hex)
  //       content: "...", // Up to 494 characters long
  //     }
  //   ],
  //   _packetsLength: 5,
  // }
]

async function createNewPeer(peerContext) {

  // Generate a peer
  let peer = new Peer({
    initiator: false,
    trickle: false,
    wrtc,
  })
  peer.on('signal', answer => {
    peerContext.connectionStep = 2
    peerContext.answer = answer
  }).on('connect', () => {
    console.log(`Peer connected!`);
    peerContext.connectionStep = 3
    peerContext.peer = peer
    // onPeerConnect(peer, peers)
  }).on('data', data => {
    data = data.toString()
    let commandName = data.split(' ')[0].replace("!", '')
    let commandArgs = data.split(' ').slice(1)
    if (commandName == "config-game") {
      let gameName = data.split(' ')[2]
      peerContext.game.GAME_NAME = gameName
      return
    }
    let command = globalCommands.find(x => x.name == commandName)
    if (command) {
      try {
        command.exec(commandArgs, peerContext, peers)
      } catch (e) {
        console.log(`There was an error executing the command: ${commandName}`)
        console.error(e)
      }
    } else {
      console.log(`Unknown command ${commandName}`)
    }
  })
  peer.on('close', () => {
    let ind = peers.findIndex(x => x.peer == peer)
    if (ind != -1) {
      peers.splice(ind, 1)
    }
    console.log(`Peer #${ind} closed!`);
  })
  peer.on('error', err => {
    console.log(`Peer error!`, err);
    peer.destroy()
  })

  // Stitch together the offer packets
  peerContext.connectionStep = 1
  let sortedPackets = peerContext._packets.sort((a, b) => a.index - b.index)
  let offer = JSON.parse(sortedPackets.map(x => x.content).join(''))
  peerContext.offer = offer
  peerContext.offerLineNumber = parseInt(peerContext._packetsFingerprint.slice(0, 2), 16) // Line number of the answer in the link program (0-255)
  peer.signal(offer) // Trigger connection

  // Get IP info
  let ipAddress = offer.sdp.match(/(?<=IP4 ).+/gm)[1]
  lookupIpInfo(ipAddress, peerContext)
}

async function lookupIpInfo(ipAddress, peerContext) {
  let ipdb = JSON.parse(fs.readFileSync('ipdb.json'))
  if (ipdb.find(x => x.ip == ipAddress)) {
    // Add to peerData
    peerContext.ipInfo = ipdb.find(x => x.ip == ipAddress)
  } else {
    let token = process.env.IPINFO_TOKEN
    let res = await fetch(`https://ipinfo.io/${ipAddress}?token=${token}`)
    let ipInfoRes = await res.json()

    // Add to peerData
    peerContext.ipInfo = ipInfoRes

    // Add to ipdb
    ipInfoRes.date = new Date()
    ipdb.push(ipInfoRes)
    fs.writeFileSync('ipdb.json', JSON.stringify(ipdb, null, 2))
  }
}

async function updateLinkProgram() {
  // Post those offers to the KA link program

  // Generate new code based on offers
  let signalAnswerList = []
  for (let i = 0; i < peers.length; i++) {
    let peerObj = peers[i]
    if (peerObj.connectionStep == 2) {
      peerObj.connectionStep = 2.5
      signalAnswerList[peerObj.offerLineNumber - 1] = "answer=" + JSON.stringify(peerObj.answer)
    }
  }
  if (signalAnswerList.length == 0) {
    //console.log('No offers to update link program!')
    return
  }
  let newCode = signalAnswerList.join('\n')

  // Create link program
  let linkId = getConfig('link_id')
  let existingProgram
  if (linkId) {
    existingProgram = await updateProgram(linkId, newCode, "Link4")
  }
  if (!linkId || existingProgram.status == 404) {

    // Create a new program
    let data = await createProgram(newCode, "Link2")
    linkId = data.id.toString()
    console.log(`Created program ${linkId}`)

    // Update config with the program id
    editConfig('link_id', linkId)
  }

  console.log(`Done updating link - https://www.khanacademy.org/cs/i/${linkId}`)
}

// TURN server setup
var server = new Turn({
  // set options
  authMech: 'long-term',
  credentials: {
    username: "password",
  },

});
server.start();
server.onSdpPacket = function (content) {
  console.log('onSdpPacket', content.slice(0, 40) + '...');

  let packetIndex = parseInt(content.slice(0, 1), 16)
  let packetLength = parseInt(content.slice(1, 2), 16)
  let packetFingerprint = content.slice(2, 6)
  let packetContent = content.slice(6)
  let peerContext = peers.find(x => x._packetsFingerprint == packetFingerprint)
  if (packetContent.connectionStep > 0) {
    console.log("Already connected... ")
    console.log("fingerprint: " + packetFingerprint)
    return
  }
  if (peerContext) { // If fingerprint matches a peer that is waiting for more packets
    // Check if index is already in _packets
    let existingPacket = peerContext._packets.find(y => y.index == packetIndex)
    if (existingPacket) {
      console.log('Duplicate packet!', existingPacket.index, packetIndex)
      return
    }
    peerContext._packets.push({
      index: packetIndex,
      content: packetContent,
    })
  } else { // If packet is from a new peer

    peers.push({
      connectionStep: 0,
      _packetsFingerprint: packetFingerprint,
      _packets: [{
        index: packetIndex,
        content: packetContent
      }],
      _packetsLength: packetLength
    })
  }
  // If all packets have been received, create a new peer
  if (peerContext._packets.length >= packetLength) {
    createNewPeer(peerContext)
  }
  
    

}


// Main loop
var activeMode = true
var cycleN = 0
setInterval(() => {
  if (activeMode || cycleN % 4 === 0) {
    updateLinkProgram()
  }
  cycleN++
}, 5000) // Check for new spinoffs every 5 seconds (active) or 20 seconds (inactive)


console.log('server started');


