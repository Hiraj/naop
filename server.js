const http = require('http')
    , fs = require('fs')
    , path = require('path')
    , express = require('express')
    , socket  = require('socket.io')
    , log = require('fancy-log')
    , _ = require('lodash')
    , lodashId = require('lodash-id')
    , passport = require('passport')
    , lowdb = require('lowdb')
    , FileSync = require('lowdb/adapters/FileSync')
    , Authenticator = require('./lib/Authenticator')
    , util = require('./lib/util')
    , ManagerInteractor = require('./lib/Manager').Interactor

let conf = util.getConfig()
  , app = express()
  , server = http.Server(app)
  , io = socket(server)
  , manager = util.createManager(conf)
  , interactor = new ManagerInteractor(manager, io, conf)
  , authenticator = new Authenticator(passport)
  , adapter = new FileSync('./naop.json')
  , db = lowdb(adapter)

db._.mixin(lodashId)

app.use(express.static('static'))

io.on('connection', (socket) => {

  socket.on('show peers', () => {
    // Send peer 1 by 1 for minimal output
    _.forEach(interactor.peers, (peer) => {
      socket.emit('peer', peer)
    })
  })

  // Send conference 1 by 1 for minimal output
  socket.on('show conferences', () => {
    _.forEach(interactor.conferences, (conference) => {
      socket.emit('conference', conference)
    })
  })

  socket.on('process mute', (msg) => {
    interactor.requestMute(msg)
  })
})

app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname + '/index.html'))
})

server.listen(conf.web.port, () => {
  log.info('Server started on port: ' + conf.web.port)
})
