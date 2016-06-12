Infinite Load for Meteor
========================
A helper library for loading items from a collection incrementally and also know how many new items are available to be pulled.

Design Principles
------------------------
- Only one subscription per instance which handles both data and stats synchronization.
- Instance query methods feel identical to vanilla `Mongo.Collection` methods as stats documents are masked out.
- All instance actions returns a `Promise` to which callbacks could be attached so code can run reliably when action results are ready.
- Every instance has its own collection to avoid polluting anything else.
- To make things simple and predictable, instances have only read methods.
- Instantiation only leaves minimal side-effects.
- Support affiliation to return related documents from multiple collections in one subscription.

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

new InfiniLoad(someCollection);
```

### Client side setup:
```JavaScript
import { Template } from 'meteor/templating'
import { InfiniLoad } from "meteor/zodiase:infinite-load";
import { someCollection } from "./collections.js";

let infiniSomeData = new InfiniLoad(someCollection);

Template.body.helpers({
  'dataReady' () {
    // `.ready` is an reactive data source. When it returns `true`, it is safe to access data.
    return infiniSomeData.ready;
  },
  'docItems' () {
    if (!infiniSomeData.ready) {
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
    if (infiniSomeData.ready) {
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
    if (infiniSomeData.ready) {
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
