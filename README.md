Infinite Load for Meteor
========================
A helper library for loading items from a collection incrementally and also know how many new items are available to be pulled.

Get Started
------------------------
### Add the package:

```Bash
$ meteor add zodiase:infinite-load
```

### Server side setup:
```JavaScript
import { InfiniLoad } from "meteor/zodiase:infinite-load";
import { someCollection } from "./collections.js";

InfiniLoad(someCollection);
```

### Client side setup:
```JavaScript
import { Template } from 'meteor/templating'
import { InfiniLoad } from "meteor/zodiase:infinite-load";
import { someCollection } from "./collections.js";

let infiniSomeData = InfiniLoad(someCollection);

Template.body.helpers({
  'dataReady' () {
    // `.started` is an reactive data source. When it returns `true`, it is safe to access data.
    return infiniSomeData.started;
  },
  'docItems' () {
    if (!infiniSomeData.started) {
      return [];
    } else {
      // Use `.find` as you would on a `Mongo.Collection`.
      return infiniSomeData.find().fetch();
    }
  },
  'moreItemsCount' () {
    return infiniSomeData.countMore();
  },
  'newItemsCount' () {
    return infiniSomeData.countNew();
  }
});

Template.body.events({
  'click .button-loadMore' (event, tpl) {
    if (infiniSomeData.started) {
      const buttonElement = event.currentTarget;
      // Disable the button to prevent more clicks before the request is ready.
      buttonElement.disabled = true;
      infiniSomeData.loadMore().then((infiniSomeData) => {
        buttonElement.disabled = false;
        // Do things after more data is loaded.
        console.log(infiniSomeData.count() + ' items loaded.');
      });
    }
  },
  'click .button-loadNew' (event, tpl) {
    if (infiniSomeData.started) {
      const buttonElement = event.currentTarget;
      // Disable the button to prevent more clicks before the request is ready.
      buttonElement.disabled = true;
      infiniSomeData.loadNew().then((infiniSomeData) => {
        buttonElement.disabled = false;
        // Do things after all new data is loaded.
        console.log(infiniSomeData.count() + ' items loaded.');
      });
    }
  }
});

Template.body.onCreated(function () {
  infiniSomeData.start(this).then((infiniSomeData) => {
    // Do things after the initial data is loaded.
    console.log(infiniSomeData.count() + ' items loaded.');
  });
});
```

Examples
------------------------
To be added.