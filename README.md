# hyperlog-geopoint-index

> Manage a geo-point store using data from a
> [hyperlog](https://github.com/mafintosh/hyperlog).

# Example

``` js
var hypergeo = require('hyperlog-geopoint-index')
var hyperlog = require('hyperlog')
var level = require('level')

var log = hyperlog(level('./log'), { valueEncoding: 'json' })

var kdb = hypergeo({
  log: log,
  db: level('./db'),
  geostore: level('./geo'),
  map: function (row, next) {
    if (row.value.type === 'point') {
      next(null, [ row.value.lat, row.value.lon ])
    } else next()
  }
})

if (process.argv[2] === 'add') {
  log.add(null, {
    type: 'point',
    lat: Number(process.argv[3]),
    lon: Number(process.argv[4])
  })
} else if (process.argv[2] === 'query') {
  var q = process.argv.slice(3).map(commaSplit)
  kdb.query(q, function (err, pts) {
    if (err) return console.error(err)
    pts.forEach(function (pt) {
      console.log(pt.point)
    })
  })
}

function commaSplit (s) { return s.split(',').map(Number) }
```

```
$ node log.js add 64.7 -147.9
$ node log.js add 66.2 -147.5
$ node log.js add 61.6 -148.3
$ node log.js query 60,65 -149,-146
[ 64.69999694824219, -147.89999389648438 ]
[ 61.599998474121094, -148.3000030517578 ]
```

# api

``` js
var hypergeo = require('hyperlog-geopoint-index')
```

## var geo = hypergeo(opts)

Create a spatial index of points over a hyperlog. These options are required:

* `opts.log` - a hyperlog where data is written
* `opts.db` - leveldb instance to store hyperlog+geo index data
* `opts.geostore` - leveldb instance to store spatial index data
* `opts.map(row, next)` - asynchronous function mapping hyperlog rows to points

Optional:

* `opts.pointType` - the [comparable-storable-types][1] type to use for point coordinates
* `opts.valueType` - the [comparable-storable-types][1] type to use for a point's value

In the `opts.map(row, next)`, if there are no points to map in a given row, call
`next()` with a falsy value. Otherwise call `next(err, rec)` with a record:

* `rec.type` - `'put'` or `'del'`
* `rec.point` - array of coordinates

If `rec` is an array, it will be interpreted as a point in a `'put'`.

[1]: https://npmjs.com/package/comparable-storable-types

## geo.query(q, opts={}, cb)

Query for all points in the region described by `q`. This method is passed
through to the underlying geopoint store's query method.

## var r = geo.queryStream(q, opts={})

Return a readable stream `r` with the region described by `q`. This method is
passed through to the underlying geopoint store's query method.

## geo.ready(fn)

When the index has caught up with the latest known entry in the hyperlog, `fn()`
fires.

## log.add(links, doc, cb)

When you write to the hyperlog, the `links` should refer to the ancestors of the
current `doc` which will be replaced with the new value.

When you create a new point, `links` should be any empty array `[]`.

When you update an existing point, `links` should contain a list of immediate
ancestors that the update will replace. Usually this will be a single key, but
for merge cases, this can be several keys.

# install

```
npm install hyperlog-geopoint-index
```

# license

ISC
