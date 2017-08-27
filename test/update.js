var test = require('tape')
var fdstore = require('fd-chunk-store')
var hyperkdb = require('../')
var GeoStore = require('grid-point-store')
var memdb = require('memdb')
var hyperlog = require('hyperlog')
var xtend = require('xtend')

test('update', function (t) {
  t.plan(8)

  var log = hyperlog(memdb(), { valueEncoding: 'json' })
  var kdb = hyperkdb({
    log: log,
    db: memdb(),
    pointType: 'float',
    types: [ 'float', 'float' ],
    store: GeoStore,
    storeDb: memdb(),
    map: function (row, next) {
      if (row.value.type === 'point') {
        next(null, [ row.value.lat, row.value.lon ])
      }
    }
  })
  var docs = [
    { type: 'point', lat: 64, lon: -147 },
    { type: 'point', lat: 63, lon: -145 },
    { type: 'point', lat: 65, lon: -149 },
    { type: 'point', lat: 64, lon: -148 }
  ]
  var pending = docs.length
  var nodes = {}, knodes = {}
  docs.forEach(function (doc, i) {
    log.add(null, doc, function (err, node) {
      t.ifError(err)
      nodes[i] = node
      knodes[node.key] = node
      if (--pending === 0) ready()
    })
  })
  function ready () {
    var doc = xtend(nodes[2].value, { lat: 65.3, lon: -143 })
    log.add([nodes[2].key], doc, function (err, node) {
      // TODO: figure out why kdb.ready() isn't sufficient here
      // need a short delay to let the index processing catch up
      setTimeout(function () {
        var q0 = [[63.5,-150],[65.1,-147.5]]
        kdb.query(q0, function (err, pts) {
          t.ifError(err)
          var ps = pts.map(function (pt) {
            return knodes[pt.value.toString('hex')].value
          })
          t.deepEqual(ps, [
            { type: 'point', lat: 64, lon: -148 }
          ])
        })
        var q1 = [[63.5,-150],[65.4,-142]]
        kdb.query(q1, function (err, pts) {
          t.ifError(err)
          var ps = pts.map(function (pt) {
            if (node.key === pt.value.toString('hex')) return node.value
            return knodes[pt.value.toString('hex')].value
          })
          t.deepEqual(ps.sort(cmp), [
            { type: 'point', lat: 65.3, lon: -143 },
            { type: 'point', lat: 64, lon: -148 },
            { type: 'point', lat: 64, lon: -147 }
          ].sort(cmp))
        })
      }, 10)
    })
  }
})

function cmp (a, b) {
  return a.lat + ',' + a.lon < b.lat + ',' + b.lon ? -1 : 1
}
