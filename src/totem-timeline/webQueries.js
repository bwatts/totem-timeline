import http from "./http";
import { appendEvent } from "./events";

export default function webQuery(loadedEventType, url, options) {
  let type = new WebQueryType(loadedEventType, url, options);

  return {
    getDefaultData() {
      return {
        loading: false,
        loaded: false,
        loadError: null,
        subscribing: false,
        subscribed: false,
        subscribeError: null,
        etag: null,
        data: null
      };
    },
    bind(args, notify) {
      return type.bind(args, notify);
    }
  };
}

//
// Allow configuration of the connection to the query hub
//

let webQueryHub = null;

webQuery.enableHub = function(hub) {
  webQueryHub = hub;

  return onWebQueryChanged;
}

//
// A type of query that loads data via GET requests to a web endpoint
//

class WebQueryType {
  constructor(loadedEventType, url, options) {
    this.loadedEventType = loadedEventType;
    this.url = url;
    this.options = options;
  }

  appendLoadedEvent(data) {
    appendEvent(null, null, this.loadedEventType, data);
  }

  getEndpoint(args) {
    return new WebQueryEndpoint(this.url, this.options, args);
  }

  bind(args, notify) {
    return new WebQueryBinding(this, args, notify);
  }
}

//
// A URL and options declared for GET requests to a web endpoint
//

class WebQueryEndpoint {
  constructor(url = "", options = null, args) {
    while(typeof args === "function") {
      args = args();
    }

    while(typeof url === "function") {
      url = url(args);
    }

    while(typeof options === "function") {
      options = options(args, url);
    }

    this.url = url;
    this.options = options;
  }

  fetch() {
    if(!this.url) {
      throw new Error("Expected a URL when sending this request");
    }

    return http(this.url, this.options);
  }
}

//
// Binds the data of a web endpoint to an observer
//

class WebQueryBinding {
  constructor(type, args, notify) {
    this.type = type;
    this.args = args;
    this.notify = notify;

    this.client = new WebQueryClient(this);
  }

  get key() {
    return this.client.key;
  }

  subscribe() {
    this.endpoint = this.type.getEndpoint(this.args);

    this.client.startLoading();
  }

  resubscribeIfArgsChanged() {
    let newEndpoint = this.type.getEndpoint(this.args);

    if(newEndpoint.url !== this.endpoint.url) {
      // Changes in options will not cause a reload. It implies a deep equality check
      // between old and new options, which requires some thought.

      this.endpoint = newEndpoint;

      this.client.startLoading();
    }
  }

  unsubscribe() {
    this.client.startUnsubscribing();
  }

  update(data) {
    this.data = data;

    this.notify();
  }
}

//
// Loads data from a web endpoint and observes changes if it is a server query
//

class WebQueryClient {
  constructor(binding) {
    this.binding = binding;
    this.state = new WebQueryClientState(binding);
  }

  get key() {
    return this.state.etag ? this.state.etag.key : "";
  }

  startLoading() {
    if(this.state.loading) {
      return;
    }

    if(!this.binding.endpoint.url) {
      this.state.updateBinding();
      return;
    }

    this.state.setLoading();

    this.binding.endpoint.fetch().then(
      response => response.ok ? this.setLoaded(response) : this.setLoadError(response),
      error => this.state.setLoadError(error));
  }

  setLoaded(response) {
    return response.json().then(data => {
      this.state.setLoaded(response, data);

      this.binding.type.appendLoadedEvent(data);

      this.startSubscribing();
    });
  }

  setLoadError(response) {
    if(response.status === 404) {
      this.state.setLoad404(response);
      this.startSubscribing();
    }
    else {
      this.state.setLoadError(new TypeError(`Unexpected response status ${response.status} from query at ${response.url}`));
    }
  }

