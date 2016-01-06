var log = function () {
  'use strict';
  var args = [
    '<InfiniLoad>'
  ];
  // For some reason using `let...of` will throw an error.
  for (let key in arguments) {
    args.push(arguments[key]);
  }
  console.log.apply(console, args);
};
var resolveGenerator = function (mixed, args) {
  'use strict';
  // If the test variable is a function, call it with the arguments and return
  // its result. Otherwise return that variable.
  return (typeof mixed === 'function') ? mixed.apply(null, args) : mixed;
};
var timeValueConversion = {};
timeValueConversion['number'] = function (numValue) {
  return numValue;
};
timeValueConversion['date'] = function (numValue) {
  return new Date(numValue);
};
var allowedTimeFieldType = Object.getOwnPropertyNames(timeValueConversion);

InfiniLoad = function (collection, options) {
  'use strict';

  var _statsCollName, _contentCollName,
      _id, _pubId, _selector, _sort, _fields,
      _timeFieldName, _timeFieldType,
      _affiliation,
      _verbose, _slowdown, // These are debug options.
      _countingSort, _countingFields;

  // Make sure we get a valid collection.
  check(collection, Mongo.Collection);

  // Check necessary parameters in options.
  check(options, Match.Optional(Match.ObjectIncluding({
    'id': Match.Optional(String),
    'selector': Match.Optional(Match.OneOf(Object, Function)),
    'sort': Match.Optional(Match.OneOf(Object, Function)),
    'fields': Match.Optional(Match.OneOf(Object, Function)),
    'timeField': Match.Optional(Match.OneOf(String, {
      'name': Match.Optional(String),
      'type': Match.Optional(String)
    })),
    'affiliation': Match.Optional(Function),
    'verbose': Match.Optional(Boolean),
    'slowdown': Match.Optional(Number)
  })));

  options = options || {};

  // Fetch options.
  _pubId = options['id'] || 'default';
  _selector = options['selector'] || {};
  _sort = options['sort'] || {};
  _fields = options['fields'] || {};
  if (typeof options['timeField'] === 'string') {
    options['timeField'] = {
      'name': options['timeField']
    }
  } else {
    options['timeField'] = options['timeField'] || {};
  }
  _timeFieldName = options['timeField']['name'] || 'createTime';
  _timeFieldType = options['timeField']['type'] || 'number';
  _affiliation = options['affiliation'] || null;
  _verbose = options['verbose'] || false;
  _slowdown = options['slowdown'] || 0;

  _id = collection['_name'] + '__' + _pubId;
  _statsCollName = '__InfiniLoad-Stats-' + _id;
  _contentCollName = '__InfiniLoad-Content-' + _id;

  // Sort options for counting and detecting new documents.
  _countingSort = {};
  _countingSort[_timeFieldName] = -1;
  // Fields to return for counting documents.
  _countingFields = {};
  _countingFields[_timeFieldName] = 1;

  // Verify configurations.
  if (allowedTimeFieldType.indexOf(_timeFieldType) < 0) {
    throw new Error('Error when initializing InfiniLoad ' + _id + '. ' +
      _timeFieldType + ' is not a supported type.');
  }

  if (_verbose) {
    log('Initializing InfiniLoad ' + _id, {
      'statsCollName': _statsCollName,
      'contentCollName': _contentCollName,
      'selector': _selector,
      'sort': _sort,
      'fields': _fields,
      'timeFieldName': _timeFieldName,
      'timeFieldConstructor': _timeFieldType,
      'affiliation': _affiliation,
      'countingSort': _countingSort,
      'countingFields': _countingFields
    });
  }

  Meteor.publish(_statsCollName, function (options) {
    var now, self, initializing, selector,
        totalDocCount, totalDocCursor, totalDocHandle,
        latestDocTime, latestDocCursor,
        lastLoadTimeComparingValue,
        newDocCount, newDocCursor, newDocHandle,
        newDocSelector,
        GetReturnObject, Changed;

    if (_verbose) {
      log(_id, 'Publish request', _statsCollName, options);
    }

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

    if (_verbose) {
      log(_id, 'Accepted publish request', options);
    }

    self = this;
    initializing = true;

    selector = resolveGenerator(_selector, [this.userId, options['args']]);
    if (_verbose) {
      log(_id, 'selector', selector);
    }

    totalDocCount = 0;
    totalDocCursor = collection.find(selector, {
      'sort': _countingSort,
      'fields': _countingFields
    });

    // Get the newest document.
    latestDocTime = 0;
    latestDocCursor = collection.find(selector, {
      'sort': _countingSort,
      'limit': 1,
      'fields': _countingFields
    });
    if (latestDocCursor.count() === 0) {
      if (_verbose) {
        log(_id, 'selection is empty');
      }
      latestDocTime = now;
    } else {
      // Time field value must be able to be converted to a number.
      let timeValue = Number(latestDocCursor.fetch()[0][_timeFieldName]);
      latestDocTime = timeValue || now;
    }

    // Get what's new since last loading.
    lastLoadTimeComparingValue = timeValueConversion[_timeFieldType](options['lastLoadTime'])
    newDocCount = 0;
    newDocSelector = {};
    newDocSelector[_timeFieldName] = {
      '$gt': lastLoadTimeComparingValue
    };
    newDocCursor = collection.find({
      '$and': [
        selector,
        newDocSelector
      ]
    }, {
      'sort': _countingSort,
      'fields': _countingFields
    });

    GetReturnObject = function () {
      return {
        'totalDocCount': totalDocCount,
        'latestDocTime': latestDocTime,
        'newDocCount': newDocCount
      };
    };
    Changed = function () {
      self.changed(_statsCollName, 0, GetReturnObject());
    };

    totalDocHandle = totalDocCursor.observeChanges({
      'added': function (id, fields) {
        totalDocCount++;
        // Time field value must be able to be converted to a number.
        let timeValue = Number(fields[_timeFieldName]);
        if (timeValue > latestDocTime) {
          latestDocTime = timeValue;
        }
        if (!initializing) Changed();
      },
      'removed': function (id) {
        totalDocCount--;
        Changed();
      }
    });
    newDocHandle = newDocCursor.observeChanges({
      'added': function (id) {
        newDocCount++;
        if (!initializing) Changed();
      },
      'removed': function (id) {
        newDocCount--;
        Changed();
      }
    });

    initializing = false;
    self.added(_statsCollName, 0, GetReturnObject());
    self.ready();

    self.onStop(function () {
      totalDocHandle.stop();
      newDocHandle.stop();
    });

    return;
  });

  Meteor.publish(_contentCollName, function (options) {
    var now, selector, sort, fields, oldDocSelector, oldDocCursor,
        lastLoadTimeComparingValue, returningCursors;

    if (_verbose) {
      log(_id, 'Publish request', _contentCollName, options);
    }

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
    options['lastLoadTime'] = options['lastLoadTime'] || now;

    if (_verbose) {
      log(_id, 'Accepted publish request', options);
    }

    selector = resolveGenerator(_selector, [this.userId, options['args']]);
    if (_verbose) {
      log(_id, 'selector', selector);
    }

    sort = resolveGenerator(_sort, [this.userId, options['args']]);
    sort[_timeFieldName] = -1;
    if (_verbose) {
      log(_id, 'sort', sort);
    }

    fields = resolveGenerator(_fields, [this.userId, options['args']]);
    if (_verbose) {
      log(_id, 'fields', fields);
    }

    lastLoadTimeComparingValue = timeValueConversion[_timeFieldType](options['lastLoadTime'])
    oldDocSelector = {};
    oldDocSelector[_timeFieldName] = {
      '$lte': lastLoadTimeComparingValue
    };

    oldDocCursor = collection.find({
      '$and': [
        selector,
        oldDocSelector
      ]
    }, {
      'sort': sort,
      'limit': options.limit,
      'fields': fields
    });

    if (_verbose) {
      log(_id, 'Results found', oldDocCursor.count());
    }

    returningCursors = [oldDocCursor];
    // Handle affiliation and see if it has more cursors to be returned.
    if (_affiliation) {
      let affiliatedCursors = _affiliation(oldDocCursor);
      // Proceed only if returns anything.
      if (affiliatedCursors) {
        // Make it an array.
        if (!Array.isArray(affiliatedCursors)) {
          affiliatedCursors = [affiliatedCursors];
        }
        // Examine the array and collect Mongo.Cursor items.
        for (let cursor of affiliatedCursors) {
          // `cursor instanceof Mongo.Cursor` doesn't work.
          if (cursor.fetch) {
            returningCursors.push(cursor);
          }
        }
      }
    }

    if (_slowdown > 0) Meteor._sleepForMs(_slowdown);

    return returningCursors;
  });
  return;
};
