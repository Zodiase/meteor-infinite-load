var log = function () {
  var args = [
    '<InfiniLoad>'
  ];
  for (let key in arguments) {
    args.push(arguments[key]);
  }
  console.log.apply(console, args);
};

InfiniLoad = function (collection, options) {
  "use strict";

  var _initialDataReady,
      _pubId,
      _tracker, _subscriber,
      _onReady, _onUpdate,
      _verbose,
      _serverParameters,
      _initialLimit, _limitIncrement,
      _statsCollName, _contentCollName,
      _Stats,
      _serverArgs,
      _newDocCount, _totalDocCount,
      _latestDocTime, _lastLoadTime, _listLoadLimit, _loadOptions,
      _computations, _subscriptions,
      _onStatsSubscribed, _onContentSubscribed,
      _UpdateLoadOptions, _UpdateLoadOptions_NonReactive,
      _GetLoadedDocCount, _GetToLoadDocCount,
      _GetNewDocCount, _GetTotalDocCount,
      _HasMoreDocs, _HasNewDocs,
      _LoadMoreDocs, _LoadNewDocs,
      _SetServerParameters,
      _Stop,
      _API;

  // Make sure we get a valid collection.
  check(collection, Mongo.Collection);

  // Check necessary parameters in options.
  check(options, Match.Optional(Match.ObjectIncluding({
    'id': Match.Optional(String),
    'serverParameters': Match.Optional(Object),
    'initialLimit': Match.Optional(Number),
    'limitIncrement': Match.Optional(Number),
    'tpl': Match.Optional(Blaze.TemplateInstance),
    'onReady': Match.Optional(Function),
    'onUpdate': Match.Optional(Function),
    'verbose': Match.Optional(Boolean)
  })));

  options = options || {};

  _initialDataReady = false;

  // Fetch options.
  _pubId = options['id'] || '';
  _tracker = options['tpl'] || Tracker;
  _subscriber = options['tpl'] || Meteor;
  _onReady = options['onReady'] || null;
  _onUpdate = options['onUpdate'] || null;
  _verbose = options['verbose'] || false;
  _serverParameters = options['serverParameters'] || {};
  _initialLimit = options['initialLimit'] || 10;
  _limitIncrement = options['limitIncrement'] || _initialLimit;

  _statsCollName = '__InfiniLoad-Stats-' + collection['_name'] + _pubId;
  _contentCollName = '__InfiniLoad-Content-' + collection['_name'] + _pubId;

  if (_verbose) {
    log('Initializing InfiniLoad for collection', collection['_name']);
    log('statsCollName', _statsCollName);
    log('contentCollName', _contentCollName);
    log('initialLimit', _initialLimit);
    log('limitIncrement', _limitIncrement);
  }

  _Stats = new Mongo.Collection(_statsCollName)

  _serverArgs = new ReactiveVar(_serverParameters);
  _newDocCount = new ReactiveVar(0);
  _totalDocCount = new ReactiveVar(0);
  _latestDocTime = new ReactiveVar(0);
  _lastLoadTime = new ReactiveVar(0);
  _listLoadLimit = new ReactiveVar(_initialLimit);
  _loadOptions = new ReactiveVar(null);

  _computations = {};
  _subscriptions = {};

  // React to: (If used in a computation)
  // - _listLoadLimit
  // - _lastLoadTime
  _UpdateLoadOptions = function () {
    _loadOptions.set({
      'args': _serverArgs.get(),
      'limit': _listLoadLimit.get(),
      'lastLoadTime': _lastLoadTime.get()
    });
  };
  _UpdateLoadOptions_NonReactive = function () {
    Tracker.nonreactive(_UpdateLoadOptions);
  };
  _UpdateLoadOptions_NonReactive();

  // React to: (If used in a computation)
  // - collection
  _GetLoadedDocCount = function () {
    return collection.find({}).count()
  };

  // React to: (If used in a computation)
  // - _totalDocCount
  // - _newDocCount
  // - _listLoadLimit
  _GetToLoadDocCount = function () {
    var listLoadLimit, newDocCount, totalDocCount;
    totalDocCount = _totalDocCount.get();
    newDocCount = _newDocCount.get();
    listLoadLimit = _listLoadLimit.get();
    return totalDocCount - newDocCount - listLoadLimit;
  };

  // React to: (If used in a computation)
  // - _newDocCount
  _GetNewDocCount = function () {
    return _newDocCount.get();
  };

  // React to: (If used in a computation)
  // - _totalDocCount
  _GetTotalDocCount = function () {
    return _totalDocCount.get();
  };

  // React to: (If used in a computation)
  // (Refer to _GetToLoadDocCount)
  _HasMoreDocs = function () {
    return _GetToLoadDocCount() > 0;
  };

  // React to: (If used in a computation)
  // (Refer to _GetNewDocCount)
  _HasNewDocs = function () {
    return _GetNewDocCount() > 0;
  };

  // React to: (If used in a computation)
  // - _listLoadLimit
  _LoadMoreDocs = function (limitIncrement) {
    var listLoadLimit;
    listLoadLimit = _listLoadLimit.get();
    listLoadLimit += limitIncrement || _limitIncrement;
    _listLoadLimit.set(listLoadLimit);
    _UpdateLoadOptions_NonReactive();
  };

  // React to: (If used in a computation)
  // - _latestDocTime
  // - _lastLoadTime
  // - _listLoadLimit
  // - _newDocCount
  _LoadNewDocs = function () {
    var lastLoadTime, latestDocTime, listLoadLimit, newDocCount;
    latestDocTime = _latestDocTime.get();
    lastLoadTime = _lastLoadTime.get();
    listLoadLimit = _listLoadLimit.get();
    newDocCount = _newDocCount.get();
    listLoadLimit += newDocCount;
    _lastLoadTime.set(latestDocTime);
    _listLoadLimit.set(listLoadLimit);
    _UpdateLoadOptions_NonReactive();
  };

  _SetServerParameters = function (value) {
    check(value, Object);
    _serverArgs.set(value);
    _UpdateLoadOptions_NonReactive();
  };

  _onStatsSubscribed = function () {
    if (_verbose) log('Stats subscription ready');
  };

  // Subscribe to the latest stats by last load time.
  // React to:
  // - _serverArgs
  // - _lastLoadTime
  _computations['subscribeStats'] = _tracker.autorun(function (comp) {
    var serverArgs, lastLoadTime, parameters;
    serverArgs = _serverArgs.get();
    lastLoadTime = _lastLoadTime.get();
    parameters = {
      'args': serverArgs,
      'lastLoadTime': lastLoadTime
    };
    if (_verbose) log('Subscribing status', parameters);
    _subscriptions['stats'] = _subscriber.subscribe(_statsCollName, parameters, _onStatsSubscribed);
  });

  // When new stats come in, update the records.
  // React to:
  // - _Stats
  _computations['saveStats'] = _tracker.autorun(function (comp) {
    var stats;
    stats = _Stats.find(0).fetch()[0];
    if (!stats) return;
    //else
    if (_verbose) log('Stats updated', stats);
    _newDocCount.set(stats['newDocCount']);
    _totalDocCount.set(stats['totalDocCount']);
    _latestDocTime.set(stats['latestDocTime']);
  });

  // When the latest document time comes in (for the first time),
  // set the last load time to load documents.
  // React to:
  // - _latestDocTime
  _computations['setLastLoadTime'] = _tracker.autorun(function (comp) {
    var latestDocTime;
    latestDocTime = _latestDocTime.get();
    if (latestDocTime > 0) {
      _lastLoadTime.set(latestDocTime);
      _UpdateLoadOptions_NonReactive();
      comp.stop();
    }
  });

  _onContentSubscribed = function () {
    if (_verbose) {
      log('Data subscription ready');
    }
    if (!_initialDataReady) {
      _initialDataReady = true;
      if (_onReady) {
        _onReady.call(_API, collection);
      }
    } else {
      if (_onUpdate) {
        _onUpdate.call(_API, collection);
      }
    }
  };

  // Subscribe to the content with those load options.
  // React to:
  // - _loadOptions
  _computations['subscribeContent'] = _tracker.autorun(function (comp) {
    var parameters;
    parameters = _loadOptions.get();
    if (_verbose) log('Data subscription parameters', parameters);
    if (parameters['lastLoadTime'] === 0) return;
    //else
    _subscriptions['content'] = _subscriber.subscribe(_contentCollName, parameters, _onContentSubscribed);
  });

  _Stop = function () {
    // Stop all computations.
    for (let comp of _computations) {
      if (!comp.stopped) {
        comp.stop()
      }
    }
    // Stop all subscriptions.
    for (let sub of _subscriptions) {
      sub.stop()
    }
  };

  _API = {
    'find': collection.find.bind(collection),
    'findOne': collection.findOne.bind(collection),
    'count': _GetLoadedDocCount,
    'countMore': _GetToLoadDocCount,
    'countNew': _GetNewDocCount,
    'countTotal': _GetTotalDocCount,
    'hasMore': _HasMoreDocs,
    'hasNew': _HasNewDocs,
    'loadMore': _LoadMoreDocs,
    'loadNew': _LoadNewDocs,
    'setServerParameters': _SetServerParameters
  };

  // Attach a reference to the original collection.
  Object.defineProperty(_API, 'collection', {
    'configurable': false,
    'enumerable': false,
    'value': collection,
    'writable': false
  })

  // If a template instance is not provided, the `stop` method has to be
  // provided so the user can stop all the subscriptions and computations.
  if (!options['tpl']) {
    _API['stop'] = _Stop
  }

  return _API;
};
