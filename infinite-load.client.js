const log = function () {
  var args = [
    '<InfiniLoad>'
  ];
  for (let key in arguments) {
    args.push(arguments[key]);
  }
  console.log.apply(console, args);
};

const attachedScopeName = '_infiniLoad';

class InfiniLoadClient {
  constructor(scope) {
    check(scope, InfiniLoadScope);
    this._id = scope.id;
    this.originalCollection = scope.collection;
    this.find = scope.collection.find.bind(scope.collection);
    this.findOne = scope.collection.findOne.bind(scope.collection);
    this.count = scope.getLoadedDocCount.bind(scope);
    this.countMore = scope.getToLoadDocCount.bind(scope);
    this.countNew = scope.getNewDocCount.bind(scope);
    this.countTotal = scope.getTotalDocCount.bind(scope);
    this.hasMore = scope.hasMoreDocs.bind(scope);
    this.hasNew = scope.hasNewDocs.bind(scope);
    this.loadMore = scope.loadMoreDocs.bind(scope);
    this.loadNew = scope.loadNewDocs.bind(scope);
    this.setServerParameters = scope.setServerParameters.bind(scope);
    this.getServerParameters = scope.getServerParameters.bind(scope);
    this.start = scope.start.bind(scope);
    // If a template instance is not provided, the `stop` method has to be
    // provided so the user can stop all the subscriptions and computations.
    this.stop = scope.stop.bind(scope);
    this._started = false;
  }

  get id() {
    return this._id;
  }
}

class InfiniLoadScope {
  constructor(args) {
    this.id = args.id;
    this.collection = args.collection;
    this.statsCollName = args.statsCollName;
    this.contentCollName = args.contentCollName;
    this.statsCollection = new Mongo.Collection(this.statsCollName);
    this.serverArgs = new ReactiveVar(args.serverParameters);
    this.newDocCount = new ReactiveVar(0);
    this.totalDocCount = new ReactiveVar(0);
    this.latestDocTime = new ReactiveVar(0);
    this.lastLoadTime = new ReactiveVar(0);
    this.listLoadLimit = new ReactiveVar(args.initialLimit);
    this.limitIncrement = args.limitIncrement;
    this.onReady = args.onReady;
    this.onUpdate = args.onUpdate;
    this.verbose = args.verbose;
    this.log = args.log;
    this.loadOptions = new ReactiveVar(null);
    this.computations = {};
    this.subscriptions = {};
    this.loadedDocPattern = new ReactiveVar({});
    this.initialDataReady = false;
  }

  // React to: (If used in a computation)
  // - this.loadedDocPattern
  // - this.collection
  getLoadedDocCount () {
    return this.collection.find(this.loadedDocPattern.get()).count()
  }

  // React to: (If used in a computation)
  // - this.totalDocCount
  // - this.newDocCount
  // - this.listLoadLimit
  getToLoadDocCount () {
    let totalDocCount = this.totalDocCount.get(),
        newDocCount = this.newDocCount.get(),
        listLoadLimit = this.listLoadLimit.get();
    return totalDocCount - newDocCount - listLoadLimit;
  }

  // React to: (If used in a computation)
  // - this.newDocCount
  getNewDocCount () {
    return this.newDocCount.get();
  }

  // React to: (If used in a computation)
  // - this.totalDocCount
  getTotalDocCount () {
    return this.totalDocCount.get();
  }

  // React to: (If used in a computation)
  // (Refer to this.getToLoadDocCount)
  hasMoreDocs () {
    return this.getToLoadDocCount() > 0;
  }

  // React to: (If used in a computation)
  // (Refer to this.getNewDocCount)
  hasNewDocs () {
    return this.getNewDocCount() > 0;
  }

  loadMoreDocs (limitIncrement) {
    let listLoadLimit = Tracker.nonreactive(this.listLoadLimit.get.bind(this.listLoadLimit));
    listLoadLimit += limitIncrement || this.limitIncrement;
    this.listLoadLimit.set(listLoadLimit);
    this.updateLoadOptionsNonReactive();
  }

