var log = function() {
  var args = [
    '<InfiniLoad>'
  ];
  for (let key in arguments) {
    args.push(arguments[key]);
  }
  console.log.apply(console, args);
};
var resolveGenerator = function(mixed, args) {
  // If the test variable is a function, call it with the arguments and return
  // its result. Otherwise return that variable.
  return (typeof mixed === 'function') ? mixed.apply(null, args) : mixed;
};

InfiniLoad = function(collection, options) {
  "use strict";

  var _statsCollName, _contentCollName,
      _selector, _fields, _timeFieldName,
      _verbose, _slowdown, // These are debug options.
      _sortOptions, _countingFields;

  // Make sure we get a valid collection.
  check(collection, Mongo.Collection);
  _statsCollName = '__InfiniLoad-Stats-' + collection._name;
  _contentCollName = '__InfiniLoad-Content-' + collection._name;
  
  // Check necessary parameters in options.
  check(options, Match.Optional(Match.ObjectIncluding({
    'selector': Match.Optional(Match.OneOf(Object, Function)),
    'fields': Match.Optional(Match.OneOf(Object, Function)),
    'timeFieldName': Match.Optional(String),
    'verbose': Match.Optional(Boolean),
    'slowdown': Match.Optional(Number)
  })));

  options = options || {};

  // Fetch options.
  _selector = options['selector'] || {};
  _fields = options['fields'] || {};
  _timeFieldName = options['timeFieldName'] || 'createTime';
  _verbose = options['verbose'] || false;
  _slowdown = options['slowdown'] || 0;

  // Prepare data based on options.
  _sortOptions = {};
  _sortOptions[_timeFieldName] = -1;
  _countingFields = {};
  _countingFields[_timeFieldName] = 1;
  
  if (_verbose) {
    log('Initializing InfiniLoad for collection', collection._name);
    log('_statsCollName', _statsCollName);
    log('_contentCollName', _contentCollName);
    log('selector', _selector);
    log('fields', _fields);
    log('timeFieldName', _timeFieldName);
    log('sortOptions', _sortOptions);
    log('countingFields', _countingFields);
  }

  Meteor.publish(_statsCollName, function(options) {
    var now, self, initializing, selector,
        totalDocCount, totalDocCursor, totalDocHandle,
        latestDocTime, latestDocCursor,
        newDocCount, newDocCursor, newDocHandle,
        newDocSelector,
        GetReturnObject, Changed;

    if (_verbose) log('Publish request', _statsCollName, options);

    check(options, Match.Optional(Match.ObjectIncluding({
      'args': Match.Optional(Object),
      'lastLoadTime': Match.Optional(Number)
    })));

    // `Date.now()` is faster than `new Date().getTime()`.
    now = Date.now();

    options = options || {};

    options['args'] = options['args'] || {};
    // If `lastLoadTime` is not specified, it is `now`.
    options['lastLoadTime'] = options['lastLoadTime'] || now;

    if (_verbose) log('Accepted publish request', options);

    self = this;
    initializing = true;
    
    selector = resolveGenerator(_selector, [this.userId, options['args']]);
    if (_verbose) log('selector', selector);

    totalDocCount = 0;
    totalDocCursor = collection.find(selector, {
      'sort': _sortOptions,
      'fields': _countingFields
    });

    latestDocTime = 0;
    latestDocCursor = collection.find(selector, {
      'sort': _sortOptions,
      'limit': 1,
      'fields': _countingFields
    });
    if (latestDocCursor.count() === 0) {
      if (_verbose) log('no result');
      latestDocTime = now;
    } else {
      latestDocTime = Number(latestDocCursor.fetch()[0][_timeFieldName]) || now;
    }

    newDocCount = 0;
    newDocSelector = {};
    newDocSelector[_timeFieldName] = {
      '$gt': options['lastLoadTime']
    };
    newDocCursor = collection.find({
      '$and': [
        selector,
        newDocSelector
      ]
    }, {
      'sort': _sortOptions,
      'fields': _countingFields
    });

    GetReturnObject = function() {
      return {
        'totalDocCount': totalDocCount,
        'latestDocTime': latestDocTime,
        'newDocCount': newDocCount
      };
    };
    Changed = function() {
      self.changed(_statsCollName, 0, GetReturnObject());
    };

    totalDocHandle = totalDocCursor.observeChanges({
      'added': function(id, fields) {
        totalDocCount++;
        if (fields[_timeFieldName] > latestDocTime) {
          latestDocTime = fields[_timeFieldName];
        }
        if (!initializing) Changed();
      },
      'removed': function(id) {
        totalDocCount--;
        Changed();
      }
    });
    newDocHandle = newDocCursor.observeChanges({
      'added': function(id) {
        newDocCount++;
        if (!initializing) Changed();
      },
      'removed': function(id) {
        newDocCount--;
        Changed();
      }
    });

    initializing = false;
    self.added(_statsCollName, 0, GetReturnObject());
    self.ready();

    self.onStop(function() {
      totalDocHandle.stop();
      newDocHandle.stop();
    });

    return;
  });

  Meteor.publish(_contentCollName, function(options) {
    var now, selector, fields, oldDocSelector, oldDocCursor;
    
    if (_verbose) log('Publish request', _contentCollName, options);
    
    check(options, Match.Optional(Match.ObjectIncluding({
      'args': Match.Optional(Object),
      'limit': Match.Optional(Number),
      'lastLoadTime': Match.Optional(Number)
    })));

    // `Date.now()` is faster than `new Date().getTime()`.
    now = Date.now();

    options = options || {};

    options['args'] = options['args'] || {};
    options['limit'] = options['limit'] || 0;
    options['lastLoadTime'] = options['lastLoadTime'] || now

    if (_verbose) log('Accepted publish request', options);

    selector = resolveGenerator(_selector, [this.userId, options['args']]);
    if (_verbose) log('selector', selector);

    fields = resolveGenerator(_fields, [this.userId, options['args']]);
    if (_verbose) log('fields', fields);

    oldDocSelector = {};
    oldDocSelector[_timeFieldName] = {
      '$lte': options['lastLoadTime']
    };

    oldDocCursor = collection.find({
      '$and': [
        selector,
        oldDocSelector
      ]
    }, {
      'sort': _sortOptions,
      'limit': options.limit,
      'fields': fields
    });

    if (_verbose) log('Results found', oldDocCursor.count());

    if (_slowdown > 0) Meteor._sleepForMs(_slowdown);

    return oldDocCursor;
  });
  return;
};
