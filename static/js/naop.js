(function(window) {
  function padZero(num, size) {
    num = num + ''
    while (num.length < (size || 2)) {num = "0" + num}
    return num
  }

  Vue.use(bootstrapVue)

  var callTimer = Vue.component('call-timer', {
    template: '<span v-if="timer"><i class="mdi mdi-clock-outline"></i> <span>{{timer}}</span></span>',
    props: ['call'],
    data: function() {
      return {
        timer: '',
        timerInterval: null
      }
    },
    methods: {
      startTimer: function() {
        if (!this.call.time) {
          this.timer = ''
        } else {
          var diffSecond = moment(this.call.time).diff(moment(), 'seconds')
          diffSecond = Math.abs(diffSecond)

          this.timer = [
            padZero(Math.floor(diffSecond / (60*60))),
            padZero(Math.floor(diffSecond / 60)),
            padZero(Math.floor(diffSecond % 60))
          ].join(':')
        }
      }
    },
    beforeDestroy: function() {
      // Clean the interval on hidden
      if (!this.timerInterval) {
        clearInterval(this.timerInterval)
      }
    },
    created: function() {
      this.startTimer.apply(this)

      if (!this.timerInterval) {
        this.timerInterval = setInterval(this.startTimer.bind(this), 1000)
      }
    }
  })

  var app = new Vue({
    el: '#app',
    components: {
      callTimer: callTimer
    },
    filters: {
      printPeer: function(peer) {
        return (peer.name == peer.extension || !peer.name) ?
                peer.extension :
                peer.extension + ' - ' + peer.name
      }
    },
    data: function() {
      return {
        socket: null,
        peers: [],
        calls: [],
        conferences: [],
        filterExtension: '',
        EXT_STATE: {
          NOT_FOUND: -1,
          IDLE: 0,
          IN_USE: 1,
          BUSY: 2,
          UNAVAILABLE: 4,
          RINGING: 8,
          ON_HOLD: 16
        },
        CHAN_STATE: {
          IS_DOWN_AVAILABLE: 0,
          IS_DOWN_RESERVED: 1,
          IS_OFF_HOOK: 2,
          DIGITS: 3,
          RING: 4,
          RINGING: 5,
          LINE_IS_UP: 6,
          BUSY: 7,
        },
        findPeer: function(ext) {
          return _.find(this.peers, function(peer) {
            return ext == peer.extension
          })
        },
        findConference: function(id) {
          return _.find(this.conferences, function(conf) {
            return conf.id == id
          })
        }
      }
    },
    computed: {
      peerList: function() {
        var sorted = _.sortBy(this.peers, function(o) {
          var ext = parseInt(o.extension)
          return !isNaN(ext) ? ext : o.extension
        })

        if (this.filterExtension) {
          var filter = [this.filterExtension]
            , rangeFilter = this.filterExtension.match(/^(\d+)\-(\d+)$/)
            , gtltFilter = this.filterExtension.match(/^(\<|\>|\<=|\>=)(\d+)$/)

          if (rangeFilter && rangeFilter[1] && rangeFilter[2]) {
            filter = [
              parseInt(rangeFilter[1] > rangeFilter[2] ? rangeFilter[2] : rangeFilter[1]),
              parseInt(rangeFilter[2] > rangeFilter[1] ? rangeFilter[2] : rangeFilter[1])
            ]
          } else if (gtltFilter && gtltFilter[1] && gtltFilter[2]) {
            filter = [gtltFilter[1], gtltFilter[2]]
          }

          var result = _.filter(sorted, function(o) {
            // Skip trunk
            if (o.type == 'trunk') {
              return false
            }

            if (filter.length > 1) {
              var ext = parseInt(o.extension)
              if (isNaN(ext)) {
                return false
              }

              if (filter[0] == '<' || filter[0] == '>' ||
                  filter[0] == '<=' || filter[0] == '>=') {
                switch (filter[0]) {
                  case '<':
                    return ext < filter[1]
                  case '<=':
                    return ext <= filter[1]
                  case '>':
                    return ext > filter[1]
                  case '>=':
                    return ext >= filter[1]
                }
              } else {
                return o.extension >= filter[0] && o.extension <= filter[1]
              }
            } else {
              var ext = o.extension + ''
              var pattern = new RegExp(filter[0].replace(/[-[\]{}()*+?.,\\^$|#\s]/g, '\\$&'), 'i')
              return pattern.test(ext)
            }
          })
        } else {
          var result = _.filter(sorted, function(o) {
            return o.type != 'trunk'
          })
        }

        return result
      },
      trunkList: function() {
        var sorted = _.sortBy(this.peers, function(o) {
          var ext = parseInt(o.extension)
          return !isNaN(ext) ? ext : o.extension
        })

        if (this.filterExtension) {
          var filter = [this.filterExtension]
            , rangeFilter = this.filterExtension.match(/^(\d+)\-(\d+)$/)
            , gtltFilter = this.filterExtension.match(/^(\<|\>|\<=|\>=)(\d+)$/)

          if (rangeFilter && rangeFilter[1] && rangeFilter[2]) {
            filter = [
              parseInt(rangeFilter[1] > rangeFilter[2] ? rangeFilter[2] : rangeFilter[1]),
              parseInt(rangeFilter[2] > rangeFilter[1] ? rangeFilter[2] : rangeFilter[1])
            ]
          } else if (gtltFilter && gtltFilter[1] && gtltFilter[2]) {
            filter = [gtltFilter[1], gtltFilter[2]]
          }

          var result = _.filter(sorted, function(o) {
            // Skip extension
            if (o.type == 'extension') {
              return false
            }

            if (filter.length > 1) {
              var ext = parseInt(o.extension)
              if (isNaN(ext)) {
                return false
              }

              if (filter[0] == '<' || filter[0] == '>' ||
                  filter[0] == '<=' || filter[0] == '>=') {
                switch (filter[0]) {
                  case '<':
                    return ext < filter[1]
                  case '<=':
                    return ext <= filter[1]
                  case '>':
                    return ext > filter[1]
                  case '>=':
                    return ext >= filter[1]
                }
              } else {
                return o.extension >= filter[0] && o.extension <= filter[1]
              }
            } else {
              var ext = o.extension + ''
              var pattern = new RegExp(filter[0].replace(/[-[\]{}()*+?.,\\^$|#\s]/g, '\\$&'), 'i')
              return pattern.test(ext)
            }
          })
        } else {
          var result = _.filter(sorted, function(o) {
            return o.type != 'extension'
          })
        }

        return result
      }
    },
    methods: {
      bindSocketEvent: function() {
        this.socket.on('peer', this.processPeer.bind(this))
        this.socket.on('peer remove', this.removePeer.bind(this))
        this.socket.on('conference', this.processConference.bind(this))
      },
      processConference: function(conf) {
        var conference = this.findConference(conf.id)
        if (!conference) {
          this.conferences.push(conf)
        } else {
          for (var k in conference) {
            conference[k] = conf[k]
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
      },
      processMute: function(member, confId) {
        this.socket.emit('process mute', {
          conference: confId,
          usernum: member.usernum,
          mute: !member.mute
        })
      }
    },
    created: function() {
      this.socket = io()
      this.socket.emit('show peers')
      this.socket.emit('show calls')
      this.socket.emit('show conferences')

      this.bindSocketEvent()
    }
  })
}(window))
