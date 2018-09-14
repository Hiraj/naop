const LocalStrategy = require('passport-local').Strategy
    , BasicStrategy = require('passport-http').BasicStrategy

/**
 * Authenticator class
 *
 * @param {object} passport
 */
function Authenticator(passport) {
  this.passport = passport
}

/**
 * Basic Auth
 *
 * @param {string} user
 * @param {string} pass
 */
Authenticator.prototype.basic = function(user, pass) {
  this.passport.use(new BasicStrategy((username, password, cb) => {
    if (user == username && pass == password) {
      cb(null, {
        user: user
      })
    } else {
      cb(null, false)
    }
  }))
}

Authenticator.prototype.local = function(db) {
  this.passport.use(new LocalStrategy((username, password, cb) => {

  }))
}

module.exports = Authenticator
