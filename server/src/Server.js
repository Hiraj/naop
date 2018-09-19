const express = require('express')
    , socket = require('socket.io')
    , passport = require('passport')
    , http = require('http')
    , { readConfig } = require('./util')
    , AMI = require('./AMI')

class Server {

  constructor() {
    this.config = readConfig()
    this.app = express()
    this.http = http.createServer(app)
    this.socket = socket(http)
    this.amiConnections = {}

    this.setup_()
  }

  setup_() {
    for (var k in this.config) {
      let match = k.match(/^ami-(.*)$/)
      if (match) {
        this.amiConnections[match[1]] = new AMI(
          match[1],
          this.config[k],
          this.socket
        )
      }
    }
  }

  run() {

  }

}

module.exports = Server
