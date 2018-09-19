const should = require('should')
    , util = require('../../src/util')

describe('Test util/index.js', () => {

  it('Should all propery type is a function', () => {
    util.readConfig.should.be.a.Function()
  })

})
