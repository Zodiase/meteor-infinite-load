// Collection used for testing.
const dataCollection = new Mongo.Collection('test');

// Export to window for debugging in user-agent.
if (Meteor.isClient) window.dataCollection = dataCollection;

// Alias of the library namespace, make name changing easier.
const lib = InfiniLoad;

// Server side resetting for each pass of tests.
if (Meteor.isServer) {
  Tinytest.add('Reset all on test start', function (test) {
    dataCollection.remove({});
    test.ok();
  });
}

Tinytest.add('Basics - Export', function (test) {
  // Is defined.
  test.isNotUndefined(lib);

  // Is a class.
  test.equal(typeof lib, 'function');
});

Tinytest.add('Basics - Instantiation', function (test) {
  const inst = new InfiniLoad(dataCollection);

  // Instance should have property `.id`.
  test.isNotUndefined(inst.id);

  // Instance property `.id` should be read-only.
  const prevId = inst.id;
  inst.id = prevId + '_';
  test.equal(inst.id, prevId);

  // Instance should have property `.originalCollection`.
  test.isNotUndefined(inst.originalCollection);

  // Instance property `.originalCollection` should match the given one.
  test.equal(inst.originalCollection, dataCollection);
});

Tinytest.add('Basics - Instantiation with ID', function (test) {
  const id = 'id';
  const inst = new InfiniLoad(dataCollection, {
    id: id
  });

  // Instance property `.id` should match the given one.
  test.equal(inst.id, id);
});

Tinytest.add('Basics - Multiple Identical Instantiations', function (test) {
  const inst1 = new InfiniLoad(dataCollection);
  const inst2 = new InfiniLoad(dataCollection);
  const inst3 = new InfiniLoad(dataCollection);
  test.ok();
});

if (Meteor.isClient) {
  Tinytest.add('Basics - Client side methods', function (test) {
    const inst = new InfiniLoad(dataCollection);
    const methodNames = [
      'find',
      'findOne',
      'count',
      'countMore',
      'countNew',
      'countTotal',
      'hasMore',
      'hasNew',
      'loadMore',
      'loadNew',
      'setServerParameters',
      'getServerParameters',
      'on',
      'off',
      'start',
      'stop'
    ];
    for (let key of methodNames) {
      test.equal(typeof inst[key], 'function');
    }
  });

  Tinytest.add('State before starting', function (test) {
    const inst = new InfiniLoad(dataCollection);
    test.equal(inst.find({}).count(), 0);
    test.equal(inst.count(), 0);
    test.equal(inst.countMore(), 0);
    test.equal(inst.countNew(), 0);
    test.equal(inst.countTotal(), 0);
    test.equal(inst.hasMore(), false);
    test.equal(inst.hasNew(), false);
  });
}
