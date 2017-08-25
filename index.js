var indexer = require('hyperlog-index')
var inherits = require('inherits')
var EventEmitter = require('events').EventEmitter
var sub = require('subleveldown')
var through = require('through2')
var readonly = require('read-only-stream')
var once = require('once')

module.exports = HGEO
inherits(HGEO, EventEmitter)

function HGEO (opts) {
  if (!(this instanceof HGEO)) return new HGEO(opts)
  var self = this
  EventEmitter.call(self)
  self.log = opts.log
  self.db = opts.db
  self.idb = sub(self.db, 'i')

  self.geostore = opts.store(opts.storeDb, {
    pointType: opts.pointType || undefined,
    valueType: 'buffer[32]'
  })

  self.map = opts.map
  self.dex = indexer({
    log: self.log,
    db: self.idb,
    map: mapfn
  })
  self.dex.on('error', function (err) { self.emit('error', err) })

  function mapfn (row, next) {
    next = once(next)
    self.map(row, function (err, rec) {
      if (err) return next(err)
      if (Array.isArray(rec)) rec = { type: 'put', point: rec }
      if (!rec || (!rec.point && !Array.isArray(rec.points))) return next()
      if (!rec.type) rec.type = 'put'
      handleRow(row, rec, next)
    })
  }

  function handleRow (row, rec, next) {
    var value = Buffer(row.key, 'hex')
    var links = {}
    row.links.forEach(function (link) { links[link] = true })
    var pending = 1

    row.links.forEach(function (link) {
      pending++
      self.log.get(link, function (err, doc) {
        if (err) return next(err)
        self.map(doc, function (err, rec) {
          if (err) return next(err)
          if (Array.isArray(rec)) rec = { type: 'put', point: rec }
          if (!rec || (!rec.point && !Array.isArray(rec.points))) {
            if (--pending === 0) insert()
            return
          }
          if (rec.point) {
            self.geostore.remove(rec.point, { value: Buffer(link, 'hex') }, onrm)
          } else if (rec.points) {
            pending += rec.points.length
            rec.points.forEach(function (pt) {
              self.geostore.remove(pt, { value: Buffer(link, 'hex') }, onrm)
            })
            if (--pending === 0) insert()
          }
        })
      })
    })
    if (--pending === 0) insert()
    function insert () {
      if (rec.type === 'put' && rec.points) {
        var p = 1 + rec.points.length
        rec.points.forEach(function (p) {
          self.geostore.insert(p, value, oninsert)
        })
        function oninsert (err) {
          if (err) next(err)
          else if (--p === 0) next()
        }
        if (--p === 0) next()
      } else if (rec.type === 'put') {
        self.geostore.insert(rec.point, value, next)
      } else { // del, unknown type cases
        next()
      }
    }
    function onrm (err) {
      if (err) next(err)
      else if (--pending === 0) insert()
    }
  }
}

HGEO.prototype.ready = function (fn) {
  this.dex.ready(fn)
}

HGEO.prototype.query = function (q, opts, cb) {
  var self = this
  self.ready(function () {
    self.geostore.query(q, opts, cb)
  })
}

HGEO.prototype.queryStream = function (q, opts) {
  var self = this
  var r = through.obj()
  self.ready(function () {
    var qs = self.geostore.queryStream(q, opts)
    qs.on('error', r.emit.bind(r, 'error'))
    qs.pipe(r)
  })
  return readonly(r)
}

function noop () {}
