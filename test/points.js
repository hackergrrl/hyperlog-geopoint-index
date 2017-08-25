var test = require('tape')
var hypergeo = require('../')
var GeoStore = require('grid-point-store')
var memdb = require('memdb')
var xtend = require('xtend')
var hyperlog = require('hyperlog')

test('points', function (t) {
  t.plan(8)

  var log = hyperlog(memdb(), { valueEncoding: 'json' })
  var geo = hypergeo({
    log: log,
    db: memdb(),
    pointType: 'float',
    types: [ 'float', 'float' ],
    store: GeoStore,
    storeDb: memdb(),
    map: function (row, next) {
      if (row.value.type === 'remove' && row.value.points) {
        next(null, { type: 'del', points: row.value.points })
      } else if (row.value.type === 'remove') {
        next(null, { type: 'del', point: [ row.value.lat, row.value.lon ] })
      } else if (row.value.type === 'point') {
        next(null, { type: 'put', point: [ row.value.lat, row.value.lon ] })
      } else if (row.value.type === 'way') {
        next(null, { type: 'put', points: row.value.points })
      }
    }
  })

  var docs = {
    A: { v: { type: 'point', lat: 64, lon: -147 } },
    B: { v: { type: 'point', lat: 63, lon: -145 } },
    C: { v: { type: 'point', lat: 65, lon: -149 } },
    D: { v: { type: 'way', points: [ 'A', 'B', 'C' ] } }
  }
  var keys = Object.keys(docs).sort()
  var nodes = {}, knodes = {}
  ;(function advance () {
    if (keys.length === 0) return ready()
    var key = keys.shift()
    var doc = docs[key]
    var ln = (doc.links || []).map(function (k) { return nodes[k].key })
    if (doc.v.points) doc.v.points = doc.v.points.map(function (p) {
      return [docs[p].v.lat,docs[p].v.lon]
    })
    log.add(ln, doc.v, function (err, node) {
      t.ifError(err)
      nodes[key] = node
      knodes[node.key] = node
      advance()
    })
  })()
  function ready () {
    var q0 = [[63.5,-150],[65.1,-147.5]]
    geo.query(q0, function (err, pts) {
      t.ifError(err)
      t.deepEqual(pts.sort(cmp), [
        { lat: 65, lon: -149, value: Buffer(nodes.C.key, 'hex') },
        { lat: 65, lon: -149, value: Buffer(nodes.D.key, 'hex') }
      ].sort(cmp))
    })
    var q1 = [[63.5,-150],[65.4,-142]]
    geo.query(q1, function (err, pts) {
      t.ifError(err)
      t.deepEqual(pts.sort(cmp), [
        { lat: 65, lon: -149, value: Buffer(nodes.C.key, 'hex') },
        { lat: 65, lon: -149, value: Buffer(nodes.D.key, 'hex') },
        { lat: 64, lon: -147, value: Buffer(nodes.A.key, 'hex') },
        { lat: 64, lon: -147, value: Buffer(nodes.D.key, 'hex') }
      ].sort(cmp))
    })
  }
})

function cmp (a, b) {
  var n = Buffer.compare(a.value, b.value)
  if (n !== 0) return n
  return a.lat < b.lat ? -1 : 1
}
