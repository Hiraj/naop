const ini = require('ini')
    , fs = require('fs')
    , path = require('path')

module.exports = function(argument) {
  let configPath = path.join(__dirname, '../../naop.conf')

  return ini.parse(fs.readFileSync(configPath, 'utf-8'))
}
