const dataCollection = new Mongo.Collection('test');

if (Meteor.isServer) {
  Tinytest.add('Server side instantiation', function (test) {
    InfiniLoad(dataCollection);
    test.ok();
  });
}

if (Meteor.isClient) {
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

  Tinytest.add('Empty on start', function (test) {
    const infini = InfiniLoad(dataCollection);
    test.equal(infini.find().count(), 0);
  });
}
