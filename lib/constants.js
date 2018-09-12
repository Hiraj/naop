exports.CHAN_STATE = {
  IS_DOWN_AVAILABLE: 0,
  IS_DOWN_RESERVED: 1,
  IS_OFF_HOOK: 2,
  DIGITS: 3,
  RING: 4,
  RINGING: 5,
  LINE_IS_UP: 6,
  BUSY: 7,
}

exports.EXT_STATE = {
  NOT_FOUND: -1,
  IDLE: 0,
  IN_USE: 1,
  BUSY: 2,
  UNAVAILABLE: 4,
  RINGING: 8,
  ON_HOLD: 16
}

exports.OUTGOING_APPS = [
  'Dial',
  'MeetMe'
]
