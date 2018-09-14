const Promise = require('bluebird')
    , ArrayEvent = require('array-events')
    , _ = require('lodash')
    , constants = require('./constants')

/**
 * Initating AMI Interactor
 *
 * @param {object} manager  - Object asterisk-manager
 * @param {object} io       - Object socket.io
 */
function ManagerInteractor(manager, io, conf) {
  this.manager = manager
  this.io = io
  this.peers = new ArrayEvent()
  this.conferences = new ArrayEvent()
  this.manager.action = Promise.promisify(manager.action)
  this.logger = require('fancy-log')
  this.trunkContextPattern = new RegExp(conf.sip.trunkContextPattern)

  this.initialize()
}

/**
 * Initializing AMI Interactor
 * initiate with peers and calls
 */
ManagerInteractor.prototype.initialize = function() {
  this.send({ action: 'SIPpeers' })
    .then(() => {
      let promises = []
      // Now find the channels
      promises.push(this.send({ action: 'CoreShowChannels' }))
      promises.push(this.send({action: 'VoicemailUsersList'}))
      // Get List Conferences
      promises.push(this.send({
        action: 'GetConfig',
        filename: 'meetme.conf'
      }).then(res => {
        for (let k in res)  {
          let match = res[k].match(/^conf=(\w+)/)
          if (match && match[1]) {
            this.conferences.push({
              id: match[1],
              members: []
            })
          }
        }
      }))

      return  Promise.all(promises)
    }).catch(this.actionError.bind(this))
    .then(() => {
      _.forEach(this.conferences, (conference) => {
        this.send({
          action: 'MeetmeList',
          conference: conference.id
        }).catch(this.logger.info)
      })
    })

  // Bind array event for peers and calls
  _.forEach(['peer', 'conference'], v => {
    var k = v + 's'
    this[k].on('add', obj => {
      this.io.emit(v, obj)
      this.logger.info(k +' currently: ' + this[k].length)
    })

    this[k].on('remove', obj => {
      this.io.emit(v + ' remove', obj)
      this.logger.info(k + ' currently: ' + this[k].obj)
    })

    this[k].on('change', obj => {
      if (obj) {
        this.io.emit(v, obj)
      }
    })
  })

  // Set event handler method to prefix with handler
  this.manager.on('managerevent', evt => {
    let method = 'handler' + evt.event

    if (typeof this[method] == 'function') {
      this[method].apply(this, [evt])
    }
  })
}

/**
 * Handler MeetmeList
 *
 * @param {object} evt
 */
ManagerInteractor.prototype.handlerMeetmeList = function(evt) {
  let conference = this.findConference(evt.conference)
    , member = null

  if (conference) {
    member = this.findConferenceMember(conference, evt.usernumber)
    if (!member) {
      conference.members.push({
        exten: evt.calleridnum,
        name: evt.calleridname,
        usernum: evt.usernumber,
        mute: evt.muted != 'No'
      })

      this.conferences.emit('change', conference)
    }
  }
}

/**
 * Handler MeetmeJoin
 *
 * @param {object} evt
 */
ManagerInteractor.prototype.handlerMeetmeJoin = function(evt) {
  let conference = this.findConference(evt.meetme)
    , member = null

  if (conference) {
    member = this.findConferenceMember(conference, evt.usernum)
    if (!member) {
      conference.members.push({
        exten: evt.calleridnum,
        name: evt.calleridname,
        usernum: evt.usernum,
        mute: false
      })

      this.conferences.emit('change', conference)
    }
  }
}

ManagerInteractor.prototype.handlerMeetmeMute = function(evt) {
  let conference = this.findConference(evt.meetme)
    , member = null

  if (conference) {
    member = this.findConferenceMember(conference, evt.usernum)
    if (member) {
      member.mute = evt.status == 'on'

      this.conferences.emit('change', conference)
    }
  }
}

ManagerInteractor.prototype.requestMute = function(msg) {
  let action = msg.mute ? 'MeetmeMute' : 'MeetmeUnmute'

  this.send({
    action: action,
    usernum: msg.usernum,
    meetme: msg.conference
  }).catch(this.logger.error)
}

/**
 * Handler MeetmeLeave
 *
 * @param {object} evt
 */
ManagerInteractor.prototype.handlerMeetmeLeave = function(evt) {
  let conference = this.findConference(evt.meetme)
    , member = null
    , memberIndex = -1

  if (conference) {
    member = this.findConferenceMember(conference, evt.usernum)
    if (member) {
      memberIndex = conference.members.indexOf(member)
      conference.members.splice(memberIndex, 1)
      this.conferences.emit('change', conference)
    }
  }
}

