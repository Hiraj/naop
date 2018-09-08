const http = require('http')
    , fs = require('fs')
    , path = require('path')
    , express = require('express')
    , socket  = require('socket.io')
    , astman = require('asterisk-manager')
    , ini = require('ini')
    , log = require('fancy-log')
    , ArrayEvent = require('array-events')
    , _ = require('lodash')

const CHAN_STATE = {
  RING: 4,
  RINGING: 5
}

let conf = ini.parse(fs.readFileSync('./server.conf', 'utf-8'))
  , app = express()
  , server = http.Server(app)
  , io = socket(server)
  , manager = astman(conf.ami.port, conf.ami.host, conf.ami.user, conf.ami.secret, true)
  , amiData = {
    peers: new ArrayEvent(),
    calls: new ArrayEvent()
  }

manager.keepConnected()
manager.action({ action: 'SIPpeers' })
manager.action({ action: 'CoreShowChannels' })
// manager.action({ action: 'IAXpeers' })
function findPeer(ext) {
  return _.find(amiData.peers, (p) => {
    return p.extension == ext
  })
}

function findCall(uniqueid) {
  return _.find(amiData.calls, (c) => {
    return c.uniqueid == uniqueid
  })
}

function initiatePeer(peer) {
  manager.action({
    action: 'SIPShowPeer',
    peer: peer.extension
  }, (err, res) => {
    if (!err) {
      if (res.callerid) {
        let match = res.callerid.match(/^\"(.*)\"/)

        if (match && match[1]) {
          peer.name = match[1]
          amiData.peers.emit('change', peer)
        }
      }
    }
  })

  manager.action({
    action: 'ExtensionState',
    exten: peer.extension
  }, (err, res) => {
    if (!err) {
      peer.status = parseInt(res.status)
      amiData.peers.emit('change', peer)
    }
  })
}

manager.on('managerevent', (evt) => {
  switch (evt.event) {
    case 'PeerEntry':
      var peer = {
        extension: evt.objectname,
        status: -1,
        tech: evt.channeltype,
        dynamic: evt.dynamic,
        name: '',
        calling: null,
        receiving: null
      }
      amiData.peers.push(peer)
      initiatePeer(peer)
      break;
    case 'ExtensionStatus':
      var peer = findPeer(evt.exten)
      if (peer) {
        peer.status = parseInt(evt.status)
        amiData.peers.emit('change', peer)
      }
      break;
    case 'Dial':
      if (evt.subevent == 'End') {
        var call = findCall(evt.uniqueid)

        if (call) {
          var peerCaller = findPeer(call.callerid)
          var peerTarget = findPeer(call.target)

          var calls = [call]

          // Cleaning up if come from CoreShowChannels
          var peers = [peerCaller, peerTarget]
          _.forEach(peers, (p) => {
            if (p) {
              _.forEach(['calling', 'receiving'], (k) => {
                if (p[k] != evt.uniqueid) {
                  calls.push(findCall(p[k]))
                }
              })
            }
          })

          if (peerCaller) {
            peerCaller.calling = null
            amiData.peers.emit('change', peerCaller)
          }

          if (peerTarget) {
            peerTarget.receiving = null
            amiData.peers.emit('change', peerTarget)
          }

          _.forEach(calls, (c) => {
            var callIndex = amiData.calls.indexOf(c)
            if (callIndex != -1) {
              amiData.calls.splice(callIndex, 1)
              amiData.calls.emit('removed', evt.uniqueid)
            }
          });
        }

      } else if (evt.subevent == 'Begin') {
        amiData.calls.push({
          uniqueid: evt.uniqueid,
          callerid: evt.calleridnum,
          target: evt.connectedlinenum,
          starttime: null
        })

        var peerCaller = findPeer(evt.calleridnum)
        var peerTarget = findPeer(evt.connectedlinenum)

        if (peerCaller) {
          peerCaller.calling = evt.uniqueid
          amiData.peers.emit('change', peerCaller)
        }

        if (peerTarget) {
          peerTarget.receiving = evt.uniqueid
          amiData.peers.emit('change', peerTarget)
        }
      }

      log.info('Current Active calls: ' + amiData.calls.length)
      if (amiData.calls.length) {
        log.info(amiData.calls)
      }
      break;
    case 'CoreShowChannel':
      var call = findCall(evt.uniqueid)

      if (!call) {
        amiData.calls.push({
          uniqueid: evt.uniqueid,
          callerid: evt.calleridnum,
          target: evt.connectedlinenum,
          starttime: null
        })
      }

      if (CHAN_STATE.RING) {
        var peerCaller = findPeer(evt.calleridnum)
        var peerTarget = findPeer(evt.connectedlinenum)

        if (peerCaller) {
          peerCaller.calling = evt.uniqueid
          amiData.peers.emit('change', peerCaller)
        }

        if (peerTarget) {
          peerTarget.receiving = evt.uniqueid
          amiData.peers.emit('change', peerTarget)
        }
      } else if (CHAN_STATE.RINGING) {
        var peerCaller = findPeer(evt.connectedlinenum)
        var peerTarget = findPeer(evt.calleridnum)

        if (peerCaller) {
          peerCaller.calling = evt.uniqueid
          amiData.peers.emit('change', peerCaller)
        }

        if (peerTarget) {
          peerTarget.receiving = evt.uniqueid
          amiData.peers.emit('change', peerTarget)
        }
      }
      break;
    case 'Newstate':
      if (evt.channelstate == '6') {

      }
      break;
    case 'Bridge':
      console.log(evt)
      break;
    default:
      // console.log(evt)
      break;
  }
})

amiData.calls.on('add', function(call) {
  io.emit('call', call)
})

amiData.calls.on('removed', function(uniqueid) {
  io.emit('call remove', uniqueid)
})

amiData.peers.on('add', () => {
  _.forEach(amiData.peers, (peer) => {
    io.emit('peer', peer)
  })
})

amiData.peers.on('removed', () => {
  _.forEach(amiData.peers, (peer) => {
    io.emit('peer remove', peer)
  })
})

amiData.peers.on('change', (peer) => {
  if (peer) {
    io.emit('peer', peer)
  }
})

app.use(express.static('static'))

io.on('connection', (socket) => {
  log.info('New user connected')

  socket.on('show peers', () => {
    // log.info(amiData.peers.length)
    _.forEach(amiData.peers, (peer) => {
      socket.emit('peer', peer)
    })
  })

  socket.on('show calls', () => {
    _.forEach(amiData.calls, (call) => {
      socket.emit('call', call)
    })
  })
})

app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname + '/index.html'))
})

server.listen(conf.web.port, () => {
  log.info('Server started on port: ' + conf.web.port)
})
