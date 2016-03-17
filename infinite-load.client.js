const log = function () {
  var args = [
    '<InfiniLoad>'
  ];
  for (let key in arguments) {
    args.push(arguments[key]);
  }
  console.log.apply(console, args);
};

// The property name used to attach InfiniLoadScope instances to the collection.
const attachedScopeName = '_infiniLoad';

/**
 * Interface for operating a `InfiniLoadScope` instance.
 * @borrows InfiniLoadScope#getLoadedDocCount as #count
 * @borrows InfiniLoadScope#getToLoadDocCount as #countMore
 * @borrows InfiniLoadScope#getNewDocCount as #countNew
 * @borrows InfiniLoadScope#getTotalDocCount as #countTotal
 * @borrows InfiniLoadScope#hasMoreDocs as #hasMore
 * @borrows InfiniLoadScope#hasNewDocs as #hasNew
 * @borrows InfiniLoadScope#loadMoreDocs as #loadMore
 * @borrows InfiniLoadScope#loadNewDocs as #loadNew
 * @borrows InfiniLoadScope#setServerParameters as #setServerParameters
 * @borrows InfiniLoadScope#getServerParameters as #getServerParameters
 * @borrows InfiniLoadScope#start as #start
 * @borrows InfiniLoadScope#stop as #stop
 */
class InfiniLoadClient {
  constructor(scope) {
    check(scope, InfiniLoadScope);
    /**
     * The id of the instance.
     * @private
     * @prop {String}
     */
    this._id = scope.id;
    /**
     * The collection wrapped in.
     * @prop {Mongo.Collection}
     */
    this.originalCollection = scope.collection;
    /**
     * Shortcut to `.find` on the wrapped collection.
     * @see {@link http://docs.meteor.com/#/full/find}
     * @method
     */
    this.find = scope.collection.find.bind(scope.collection);
    /**
     * Shortcut to `.findOne` on the wrapped collection.
     * @see {@link http://docs.meteor.com/#/full/findone}
     * @method
     */
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

    this.on = scope.on.bind(scope);
    this.off = scope.off.bind(scope);

    this.start = scope.start.bind(scope);
    // If a template instance is not provided, the `stop` method has to be
    // provided so the user can stop all the subscriptions and computations.
    this.stop = scope.stop.bind(scope);
    this._started = false;
  }

  /**
   * Returns the id of the instance.
   * @readonly
   * @returns {String}
   */
  get id() {
    return this._id;
  }
}

/**
 * Internal class that does all the magic.
 * @private
 */
class InfiniLoadScope {
  /**
   * Creates a new InfiniLoadScope instance.
   * @param {Object} args
   * @param {String} args.id
   * @param {Mongo.Collection} args.collection
   * @param {String} args.statsCollName
   * @param {String} args.contentCollName
   * @param {Object} args.serverParameters
   * @param {Integer} args.initialLimit
   * @param {Integer} args.limitIncrement
   * @param {Function} args.onReady
   * @param {Function} args.onUpdate
   * @param {Boolean} args.verbose
   * @param {Function} args.log
   */
  constructor(args) {
    this.id = args.id;
    this.collection = args.collection;
    this.statsCollName = args.statsCollName;
    this.contentCollName = args.contentCollName;
    this.statsCollection = new Mongo.Collection(this.statsCollName);
    this.serverArgs = new ReactiveVar(args.serverParameters);
    this.localStats = new ReactiveVar({
      listLoadLimit: args.initialLimit
    });
    this.lastLoadTime = 0;
    this.limitIncrement = args.limitIncrement;
    this.eventHandlers = {};
    this.supportedEvents = [
      'ready',
      'update'
    ];
    for (let eventName of this.supportedEvents) {
      this.eventHandlers[eventName] = [];
    }
    if (typeof args.onReady === 'function') {
      this.eventHandlers.ready.push(args.onReady);
    }
    if (typeof args.onUpdate === 'function') {
      this.eventHandlers.update.push(args.onUpdate);
    }
    this.verbose = args.verbose;
    this.log = args.log;
    this.statsSubscribeParameters = new ReactiveVar(null);
    this.contentSubscribeParameters = new ReactiveVar(null);
    this.computations = {};
    this.subscriptions = {};
    this.initialDataReady = false;
  }