  loadNewDocs () {
    let latestDocTime = Tracker.nonreactive(this.latestDocTime.get.bind(this.latestDocTime)),
        lastLoadTime = Tracker.nonreactive(this.lastLoadTime.get.bind(this.lastLoadTime)),
        listLoadLimit = Tracker.nonreactive(this.listLoadLimit.get.bind(this.listLoadLimit)),
        newDocCount = Tracker.nonreactive(this.newDocCount.get.bind(this.newDocCount));
    listLoadLimit += newDocCount;
    this.lastLoadTime.set(latestDocTime);
    this.listLoadLimit.set(listLoadLimit);
    this.updateLoadOptionsNonReactive();
  }

  setServerParameters (value) {
    check(value, Object);
    this.serverArgs.set(value);
    this.updateLoadOptionsNonReactive();
  }
  getServerParameters () {
    return this.serverArgs.get();
  }

  // React to: (If used in a computation)
  // - this.serverArgs
  // - this.listLoadLimit
  // - this.lastLoadTime
  updateLoadOptions () {
    let newLoadOptions = {
      'args': this.serverArgs.get(),
      'limit': this.listLoadLimit.get(),
      'lastLoadTime': this.lastLoadTime.get()
    };
    this.loadOptions.set(newLoadOptions);
    return newLoadOptions;
  }
  // Non-reactive version of updateLoadOptions.
  updateLoadOptionsNonReactive () {
    return Tracker.nonreactive(this.updateLoadOptions.bind(this));
  }

  _onStatsSubscribed () {
    if (this.verbose) {
      this.log(this.id, 'Stats subscription ready');
    }
  }

  _onContentSubscribed () {
    if (this.verbose) {
      this.log(this.id, 'Data subscription ready');
    }
    if (!this.initialDataReady) {
      this.initialDataReady = true;
      if (this.onReady) {
        this.onReady.call(this.API, this.collection);
      }
    } else {
      if (this.onUpdate) {
        this.onUpdate.call(this.API, this.collection);
      }
    }
  }

  // Subscribe to the latest stats by last load time.
  // React to:
  // - this.serverArgs
  // - this.lastLoadTime
  _subscribeStatsAutorun (comp) {
    let serverArgs = this.serverArgs.get(),
        lastLoadTime = this.lastLoadTime.get(),
        parameters = {
          'args': serverArgs,
          'lastLoadTime': lastLoadTime
        }
        onSubscriptionReady = this._onStatsSubscribed.bind(this);
    if (this.verbose) {
      this.log(this.id, 'Subscribing status', parameters);
    }
    this.subscriptions['stats'] = this._subscribe(this.statsCollName, parameters, onSubscriptionReady);
  }

  // When new stats come in, update the records.
  // React to:
  // - this.statsCollection
  _saveStatsAutorun (comp) {
    let stats = this.statsCollection.find(0).fetch()[0];
    if (!stats) return;
    //else
    if (this.verbose) {
      this.log(this.id, 'Stats updated', stats);
    }
    this.newDocCount.set(stats['newDocCount']);
    this.totalDocCount.set(stats['totalDocCount']);
    this.latestDocTime.set(stats['latestDocTime']);
    this.loadedDocPattern.set(stats['selector']);
  }

  // When the latest document time comes in (for the first time),
  // set the last load time to load documents.
  // React to:
  // - this.latestDocTime
  _setLastLoadTimeAutorun (comp) {
    let latestDocTime = this.latestDocTime.get();
    if (latestDocTime > 0) {
      this.lastLoadTime.set(latestDocTime);
      this.updateLoadOptionsNonReactive();
      comp.stop();
    }
  }

  // Subscribe to the content with those load options.
  // React to:
  // - this.loadOptions
  _subscribeContentAutorun (comp) {
    let parameters = this.loadOptions.get();
    if (this.verbose) {
      this.log(this.id, 'Data subscription parameters', parameters);
    }
    if (parameters['lastLoadTime'] === 0) {
      if (this.verbose) {
        this.log(this.id, 'Stats not ready yet.');
      }
      return;
    }
    //else
    let onSubscriptionReady = this._onContentSubscribed.bind(this);
    this.subscriptions['content'] = this._subscribe(this.contentCollName, parameters, onSubscriptionReady);
  }

