const dataCollection = new Mongo.Collection('test');
const customInitialLimit = 13;
const customLimitIncrement = 17;

if (Meteor.isServer) {
  let testData = {};
  Meteor.methods({
    'server_args/verify': function (realData) {
      return _.isEqual(realData, testData['server_args']);
    }
  });

  Tinytest.add('Reset all on test start', function (test) {
    testData = {};
    dataCollection.remove({});
    test.ok();
  });

  Tinytest.add('Server side instantiation', function (test) {
    InfiniLoad(dataCollection, {
      verbose: true
    });
    test.ok();
  });

  Tinytest.add('Prepare connection test', function (test) {
    InfiniLoad(dataCollection, {
      id: 'connection',
      verbose: true
    });
    test.ok();
  });

  Tinytest.add('Prepare server args test', function (test) {
    InfiniLoad(dataCollection, {
      id: 'server_args',
      selector: function (userId, args) {
        testData['server_args'] = args;
        return {};
      },
      verbose: true
    });
    test.ok();
  });
}

if (Meteor.isClient) {
  window.data = dataCollection;
  Tinytest.add('Client side instantiation', function (test) {
    const infini = InfiniLoad(dataCollection, {
      verbose: true
    });
    test.ok();
  });

  Tinytest.add('Client side properties', function (test) {
    const infini = InfiniLoad(dataCollection, {
      verbose: true
    });
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
    const infini1 = InfiniLoad(dataCollection, {
      verbose: true
    });
    const infini2 = InfiniLoad(dataCollection, {
      verbose: true
    });
    test.equal(infini1, infini2);
  });

  Tinytest.add('State before start', function (test) {
    const infini = InfiniLoad(dataCollection, {
      verbose: true
    });
    test.equal(infini.find().count(), 0);
    test.equal(infini.count(), 0);
    test.equal(infini.countMore(), 0);
    test.equal(infini.countNew(), 0);
    test.equal(infini.countTotal(), 0);
    test.equal(infini.hasMore(), false);
    test.equal(infini.hasNew(), false);
  });

  Tinytest.addAsync('Test connection', function (test, next) {
    const infini = InfiniLoad(dataCollection, {
      id: 'connection',
      onReady: function (collection) {
        test.equal(collection, dataCollection);
        this.stop();
        next();
      },
      verbose: true
    });
    infini.start();
  });

  Tinytest.addAsync('Test server args', function (test, next) {
    let serverArgs = {
      secret: Math.random()
    };
    let moreSecrets = [
      Math.random(),
      Math.random()
    ];
    const onReadyOrUpdate = function (collection) {
      Meteor.call('server_args/verify', serverArgs, function (test, next, error, result) {
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
      onUpdate: onReadyOrUpdate,
      verbose: true
    });
    test.equal(infini.getServerParameters(), serverArgs);
    infini.start();
  });
}
