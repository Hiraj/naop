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
function ManagerInteractor(manager, io) {
  this.manager = manager
  this.io = io
  this.peers = new ArrayEvent()
  this.calls = new ArrayEvent()
  this.manager.action = Promise.promisify(manager.action)
  this.logger = require('fancy-log')

  this.initialize()
}

/**
 * Initializing AMI Interactor
 * initiate with peers and calls
 */
ManagerInteractor.prototype.initialize = function() {
  this.send({ action: 'SIPpeers' })
    .then(() => {
      // Now find the channels
      return this.send({ action: 'CoreShowChannels' })
    }).then(this.logger.info)

  // Bind array event for peers and calls
  _.forEach(['peer', 'call'], v => {
    var k = v + 's'
    this[k].on('add', obj => {
      this.io.emit(v, obj)
      this.logger.info(k+' currently: ' + this[k].length)
    })

    this[k].on('remove', obj => {
      this.io.emit('peer remove', obj)
      this.logger.info('Peers currently: ' + this[k].obj)
    })

    this[k].on('change', obj => {
      if (obj) {
        this.io.emit('peer', obj)
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
      // Tracking multiple calls
      calls: []
    }

    this.peers.push(peer)
    this.setupExtension(peer).catch(this.logger.error)
  }
}

/**
 * Finding call on peer
 *
 * @param {object} peer
 * @param {string} uniqueid
 */
ManagerInteractor.prototype.findCallOnPeer = function(peer, uniqueid) {
  return _.find(peer.calls, (call) => {
    return call.uniqueid == uniqueid
  })
}

/**
 * Parse peer and channel by event
 *
 * @param {object} evt
 */
ManagerInteractor.prototype.getPeerAndChannel = function(evt) {
  let peer = this.findPeer(evt.calleridnum)
    , call = null
    , callIndex = -1

  if (peer) {
    call = this.findCallOnPeer(peer, evt.uniqueid)
  }

  return {
    peer: peer,
    channel: call
  }
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
  this.getChannelTime(channel, channelstate)
    .then(res => {
      peer.calls.push({
        uniqueid: uniqueid,
        callType: callType,
        channel: channel,
        channelState: parseInt(channelstate),
        exten: exten,
        time: res.value
      })

      this.peers.emit('change', peer)
    })
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
 * Handle CoreShowChannel
 *
 * @param {object} evt
 */
ManagerInteractor.prototype.handlerCoreShowChannel = function(evt) {
  let peer = this.findPeer(evt.calleridnum)
    // checking callType by application used
    , callType = evt.application == 'Dial' ? 'outgoing' : 'incoming'

  if (peer) {
    this.appendPeerCall(peer, evt.uniqueid, callType, evt.channel, evt.channelstate, evt.connectedlinenum)
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
    // Don't replace if empty
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
    console.log(res)
    if (res['address-ip'] && res['address-ip'] != '(null)') {
      peer.address = res['address-ip']
      peer.statusLog = res.status
    } else {
      peer.address = ''
      peer.statusLog = 'UNKNOWN'
    }

    if (res.callerid) {
      let match = res.callerid.match(/^\"(.*)\"/)

      if (match && match[1]) {
        peer.name = match[1]
        // trigger new peer status
      }
    }

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

exports.Interactor = ManagerInteractor
