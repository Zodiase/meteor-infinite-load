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
    'publish' (name) {
      Meteor.publish(name, function () {
        this.ready();
      });
      return name;
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

  Tinytest.addAsync('Basics - Client side methods', function (test, next) {
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

  Tinytest.addAsync('Basics - Client side properties', function (test, next) {
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

  Tinytest.addAsync('APIs - State before starting', function (test, next) {
    const onLibReady = (error, result) => {
      if (error) {
        throw error;
      }
      const id = result;
      const inst = new lib(dataCollection, {
        id,
        verbose: true
      });

      test.equal(inst.find({}).count(), 0);
      test.equal(typeof inst.findOne({}), 'undefined');
      test.equal(inst.count(), 0);
      test.equal(inst.countMore(), 0);
      test.equal(inst.countNew(), 0);
      test.equal(inst.countTotal(), 0);
      test.equal(inst.hasMore(), false);
      test.equal(inst.hasNew(), false);
      next();
    };
    Meteor.call('newlib', {}, onLibReady);
  });

/*
  Tinytest.addAsync('APIs - Dynamic publishing', function (test, next) {
    const name = 'foobar';
    const onPubReady = (error, result) => {
      console.log('onPubReady');
      if (error) {
        throw error;
      }
      const name = result;
      Meteor.subscribe(name, function () {
        console.log('sub ready');
      });
      test.ok();
//       next();
    };
    Meteor.call('publish', name, onPubReady);
    console.log('called');
  });
*/

  Tinytest.addAsync('APIs - Subscribe', function (test, next) {
    const onLibReady = (error, result) => {
      console.log('onLibReady');
      if (error) {
        throw error;
      }
      const id = result;
      const inst = new lib(dataCollection, {
        id,
        verbose: true
      });

      //! Somehow start immediately after instantiation does not work.
      inst.start();
      window.inst = inst;
      test.ok();
//       next();
    };
    Meteor.call('newlib', {}, onLibReady);
    console.log('called');
  });

}