  start (template) {
    check(template, Match.Optional(Blaze.TemplateInstance));
    if (this._started) {
      throw new Error('InfiniLoadClient ' + this.id + ' already started.');
    }
    //else
    this._started = true;
    if (template) {
      this._autorun = template.autorun.bind(template);
      this._subscribe = template.subscribe.bind(template);
      template.view.onViewDestroyed(this.stop.bind(this));
    } else {
      this._autorun = Tracker.autorun.bind(Tracker);
      this._subscribe = Meteor.subscribe.bind(Meteor);
    }
    if (this.verbose) {
      this.log(this.id, 'Starting...');
    }
    this.updateLoadOptionsNonReactive();
    this.computations['subscribeStats'] = this._autorun(this._subscribeStatsAutorun.bind(this));
    this.computations['saveStats'] = this._autorun(this._saveStatsAutorun.bind(this));
    this.computations['setLastLoadTime'] = this._autorun(this._setLastLoadTimeAutorun.bind(this));
    this.computations['subscribeContent'] = this._autorun(this._subscribeContentAutorun.bind(this));
  }

  stop () {
    if (!this._started) {
      return;
    }
    //else
    if (this.verbose) {
      this.log(this.id, 'Stopping...');
    }
    // Stop all computations.
    for (let name of Object.getOwnPropertyNames(this.computations)) {
      let comp = this.computations[name];
      if (!comp.stopped) {
        comp.stop();
      }
    }
    // Stop all subscriptions.
    for (let name of Object.getOwnPropertyNames(this.subscriptions)) {
      let sub = this.subscriptions[name];
      // It's OK to call `stop` multiple times.
      sub.stop();
    }
    delete this._autorun;
    delete this._subscribe;
    this.initialDataReady = false;
    this._started = false;
  }

  get API () {
    if (!(this._api instanceof InfiniLoadClient)) {
      this._api = new InfiniLoadClient(this);
    }
    return this._api;
  }
}

InfiniLoad = function (collection, options) {
  "use strict";

  var _id, _pubId,
      _onReady, _onUpdate,
      _verbose,
      _serverParameters,
      _initialLimit, _limitIncrement,
      _statsCollName, _contentCollName,
      _rootScope, _self;

  // Make sure we get a valid collection.
  check(collection, Mongo.Collection);

  // Check necessary parameters in options.
  check(options, Match.Optional(Match.ObjectIncluding({
    'id': Match.Optional(String),
    'serverParameters': Match.Optional(Object),
    'initialLimit': Match.Optional(Number),
    'limitIncrement': Match.Optional(Number),
    'onReady': Match.Optional(Function),
    'onUpdate': Match.Optional(Function),
    'verbose': Match.Optional(Boolean)
  })));

  options = options || {};

  // Fetch options.
  _pubId = options['id'] || 'default';
  _onReady = options['onReady'] || null;
  _onUpdate = options['onUpdate'] || null;
  _verbose = options['verbose'] || false;
  _serverParameters = options['serverParameters'] || {};
  _initialLimit = options['initialLimit'] || 10;
  _limitIncrement = options['limitIncrement'] || _initialLimit;

  _id = collection['_name'] + '__' + _pubId;
  _statsCollName = '__InfiniLoad-Stats-' + _id;
  _contentCollName = '__InfiniLoad-Content-' + _id;

  if (_verbose) {
    log('Initializing InfiniLoad ' + _id, {
      'statsCollName': _statsCollName,
      'contentCollName': _contentCollName,
      'initialLimit': _initialLimit,
      'limitIncrement': _limitIncrement
    });
  }

  if (!Object.hasOwnProperty.call(collection, attachedScopeName)) {
    // Create the new root scope.
    _rootScope = {};
    // Attach the scope we need to the original collection.
    Object.defineProperty(collection, attachedScopeName, {
      'configurable': false,
      'enumerable': false,
      'value': _rootScope,
      'writable': false
    });
  } else {
    // Reuse the root scope.
    _rootScope = collection[attachedScopeName];
    check(_rootScope, Object);
  }

  if (!Object.hasOwnProperty.call(_rootScope, _pubId)) {
    _rootScope[_pubId] = new InfiniLoadScope({
      id: _id,
      collection: collection,
      statsCollName: _statsCollName,
      contentCollName: _contentCollName,
      serverParameters: _serverParameters,
      initialLimit: _initialLimit,
      limitIncrement: _limitIncrement,
      onReady: _onReady,
      onUpdate: _onUpdate,
      verbose: _verbose,
      log: log
    });
  }
  _self = _rootScope[_pubId];
  check(_self, InfiniLoadScope);

  return _self.API;
};
