* Use only one subscription.
* Publish stats document along with data documents.
* Stats document would have a special ID that never collides with other documents.
* Stats document is always updated the last, so when that update is a signal to changes.
* Each unique instance (with unique ID) creates a new private collection for subscribed data.
* An instance has to provide an interface for finding and fetching data documents, while hiding the stats document.