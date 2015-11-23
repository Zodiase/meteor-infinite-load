InfiniLoad = function (collection, options) {
  "use strict";

  var _tracker, _subscriber,
      _initialLimit, _limitIncrement,
      _statCollectionName, _contentCollectionName,
      _Stats,
      _newDocumentCount, _totalDocumentCount,
      _latestDocumentTime, _lastLoadTime, _listLoadLimit, _loadOptions,
      _computations, _subscriptions,
      _UpdateLoadOptions, _UpdateLoadOptions_NonReactive,
      _GetOldDocumentCount,
      _GetTotalDocumentCount,
      _GetNewDocumentCount, _HasMoreDocuments, _LoadMoreDocuments,
      _LoadNewDocuments,
      _Stop,
      _API;

  check(collection, Mongo.Collection);
  // Check necessary parameters in options.
  check(options, Match.Optional(Match.ObjectIncluding({
    initialLimit: Match.Optional(Number),
    limitIncrement: Match.Optional(Number),
    tpl: Match.Optional(Blaze.TemplateInstance)
  })));
  if (options == null) {
    options = {};
  }

  _tracker = options.tpl ? options.tpl : Tracker;
  _subscriber = options.tpl ? options.tpl : Meteor;

  _initialLimit = options.initialLimit ? options.initialLimit : 10;
  _limitIncrement = options.limitIncrement ? options.limitIncrement : _initialLimit;

  _statCollectionName = '__InfiniLoad-Stats-' + collection._name;
  _contentCollectionName = '__InfiniLoad-Content-' + collection._name;
  
  _Stats = new Mongo.Collection(_statCollectionName)

  _newDocumentCount = new ReactiveVar(0);
  _totalDocumentCount = new ReactiveVar(0);
  _latestDocumentTime = new ReactiveVar(0);
  _lastLoadTime = new ReactiveVar(0);
  _listLoadLimit = new ReactiveVar(_initialLimit);
  _loadOptions = new ReactiveVar(null);

  _computations = {};
  _subscriptions = {};

  // React to: (If used in a computation)
  // - _listLoadLimit
  // - _lastLoadTime
  _UpdateLoadOptions = function() {
    _loadOptions.set({
      limit: _listLoadLimit.get(),
      lastLoadTime: _lastLoadTime.get()
    });
  };
  _UpdateLoadOptions_NonReactive = function() {
    Tracker.nonreactive(_UpdateLoadOptions);
  };
  _UpdateLoadOptions_NonReactive();
  
  // React to: (If used in a computation)
  // - collection
  _GetOldDocumentCount = function() {
    return collection.find({}).count()
  };
  
  // React to: (If used in a computation)
  // - _totalDocumentCount
  _GetTotalDocumentCount = function() {
    return _totalDocumentCount.get();
  };
  
  // React to: (If used in a computation)
  // - _newDocumentCount
  _GetNewDocumentCount = function() {
    return _newDocumentCount.get();
  };

  // React to: (If used in a computation)
  // - _totalDocumentCount
  // - _newDocumentCount
  // - _listLoadLimit
  _HasMoreDocuments = function() {
    var listLoadLimit, newDocumentCount, totalDocumentCount;
    totalDocumentCount = _totalDocumentCount.get();
    newDocumentCount = _newDocumentCount.get();
    listLoadLimit = _listLoadLimit.get();
    return listLoadLimit < (totalDocumentCount - newDocumentCount);
  };

  // React to: (If used in a computation)
  // - _listLoadLimit
  _LoadMoreDocuments = function(limitIncrement) {
    var listLoadLimit;
    listLoadLimit = _listLoadLimit.get();
    listLoadLimit += limitIncrement ? limitIncrement : _limitIncrement;
    _listLoadLimit.set(listLoadLimit);
    _UpdateLoadOptions_NonReactive();
  };

  // React to: (If used in a computation)
  // - _latestDocumentTime
  // - _lastLoadTime
  // - _listLoadLimit
  // - _newDocumentCount
  _LoadNewDocuments = function() {
    var lastLoadTime, latestDocumentTime, listLoadLimit, newDocumentCount;
    latestDocumentTime = _latestDocumentTime.get();
    lastLoadTime = _lastLoadTime.get();
    listLoadLimit = _listLoadLimit.get();
    newDocumentCount = _newDocumentCount.get();
    listLoadLimit += newDocumentCount;
    _lastLoadTime.set(latestDocumentTime);
    _listLoadLimit.set(listLoadLimit);
    _UpdateLoadOptions_NonReactive();
  };

  // Subscribe to the latest stats by last load time.
  // React to:
  // - _lastLoadTime
  _computations['subscribeStats'] = _tracker.autorun(function(comp) {
    var lastLoadTime, parameters;
    lastLoadTime = _lastLoadTime.get();
    parameters = {
      lastLoadTime: lastLoadTime
    };
    _subscriptions['stats'] = _subscriber.subscribe(_statCollectionName, parameters);
  });

  // When new stats come in, update the records.
  // React to:
  // - _Stats
  _computations['saveStats'] = _tracker.autorun(function(comp) {
    var stats;
    stats = _Stats.find(0).fetch()[0];
    if (!stats) {
      return;
    }
    _newDocumentCount.set(stats.newDocumentCount);
    _totalDocumentCount.set(stats.totalDocumentCount);
    _latestDocumentTime.set(stats.latestDocumentTime);
  });

  // When the latest document time comes in (for the first time),
  // set the last load time to load documents.
  // React to:
  // - _latestDocumentTime
  _computations['setLastLoadTime'] = _tracker.autorun(function(comp) {
    var latestDocumentTime;
    latestDocumentTime = _latestDocumentTime.get();
    if (latestDocumentTime > 0) {
      _lastLoadTime.set(latestDocumentTime);
      _UpdateLoadOptions_NonReactive();
      comp.stop();
    }
  });

  // 
  // React to:
  // - _loadOptions
  _computations['subscribeContent'] = _tracker.autorun(function(comp) {
    var parameters;
    parameters = _loadOptions.get();
    if (parameters.lastLoadTime === 0) {
      return;
    }
    _subscriptions['content'] = _subscriber.subscribe(_contentCollectionName, parameters);
  });

  _Stop = function() {
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
    'count': _GetOldDocumentCount,
    'countNew': _GetNewDocumentCount,
    'hasMore': _HasMoreDocuments,
    'loadMore': _LoadMoreDocuments,
    'loadNew': _LoadNewDocuments,
    'countTotal': _GetTotalDocumentCount
  };

  // If a template instance is not provided, the `stop` method has to be
  // provided so the user can stop all the subscriptions and computations.
  if (!options.tpl) {
    _API['stop'] = _Stop
  }

  return _API;
};
