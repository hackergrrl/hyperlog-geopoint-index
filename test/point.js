var test = require('tape')
var fdstore = require('fd-chunk-store')
var hyperkdb = require('../')
var kdbtree = require('grid-point-store')
var memdb = require('memdb')
var path = require('path')

var hyperlog = require('hyperlog')
var log = hyperlog(memdb(), { valueEncoding: 'json' })
var file = path.join(require('os').tmpdir(), 'kdb-tree-' + Math.random())

test('points', function (t) {
  var N = 50
  t.plan(2 + N)
  var kdb = hyperkdb({
    log: log,
    db: memdb(),
    pointType: 'float',
    types: [ 'float', 'float' ],
    store: kdbtree,
    storeDb: memdb(),
    map: function (row, next) {
      if (row.value.type === 'point') {
        next(null, [ row.value.lat, row.value.lon ])
      }
    }
  })
  var data = []
  for (var i = 0; i < N; i++) (function (i) {
    var row = {
      type: 'point',
      lat: 64 + Math.random() * 2,
      lon: -147 - Math.random() * 2
    }
    log.add(null, row, function (err, node) {
      t.ifError(err)
      data[i] = {
        point: [ row.lat, row.lon ],
        value: Buffer(node.key, 'hex')
      }
    })
  })(i)

  var q = [[64.5,65],[-147.9,-147.2]]
  kdb.query(q, function (err, pts) {
    t.ifError(err)
    pts = pts.map(function (pt) {
      pt.point = [pt.lat, pt.lon]
      delete pt.lat
      delete pt.lon
      return pt
    }).sort(cmp)
    var expected = data.filter(function (row) {
      return q[0][0] <= row.point[0] && row.point[0] <= q[0][1]
        && q[1][0] <= row.point[1] && row.point[1] <= q[1][1]
    }).map(round).sort(cmp)
    t.deepEqual(pts.sort(cmp), expected, 'expected points')
  })
})

function round (row) {
  return {
    point: row.point.map(roundf),
    value: row.value
  }
}

function roundf (x) {
  var buf = new Buffer(4)
  buf.writeFloatBE(x, 0)
  return buf.readFloatBE(0)
}

function cmp (a, b) {
  return a.point.join(',') < b.point.join(',') ? -1 : 1
}