  /**
   * Attach an event handler function for one or more events.
   * @param {String} events
   * @param {Function} handler
   * @returns {InfiniLoadClient}
   */
  on (events, handler) {
    check(events, String);
    check(handler, Function);

    let eventsAry = events.split(' ')
                          .filter((x) => x.length > 0 &&
                                  this.supportedEvents.indexOf(x) > -1);
    for (let eventName of eventsAry) {
      this.eventHandlers[eventName].push(handler);
    }
    return this.API;
  }

  /**
   * Remove an event handler.
   * @param {String} events
   * @param {Function} handler
   * @returns {InfiniLoadClient}
   */
  off (events, handler) {
    check(events, Match.Optional(String));
    check(handler, Match.Optional(Function));

    let eventsAry;

    if (typeof events === 'undefined') {
      // Remove all handlers.
      eventsAry = this.supportedEvents;
    } else {
      // Remove handlers of events.
      eventsAry = events.split(' ')
                        .filter((x) => x.length > 0 &&
                                this.supportedEvents.indexOf(x) > -1);
    }
    eventsAry.forEach((x) => {
      if (typeof handler === 'undefined') {
        this.eventHandlers[x] = [];
      } else {
        let handlerIndex = this.eventHandlers[x].indexOf(handler);
        if (handlerIndex > -1) {
          this.eventHandlers[x].splice(handlerIndex, 1);
        }
      }
    });
    return this.API;
  }

  /**
   * Get the number of documents loaded.
   * @returns {Integer}
   */
  getLoadedDocCount () {
    let localStats = this.localStats.get();
    return this.collection.find(localStats.selector || {}).count();
  }

  /**
   * Get the number of documents not yet loaded.
   * This does not include any new documents.
   * @returns {Integer}
   */
  getToLoadDocCount () {
    let localStats = this.localStats.get(),
        totalDocCount = localStats.totalDocCount || 0,
        newDocCount = localStats.newDocCount || 0,
        listLoadLimit = localStats.listLoadLimit;
    return Math.max(totalDocCount - newDocCount - listLoadLimit, 0);
  }

  /**
   * Get the number of new documents not yet loaded.
   * @returns {Integer}
   */
  getNewDocCount () {
    let localStats = this.localStats.get();
    return localStats.newDocCount || 0;
  }

  /**
   * Get the number of all documents.
   * @returns {Integer}
   */
  getTotalDocCount () {
    let localStats = this.localStats.get();
    return localStats.totalDocCount || 0;
  }

  /**
   * Checks if there are any old documents to load.
   * @returns {Boolean}
   */
  hasMoreDocs () {
    return this.getToLoadDocCount() > 0;
  }

  /**
   * Checks if there are any new documents to load.
   * @returns {Boolean}
   */
  hasNewDocs () {
    return this.getNewDocCount() > 0;
  }

  /**
   * Load more old documents from server.
   * @param {Integer} [limitIncrement] Override the limitIncrement set for the InfiniLoadScope instance.
   */
  loadMoreDocs (limitIncrement) {
    let localStats = Tracker.nonreactive(this.localStats.get.bind(this.localStats));
    localStats.listLoadLimit += limitIncrement || this.limitIncrement;
    this.localStats.set(localStats);
    this.updateLoadOptionsNonReactive();
  }

  /**
   * Load all new documents from server.
   */
  loadNewDocs () {
    let localStats = Tracker.nonreactive(this.localStats.get.bind(this.localStats)),
        latestDocTime = localStats.latestDocTime || 0,
        newDocCount = localStats.newDocCount || 0;
    localStats.listLoadLimit += newDocCount;
    this.lastLoadTime = latestDocTime;
    this.localStats.set(localStats);
    this.updateLoadOptionsNonReactive();
  }

  /**
   * Set the parameters sent to server. Triggers `onReady` or `onUpdate` when effective.
   * @param {Object} value
   */
  setServerParameters (value) {
    check(value, Object);
    this.serverArgs.set(value);
    this.updateLoadOptionsNonReactive();
  }

  /**
   * Get the parameters sent to server.
   * @returns {Object}
   */
  getServerParameters () {
    return this.serverArgs.get();
  }

  /**
   * Update the load options object from related reactive sources.
   * This is done to combine multiple reactive callbacks into one.
   * @returns {Object}
   */
  updateLoadOptions () {
    let localStats = this.localStats.get();
    this.statsSubscribeParameters.set({
      'args': this.serverArgs.get(),
      'lastLoadTime': this.lastLoadTime
    });
    this.contentSubscribeParameters.set({
      'args': this.serverArgs.get(),
      'limit': localStats.listLoadLimit,
      'lastLoadTime': this.lastLoadTime
    });
  }

