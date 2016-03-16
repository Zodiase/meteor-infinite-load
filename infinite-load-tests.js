const dataCollection = new Mongo.Collection('test');
const customInitialLimit = 13;
const customLimitIncrement = 17;

// Place to store runtime data.
let testData = {};

if (Meteor.isServer) {
  Meteor.methods({
    'server_args/verify': (realData) => _.isEqual(realData, testData['server_args']),
    'data_link/insert': (count) => {
      for (let i = 0; i < Number(count); ++i) {
        dataCollection.insert({
          createTime: Date.now()
        });
      }
      return dataCollection.find({}).count();
    }
  });

  Tinytest.add('Reset all on test start', function (test) {
    testData = {};
    dataCollection.remove({});
    test.ok();
  });

  Tinytest.add('Server side instantiation', function (test) {
    InfiniLoad(dataCollection);
    test.ok();
  });

  Tinytest.add('Test connection - preparation', function (test) {
    InfiniLoad(dataCollection, {
      id: 'connection'
    });
    test.ok();
  });

  Tinytest.add('Test server args - preparation', function (test) {
    InfiniLoad(dataCollection, {
      id: 'server_args',
      selector: function (userId, args) {
        testData['server_args'] = args;
        return {};
      }
    });
    test.ok();
  });

  Tinytest.add('Test event registration - preparation', function (test) {
    InfiniLoad(dataCollection, {
      id: 'events'
    });
    test.ok();
  });

  Tinytest.add('Test data link - preparation', function (test) {
    InfiniLoad(dataCollection, {
      id: 'data_link',
      verbose: true
    });
    test.ok();
  });
}