// ManagerInteractor.prototype.handlerVoicemailUserEntry = function(evt) {
//   console.log(evt)
// }

/**
 * Handle AMI Event ExtensionStatus
 *
 * @param {object} evt
 */
ManagerInteractor.prototype.handlerExtensionStatus = function(evt) {
  var peer = this.findPeer(evt.exten)

  if (peer) {
    peer.status = parseInt(evt.status)
    this.setupExtension(peer)
    // this.peers.emit('change', peer)
  }
}

/**
 * Handle AMI Event PeerStatus
 *
 * @param {object} evt
 */
ManagerInteractor.prototype.handlerPeerStatus = function(evt) {
  var exten = evt.peer.replace(evt.channeltype + '/', '')
    , peer = this.findPeer(exten)

  if (peer) {
    this.setupExtension(peer)
  }
}

/**
 * Handle AMI Event PeerEntry
 *
 * @param {object} evt
 */
ManagerInteractor.prototype.handlerPeerEntry = function(evt) {
  let peer = this.findPeer(evt.objectname)

  if (!peer) {
    peer = {
      extension: evt.objectname,
      tech: evt.channeltype,
      dynamic: evt.dynamic,
      status: -1,
      statusLog: evt.status,
      name: '',
      address: '',
      type: '',
      // Tracking multiple calls
      calls: []
    }

    this.peers.push(peer)
    this.setupExtension(peer).catch(this.logger.error)
  }
}

/**
 * Parse peer and channel by event
 *
 * @param {object} evt
 */
ManagerInteractor.prototype.getPeerAndChannel = function(evt) {
  let peer = this.findPeer(evt.calleridnum)
    , channel = null
    , callIndex = -1

  if (peer) {
    channel = this.findChannelOnPeer(peer, evt.channel)
  }

  return {
    peer: peer,
    channel: channel
  }
}

/**
 * Finding channel on peer
 *
 * @param {object} peer
 * @param {string} channel
 */
ManagerInteractor.prototype.findChannelOnPeer = function(peer, channel) {
  return _.find(peer.calls, (call) => {
    return call.channel = channel
  })
}

/**
 * Handle hangup
 *
 * @param {object} evt
 */
ManagerInteractor.prototype.handlerHangup = function(evt) {
  let result = this.getPeerAndChannel(evt)

  if (result.peer && result.channel) {
    callIndex = result.peer.calls.indexOf(result.channel)

    result.peer.calls.splice(callIndex, 1)
    this.peers.emit('change', result.peer)
  }
}

/**
 * Retrieve channel time
 *
 * @param {string}        channel
 * @param {string|number} channelstate
 */
ManagerInteractor.prototype.getChannelTime = function(channel, channelstate) {
  // Give answer time if line is already
  let cdrKey = channelstate == constants.CHAN_STATE.LINE_IS_UP ? 'answer' : 'start'

  return this.send({
    action: 'GetVar',
    channel: channel,
    variable: 'CDR('+cdrKey+')'
  })
}

/**
 * Append call into peer
 *
 * @param {object} peer
 * @param {string} uniqueid
 * @param {string} callType
 * @param {string} channel
 * @param {string} channelstate
 * @param {string} exten
 */
ManagerInteractor.prototype.appendPeerCall = function(peer, uniqueid, callType, channel, channelstate, exten) {
  let call = {
    uniqueid: uniqueid,
    callType: callType,
    channel: channel,
    channelState: parseInt(channelstate),
    time: '',
    exten: exten
  }

  peer.calls.push(call)
  this.peers.emit('change', peer)

  this.getChannelTime(channel, channelstate)
    .then(res => {
      call.time = res.value
      this.peers.emit('change', peer)
    })
}

/**
 * Handle CoreShowChannel
 *
 * @param {object} evt
 */
ManagerInteractor.prototype.handlerCoreShowChannel = function(evt) {
  let peer = this.findPeer(evt.calleridnum)
  // checking callType by application used
    , callType = constants.OUTGOING_APPS.indexOf(evt.application) != -1 ?
                'outgoing' :
                'incoming'

  // Check for conferences
  if (evt.application == 'MeetMe') {
    let match = evt.applicationdata.match(/^(\w+),/)
    if (match && match[1]) {
      evt.connectedlinenum = match[1]
    }
  }

  if (peer) {
    this.appendPeerCall(peer, evt.uniqueid, callType, evt.channel, evt.channelstate, evt.connectedlinenum)
  }
}

/**
 * Handle every channel created
 *
 * @param {object} evt
 */
