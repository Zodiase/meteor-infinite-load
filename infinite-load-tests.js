const dataCollection = new Mongo.Collection('test');
const customInitialLimit = 13;
const customLimitIncrement = 17;

// Place to store runtime data.
let testData = {};

if (Meteor.isServer) {
  Meteor.methods({
    'server_args/verify': function (realData) {
      return _.isEqual(realData, testData['server_args']);
    },
    'data_link/prepare': function (count) {
      for (let i = 0; i < count; ++i) {
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

  Tinytest.addAsync('Test data link - preparation', function (test, next) {
    testData.initialLimit = Math.ceil(Math.random() * 30);
    testData.limitIncrement = Math.ceil(Math.random() * 30);
    // Make sure to load more at least 10 times.
    testData.expectedTotal = testData.initialLimit + testData.limitIncrement * 10;

    Meteor.call('data_link/prepare', testData.expectedTotal, function (test, next, error, result) {
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
    let expectedCount = testData.initialLimit;
    const onReadyOrUpdate = function (collection) {
      test.equal(this.count(), expectedCount);
      test.equal(this.countNew(), 0);
      test.equal(this.countTotal(), testData.expectedTotal);
      test.equal(this.countMore(), testData.expectedTotal - expectedCount);
      if (testData.expectedTotal - expectedCount > 0) {
        expectedCount = Math.min(expectedCount + testData.limitIncrement, testData.expectedTotal);
        this.loadMore();
      } else {
        next();
      }
    };
    const infini = InfiniLoad(dataCollection, {
      id: 'data_link',
      initialLimit: testData.initialLimit,
      limitIncrement: testData.limitIncrement,
      onReady: onReadyOrUpdate,
      onUpdate: onReadyOrUpdate,
      verbose: true
    });
    testData['data_link'] = infini;
    infini.start();
  });
}
