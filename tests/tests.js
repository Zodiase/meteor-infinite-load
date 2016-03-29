import { Meteor } from 'meteor/meteor';
import { Mongo } from 'meteor/mongo';
import { Tinytest } from "meteor/tinytest";
import { InfiniLoad } from "meteor/zodiase:infinite-load";

// Collection used for testing.
const dataCollection = new Mongo.Collection('test');

// Export to window for debugging in user-agent.
if (Meteor.isClient) window.dataCollection = dataCollection;

// Alias of the library namespace, make name changing easier.
const lib = InfiniLoad;

// A record of existing instances so we don't run into name collisions unintentionally.
const instances = new Map();
// Helper function for generating an ID that does not exist in `instances`.
function newInstanceId () {
  let id = '';
  do {
    id = 'test_' + Math.random();
  } while (instances.has(id));
  return id;
}
// Helper function for checking if an instance exists.
function hasInstance (key) {
  return instances.has(key);
}
// Helper function for saving instances.
function saveInstance (key, instance) {
  if (instances.has(key)) {
    throw new Error('Instance with id "' + key + '" already exists.');
  }
  instances.set(key, instance);
}

// Basic checks.
check(lib, Function);

// Server side resetting for each pass of tests.
if (Meteor.isServer) {
  Tinytest.add('Reset - server', function (test) {
    dataCollection.remove({});
    test.ok();
  });

  Meteor.methods({
    'newlib' (options) {
      check(options, Object);
      options.id = newInstanceId();
      options.verbose = true;
      const infiniServer = new lib(dataCollection, options);
      saveInstance(options.id, infiniServer);
      console.log('new lib ready', options.id);
      return options.id;
    },
    'insert' (doc) {
      check(doc, Object);
      delete doc._id;
      const docId = dataCollection.insert(doc);
      return docId;
    }
  });
}

Tinytest.add('Instantiation - can not call InfiniLoad without new', function (test) {
  test.throws(function () {
    lib(dataCollection);
  });
});

Tinytest.add('Instantiation - instantiation', function (test) {
  const id = newInstanceId();
  const inst = new lib(dataCollection, {
    id,
    verbose: true
  });
  saveInstance(id, inst);

  // Instance should have matching property `.id`.
  test.equal(inst.id, id);

  // Instance property `.id` should be read-only.
  const prevId = inst.id;
  inst.id = prevId + '_';
  test.equal(inst.id, prevId);

  // Instance should have property `.originalCollection`.
  test.isNotUndefined(inst.originalCollection);

  // Instance property `.originalCollection` should match the given one.
  test.equal(inst.originalCollection, dataCollection);
});

Tinytest.add('Instantiation - multiple identical instantiations throw', function (test) {
  const id = newInstanceId();
  const inst = new lib(dataCollection, {
    id,
    verbose: true
  });
  saveInstance(id, inst);

  test.throws(function () {
    const inst = new lib(dataCollection, {
      id,
      verbose: true
    });
  });
});

if (Meteor.isClient) {
  //! For debugging only.
  window.Meteor = Meteor;

  let globalInst = null;

  Tinytest.addAsync('Basics - client side methods', function (test, next) {
    const onLibReady = (error, result) => {
      if (error) {
        throw error;
      }
      const id = result;
      const inst = new lib(dataCollection, {
        id,
        verbose: true
      });

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
      next();
    };
    Meteor.call('newlib', {}, onLibReady);
  });

  Tinytest.addAsync('Basics - client side properties', function (test, next) {
    const onLibReady = (error, result) => {
      if (error) {
        throw error;
      }
      const id = result;
      const inst = new lib(dataCollection, {
        id,
        verbose: true
      });

      const properties = {
        'originalCollection': Mongo.Collection,
        'id': String,
        'collectionName': String,
        'rawCollection': Mongo.Collection
      };
      for (let key of Object.keys(properties)) {
        test.equal(Match.test(inst[key], properties[key]), true);
      }
      next();
    };
    Meteor.call('newlib', {}, onLibReady);
  });

  Tinytest.addAsync('APIs - initialize', function (test, next) {
    const onLibReady = (error, result) => {
      if (error) {
        throw error;
      }
      const id = result;
      globalInst = new lib(dataCollection, {
        id,
        verbose: true
      });

      //!
      window.inst = globalInst;

      test.ok();
      next();
    };
    Meteor.call('newlib', {}, onLibReady);
  });

  Tinytest.add('APIs - state before starting', function (test) {
    const inst = globalInst;

    test.equal(inst.find({}).count(), 0);
    test.equal(typeof inst.findOne({}), 'undefined');
    test.equal(inst.count(), 0);
    test.equal(inst.countMore(), 0);
    test.equal(inst.countNew(), 0);
    test.equal(inst.countTotal(), 0);
    test.equal(inst.hasMore(), false);
    test.equal(inst.hasNew(), false);
  });

  Tinytest.addAsync('APIs - subscribe', function (test, next) {
    const inst = globalInst;
    inst.start().ready(() => {
//       inst.stop();
      test.ok();
//       next();
    });
  });

}