ManagerInteractor.prototype.handlerNewchannel = function(evt) {
  // Check call type using who is calling
  let callType = evt.exten ? 'outgoing' : 'incoming'
    , peer = this.findPeer(evt.calleridnum)

  if (peer) {
    this.appendPeerCall(peer, evt.uniqueid, callType, evt.channel, evt.channelstate, evt.exten)
  }
}

/**
 * Handle Newstate
 *
 * @param {object} evt
 */
ManagerInteractor.prototype.handlerNewstate = function(evt) {
  let result = this.getPeerAndChannel(evt)

  if (result.peer && result.channel) {
    callIndex = result.peer.calls.indexOf(result.channel)

    if (evt.connectedlinenum) {
      result.peer.calls[callIndex].exten = evt.connectedlinenum
    }

    result.peer.calls[callIndex].channelState = evt.channelstate

    this.getChannelTime(evt.channel, evt.channelstate)
      .then(res => {
        result.peer.calls[callIndex].time = res.value
        this.peers.emit('change', result.peer)
      })
  }
}

/**
 * Handle Bridge
 *
 * @param {object} evt
 */
ManagerInteractor.prototype.handlerBridge = function(evt) {
  if (evt.bridgestate == 'Link') {
    // Fake events
    let evts = [{
      channel: evt.channel1,
      uniqueid: evt.uniqueid1,
      calleridnum: evt.callerid1,
      exten: evt.callerid2
    }, {
      channel: evt.channel2,
      uniqueid: evt.uniqueid2,
      calleridnum: evt.callerid2,
      exten: evt.callerid1
    }]

    _.forEach(evts, (e) => {
      let result = this.getPeerAndChannel(e)
        , callIndex = -1

      if (result.channel) {
        callIndex = result.peer.calls.indexOf(result.channel)
        result.peer.calls[callIndex].exten = e.exten

        this.getChannelTime(e.channel, constants.CHAN_STATE.LINE_IS_UP)
            .then(res => {
              result.peer.calls[callIndex].time = res.value
              this.peers.emit('change', result.peer)
            })
      }
    })
  }
}

/**
 * Initiate peer state
 *
 * @param {object} peer
 */
ManagerInteractor.prototype.setupExtension = function(peer) {
  let promises = []
  // Finding callerid and ip address of this peer
  promises.push(this.send({
    action: 'SIPShowPeer',
    peer: peer.extension
  }).then(res => {
    if (res['address-ip'] && res['address-ip'] != '(null)') {
      peer.address = res['address-ip']
      peer.statusLog = res.status
    } else {
      peer.address = ''
      peer.statusLog = 'UNKNOWN'
    }

    peer.type = this.trunkContextPattern.test(res.context) ? 'trunk' : 'extension'

    if (res.callerid) {
      let match = res.callerid.match(/^\"(.*)\"/)

      if (match && match[1]) {
        peer.name = match[1]
      }
    }

    // trigger new peer status
    this.peers.emit('change', peer)
  }))

  // Finding Extension state
  promises.push(this.send({
    action: 'ExtensionState',
    exten: peer.extension
  }).then(res => {
    // convert status into integer
    peer.status = parseInt(res.status)
    // trigger new peer status
    this.peers.emit('change', peer)
  }))

  return Promise.all(promises)
}

/**
 * Sending AMI Action
 * @param {object} params
 */
ManagerInteractor.prototype.send = function(params) {
  return this.manager.action(params)
}

/**
 * Handle error AMI Action
 *
 * @param {object} err
 */
ManagerInteractor.prototype.actionError = function(err) {
  this.logger.error(err)
}

/**
 * Find peer
 *
 * @param {string} ext
 */
ManagerInteractor.prototype.findPeer = function(ext) {
  return _.find(this.peers, (peer) => {
    return peer.extension == ext
  })
}

/**
 * Find call
 *
 * @param {string} uniqueid
 */
ManagerInteractor.prototype.findCall = function(uniqueid) {
  return _.find(this.peers, (call) => {
    return call.uniqueid == uniqueid
  })
}

/**
 * Find conference
 *
 * @param {string} uniqueid
 */
ManagerInteractor.prototype.findConference = function(id) {
  return _.find(this.conferences, (conference) => {
    return conference.id == id
  })
}

/**
 * Find Conference Member
 *
 * @param {string} uniqueid
 */
ManagerInteractor.prototype.findConferenceMember = function(conf, usernum) {
  return _.find(conf.members, (member) => {
    return member.usernum == usernum
  })
}

exports.Interactor = ManagerInteractor