  startSubscribing() {
    let { subscribing, subscribed, etag } = this.state;

    if(!webQueryHub || subscribing || subscribed || !etag) {
      return;
    }

    this.state.setSubscribing();

    subscribeClient(this);

    webQueryHub.subscribeToChanged(etag.toString()).then(
      () => this.state.setSubscribed(),
      error => this.state.setSubscribeError(error));
  }

  startUnsubscribing() {
    unsubscribeClient(this);

    let { etag } = this.state;

    if(etag) {
      webQueryHub.unsubscribeFromChanged(etag.key).catch(/* Binding is gone, nothing to do */);
    }
  }
}

//
// The observable state of a a WebQueryClient
//

class WebQueryClientState {
  loading = false;
  loaded = false;
  loadError = null;
  subscribing = false;
  subscribed = false;
  subscribeError = null;
  etag = null;
  data = null;

  constructor(binding) {
    this.binding = binding;
  }

  updateBinding() {
    let data = { ...this };

    delete data.binding;

    this.binding.update(data);
  }

  setLoading() {
    this.loading = true;

    this.updateBinding();
  }

  setLoaded(response, data) {
    this.loading = false;
    this.loaded = true;
    this.loadError = null;
    this.etag = WebQueryETag.tryFromHeader(response);
    this.data = data;

    this.updateBinding();
  }

  setLoad404(response) {
    this.loading = false;
    this.loaded = false;
    this.loadError = new Error("Query not found");
    this.etag = WebQueryETag.tryFromHeader(response);
    this.data = null;

    this.updateBinding();
  }

  setLoadError(error) {
    this.loading = false;
    this.loaded = false;
    this.loadError = error;
    this.etag = null;
    this.data = null;

    this.updateBinding();
  }

  setSubscribing() {
    this.subscribing = true;

    this.updateBinding();
  }

  setSubscribed() {
    this.subscribing = false;
    this.subscribed = true;
    this.subscribeError = null;

    this.updateBinding();
  }

  setSubscribeError(error) {
    this.subscribing = false;
    this.subscribed = false;
    this.subscribeError = error;

    this.updateBinding();
  }
}

//
// The key and position of a server query checkpoint
//

class WebQueryETag {
  constructor(key, checkpoint) {
    this.key = key;
    this.checkpoint = checkpoint;
  }

  toString() {
    return this.checkpoint === null ? this.key : `${this.key}@${this.checkpoint}`;
  }

  static tryFromHeader(response) {
    return WebQueryETag.tryFrom(response.headers.get("ETag"));
  }

  static tryFrom(value) {
    if(value) {
      let separatorIndex = value.indexOf("@");

      if(separatorIndex == -1) {
        return new WebQueryETag(value, null);
      }

      if(separatorIndex > 0 && separatorIndex < value.length - 1) {
        let key = value.substring(0, separatorIndex);
        let checkpoint = parseInt(value.substring(separatorIndex + 1));

        if(Number.isInteger(checkpoint)) {
          return new WebQueryETag(key, checkpoint);
        }
      }
    }

    return null;
  }
}

//
// Track subscriptions of web query clients to server queries and observe changes
//

let subscriptionsByKey = new Map();

function subscribeClient(client) {
  let subscriptions = subscriptionsByKey.get(client.key);

  if(!subscriptions) {
    subscriptions = new Set();

    subscriptionsByKey.set(client.key, subscriptions);
  }

  subscriptions.add(client);
}

function unsubscribeClient(client) {
  if(!client.key) {
    return;
  }

  let subscriptions = subscriptionsByKey.get(client.key);

  if(subscriptions) {
    subscriptions.delete(client);

    if(subscriptions.size === 0) {
      subscriptionsByKey.delete(client.key);
    }
  }
}

function onWebQueryChanged(etag) {
  let parsed = WebQueryETag.tryFrom(etag);

  if(parsed) {
    let subscriptions = subscriptionsByKey.get(parsed.key);

    if(subscriptions) {
      for(let client of subscriptions) {
        client.startLoading();
      }
    }
  }
}