const dataCollection = new Mongo.Collection('test');

if (Meteor.isServer) {
  Tinytest.add('Server side instantiation', function (test) {
    InfiniLoad(dataCollection, {
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
    window.infini = infini;
    test.equal(infini.find().count(), 0);
    test.equal(infini.count(), 0);
    test.equal(infini.countMore(), 0);
    test.equal(infini.countNew(), 0);
    test.equal(infini.countTotal(), 0);
    test.equal(infini.hasMore(), false);
    test.equal(infini.hasNew(), false);
  });
}
