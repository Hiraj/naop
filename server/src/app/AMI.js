const astman = require('asterisk-manager')

class AMI {

  constructor(serverName, conf, socket) {
    this.serverName = serverName
    this.socket = socket
    this.manager = astman(conf.port, conf.host, conf.user, conf.pass, true)
    this.peers = []
    this.conferences = []
    this.queues = []

    this.manager.keepConnected()
  }


  response(evt, obj) {
    this.socket.emit(evt, {
      server: this.serverName.
      data: obj
    })
  }

}