  /**
   * Non-reactive version of updateLoadOptions.
   * @returns {Object}
   */
  updateLoadOptionsNonReactive () {
    return Tracker.nonreactive(this.updateLoadOptions.bind(this));
  }

  /**
   * Helper function for calling event handlers.
   * @private
   */
  _callEventHandlers (eventName, context, args) {
    check(eventName, String);
    check(args, Array);
    if (this.supportedEvents.indexOf(eventName) === -1) {
      return;
    }
    //else
    for (let handler of this.eventHandlers[eventName]) {
      handler.apply(context, args);
    }
  }

  /**
   * Callback when stats are pulled from the server.
   * Not functional at this time.
   * @private
   */
  _onStatsSubscribed () {
    if (this.verbose) {
      this.log(this.id, 'Stats subscription ready', this.statsCollection.find(0).fetch()[0]);
    }
  }

  /**
   * Callback when content are pulled from the server.
   * If it's the first time, calls `onReady` callback. Otherwise calls `onUpdate`.
   * @private
   */
  _onContentSubscribed () {
    if (this.verbose) {
      this.log(this.id, 'Data subscription ready', this.initialDataReady);
    }
    if (!this.initialDataReady) {
      this.initialDataReady = true;
      this._callEventHandlers('ready', this.API, [this.collection]);
    } else {
      this._callEventHandlers('update', this.API, [this.collection]);
    }
  }

  /**
   * Autorun for pulling stats from the server.
   * @param {Tracker.Computation} comp
   * @private
   */
  _subscribeStatsAutorun (comp) {
    let parameters = this.statsSubscribeParameters.get(),
        onSubscriptionReady = this._onStatsSubscribed.bind(this);
    if (this.verbose) {
      this.log(this.id, 'Subscribing status', parameters);
    }
    this.subscriptions['stats'] = this._subscribe(this.statsCollName, parameters, onSubscriptionReady);
  }

  /**
   * Autorun for saving stats from the server into reactive vars.
   * @param {Tracker.Computation} comp
   * @private
   */
  _saveStatsAutorun (comp) {
    let serverStats = this.statsCollection.find(0).fetch()[0];
    if (!serverStats) return;
    //else
    if (this.verbose) {
      this.log(this.id, 'Stats updated', serverStats);
    }
    let localStats = Tracker.nonreactive(this.localStats.get.bind(this.localStats));
    for (let propName of ['newDocCount', 'totalDocCount', 'latestDocTime', 'selector']) {
      localStats[propName] = serverStats[propName];
    }
    this.localStats.set(localStats);
  }

  /**
   * When the latest document time comes in (for the first time), set the last load time to load documents.
   * @param {Tracker.Computation} comp
   * @private
   */
  _setLastLoadTimeAutorun (comp) {
    let localStats = this.localStats.get(),
        latestDocTime = localStats.latestDocTime || 0;
    if (latestDocTime > 0) {
      this.lastLoadTime = latestDocTime;
      this.updateLoadOptionsNonReactive();
      comp.stop();
    }
  }

  /**
   * When the load options are changed, subscribe content with the new options.
   * @param {Tracker.Computation} comp
   * @private
   */
  _subscribeContentAutorun (comp) {
    let parameters = this.contentSubscribeParameters.get();
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

  /**
   * Start all the automations. If a template instance is provided, all the automations will be attached to it so they will be terminated automatically.
   * @param {Blaze.TemplateInstance} [template]
   */
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
    if (this.verbose) {
      this.log(this.id, 'Started');
    }
  }

  /**
   * Stop all the automations.
   */
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
    if (this.verbose) {
      this.log(this.id, 'Stopped');
    }
  }

  /**
   * Returns an `InfiniLoadClient` instance which is the public APIs for this.
   * @readonly
   * @returns {InfiniLoadClient}
   */
  get API () {
    if (!(this._api instanceof InfiniLoadClient)) {
      this._api = new InfiniLoadClient(this);
    }
    return this._api;
  }
}

/**
 * Creates a `InfiniLoadClient` instance for the collection with the given options.
 * @global
 * @function
 * @param {Mongo.Collection} collection
 * @param {Object} [options={}]
 * @param {String} [options.id="default"]
 * @param {Object} [options.serverParameters={}]
 * @param {Integer} [options.initialLimit=10]
 * @param {Integer} [options.limitIncrement=10]
 * @param {Function} [options.onReady=null]
 * @param {Function} [options.onUpdate=null]
 * @param {Boolean} [options.verbose=false]
 * @returns {InfiniLoadClient}
 */
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
