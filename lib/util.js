const fs = require('fs')
    , path = require('path')
    , ini = require('ini')
    , astman = require('asterisk-manager')
    , sqlite3 = require('sqlite3').verbose()
    , Promise = require('bluebird')

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

exports.createDBConn = function() {
  let db = new sqlite3.Database('./naop.db')
  return Promise.promisifyAll(db)
}

exports.createDBTable = function(db) {
  db.exec([
    'CREATE TABLE IF NOT EXISTS `naop_users` (',
    ' exten CHAR(20) NOT NULL PRIMARY KEY,',
    ' pass CHAR(32) NOT NULL,',
    ' template_id INTEGER',
    ' role_id INTEGER NOT NULL',
    ');',
    'CREATE TABLE IF NOT EXISTS `naop_templates` (',
    ' template_id integer NOT NULL PRIMARY KEY,',
    ' name CHAR(30) NOT NULL',
    ');',
    'CREATE TABLE IF NOT EXISTS `naop_panels` (',
    ' panel_id integer NOT NULL PRIMARY KEY,',
    ' name CHAR(30) NOT NULL',
    ');',
    'CREATE TABLE IF NOT EXISTS `naop_extensions_panel` (',
    ' panel_id integer NOT NULL,',
    ' exten CHAR(20) NOT NULL',
    ');',
    'CREATE TABLE IF NOT EXISTS `naop_panels_template` (',
    ' template_id integer NOT NULL,',
    ' panel_id CHAR(20) NOT NULL',
    ');',
    'CREATE TABLE IF NOT EXISTS `naop_roles` (',
    ' role_id integer NOT NULL PRIMARY KEY,',
    ' panel_id CHAR(20) NOT NULL',
    ');',
  ].join('\n'))
}