if (Meteor.isClient) {
  window.data = testData;
  testData.collection = dataCollection;

  Tinytest.add('Client side instantiation', function (test) {
    const infini = InfiniLoad(dataCollection);
    test.ok();
  });

  Tinytest.add('Client side properties', function (test) {
    const infini = InfiniLoad(dataCollection);
    const propTypes = {
      _id: String,
      originalCollection: Mongo.Collection,
      find: Function,
      findOne: Function,
      count: Function,
      countMore: Function,
      countNew: Function,
      countTotal: Function,
      hasMore: Function,
      hasNew: Function,
      loadMore: Function,
      loadNew: Function,
      setServerParameters: Function,
      getServerParameters: Function,
      on: Function,
      off: Function,
      start: Function,
      stop: Function
    };
    for (let key of Object.keys(propTypes)) {
      check(infini[key], propTypes[key]);
    }
    test.ok();

    test.equal(infini.originalCollection, dataCollection);
  });

  Tinytest.add('Instances are cached and reused', function (test) {
    const infini1 = InfiniLoad(dataCollection);
    const infini2 = InfiniLoad(dataCollection);
    test.equal(infini1, infini2);
  });

  Tinytest.add('State before start', function (test) {
    const infini = InfiniLoad(dataCollection);
    test.equal(infini.find({}).count(), 0);
    test.equal(infini.count(), 0);
    test.equal(infini.countMore(), 0);
    test.equal(infini.countNew(), 0);
    test.equal(infini.countTotal(), 0);
    test.equal(infini.hasMore(), false);
    test.equal(infini.hasNew(), false);
  });

  Tinytest.addAsync('Test connection - connect', function (test, next) {
    const infini = InfiniLoad(dataCollection, {
      id: 'connection',
      onReady: function (collection) {
        test.equal(collection, dataCollection);
        this.stop();
        next();
      }
    });
    infini.start();
  });

  Tinytest.addAsync('Test server args - verify', function (test, next) {
    let serverArgs = {
      secret: Math.random()
    };
    let moreSecrets = [
      Math.random(),
      Math.random()
    ];
    const onReadyOrUpdate = function (collection) {
      Meteor.call('server_args/verify', serverArgs, function (test, next, error, result) {
        if (error) throw error;

        test.equal(typeof error, 'undefined');
        test.equal(result, true);

        if (moreSecrets.length > 0) {
          serverArgs.secret = moreSecrets.shift();
          this.setServerParameters(serverArgs);
        } else {
          this.stop();
          next();
        }
      }.bind(this, test, next));
    };
    const infini = InfiniLoad(dataCollection, {
      id: 'server_args',
      serverParameters: serverArgs,
      onReady: onReadyOrUpdate,
      onUpdate: onReadyOrUpdate
    });
    test.equal(infini.getServerParameters(), serverArgs);
    infini.start();
  });

  Tinytest.addAsync('Test event registration - onReady/offReady', function (test, next) {
    const infini = InfiniLoad(dataCollection, {
      id: 'events'
    });
    infini.off();
    const wrongCallback = function (collection) {
      throw new Error('This callback should not be called.');
    };
    infini.on('ready', wrongCallback);
    infini.off('ready', wrongCallback);
    const readyCallback = function (collection) {
      test.ok();
      this.off('ready', readyCallback);
      this.stop();
      next();
    };
    infini.on('ready', readyCallback);
    infini.start();
  });

  Tinytest.addAsync('Test event registration - onUpdate/offUpdate', function (test, next) {
    const infini = InfiniLoad(dataCollection, {
      id: 'events'
    });
    infini.off();
    infini.setServerParameters({});
    const wrongCallback = function (collection) {
      throw new Error('This callback should not be called.');
    };
    infini.on('update', wrongCallback);
    infini.off('update', wrongCallback);
    const readyCallback = function (collection) {
      this.off('ready', readyCallback);
      // This would trigger onUpdate.
      this.setServerParameters({
        foo: 'bar'
      });
    };
    const updateCallback = function (collection) {
      test.ok();
      this.off('update', updateCallback);
      this.stop();
      next();
    };
    infini.on('ready', readyCallback);
    infini.on('update', updateCallback);
    infini.start();
  });

  Tinytest.addAsync('Test data link - preparation', function (test, next) {
    testData.initialLimit = Math.ceil(Math.random() * 30);
    testData.limitIncrement = Math.ceil(Math.random() * 30);
    testData.expectedCount = testData.initialLimit;
    // Make sure to load more at least 10 times.
    testData.expectedTotal = testData.initialLimit + testData.limitIncrement * 10;

    const infini = InfiniLoad(dataCollection, {
      id: 'data_link',
      initialLimit: testData.initialLimit,
      limitIncrement: testData.limitIncrement,
      verbose: true
    });
    testData['data_link'] = infini;

    Meteor.call('data_link/insert', testData.expectedTotal, function (test, next, error, result) {
      if (error) throw error;

      test.equal(typeof error, 'undefined');
      test.equal(typeof result, 'number');

      // Server might already have some data, in that case, result would be greater than the expected value.
      if (result < expectedTotal) {
        throw new RangeError('Server did not create expected amount of data');
      }
      // Update expectedTotal.
      expectedTotal = result;
      next();
    }.bind(null, test, next));
  });

  Tinytest.addAsync('Test data link - count old and load more', function (test, next) {
    const infini = testData['data_link'];
    infini.off();
    infini.on('ready update', function (collection) {
      test.equal(this.count(), testData.expectedCount);
      test.equal(this.hasNew(), false);
      test.equal(this.countNew(), 0);
      test.equal(this.countTotal(), testData.expectedTotal);
      test.equal(this.hasMore(), testData.expectedTotal > testData.expectedCount);
      test.equal(this.countMore(), testData.expectedTotal - testData.expectedCount);
      if (testData.expectedTotal - testData.expectedCount > 0) {
        testData.expectedCount = Math.min(testData.expectedCount + testData.limitIncrement, testData.expectedTotal);
        console.warn('loadMore');
        this.loadMore();
      } else {
        this.off();
        this.stop();
        next();
      }
    });
    infini.start();
  });

  Tinytest.addAsync('Test data link - count new and load new', function (test, next) {
    const infini = testData['data_link'];
    infini.off();
    let expectedNew = Math.ceil(Math.random() * 30);
    console.info('new', expectedNew);
    let count, total;
    infini.on('ready', function (collection) {
      count = this.count();
      total = this.countTotal() + expectedNew;
      Meteor.call('data_link/insert', expectedNew, function (test, next, error, result) {
        if (error) throw error;

        test.equal(typeof error, 'undefined');
        test.equal(typeof result, 'number');

        test.equal(result, total);

        Tracker.autorun((comp) => {
          if (this.countNew() === expectedNew) {
            comp.stop();
            console.warn('loadNew', {
              count: this.count(),
              new: this.countNew()
            });
            this.loadNew();
          }
        });
      }.bind(this, test, next));
      this.off('ready');
    });
    infini.on('update', function (collection) {
      console.info('update', {
        count: this.count(),
        new: this.countNew()
      });
/*
      test.equal(this.count(), count);
      test.equal(this.hasNew(), expectedNew > 0);
      test.equal(this.countNew(), expectedNew);
      test.equal(this.countTotal(), total);
      test.equal(this.hasMore(), total > count);
      test.equal(this.countMore(), total - expectedNew - count);
      if (expectedNew > 0) {
        count += expectedNew;
        expectedNew = 0;
        this.loadNew();
      } else {
        this.off();
        this.stop();
        next();
      }
*/
    });
    infini.start();
  });
}
