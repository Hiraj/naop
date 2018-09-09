const fs = require('fs')
    , path = require('path')
    , ini = require('ini')
    , astman = require('asterisk-manager')

exports.getConfig = function() {
  let confPath = path.join(__dirname, '../server.conf')
    , conf = ini.parse(fs.readFileSync(confPath, 'utf-8'))

  return conf
}

exports.createManager = function(conf) {
  let manager = astman(
    conf.ami.port,
    conf.ami.host,
    conf.ami.user,
    conf.ami.secret,
    true
  )

  // Keep AMI Connection alive
  manager.keepConnected()

  return manager
}
