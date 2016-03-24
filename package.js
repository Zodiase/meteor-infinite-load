Package.describe({
  name: 'zodiase:infinite-load',
  version: '0.2.0',
  // Brief, one-line summary of the package.
  summary: 'A helper library for loading items from a collection incrementally.',
  // URL to the Git repository containing the source code for this package.
  git: 'https://github.com/Zodiase/meteor-infinite-load.git',
  // By default, Meteor will default to using README.md for documentation.
  // To avoid submitting documentation, set this field to null.
  documentation: 'README.md'
});

Package.onUse(function(api) {
  api.versionsFrom('1.2.1');
  api.use([
    'ecmascript',
    'underscore',
    'mongo',
    'zodiase:check',
    'blaze-html-templates',
    'tracker',
    'reactive-var'
  ]);
  api.addFiles('src/setup.js', ['client', 'server']);
  api.addFiles('src/base.js', ['client', 'server']);
  api.addFiles('src/client/lib.js', 'client');
  api.addFiles('src/server/lib.js', 'server');
  api.addFiles('src/export.js', ['client', 'server']);
  api.export('InfiniLoad');
});

Package.onTest(function(api) {
  api.use([
    'ecmascript',
    'tinytest',
    'underscore',
    'tracker',
    'check',
    'mongo'
  ]);
  api.use('zodiase:infinite-load');
  api.addFiles('tests/tests.js');
});
