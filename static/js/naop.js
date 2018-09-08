(function(window) {
  Vue.use(bootstrapVue)

  var app = new Vue({
    el: '#app',
    filters: {
      printPeer: function(peer) {
        return (peer.name == peer.extension || !peer.name) ?
                peer.extension :
                peer.extension + ' - ' + peer.name
      },
      callState: function(peer) {
        var call = app.findCall(peer.calling)
        return call ? call.target : ''
      },
      receiveState: function(peer) {
        var call = app.findCall(peer.receiving)
        return call ? call.callerid : ''
      }
    },
    data: function() {
      return {
        socket: null,
        peers: [],
        calls: [],
        EXT_STATE: {
          NOT_FOUND: -1,
          IDLE: 0,
          IN_USE: 1,
          BUSY: 2,
          UNAVAILABLE: 4,
          RINGING: 8,
          ON_HOLD: 16
        },
        findPeer: function(ext) {
          return _.find(this.peers, function(peer) {
            return ext == peer.extension
          })
        },
        findCall: function(uniqueid) {
          return _.find(this.calls, function(call) {
            return call.uniqueid == uniqueid
          })
        }
      }
    },
    computed: {
      peerList: function() {
        return this.peers
      }
    },
    methods: {
      bindSocketEvent: function() {
        this.socket.on('peer', this.processPeer.bind(this))
        this.socket.on('peer remove', this.removePeer.bind(this))
        this.socket.on('call', this.processCall.bind(this))
        this.socket.on('call remove', this.removeCall.bind(this))
      },
      removeCall: function(call) {
        call = this.findCall(call.uniqueid)
        if (call) {
          var callIndex = this.calls.indexOf(peer)
          this.calls.splice(callIndex, 1)
        }
      },
      processCall: function(call) {
        var existsCall = this.findCall(call.uniqueid)
        if (!existsCall) {
          this.calls.push(call)
        } else {
          for(var k in call) {
            existsCall[k] = call[k]
          }
        }
      },
      removePeer: function(peer) {
        peer = this.findPeer(peer.extension)
        if (peer) {
          var peerIndex = this.peers.indexOf(peer)
          this.peers.splice(peerIndex, 1)
        }
      },
      processPeer: function(peer) {
        var existPeer = this.findPeer(peer.extension)
        if (!existPeer) {
          this.peers.push(peer)
        } else {
          for(var k in peer) {
            existPeer[k] = peer[k]
          }
        }
      }
    },
    created: function() {
      this.socket = io()
      this.socket.emit('show peers')
      this.socket.emit('show calls')

      this.bindSocketEvent()
    }
  })
}(window))
